/**
 * Command Router - Routes commands between CLI and extensions
 *
 * Enforces strict command ordering: only one command in-flight per session.
 * Commands are forwarded to extensions in arrival order.
 */

import type {
  Command,
  CommandId,
  CommandResponse,
  CommandType,
  ExtensionCommand,
  ExtensionResponse,
  SessionId,
  DaemonConfig,
} from "./types.js";
import { DaemonError } from "./types.js";
import type { SessionManager } from "./session-manager.js";
import type { WsServer } from "./ws-server.js";
import type { BrowserManager } from "./browser-manager.js";


const DEFAULT_COMMAND_TIMEOUT = 30000;
const DEFAULT_BROWSER_LAUNCH_TIMEOUT = 30000;

import { validateCommand } from "./validation.js";

/**
 * Pending command tracking
 */
interface PendingCommand {
  command: Command;
  resolve: (response: CommandResponse) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Command queue entry
 */
interface QueuedCommand {
  command: Command;
  resolve: (response: CommandResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Command Router class
 * Handles command routing, queuing, and ordering enforcement
 */
export class CommandRouter {
  private pendingCommands: Map<CommandId, PendingCommand> = new Map();
  private commandQueues: Map<SessionId, QueuedCommand[]> = new Map();
  private inFlightCommands: Map<SessionId, CommandId> = new Map();
  private browserManager: BrowserManager | null = null;
  private connectionWaiters: Map<SessionId, Array<() => void>> = new Map();

  constructor(
    private config: DaemonConfig,
    private sessionManager: SessionManager,
    private wsServer: WsServer
  ) { }

  /**
   * Set the browser manager reference (called after construction to avoid circular deps)
   */
  setBrowserManager(browserManager: BrowserManager): void {
    this.browserManager = browserManager;
  }

  /**
   * Notify that an extension has connected to a session
   * Called by daemon when extension connects
   */
  notifyExtensionConnected(sessionId: SessionId): void {
    const waiters = this.connectionWaiters.get(sessionId);
    if (waiters) {
      for (const resolve of waiters) {
        resolve();
      }
      this.connectionWaiters.delete(sessionId);
    }
  }

  // ===========================================================================
  // Command Submission
  // ===========================================================================

  /**
   * Submit a command for execution
   * Returns a promise that resolves when the command completes
   */
  async submitCommand(command: Command): Promise<CommandResponse> {

    // Validate command structure
    if (!validateCommand(command)) {
      return {
        id: command.id,
        success: false,
        error: "Invalid command structure",
      };
    }

    // Validate session exists
    const session = this.sessionManager.getSession(command.sessionId);
    if (!session) {
      return {
        id: command.id,
        success: false,
        error: `Session not found: ${command.sessionId}`,
      };
    }

    // Check if session has active extension connection
    if (!this.wsServer.isConnected(command.sessionId)) {
      // Only auto-launch browser for navigation commands
      const browserLaunchCommands: Set<CommandType> = new Set(["navigate", "tab_new", "open"]);
      if (browserLaunchCommands.has(command.type)) {
        return this.launchBrowserAndExecute(command);
      }
      // For other commands, fail immediately - browser must already be running
      return {
        id: command.id,
        success: false,
        error: "Extension not connected. Use 'navigate' or 'tab new' to launch browser first.",
      };
    }

    // If command already in-flight for session, queue this command
    if (this.hasInFlightCommand(command.sessionId)) {
      return this.queueCommand(command);
    }

    // No command in-flight, execute immediately
    return this.executeCommand(command);
  }

  /**
   * Launch browser for session, wait for extension to connect, then execute command
   */
  private async launchBrowserAndExecute(command: Command): Promise<CommandResponse> {
    const { sessionId } = command;

    // Check if browser manager is available
    if (!this.browserManager) {
      return {
        id: command.id,
        success: false,
        error: "Browser manager not configured",
      };
    }

    // Check if browser is already launching/running for this session
    if (this.browserManager.hasBrowser(sessionId)) {
      // Browser exists, just wait for extension to connect
      try {
        await this.waitForExtensionConnection(sessionId, DEFAULT_BROWSER_LAUNCH_TIMEOUT);
      } catch (err) {
        return {
          id: command.id,
          success: false,
          error: err instanceof Error ? err.message : "Failed to connect to extension",
        };
      }
    } else {
      // Mark session as awaiting extension
      this.sessionManager.updateSessionState(sessionId, "awaiting_extension");

      // Launch browser with profile directory from session and URL from command
      const session = this.sessionManager.getSession(sessionId);
      const profileDir = session?.profileDir;
      // Extract URL from navigate/open command to open browser directly to that page
      const url = command.params?.url as string | undefined;
      try {
        await this.browserManager.launchBrowser({ sessionId, profileDir, url });
      } catch (err) {
        this.sessionManager.updateSessionState(sessionId, "disconnected");
        return {
          id: command.id,
          success: false,
          error: `Failed to launch browser: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
      }

      // Wait for extension to connect
      try {
        await this.waitForExtensionConnection(sessionId, DEFAULT_BROWSER_LAUNCH_TIMEOUT);
      } catch (err) {
        // Kill browser on timeout
        await this.browserManager.killBrowser(sessionId);
        this.sessionManager.updateSessionState(sessionId, "disconnected");
        return {
          id: command.id,
          success: false,
          error: err instanceof Error ? err.message : "Extension did not connect in time",
        };
      }
    }

    // Extension connected, execute the command
    if (this.hasInFlightCommand(sessionId)) {
      return this.queueCommand(command);
    }
    return this.executeCommand(command);
  }

  /**
   * Wait for extension to connect to a session
   * Returns when extension connects or rejects on timeout
   */
  private waitForExtensionConnection(sessionId: SessionId, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already connected
      if (this.wsServer.isConnected(sessionId)) {
        resolve();
        return;
      }

      // Set up waiter
      let waiters = this.connectionWaiters.get(sessionId);
      if (!waiters) {
        waiters = [];
        this.connectionWaiters.set(sessionId, waiters);
      }

      let resolved = false;

      const onConnect = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve();
        }
      };

      waiters.push(onConnect);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Remove this waiter
          const idx = waiters!.indexOf(onConnect);
          if (idx !== -1) {
            waiters!.splice(idx, 1);
          }
          reject(new Error(`Extension did not connect within ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });
  }

  /**
   * Queue a command for later execution
   */
  private queueCommand(command: Command): Promise<CommandResponse> {
    return new Promise<CommandResponse>((resolve, reject) => {
      // Get or create queue for session
      let queue = this.commandQueues.get(command.sessionId);
      if (!queue) {
        queue = [];
        this.commandQueues.set(command.sessionId, queue);
      }

      // Add to queue with promise callbacks
      queue.push({
        command,
        resolve,
        reject,
      });
    });
  }

  /**
   * Execute a command immediately
   */
  private executeCommand(command: Command): Promise<CommandResponse> {
    return new Promise<CommandResponse>((resolve, reject) => {
      // Mark command as in-flight for session
      this.inFlightCommands.set(command.sessionId, command.id);

      // Convert to ExtensionCommand
      const extensionCommand = this.toExtensionCommand(command);

      // Send to extension via WsServer
      const sent = this.wsServer.sendCommand(command.sessionId, extensionCommand);
      if (!sent) {
        // Failed to send - clear in-flight and return error
        this.inFlightCommands.delete(command.sessionId);
        resolve({
          id: command.id,
          success: false,
          error: "Failed to send command to extension",
        });
        return;
      }

      // Set up timeout timer
      const timeoutId = this.setupCommandTimeout(command.id);

      // Store pending command with promise callbacks
      this.pendingCommands.set(command.id, {
        command,
        resolve,
        reject,
        timeoutId,
      });
    });
  }

  // ===========================================================================
  // Response Handling
  // ===========================================================================

  /**
   * Handle a response from the extension
   * Called by WsServer when extension sends response
   */
  handleExtensionResponse(sessionId: SessionId, response: ExtensionResponse): void {
    // Get pending command by ID
    const pending = this.pendingCommands.get(response.id);
    if (!pending) {
      // Log warning: response for unknown command
      console.warn(`Received response for unknown command: ${response.id}`);
      return;
    }

    // Clear timeout timer
    clearTimeout(pending.timeoutId);

    // Remove from pending commands
    this.pendingCommands.delete(response.id);

    // Clear in-flight marker for session
    this.inFlightCommands.delete(sessionId);

    // Convert to CommandResponse and resolve the pending promise
    const commandResponse = {
      id: response.id,
      success: response.success,
      data: response.data,
      error: response.error,
    };
    pending.resolve(commandResponse);

    // Process next command in queue if any
    this.processNextInQueue(sessionId);
  }

  /**
   * Process the next queued command for a session
   */
  private processNextInQueue(sessionId: SessionId): void {
    // Get queue for session
    const queue = this.commandQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }

    // Dequeue next command
    const next = queue.shift()!;

    // Execute command and wire up resolve/reject to queued promise
    this.executeCommand(next.command)
      .then(next.resolve)
      .catch(next.reject);
  }

  // ===========================================================================
  // Timeout Handling
  // ===========================================================================

  /**
   * Handle command timeout
   */
  private handleCommandTimeout(commandId: CommandId): void {
    // Get pending command
    const pending = this.pendingCommands.get(commandId);
    if (!pending) {
      return;
    }

    const sessionId = pending.command.sessionId;

    // Remove from pending commands
    this.pendingCommands.delete(commandId);

    // Clear in-flight marker
    this.inFlightCommands.delete(sessionId);

    // Reject promise with timeout error
    pending.resolve({
      id: commandId,
      success: false,
      error: "Command timed out",
    });

    // Process next in queue
    this.processNextInQueue(sessionId);
  }

  /**
   * Set up timeout for a pending command
   */
  private setupCommandTimeout(commandId: CommandId): NodeJS.Timeout {
    // Create timeout timer using heartbeat timeout from config or default
    const timeout = this.config.heartbeatTimeout || DEFAULT_COMMAND_TIMEOUT;
    return setTimeout(() => {
      this.handleCommandTimeout(commandId);
    }, timeout);
  }

  // ===========================================================================
  // Session Disconnection Handling
  // ===========================================================================

  /**
   * Handle extension disconnection
   * Fails all pending and queued commands for the session
   */
  handleExtensionDisconnected(sessionId: SessionId): void {
    const disconnectError = new DaemonError(
      "EXTENSION_NOT_CONNECTED",
      "Extension disconnected"
    );

    // Get pending command for session
    const inFlightCommandId = this.inFlightCommands.get(sessionId);
    if (inFlightCommandId) {
      const pending = this.pendingCommands.get(inFlightCommandId);
      if (pending) {
        // Clear timeout
        clearTimeout(pending.timeoutId);
        // Reject with disconnect error
        pending.resolve({
          id: inFlightCommandId,
          success: false,
          error: disconnectError.message,
        });
        // Remove from pending
        this.pendingCommands.delete(inFlightCommandId);
      }
    }

    // Get queued commands and reject all
    const queue = this.commandQueues.get(sessionId);
    if (queue) {
      for (const queued of queue) {
        queued.resolve({
          id: queued.command.id,
          success: false,
          error: disconnectError.message,
        });
      }
    }

    // Clear queue
    this.commandQueues.delete(sessionId);

    // Clear in-flight marker
    this.inFlightCommands.delete(sessionId);
  }

  // ===========================================================================
  // Command Conversion
  // ===========================================================================

  /**
   * Convert Command to ExtensionCommand
   * Maps daemon command types to extension format with 'params' field
   */
  private toExtensionCommand(command: Command): ExtensionCommand {
    // Map 'navigate' to 'open'
    if (command.type === "navigate") {
      return { id: command.id, type: "open", params: command.params };
    }

    // Map tab commands: tab_new, tab_close, tab_switch, tab_list -> tab with action
    const tabActionMap: Record<string, string> = {
      "tab_new": "new",
      "tab_close": "close",
      "tab_switch": "switch",
      "tab_list": "list",
    };

    const tabAction = tabActionMap[command.type];
    if (tabAction) {
      return {
        id: command.id,
        type: "tab",
        params: {
          action: tabAction,
          ...command.params,
        },
      };
    }

    // Default: pass through
    return {
      id: command.id,
      type: command.type,
      params: command.params,
    };
  }

  // ===========================================================================
  // Status Queries
  // ===========================================================================

  /**
   * Check if a session has a command in-flight
   */
  hasInFlightCommand(sessionId: SessionId): boolean {
    return this.inFlightCommands.has(sessionId);
  }

  /**
   * Get the queue length for a session
   */
  getQueueLength(sessionId: SessionId): number {
    const queue = this.commandQueues.get(sessionId);
    return queue ? queue.length : 0;
  }

  /**
   * Get all pending command IDs
   */
  getPendingCommandIds(): CommandId[] {
    return Array.from(this.pendingCommands.keys());
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Cancel all pending commands and clear queues
   */
  cancelAll(): void {
    const cancelError = "Command cancelled: daemon shutting down";

    // For each pending command, clear timeout and reject
    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeoutId);
      pending.resolve({
        id: commandId,
        success: false,
        error: cancelError,
      });
    }

    // For each queue, reject all commands
    for (const [_sessionId, queue] of this.commandQueues) {
      for (const queued of queue) {
        queued.resolve({
          id: queued.command.id,
          success: false,
          error: cancelError,
        });
      }
    }

    // Clear all maps
    this.pendingCommands.clear();
    this.commandQueues.clear();
    this.inFlightCommands.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new command router instance
 */
export function createCommandRouter(
  config: DaemonConfig,
  sessionManager: SessionManager,
  wsServer: WsServer,
  browserManager?: BrowserManager
): CommandRouter {
  const router = new CommandRouter(config, sessionManager, wsServer);
  if (browserManager) {
    router.setBrowserManager(browserManager);
  }
  return router;
}
