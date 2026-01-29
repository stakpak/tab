/**
 * IPC Server - Handles communication between CLI and daemon
 *
 * Exposes a local Unix socket (or named pipe on Windows) for CLI commands.
 * Each CLI invocation connects, sends one command, receives one response, and disconnects.
 */

import { createServer, type Server, type Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import type {
  IpcMessage,
  Command,
  CommandResponse,
  DaemonConfig,
  BrowserEndpoint,
  ExtensionRegistrationResponse,
} from "./types.js";

/**
 * Message delimiter for framing messages over the socket.
 * Using newline-delimited JSON for simplicity.
 */
const MESSAGE_DELIMITER = "\n";

/**
 * Callback type for handling incoming commands from CLI
 */
export type CommandHandler = (command: Command) => Promise<CommandResponse>;

/**
 * Callback type for handling extension registration requests
 */
export type RegistrationHandler = () => Promise<ExtensionRegistrationResponse>;

/**
 * IPC Server class
 * Manages Unix socket server for CLI communication
 */
export class IpcServer {
  private server: Server | null = null;
  private commandHandler: CommandHandler | null = null;
  private registrationHandler: RegistrationHandler | null = null;
  private activeConnections: Set<Socket> = new Set();

  constructor(private config: DaemonConfig) {}

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Start the IPC server and begin listening for CLI connections
   */
  async start(): Promise<void> {
    // Remove existing socket file if it exists
    if (existsSync(this.config.ipcSocketPath)) {
      unlinkSync(this.config.ipcSocketPath);
    }

    return new Promise((resolve, reject) => {
      // Create Unix socket server
      this.server = createServer((socket) => this.handleConnection(socket));

      this.server.on("error", (err) => {
        reject(err);
      });

      // Bind to config.ipcSocketPath and start listening
      this.server.listen(this.config.ipcSocketPath, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the IPC server and close all connections
   */
  async stop(): Promise<void> {
    // Close all active connections
    for (const socket of this.activeConnections) {
      socket.destroy();
    }
    this.activeConnections.clear();

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Stop accepting new connections and close the server
      this.server.close(() => {
        // Clean up socket file
        if (existsSync(this.config.ipcSocketPath)) {
          unlinkSync(this.config.ipcSocketPath);
        }
        this.server = null;
        resolve();
      });
    });
  }

  // ===========================================================================
  // Handler Registration
  // ===========================================================================

  /**
   * Register the command handler that processes incoming CLI commands
   */
  onCommand(handler: CommandHandler): void {
    // Validate handler is a function
    if (typeof handler !== "function") {
      throw new Error("Command handler must be a function");
    }
    // Store the command handler
    this.commandHandler = handler;
  }

  /**
   * Register the handler for extension registration requests
   */
  onRegistration(handler: RegistrationHandler): void {
    if (typeof handler !== "function") {
      throw new Error("Registration handler must be a function");
    }
    this.registrationHandler = handler;
  }

  // ===========================================================================
  // Connection Handling
  // ===========================================================================

  /**
   * Handle a new CLI connection
   */
  private handleConnection(socket: Socket): void {
    this.activeConnections.add(socket);

    // Set up data buffer for incoming messages
    let buffer = "";

    // Handle incoming data chunks
    socket.on("data", async (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      // Check for complete messages (delimited by newline)
      let delimiterIndex: number;
      while ((delimiterIndex = buffer.indexOf(MESSAGE_DELIMITER)) !== -1) {
        const rawMessage = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 1);

        // Parse and handle the complete message
        const message = this.parseMessage(Buffer.from(rawMessage, "utf8"));
        if (message) {
          await this.handleMessage(socket, message);
        } else {
          // Send error response for invalid message format
          this.sendResponse(socket, {
            id: "unknown",
            success: false,
            error: "Invalid message format",
          });
        }
      }
    });

    // Handle connection close
    socket.on("close", () => {
      this.activeConnections.delete(socket);
    });

    // Handle connection errors
    socket.on("error", (err) => {
      console.error("IPC connection error:", err.message);
      this.activeConnections.delete(socket);
    });
  }

  /**
   * Process a complete IPC message from the CLI
   */
  private async handleMessage(
    socket: Socket,
    message: IpcMessage
  ): Promise<void> {
    // DEBUG: Log received message
    console.log("[IPC DEBUG] Received message:", JSON.stringify(message, null, 2));
    
    // Validate message structure
    if (!message || typeof message.type !== "string") {
      this.sendResponse(socket, {
        id: "unknown",
        success: false,
        error: "Invalid message structure",
      });
      return;
    }

    // Route based on message type
    switch (message.type) {
      case "ping":
        // Respond with pong
        const pongMessage: IpcMessage = {
          type: "pong",
          payload: null,
        };
        socket.write(this.serializeMessage(pongMessage), () => {
          socket.end();
        });
        break;

      case "get_endpoint":
        // Respond with daemon's WebSocket endpoint
        const endpoint: BrowserEndpoint = {
          ip: "127.0.0.1",
          port: this.config.wsPort,
        };
        const endpointMessage: IpcMessage = {
          type: "endpoint",
          payload: endpoint,
        };
        socket.write(this.serializeMessage(endpointMessage), () => {
          socket.end();
        });
        break;

      case "register_extension":
        // Extension requests session assignment
        await this.handleExtensionRegistration(socket);
        break;

      case "command":
        // Invoke command handler
        if (!this.commandHandler) {
          this.sendResponse(socket, {
            id: (message.payload as Command)?.id ?? "unknown",
            success: false,
            error: "No command handler registered",
          });
          return;
        }

        if (!message.payload) {
          this.sendResponse(socket, {
            id: "unknown",
            success: false,
            error: "Command payload is required",
          });
          return;
        }

        try {
          const command = message.payload as Command;
          const response = await this.commandHandler(command);
          this.sendResponse(socket, response);
        } catch (err) {
          this.sendResponse(socket, {
            id: (message.payload as Command)?.id ?? "unknown",
            success: false,
            error:
              err instanceof Error ? err.message : "Unknown error occurred",
          });
        }
        break;

      default:
        this.sendResponse(socket, {
          id: "unknown",
          success: false,
          error: `Unknown message type: ${message.type}`,
        });
    }
  }

  /**
   * Handle extension registration request
   * Assigns a session to the requesting extension
   */
  private async handleExtensionRegistration(socket: Socket): Promise<void> {
    if (!this.registrationHandler) {
      const errorMessage: IpcMessage = {
        type: "response",
        payload: { id: "unknown", success: false, error: "No registration handler registered" },
      };
      socket.write(this.serializeMessage(errorMessage), () => {
        socket.end();
      });
      return;
    }

    try {
      const registration = await this.registrationHandler();
      const registrationMessage: IpcMessage = {
        type: "registration",
        payload: registration,
      };
      socket.write(this.serializeMessage(registrationMessage), () => {
        socket.end();
      });
    } catch (err) {
      const errorMessage: IpcMessage = {
        type: "response",
        payload: {
          id: "unknown",
          success: false,
          error: err instanceof Error ? err.message : "Registration failed",
        },
      };
      socket.write(this.serializeMessage(errorMessage), () => {
        socket.end();
      });
    }
  }

  // ===========================================================================
  // Message Serialization
  // ===========================================================================

  /**
   * Parse a raw buffer into an IPC message
   */
  private parseMessage(data: Buffer): IpcMessage | null {
    try {
      // Decode buffer as UTF-8 string
      const str = data.toString("utf8");

      // Parse JSON
      const parsed = JSON.parse(str);

      // Validate message structure - must have a type field
      if (!parsed || typeof parsed.type !== "string") {
        return null;
      }

      // Return parsed message
      return parsed as IpcMessage;
    } catch {
      // Return null on error
      return null;
    }
  }

  /**
   * Serialize an IPC message to send over the socket
   */
  private serializeMessage(message: IpcMessage): Buffer {
    // Convert message to JSON string
    const json = JSON.stringify(message);

    // Encode as UTF-8 buffer with message delimiter
    return Buffer.from(json + MESSAGE_DELIMITER, "utf8");
  }

  /**
   * Send a response back to the CLI
   */
  private sendResponse(socket: Socket, response: CommandResponse): void {
    // Wrap response in IpcMessage envelope
    const message: IpcMessage = {
      type: "response",
      payload: response,
    };

    // Serialize message
    const data = this.serializeMessage(message);

    // Write to socket and close after write completes
    socket.write(data, () => {
      socket.end();
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new IPC server instance
 */
export function createIpcServer(config: DaemonConfig): IpcServer {
  return new IpcServer(config);
}
