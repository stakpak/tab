/**
 * Test IPC Client
 *
 * Simulates a CLI connecting to the daemon via Unix socket
 */

import { createConnection, type Socket } from "node:net";
import type {
  IpcMessage,
  Command,
  CommandResponse,
  CommandType,
} from "../../src/types.js";
import { generateCommandId } from "./test-config.js";

const MESSAGE_DELIMITER = "\n";

export interface IpcClientOptions {
  socketPath: string;
  timeout?: number;
}

/**
 * IPC Client class
 * Simulates CLI communication with the daemon
 */
export class IpcClient {
  private socket: Socket | null = null;

  constructor(private options: IpcClientOptions) {}

  /**
   * Send a ping to check daemon health
   */
  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(this.options.socketPath);
      const timeout = this.options.timeout ?? 5000;

      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);

      socket.on("connect", () => {
        const message: IpcMessage = { type: "ping", payload: null };
        socket.write(JSON.stringify(message) + MESSAGE_DELIMITER);
      });

      socket.on("data", (data) => {
        clearTimeout(timer);
        try {
          const response: IpcMessage = JSON.parse(data.toString("utf8").trim());
          resolve(response.type === "pong");
        } catch {
          resolve(false);
        }
        socket.end();
      });

      socket.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  /**
   * Send a command to the daemon
   */
  async sendCommand(
    sessionId: string,
    type: CommandType,
    payload: Record<string, unknown> = {}
  ): Promise<CommandResponse> {
    const command: Command = {
      id: generateCommandId(),
      sessionId,
      type,
      payload,
      timestamp: new Date(),
    };

    return this.sendRawCommand(command);
  }

  /**
   * Send a raw command to the daemon
   */
  async sendRawCommand(command: Command): Promise<CommandResponse> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.options.socketPath);
      const timeout = this.options.timeout ?? 30000;

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Command timeout"));
      }, timeout);

      let buffer = "";

      socket.on("connect", () => {
        const message: IpcMessage = { type: "command", payload: command };
        socket.write(JSON.stringify(message) + MESSAGE_DELIMITER);
      });

      socket.on("data", (data) => {
        buffer += data.toString("utf8");
        
        const delimiterIndex = buffer.indexOf(MESSAGE_DELIMITER);
        if (delimiterIndex !== -1) {
          clearTimeout(timer);
          const rawMessage = buffer.slice(0, delimiterIndex);
          try {
            const response: IpcMessage = JSON.parse(rawMessage);
            if (response.type === "response" && response.payload) {
              resolve(response.payload as CommandResponse);
            } else {
              reject(new Error(`Unexpected response type: ${response.type}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err}`));
          }
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      socket.on("close", () => {
        clearTimeout(timer);
      });
    });
  }

  /**
   * Send an invalid message to test error handling
   */
  async sendInvalidMessage(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.options.socketPath);
      const timeout = this.options.timeout ?? 5000;

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Response timeout"));
      }, timeout);

      let buffer = "";

      socket.on("connect", () => {
        socket.write(data + MESSAGE_DELIMITER);
      });

      socket.on("data", (data) => {
        buffer += data.toString("utf8");
        const delimiterIndex = buffer.indexOf(MESSAGE_DELIMITER);
        if (delimiterIndex !== -1) {
          clearTimeout(timer);
          resolve(buffer.slice(0, delimiterIndex));
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/**
 * Create an IPC client
 */
export function createIpcClient(options: IpcClientOptions): IpcClient {
  return new IpcClient(options);
}
