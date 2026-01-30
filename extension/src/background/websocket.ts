import type { AgentCommand, AgentResponse, ExtensionConfig } from '../shared/types';
import { getCachedSessionId, setCachedSessionId } from './storage';

export type CommandHandler = (command: AgentCommand, windowId: number) => Promise<AgentResponse>;

// =============================================================================
// CONNECTION STATE
// =============================================================================

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
}

export interface WebSocketManager {
  connect(): void;
  disconnect(): void;
  send(response: AgentResponse): void;
  isConnected(): boolean;
  getState(): ConnectionState;
  getReconnectAttempts(): number;
  attemptReconnect(): void;
}

export interface WebSocketCallbacks {
  onStateChange?: (state: ConnectionState) => void;
  onMaxReconnectAttemptsReached?: () => void;
}

/**
 * Create a WebSocket manager instance
 * @param config - Extension configuration
 * @param windowId - The browser window ID this manager is associated with
 * @param onCommand - Handler for incoming commands
 * @param callbacks - Optional callbacks for state changes
 */
export function createWebSocketManager(
  config: ExtensionConfig,
  windowId: number,
  onCommand: CommandHandler,
  callbacks?: WebSocketCallbacks
): WebSocketManager {
  let ws: WebSocket | null = null;
  let state: ConnectionState = ConnectionState.DISCONNECTED;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;
  let awaitingPong = false;
  let shouldReconnect = true;

  function setState(newState: ConnectionState): void {
    if (state !== newState) {
      state = newState;
      callbacks?.onStateChange?.(newState);
    }
  }

  /**
   * Start heartbeat interval
   */
  function startHeartbeat(): void {
    stopHeartbeat();

    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      if (awaitingPong) {
        // Previous ping was not answered, connection is stale
        console.warn('[WebSocket] Heartbeat timeout - connection stale');
        ws.close();
        return;
      }

      // Send ping
      try {
        if (pongTimer) {
          clearTimeout(pongTimer);
          pongTimer = null;
        }
        ws.send(JSON.stringify({ type: 'ping' }));
        awaitingPong = true;
        console.log('[WebSocket] Ping sent');

        // Set timeout for pong response
        pongTimer = setTimeout(() => {
          if (awaitingPong) {
            console.warn('[WebSocket] Pong timeout - closing connection');
            ws?.close();
          }
        }, config.heartbeatTimeout);
      } catch (error) {
        console.error('[WebSocket] Failed to send ping:', error);
      }
    }, config.heartbeatInterval);
  }

  /**
   * Stop heartbeat interval
   */
  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
    awaitingPong = false;
  }

  /**
   * Handle pong response
   */
  function handlePong(): void {
    awaitingPong = false;
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
    console.log('[WebSocket] Pong received');
  }

  const manager: WebSocketManager = {
    connect() {
      if (state === ConnectionState.CONNECTING) {
        console.log('[WebSocket] Already connecting');
        return;
      }
      if (state === ConnectionState.CONNECTED) {
        console.log('[WebSocket] Already connected');
        return;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      setState(ConnectionState.CONNECTING);
      shouldReconnect = true;

      // Load cached session ID for potential reattachment
      const cachedSessionId = await getCachedSessionId();

      // Connect to generic endpoint - daemon assigns session via handshake
      const wsUrl = `${config.websocketUrl}/ws`;
      console.log(`[WebSocket:Window${windowId}] Connecting to daemon...`);

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setState(ConnectionState.CONNECTED);
          reconnectAttempts = 0;
          console.log(`[WebSocket:Window${windowId}] Connected - requesting session assignment`);
          // Send registration message to get/reattach session
          ws?.send(JSON.stringify({
            type: 'register',
            windowId,
            cachedSessionId,
          }));
          // Daemon assigns unique session ID - ONE WINDOW = ONE SESSION
          startHeartbeat();
        };

        ws.onmessage = async (event) => {
          let payload: unknown = event.data;
          if (typeof event.data === 'string') {
            try {
              payload = JSON.parse(event.data) as unknown;
            } catch {
              payload = event.data;
            }
          }

          if (isPongMessage(payload)) {
            handlePong();
            return;
          }

          // Handle session assignment from daemon
          if (isSessionAssignedMessage(payload)) {
            setCachedSessionId(payload.sessionId);
            console.log(`[WebSocket:Window${windowId}] Session assigned: ${payload.sessionId}`);
            return;
          }

          const command = parseCommand(payload);
          if (!command) {
            console.error('[WebSocket] Invalid command format:', event.data);
            return;
          }

          console.log(`[WebSocket:${windowId}] Received command:`, command.id);

          try {
            const response = await onCommand(command, windowId);
            try {
              manager.send(response);
            } catch (sendError) {
              console.error('[WebSocket] Failed to send response:', sendError);
            }
          } catch (error) {
            console.error('[WebSocket] Command handler error:', error);
            try {
              manager.send({
                id: command.id,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            } catch (sendError) {
              console.error('[WebSocket] Failed to send error response:', sendError);
            }
          }
        };

        ws.onerror = (error) => {
          console.error(`[WebSocket:${windowId}] Error:`, error);
        };

        ws.onclose = () => {
          setState(ConnectionState.DISCONNECTED);
          ws = null;
          stopHeartbeat();
          console.log(`[WebSocket:${windowId}] Disconnected`);
          if (shouldReconnect) {
            manager.attemptReconnect();
          }
        };
      } catch (error) {
        setState(ConnectionState.DISCONNECTED);
        console.error(`[WebSocket:${windowId}] Connection failed:`, error);
        manager.attemptReconnect();
      }
    },

    disconnect() {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = 0; // Reset attempts on manual disconnect
      stopHeartbeat();
      if (ws) {
        ws.close();
        ws = null;
      }
      setState(ConnectionState.DISCONNECTED);
      console.log(`[WebSocket:${windowId}] Disconnected`);
    },

    send(response: AgentResponse) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error(`[WebSocket:${windowId}] Cannot send: not connected`);
        return;
      }
      try {
        ws.send(JSON.stringify(response));
      } catch (error) {
        console.error(`[WebSocket:${windowId}] Send error:`, error);
      }
    },

    isConnected() {
      return state === ConnectionState.CONNECTED;
    },

    getState() {
      return state;
    },

    getReconnectAttempts() {
      return reconnectAttempts;
    },

    attemptReconnect() {
      if (reconnectAttempts >= config.maxReconnectAttempts) {
        console.error('[WebSocket] Max reconnection attempts reached');
        callbacks?.onMaxReconnectAttemptsReached?.();
        return;
      }

      if (state === ConnectionState.CONNECTING || state === ConnectionState.CONNECTED) {
        return;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      reconnectAttempts++;
      const delay = Math.min(
        config.reconnectInterval * Math.pow(2, reconnectAttempts - 1),
        30000 // Cap at 30 seconds
      );

      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

      reconnectTimer = setTimeout(() => {
        manager.connect();
      }, delay);
    },
  };

  return manager;
}

/**
 * Validate an incoming message as AgentCommand
 */
function parseCommand(data: unknown): AgentCommand | null {
  try {
    if (typeof data === 'string') {
      const parsed = JSON.parse(data) as unknown;
      return validateCommand(parsed);
    }
    return validateCommand(data);
  } catch (error) {
    console.error('[WebSocket] Parse error:', error);
    return null;
  }
}

function isPongMessage(payload: unknown): boolean {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    'type' in payload &&
    (payload as { type?: unknown }).type === 'pong'
  );
}

interface SessionAssignedMessage {
  type: 'session_assigned';
  sessionId: string;
}

function isSessionAssignedMessage(payload: unknown): payload is SessionAssignedMessage {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    'type' in payload &&
    (payload as { type?: unknown }).type === 'session_assigned' &&
    'sessionId' in payload &&
    typeof (payload as { sessionId?: unknown }).sessionId === 'string'
  );
}

/**
 * Validate command structure
 */
function validateCommand(obj: unknown): AgentCommand | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  const cmd = obj as Record<string, unknown>;

  if (typeof cmd.id !== 'string' || !cmd.id) {
    return null;
  }

  if (typeof cmd.type !== 'string' || ![
    'snapshot', 'click', 'dblclick', 'fill', 'type', 'press', 'hover', 'focus', 'check', 'uncheck', 'select', 'tab', 'open', 'get', 'is',
    'drag', 'upload', 'scroll', 'scrollintoview', 'wait', 'screenshot', 'pdf', 'eval', 'close', 'back', 'forward', 'reload', 'find', 'mouse'
  ].includes(cmd.type)) {
    return null;
  }

  // Validate params is undefined or an object
  const params = cmd.params;
  if (params !== undefined && (typeof params !== 'object' || params === null)) {
    return null;
  }

  return {
    id: cmd.id,
    type: cmd.type as AgentCommand['type'],
    params: params as AgentCommand['params'],
  };
}
