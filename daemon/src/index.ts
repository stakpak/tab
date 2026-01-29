/**
 * tab Daemon - Main Entry Point
 *
 * The daemon is the central coordinator and state owner of the tab system.
 * It runs as a long-lived background process managing:
 * - IPC server for CLI communication
 * - WebSocket server for extension communication
 * - Sessions and their state
 * - Browser processes
 * - Command routing and ordering
 */

import type { ChildProcess } from "node:child_process";
import type { WebSocket } from "ws";
import type { DaemonConfig, SessionId, Command, CommandResponse } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { createIpcServer, type IpcServer } from "./ipc-server.js";
import { createWsServer, type WsServer } from "./ws-server.js";
import { createSessionManager, type SessionManager } from "./session-manager.js";
import { createBrowserManager, type BrowserManager } from "./browser-manager.js";
import { createCommandRouter, type CommandRouter } from "./command-router.js";

// =============================================================================
// Re-exports
// =============================================================================

export * from "./types.js";
export { createIpcServer, type IpcServer } from "./ipc-server.js";
export { createWsServer, type WsServer } from "./ws-server.js";
export { createSessionManager, type SessionManager } from "./session-manager.js";
export { createBrowserManager, type BrowserManager } from "./browser-manager.js";
export { createCommandRouter, type CommandRouter } from "./command-router.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Graceful shutdown timeout in milliseconds
 */
const SHUTDOWN_TIMEOUT = 10000;

// =============================================================================
// Daemon Class
// =============================================================================

/**
 * Main Daemon class
 * Orchestrates all components and manages the daemon lifecycle
 */
export class TabDaemon {
  private config: DaemonConfig;
  private ipcServer: IpcServer;
  private wsServer: WsServer;
  private sessionManager: SessionManager;
  private browserManager: BrowserManager;
  private commandRouter: CommandRouter;
  private isRunning: boolean = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(config: Partial<DaemonConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.sessionManager = createSessionManager(this.config);
    this.wsServer = createWsServer(this.config);
    this.browserManager = createBrowserManager(this.config);
    this.commandRouter = createCommandRouter(
      this.config,
      this.sessionManager,
      this.wsServer,
      this.browserManager
    );
    this.ipcServer = createIpcServer(this.config);
  }

  // ===========================================================================
  // Daemon Lifecycle
  // ===========================================================================

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    // Check if already running
    if (this.isRunning) {
      throw new Error("Daemon is already running");
    }

    // Set up component event handlers
    this.setupEventHandlers();

    // Start WebSocket server
    await this.wsServer.start();
    console.log(`WebSocket server listening on port ${this.config.wsPort}`);

    // Start IPC server
    await this.ipcServer.start();
    console.log(`IPC server listening on ${this.config.ipcSocketPath}`);

    // Set up signal handlers for graceful shutdown
    this.setupSignalHandlers();

    // Set isRunning to true
    this.isRunning = true;

    console.log("tab-daemon started successfully");
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(): Promise<void> {
    // Check if running
    if (!this.isRunning) {
      return;
    }

    // Prevent multiple concurrent shutdowns
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  /**
   * Perform the actual shutdown sequence
   */
  private async performShutdown(): Promise<void> {
    console.log("Stopping tab-daemon...");

    // Set isRunning to false
    this.isRunning = false;

    // Cancel all pending commands
    this.commandRouter.cancelAll();
    console.log("Cancelled pending commands");

    // Wait for in-flight commands to complete (with timeout)
    const pendingCount = this.commandRouter.getPendingCommandIds().length;
    if (pendingCount > 0) {
      console.log(`Waiting for ${pendingCount} in-flight commands...`);
      await this.waitForCommandsWithTimeout(SHUTDOWN_TIMEOUT);
    }

    // Kill all browser processes
    console.log("Stopping browser processes...");
    await this.browserManager.killAllBrowsers();

    // Stop IPC server
    console.log("Stopping IPC server...");
    await this.ipcServer.stop();

    // Stop WebSocket server
    console.log("Stopping WebSocket server...");
    await this.wsServer.stop();

    console.log("tab-daemon stopped");
  }

  /**
   * Wait for pending commands with timeout
   */
  private async waitForCommandsWithTimeout(timeout: number): Promise<void> {
    const startTime = Date.now();

    while (this.commandRouter.getPendingCommandIds().length > 0) {
      if (Date.now() - startTime > timeout) {
        console.warn("Shutdown timeout reached, forcing command cancellation");
        this.commandRouter.cancelAll();
        break;
      }
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Check if daemon is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  // ===========================================================================
  // Component Event Wiring
  // ===========================================================================

  /**
   * Set up event handlers to wire components together
   */
  private setupEventHandlers(): void {
    // Wire IPC server command handler to command router
    this.ipcServer.onCommand((command) => this.handleCliCommand(command));

    // Wire WebSocket server events to session manager and command router
    this.wsServer.setEventHandlers({
      onExtensionConnected: (sessionId, ws) => this.handleExtensionConnected(sessionId, ws),
      onExtensionDisconnected: (sessionId) => this.handleExtensionDisconnected(sessionId),
      onExtensionResponse: (sessionId, response) =>
        this.commandRouter.handleExtensionResponse(sessionId, response),
    });

    // Wire browser manager events to session manager
    this.browserManager.setEventHandlers({
      onBrowserStarted: (sessionId, process) => this.handleBrowserStarted(sessionId, process),
      onBrowserExited: (sessionId, code) => this.handleBrowserExited(sessionId, code),
      onBrowserError: (sessionId, error) => {
        console.error(`Browser error for session ${sessionId}:`, error.message);
      },
    });
  }

  /**
   * Handle incoming command from CLI
   */
  private async handleCliCommand(command: Command): Promise<CommandResponse> {
    // Check if daemon is running
    if (!this.isRunning) {
      return {
        id: command.id,
        success: false,
        error: "Daemon is shutting down",
      };
    }

    // Validate session exists or create default
    let session = this.sessionManager.getSession(command.sessionId);
    if (!session) {
      // Try to get by name (CLI might send session name instead of ID)
      session = this.sessionManager.getSessionByName(command.sessionId);
    }
    if (!session) {
      // If sessionId is "default" or empty, use/create default session
      if (!command.sessionId || command.sessionId === "default") {
        session = this.sessionManager.getOrCreateDefaultSession();
      } else {
        return {
          id: command.id,
          success: false,
          error: `Session not found: ${command.sessionId}`,
        };
      }
    }

    // Always update command with actual session ID (CLI might have sent name)
    command = { ...command, sessionId: session.id };

    // Submit command to router
    return this.commandRouter.submitCommand(command);
  }

  /**
   * Handle extension connection
   */
  private handleExtensionConnected(sessionId: SessionId, ws: WebSocket): void {
    // Check if session exists, create if not (extension might connect before CLI creates session)
    let session = this.sessionManager.getSession(sessionId);
    if (!session) {
      // Try to get by name
      session = this.sessionManager.getSessionByName(sessionId);
    }
    if (!session) {
      // Assign the next awaiting session (daemon-launched browser) if available
      session = this.sessionManager.assignNextAwaitingSession();
      if (!session) {
        // Create a new session for this extension (already launched browser)
        try {
          session = this.sessionManager.createSession(sessionId);
        } catch {
          // If session name is invalid, use it as a generated name
          console.warn(`Extension connected with invalid session ID: ${sessionId}, creating default session`);
          session = this.sessionManager.getOrCreateDefaultSession();
        }
      }
    }

    // Update the WsServer's connection mapping to use actual session ID
    // (extension might have registered with a name, but we need to use the UUID)
    if (sessionId !== session.id) {
      this.wsServer.updateSessionId(sessionId, session.id);
    }

    // Associate WebSocket with session (this also updates state to active)
    this.sessionManager.setExtensionConnection(session.id, ws);

    // Notify command router that extension connected (for waiters)
    this.commandRouter.notifyExtensionConnected(session.id);

    // Inform extension of assigned session ID
    try {
      ws.send(JSON.stringify({ type: "session_assigned", sessionId: session.id }));
    } catch (error) {
      console.warn(`Failed to send session assignment to extension: ${session.id}`, error);
    }

    console.log(`Extension connected for session: ${session.name} (${session.id})`);
  }

  /**
   * Handle extension disconnection
   */
  private handleExtensionDisconnected(sessionId: SessionId): void {
    // Get session
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      console.warn(`Extension disconnected for unknown session: ${sessionId}`);
      return;
    }

    // Update session state to disconnected (also clears the connection reference)
    this.sessionManager.setExtensionConnection(sessionId, null);

    // Notify command router to fail pending commands
    this.commandRouter.handleExtensionDisconnected(sessionId);

    console.log(`Extension disconnected for session: ${session.name} (${session.id})`);
  }

  /**
   * Handle browser process started
   */
  private handleBrowserStarted(sessionId: SessionId, process: ChildProcess): void {
    // Get or create session
    let session = this.sessionManager.getSession(sessionId);
    if (!session) {
      session = this.sessionManager.getSessionByName(sessionId);
    }
    if (!session) {
      console.warn(`Browser started for unknown session: ${sessionId}`);
      return;
    }

    // Associate process with session
    this.sessionManager.setBrowserProcess(session.id, process);

    console.log(`Browser started for session: ${session.name} (PID: ${process.pid})`);
  }

  /**
   * Handle browser process exited
   */
  private handleBrowserExited(sessionId: SessionId, code: number | null): void {
    // Get session
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      console.warn(`Browser exited for unknown session: ${sessionId}`);
      return;
    }

    // Clean up session browser reference
    this.sessionManager.setBrowserProcess(sessionId, null);

    // Update session state if extension is not connected
    if (!session.extensionConnection) {
      this.sessionManager.updateSessionState(sessionId, "disconnected");
    }

    console.log(`Browser exited for session: ${session.name} (code: ${code})`);
  }

  // ===========================================================================
  // Signal Handling
  // ===========================================================================

  /**
   * Set up process signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Handle SIGTERM - graceful shutdown
    process.on("SIGTERM", () => {
      console.log("Received SIGTERM signal");
      this.stop().catch((err) => {
        console.error("Error during shutdown:", err);
        process.exit(1);
      });
    });

    // Handle SIGINT - graceful shutdown (Ctrl+C)
    process.on("SIGINT", () => {
      console.log("Received SIGINT signal");
      this.stop().then(() => {
        process.exit(0);
      }).catch((err) => {
        console.error("Error during shutdown:", err);
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("Uncaught exception:", err);
      this.stop().finally(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled rejection at:", promise, "reason:", reason);
    });
  }

  // ===========================================================================
  // Accessors (for testing/debugging)
  // ===========================================================================

  /**
   * Get the session manager instance
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the browser manager instance
   */
  getBrowserManager(): BrowserManager {
    return this.browserManager;
  }

  /**
   * Get the command router instance
   */
  getCommandRouter(): CommandRouter {
    return this.commandRouter;
  }

  /**
   * Get the WebSocket server instance
   */
  getWsServer(): WsServer {
    return this.wsServer;
  }

  /**
   * Get the IPC server instance
   */
  getIpcServer(): IpcServer {
    return this.ipcServer;
  }

  /**
   * Get the current configuration
   */
  getConfig(): DaemonConfig {
    return { ...this.config };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new daemon instance
 */
export function createDaemon(config?: Partial<DaemonConfig>): TabDaemon {
  return new TabDaemon(config);
}

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * CLI arguments including special modes
 */
interface CliArgs {
  config: Partial<DaemonConfig>;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CliArgs {
  const config: Partial<DaemonConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--socket":
      case "-s":
        config.ipcSocketPath = args[++i];
        break;
      case "--port":
      case "-p":
        config.wsPort = parseInt(args[++i], 10);
        break;
      case "--browser":
      case "-b":
        config.defaultBrowserPath = args[++i];
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      case "--version":
      case "-v":
        console.log("tab-daemon v0.1.0");
        process.exit(0);
        break;
    }
  }

  return { config };
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
tab-daemon - tab browser automation daemon

Usage: tab-daemon [options]

Options:
  -s, --socket <path>    IPC socket path (default: /tmp/tab-daemon.sock)
  -p, --port <port>      WebSocket server port (default: 9222)
  -b, --browser <path>   Path to Chrome/Chromium executable
  -h, --help             Show this help message
  -v, --version          Show version information

Environment Variables:
  TAB_SOCKET_PATH       IPC socket path
  TAB_WS_PORT           WebSocket server port
  TAB_BROWSER_PATH      Browser executable path

Examples:
  tab-daemon                      Start with default settings
  tab-daemon -p 9333              Use port 9333 for WebSocket server
  tab-daemon --browser /usr/bin/chromium
  `);
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Partial<DaemonConfig> {
  const config: Partial<DaemonConfig> = {};

  if (process.env.TAB_SOCKET_PATH) {
    config.ipcSocketPath = process.env.TAB_SOCKET_PATH;
  }
  if (process.env.TAB_WS_PORT) {
    config.wsPort = parseInt(process.env.TAB_WS_PORT, 10);
  }
  if (process.env.TAB_BROWSER_PATH) {
    config.defaultBrowserPath = process.env.TAB_BROWSER_PATH;
  }

  return config;
}

/**
 * Main function - entry point when run directly
 */
async function main(): Promise<void> {
  // Load configuration from environment
  const envConfig = loadEnvConfig();

  // Parse command line arguments (override env config)
  const { config: cliConfig } = parseArgs(process.argv.slice(2));

  // Merge configurations
  const config = { ...envConfig, ...cliConfig };

  // Normal mode: start daemon
  const daemon = createDaemon(config);

  // Start daemon
  await daemon.start();

  // Keep process running
  console.log("Daemon is running. Press Ctrl+C to stop.");
}

// Run main if this is the entry point
// Note: In ESM, we check if this module is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
