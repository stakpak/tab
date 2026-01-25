import { WebSocketServer, WebSocket } from 'ws';

export interface MockServerOptions {
  port?: number;
}

export interface ReceivedMessage {
  type: string;
  data: unknown;
}

export class MockWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private receivedMessages: ReceivedMessage[] = [];
  private messageHandlers: Map<string, (ws: WebSocket, data: unknown) => void> = new Map();
  public port: number;

  constructor(options: MockServerOptions = {}) {
    this.port = options.port || 8080;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws) => {
          this.clients.add(ws);

          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString());
              this.receivedMessages.push({ type: message.type, data: message });

              // Handle ping/pong
              if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
              }

              // Check for custom handler
              const handler = this.messageHandlers.get(message.type);
              if (handler) {
                handler(ws, message);
              }
            } catch (e) {
              console.error('Mock server parse error:', e);
            }
          });

          ws.on('close', () => {
            this.clients.delete(ws);
          });
        });

        this.wss.on('listening', () => {
          console.log(`Mock WebSocket server listening on port ${this.port}`);
          resolve();
        });

        this.wss.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      // Close all clients
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      this.wss.close(() => {
        this.wss = null;
        console.log('Mock WebSocket server stopped');
        resolve();
      });
    });
  }

  /**
   * Send a command to all connected clients
   */
  sendCommand(command: { id: string; type: string; params?: unknown }): void {
    const message = JSON.stringify(command);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Send a command and wait for response
   */
  async sendCommandAndWaitForResponse(
    command: { id: string; type: string; params?: unknown },
    timeout: number = 10000
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to command ${command.id}`));
      }, timeout);

      // Set up one-time handler for this command's response
      const originalHandler = this.messageHandlers.get('response');
      
      const responseHandler = (ws: WebSocket, data: unknown) => {
        const response = data as { id?: string };
        if (response.id === command.id) {
          clearTimeout(timer);
          if (originalHandler) {
            this.messageHandlers.set('response', originalHandler);
          } else {
            this.messageHandlers.delete('response');
          }
          resolve(response);
        }
      };

      // Listen for any message with matching ID
      for (const client of this.clients) {
        const originalOnMessage = client.onmessage;
        client.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data.toString());
            if (response.id === command.id) {
              clearTimeout(timer);
              client.onmessage = originalOnMessage;
              resolve(response);
            } else if (originalOnMessage) {
              originalOnMessage.call(client, event);
            }
          } catch (e) {
            // Not JSON or parsing failed
          }
        };
      }

      this.sendCommand(command);
    });
  }

  /**
   * Register a handler for a specific message type
   */
  onMessage(type: string, handler: (ws: WebSocket, data: unknown) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Get all received messages
   */
  getReceivedMessages(): ReceivedMessage[] {
    return [...this.receivedMessages];
  }

  /**
   * Clear received messages
   */
  clearMessages(): void {
    this.receivedMessages = [];
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Wait for a client to connect
   */
  async waitForConnection(timeout: number = 10000): Promise<void> {
    if (this.clients.size > 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for connection'));
      }, timeout);

      const checkInterval = setInterval(() => {
        if (this.clients.size > 0) {
          clearTimeout(timer);
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
}
