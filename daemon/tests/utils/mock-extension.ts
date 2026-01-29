/**
 * Mock Extension Client
 *
 * Simulates a browser extension connecting to the daemon via WebSocket
 */

import { WebSocket } from "ws";
import type {
  WsMessage,
  ExtensionCommand,
  ExtensionResponse,
  SessionId,
} from "../../src/types.js";

export interface MockExtensionOptions {
  wsPort: number;
  sessionId: SessionId;
  extensionVersion?: string;
  browserName?: string;
  browserVersion?: string;
  autoRegister?: boolean;
}

export type CommandHandler = (command: ExtensionCommand) => ExtensionResponse | Promise<ExtensionResponse>;

/**
 * Mock Extension class
 * Simulates a browser extension for testing
 */
export class MockExtension {
  private ws: WebSocket | null = null;
  private commandHandler: CommandHandler | null = null;
  private receivedCommands: ExtensionCommand[] = [];
  private connected = false;
  private registered = false;

  constructor(private options: MockExtensionOptions) {}

  /**
   * Connect to the daemon WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${this.options.wsPort}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 5000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;
        
        // Auto-register if enabled (default)
        if (this.options.autoRegister !== false) {
          this.register();
        }
        
        resolve();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.registered = false;
      });
    });
  }

  /**
   * Register with the daemon
   */
  register(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }

    const message: WsMessage = {
      type: "register",
      sessionId: this.options.sessionId,
      payload: {
        sessionId: this.options.sessionId,
        extensionVersion: this.options.extensionVersion ?? "1.0.0",
        browserInfo: {
          name: this.options.browserName ?? "Chrome",
          version: this.options.browserVersion ?? "120.0.0.0",
        },
      } as unknown as null,
    };

    this.ws.send(JSON.stringify(message));
    this.registered = true;
  }

  /**
   * Disconnect from the daemon
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws) {
        resolve();
        return;
      }

      this.ws.once("close", () => {
        this.ws = null;
        this.connected = false;
        this.registered = false;
        resolve();
      });

      this.ws.close();
    });
  }

  /**
   * Handle incoming WebSocket message
   * Per protocol, daemon sends:
   * - Raw commands: { id, type, params? }
   * - Ping: { type: "ping" }
   */
  private async handleMessage(data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString("utf8"));

      // Check for ping message
      if (message.type === "ping") {
        this.sendPong();
        return;
      }

      // Check for raw command (has 'id' and command 'type')
      if (message.id && typeof message.type === "string" && message.type !== "ping" && message.type !== "pong") {
        await this.handleCommand(message as ExtensionCommand);
        return;
      }

      // Legacy envelope format (for backward compatibility)
      if (message.type === "command" && message.payload) {
        await this.handleCommand(message.payload as ExtensionCommand);
        return;
      }

      if (message.type === "heartbeat") {
        this.sendPong();
        return;
      }
    } catch {
      // Ignore parse errors
    }
  }

  /**
   * Handle a command from the daemon
   */
  private async handleCommand(command: ExtensionCommand): Promise<void> {
    this.receivedCommands.push(command);

    // If we have a command handler, use it to generate a response
    if (this.commandHandler) {
      const response = await this.commandHandler(command);
      this.sendResponse(response);
    }
  }

  /**
   * Send a response to a command
   * Per protocol, responses are raw JSON: { id, success, data?, error? }
   */
  sendResponse(response: ExtensionResponse): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }

    // Send raw response (no envelope wrapper per protocol)
    this.ws.send(JSON.stringify(response));
  }

  /**
   * Send pong response to ping
   */
  private sendPong(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({ type: "pong" }));
  }

  /**
   * Set the command handler
   */
  onCommand(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  /**
   * Get all received commands
   */
  getReceivedCommands(): ExtensionCommand[] {
    return [...this.receivedCommands];
  }

  /**
   * Clear received commands
   */
  clearReceivedCommands(): void {
    this.receivedCommands = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if registered
   */
  isRegistered(): boolean {
    return this.registered;
  }
}

/**
 * Create a mock extension
 */
export function createMockExtension(options: MockExtensionOptions): MockExtension {
  return new MockExtension(options);
}
