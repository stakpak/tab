/**
 * Native Messaging Handler (Query Mode)
 * 
 * When the daemon is invoked with --query flag, it runs in "query mode":
 * 1. Reads request from stdin (Chrome native messaging format)
 * 2. Connects to the running daemon via IPC socket
 * 3. Requests the WebSocket endpoint
 * 4. Writes response to stdout in Chrome native messaging format
 * 5. Exits
 * 
 * Chrome native messaging protocol:
 * - Messages are length-prefixed (4-byte little-endian uint32)
 * - Message body is JSON
 */

import { createConnection } from 'node:net';
import type {
  IpcMessage,
  BrowserEndpoint,
  NativeMessageRequest,
  NativeMessageResponse,
  NativeMessageErrorResponse,
  ExtensionRegistrationResponse,
} from './types.js';

// =============================================================================
// Native Messaging Protocol (stdin/stdout)
// =============================================================================

/**
 * Write a native messaging response to stdout.
 * Format: 4-byte length (little-endian) + JSON body
 */
export function writeNativeMessage(message: NativeMessageResponse | NativeMessageErrorResponse): void {
  const json = JSON.stringify(message);
  const buffer = Buffer.alloc(4 + Buffer.byteLength(json, 'utf8'));
  buffer.writeUInt32LE(Buffer.byteLength(json, 'utf8'), 0);
  buffer.write(json, 4, 'utf8');
  process.stdout.write(buffer);
}

/**
 * Read a native messaging request from stdin.
 * Format: 4-byte length (little-endian) + JSON body
 * 
 * @returns Promise resolving to parsed request
 */
export function readNativeMessage(): Promise<NativeMessageRequest> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let messageLength: number | null = null;

    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);

      // Read length prefix (4 bytes)
      if (messageLength === null && buffer.length >= 4) {
        messageLength = buffer.readUInt32LE(0);
        buffer = buffer.subarray(4);
      }

      // Read message body
      if (messageLength !== null && buffer.length >= messageLength) {
        const jsonStr = buffer.subarray(0, messageLength).toString('utf8');
        cleanup();

        try {
          const parsed = JSON.parse(jsonStr) as NativeMessageRequest;
          resolve(parsed);
        } catch (err) {
          reject(new Error('Failed to parse native message JSON'));
        }
      }
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    const onEnd = (): void => {
      cleanup();
      if (messageLength === null) {
        reject(new Error('Stdin closed before receiving message'));
      }
    };

    const cleanup = (): void => {
      process.stdin.off('data', onData);
      process.stdin.off('error', onError);
      process.stdin.off('end', onEnd);
    };

    process.stdin.on('data', onData);
    process.stdin.on('error', onError);
    process.stdin.on('end', onEnd);
  });
}

// =============================================================================
// IPC Client (to query running daemon)
// =============================================================================

const MESSAGE_DELIMITER = '\n';

/**
 * Register extension with daemon and get session assignment via IPC.
 * 
 * @param socketPath - Path to daemon's IPC socket
 * @returns Promise resolving to {sessionId, ip, port}
 */
export function registerExtension(socketPath: string): Promise<{ sessionId: string; ip: string; port: number }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';

    socket.on('connect', () => {
      const message: IpcMessage = {
        type: 'register_extension',
        payload: null,
      };
      socket.write(JSON.stringify(message) + MESSAGE_DELIMITER);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      const delimiterIndex = buffer.indexOf(MESSAGE_DELIMITER);
      if (delimiterIndex !== -1) {
        const rawMessage = buffer.slice(0, delimiterIndex);
        socket.end();

        try {
          const response = JSON.parse(rawMessage) as IpcMessage;

          if (response.type === 'registration' && response.payload) {
            const registration = response.payload as ExtensionRegistrationResponse;
            if (
              typeof registration.sessionId === 'string' &&
              typeof registration.ip === 'string' &&
              typeof registration.port === 'number'
            ) {
              resolve(registration);
            } else {
              reject(new Error('Invalid registration format from daemon'));
            }
          } else if (response.type === 'response' && response.payload) {
            // Error response
            const errorPayload = response.payload as { error?: string };
            reject(new Error(errorPayload.error || 'Registration failed'));
          } else {
            reject(new Error(`Unexpected response type: ${response.type}`));
          }
        } catch (err) {
          reject(new Error('Failed to parse daemon response'));
        }
      }
    });

    socket.on('error', (err: Error) => {
      reject(new Error(`Failed to connect to daemon: ${err.message}`));
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout connecting to daemon'));
    });

    socket.setTimeout(5000);
  });
}

/**
 * Query the running daemon for its WebSocket endpoint via IPC.
 * 
 * @param socketPath - Path to daemon's IPC socket
 * @returns Promise resolving to browser endpoint
 */
export function queryDaemonEndpoint(socketPath: string): Promise<BrowserEndpoint> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';

    socket.on('connect', () => {
      // Send get_endpoint request
      const message: IpcMessage = {
        type: 'get_endpoint',
        payload: null,
      };
      socket.write(JSON.stringify(message) + MESSAGE_DELIMITER);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      // Check for complete message
      const delimiterIndex = buffer.indexOf(MESSAGE_DELIMITER);
      if (delimiterIndex !== -1) {
        const rawMessage = buffer.slice(0, delimiterIndex);
        socket.end();

        try {
          const response = JSON.parse(rawMessage) as IpcMessage;

          if (response.type === 'endpoint' && response.payload) {
            const endpoint = response.payload as BrowserEndpoint;
            if (typeof endpoint.ip === 'string' && typeof endpoint.port === 'number') {
              resolve(endpoint);
            } else {
              reject(new Error('Invalid endpoint format from daemon'));
            }
          } else {
            reject(new Error(`Unexpected response type: ${response.type}`));
          }
        } catch (err) {
          reject(new Error('Failed to parse daemon response'));
        }
      }
    });

    socket.on('error', (err: Error) => {
      reject(new Error(`Failed to connect to daemon: ${err.message}`));
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout connecting to daemon'));
    });

    // Set a reasonable timeout
    socket.setTimeout(5000);
  });
}

// =============================================================================
// Query Mode Entry Point
// =============================================================================

/**
 * Run the daemon in query mode (native messaging host).
 * Called when daemon is invoked with --query flag.
 * 
 * @param socketPath - Path to running daemon's IPC socket
 */
export async function runQueryMode(socketPath: string): Promise<void> {
  try {
    // Read request from Chrome
    const request = await readNativeMessage();

    if (request.type === 'get_browser_endpoint') {
      // Legacy: just get endpoint without session assignment
      const endpoint = await queryDaemonEndpoint(socketPath);
      writeNativeMessage({ ip: endpoint.ip, port: endpoint.port });
      process.exit(0);
    }

    if (request.type === 'register_extension') {
      // New: register extension and get assigned session
      const registration = await registerExtension(socketPath);
      writeNativeMessage({ 
        ip: registration.ip, 
        port: registration.port, 
        sessionId: registration.sessionId 
      });
      process.exit(0);
    }

    writeNativeMessage({ error: `Unknown request type: ${request.type}` });
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    writeNativeMessage({ error: message });
    process.exit(1);
  }
}
