/**
 * WebSocket Server - Handles communication between daemon and browser extensions
 *
 * Extensions connect via WebSocket, register with a session ID, and receive commands.
 * The daemon maintains one WebSocket connection per session.
 */

import { WebSocketServer, type WebSocket } from "ws";
import type {
  WsMessage,
  ExtensionCommand,
  ExtensionResponse,
  ExtensionRegistration,
  SessionId,
  DaemonConfig,
} from "./types.js";
import type { SessionManager } from "./session-manager.js";

/**
 * Event handlers for WebSocket server events
 */
export interface WsServerEventHandlers {
  onExtensionConnected: (sessionId: SessionId, ws: WebSocket) => void;
  onExtensionDisconnected: (sessionId: SessionId) => void;
  onExtensionResponse: (sessionId: SessionId, response: ExtensionResponse) => void;
}

/**
 * Tracks pending heartbeat state for a connection
 */
interface HeartbeatState {
  intervalTimer: NodeJS.Timeout;
  timeoutTimer: NodeJS.Timeout | null;
  lastAckTime: number;
}

/**
 * WebSocket Server class
 * Manages WebSocket connections from browser extensions
 */
export class WsServer {
  private wss: WebSocketServer | null = null;
  private connections: Map<SessionId, WebSocket> = new Map();
  private connectionToSession: Map<WebSocket, SessionId> = new Map();
  private eventHandlers: WsServerEventHandlers | null = null;
  private heartbeatStates: Map<SessionId, HeartbeatState> = new Map();
  private sessionManager: SessionManager | null = null;

  constructor(private config: DaemonConfig) { }

  setSessionManager(sessionManager: SessionManager): void {
    this.sessionManager = sessionManager;
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create WebSocketServer on config.wsPort
      this.wss = new WebSocketServer({ port: this.config.wsPort });

      // Set up error handler
      this.wss.on("error", (err) => {
        console.error("WebSocket server error:", err.message);
        reject(err);
      });

      // Set up connection handler
      this.wss.on("connection", (ws, req) => {
        this.handleConnection(ws, req);
      });

      // Wait for server to start listening
      this.wss.on("listening", () => {
        resolve();
      });
    });
  }

  /**
   * Stop the WebSocket server and close all connections
   */
  async stop(): Promise<void> {
    // Clear all heartbeat timers
    for (const [sessionId, state] of this.heartbeatStates) {
      clearInterval(state.intervalTimer);
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
      }
    }
    this.heartbeatStates.clear();

    // Close all active connections
    for (const [_sessionId, ws] of this.connections) {
      try {
        ws.close(1000, "Server shutting down");
      } catch {
        // Ignore close errors
      }
    }

    // Clear connections maps
    this.connections.clear();
    this.connectionToSession.clear();

    // Close the WebSocket server
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  // ===========================================================================
  // Event Handler Registration
  // ===========================================================================

  /**
   * Register event handlers for extension events
   */
  setEventHandlers(handlers: WsServerEventHandlers): void {
    // Validate handlers object
    if (!handlers || typeof handlers !== "object") {
      throw new Error("Invalid event handlers object");
    }
    if (typeof handlers.onExtensionConnected !== "function") {
      throw new Error("onExtensionConnected handler must be a function");
    }
    if (typeof handlers.onExtensionDisconnected !== "function") {
      throw new Error("onExtensionDisconnected handler must be a function");
    }
    if (typeof handlers.onExtensionResponse !== "function") {
      throw new Error("onExtensionResponse handler must be a function");
    }

    // Store event handlers
    this.eventHandlers = handlers;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Handle a new WebSocket connection
   * 
   * ONE WINDOW = ONE SESSION: Each WebSocket connection represents a browser window.
   * The daemon will assign a unique session ID via handshake protocol.
   */
  private handleConnection(ws: WebSocket, _req: any): void {
    // Set up message handler
    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, data);
    });

    // Set up close handler
    ws.on("close", () => {
      const sessionId = this.connectionToSession.get(ws);
      if (sessionId) {
        this.handleDisconnection(sessionId);
      }
      this.connectionToSession.delete(ws);
    });

    // Set up error handler
    ws.on("error", (err) => {
      console.error("WebSocket connection error:", err.message);
      const sessionId = this.connectionToSession.get(ws);
      if (sessionId) {
        this.handleDisconnection(sessionId);
      }
    });

    // Connection will wait for registration message
    // (handled in handleMessage when type === 'register')
  }

  /**
   * Handle extension registration with full session assignment protocol
   * 
   * Protocol flow:
   * 1. Check for awaiting_extension sessions (daemon-launched browsers)
   *    → These take priority because the daemon explicitly started a browser for them
   * 
   * 2. Try cached session reattachment
   *    → Each window caches its own sessionId, so this is safe
   * 
   * 3. If no match:
   *    → Create new virtual session
   * 
   * 4. Send session_assigned message to extension
   *    → Extension caches this per-windowId for future reconnection
   */
  private handleRegistration(ws: WebSocket, registration: ExtensionRegistration, sessionManager: SessionManager): SessionId {
    let sessionId: SessionId;
    const windowId = registration.windowId;

    // a. Check for awaiting_extension sessions (daemon-launched browsers waiting)
    const awaitingSessions = sessionManager.getAwaitingExtensionSessions();
    if (awaitingSessions.length > 0) {
      // Sort by createdAt (oldest first) and assign first awaiting session
      awaitingSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const assignedSession = awaitingSessions[0];
      console.log(`Assigning to awaiting session: ${assignedSession.name} (${assignedSession.id})`);
      sessionId = assignedSession.id;
    }
    // b. Try cached session reattachment (safe since each window caches its own sessionId)
    else if (registration.cachedSessionId) {
      const cachedSession = sessionManager.getSession(registration.cachedSessionId);
      if (cachedSession) {
        console.log(`Reattaching to cached session: ${registration.cachedSessionId}`);
        sessionId = registration.cachedSessionId;
      } else {
        console.log(`Cached session ${registration.cachedSessionId} not found, creating new session`);
        sessionId = this.createNewSession(sessionManager);
      }
    } else {
      // No cached session ID and no awaiting sessions, create new session
      sessionId = this.createNewSession(sessionManager);
    }

    // Check if session already has a stale connection
    const existingWs = this.connections.get(sessionId);
    if (existingWs && existingWs !== ws) {
      console.log(`Closing stale connection for session: ${sessionId}`);
      try {
        existingWs.close(4001, "New connection for session");
      } catch {
        // Ignore close errors
      }
      this.stopHeartbeat(sessionId);
      this.connectionToSession.delete(existingWs);
    }

    // Store new connection
    this.connections.set(sessionId, ws);
    this.connectionToSession.set(ws, sessionId);

    // Update session state
    sessionManager.setExtensionConnection(sessionId, ws);

    // Start heartbeat
    this.startHeartbeat(sessionId);

    // Notify handler
    if (this.eventHandlers) {
      this.eventHandlers.onExtensionConnected(sessionId, ws);
    }

    // Send session_assigned message
    try {
      ws.send(JSON.stringify({ type: "session_assigned", sessionId }));
    } catch (err) {
      console.error("Failed to send session_assigned message:", err);
    }

    console.log(`Extension registered for session: ${sessionId} (windowId: ${windowId})`);
    return sessionId;
  }

  /**
   * Create a new session for an extension that doesn't match any existing session
   */
  private createNewSession(sessionManager: SessionManager): SessionId {
    const sessionName = `window-${Date.now()}`;
    const newSession = sessionManager.createSession(sessionName, undefined);
    console.log(`Created new session ${newSession.id} with name ${sessionName}`);
    return newSession.id;
  }

  /**
   * Handle extension disconnection
   */
  private handleDisconnection(sessionId: SessionId): void {
    // Clear heartbeat timer
    this.stopHeartbeat(sessionId);

    // Get the connection before removing
    const ws = this.connections.get(sessionId);

    // Remove from connections map
    this.connections.delete(sessionId);
    if (ws) {
      this.connectionToSession.delete(ws);
    }

    // Notify via onExtensionDisconnected
    if (this.eventHandlers) {
      this.eventHandlers.onExtensionDisconnected(sessionId);
    }
  }

  /**
   * Stop heartbeat monitoring for a session
   */
  private stopHeartbeat(sessionId: SessionId): void {
    const state = this.heartbeatStates.get(sessionId);
    if (state) {
      clearInterval(state.intervalTimer);
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
      }
      this.heartbeatStates.delete(sessionId);
    }
  }

  /**
   * Get the WebSocket connection for a session
   */
  getConnection(sessionId: SessionId): WebSocket | null {
    return this.connections.get(sessionId) ?? null;
  }

  /**
   * Check if a session has an active connection
   */
  isConnected(sessionId: SessionId): boolean {
    const ws = this.connections.get(sessionId);
    if (!ws) {
      return false;
    }
    // Verify connection is open (readyState 1 = OPEN)
    return ws.readyState === 1;
  }

  /**
   * Update the session ID for a connection
   * Used when the daemon maps a registration name to an actual session ID
   */
  updateSessionId(oldSessionId: SessionId, newSessionId: SessionId): void {
    const ws = this.connections.get(oldSessionId);
    if (!ws) {
      return;
    }

    // Move connection to new session ID
    this.connections.delete(oldSessionId);
    this.connections.set(newSessionId, ws);

    // Update reverse mapping
    this.connectionToSession.set(ws, newSessionId);

    // Move heartbeat state
    const heartbeatState = this.heartbeatStates.get(oldSessionId);
    if (heartbeatState) {
      this.heartbeatStates.delete(oldSessionId);
      this.heartbeatStates.set(newSessionId, heartbeatState);
    }
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  /**
   * Handle an incoming WebSocket message
   * Extension sends raw messages (no envelope wrapper):
   * - Responses: { id, success, data?, error? }
   * - Heartbeat: { type: "ping" } or { type: "pong" }
   * - Registration: { type: "register", sessionId, ... }
   */
  private handleMessage(ws: WebSocket, data: Buffer): void {
    // First, try to parse as JSON
    let parsed: any;
    try {
      const str = data.toString("utf8");
      parsed = JSON.parse(str);
    } catch {
      console.warn("Received invalid JSON from extension");
      return;
    }

    // Check if this is a raw response (has 'id' and 'success' fields, no 'type')
    // Raw responses don't have a 'type' field, so check this FIRST
    if (this.isRawResponse(parsed)) {
      const sessionId = this.connectionToSession.get(ws);
      if (sessionId) {
        this.handleResponse(sessionId, parsed as ExtensionResponse);
      }
      return;
    }

    // Now check for typed messages
    const message = this.parseMessage(data);
    if (!message) {
      console.warn("Received invalid message format (not a raw response and no valid type)");
      return;
    }

    // Route based on message type
    switch (message.type) {
      case "register":
        // Handle 'register' message with session manager
        if (!this.sessionManager) {
          console.error("Cannot handle registration: session manager not set");
          ws.close(4000, "Server not ready");
          break;
        }
        // Extension sends register message directly (not wrapped in payload)
        this.handleRegistration(ws, message as unknown as ExtensionRegistration, this.sessionManager);
        break;

      case "response":
        // Handle wrapped 'response' message (legacy support)
        const sessionId = this.connectionToSession.get(ws);
        if (sessionId && message.payload) {
          this.handleResponse(sessionId, message.payload as ExtensionResponse);
        }
        break;

      case "pong":
        // Handle 'pong' message from extension (response to our ping)
        this.handleHeartbeatAck(ws);
        break;

      case "ping":
        // Handle 'ping' message from extension - respond with 'pong'
        try {
          const pongMessage = { type: "pong" };
          ws.send(JSON.stringify(pongMessage));
        } catch (err) {
          console.error("Failed to send pong:", err);
        }
        break;

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Check if a message is a raw response (has 'id' and 'success' fields)
   */
  private isRawResponse(message: any): boolean {
    return (
      message &&
      typeof message.id === "string" &&
      typeof message.success === "boolean"
    );
  }

  /**
   * Handle heartbeat acknowledgment from extension
   */
  private handleHeartbeatAck(ws: WebSocket): void {
    const sessionId = this.connectionToSession.get(ws);
    if (!sessionId) {
      return;
    }

    const state = this.heartbeatStates.get(sessionId);
    if (state) {
      // Clear the timeout timer
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
        state.timeoutTimer = null;
      }
      // Update last ack time
      state.lastAckTime = Date.now();
    }
  }

  /**
   * Handle a command response from the extension
   */
  private handleResponse(sessionId: SessionId, response: ExtensionResponse): void {
    // Validate response structure
    if (!response.id || typeof response.id !== "string") {
      console.warn("Invalid response: missing or invalid command ID");
      return;
    }
    if (typeof response.success !== "boolean") {
      console.warn("Invalid response: missing success field");
      return;
    }

    // Notify via onExtensionResponse
    if (this.eventHandlers) {
      this.eventHandlers.onExtensionResponse(sessionId, response);
    }
  }

  // ===========================================================================
  // Command Sending
  // ===========================================================================

  /**
   * Send a command to an extension
   * Per protocol spec, commands are sent as raw JSON without envelope wrapper:
   * { id: string, type: string, params?: object }
   */
  sendCommand(sessionId: SessionId, command: ExtensionCommand): boolean {
    // Get connection for session
    const ws = this.connections.get(sessionId);

    // Return false if not connected
    if (!ws || ws.readyState !== 1) {
      return false;
    }

    // Send command directly (no envelope wrapper per protocol)
    try {
      ws.send(JSON.stringify(command));
      return true;
    } catch (err) {
      console.error(`Failed to send command to session ${sessionId}:`, err);
      return false;
    }
  }

  // ===========================================================================
  // Heartbeat Management
  // ===========================================================================

  /**
   * Start heartbeat monitoring for a connection
   */
  private startHeartbeat(sessionId: SessionId): void {
    // Clear any existing timer
    this.stopHeartbeat(sessionId);

    // Set up interval timer
    const intervalTimer = setInterval(() => {
      this.sendHeartbeat(sessionId);
    }, this.config.heartbeatInterval);

    // Initialize heartbeat state
    const state: HeartbeatState = {
      intervalTimer,
      timeoutTimer: null,
      lastAckTime: Date.now(),
    };

    this.heartbeatStates.set(sessionId, state);
  }

  /**
   * Handle heartbeat timeout (extension unresponsive)
   */
  private handleHeartbeatTimeout(sessionId: SessionId): void {
    console.warn(`Heartbeat timeout for session: ${sessionId}`);

    // Get connection
    const ws = this.connections.get(sessionId);
    if (ws) {
      // Close connection
      try {
        ws.close(4002, "Heartbeat timeout");
      } catch {
        // Ignore close errors
      }
    }

    // Trigger disconnection handling
    this.handleDisconnection(sessionId);
  }

  /**
   * Send a heartbeat (ping) message to an extension
   */
  private sendHeartbeat(sessionId: SessionId): void {
    // Get connection
    const ws = this.connections.get(sessionId);
    if (!ws || ws.readyState !== 1) {
      return;
    }

    // Create ping message (per protocol spec)
    const message = { type: "ping" };

    // Send ping message
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`Failed to send ping to session ${sessionId}:`, err);
      return;
    }

    // Start timeout timer
    const state = this.heartbeatStates.get(sessionId);
    if (state) {
      // Clear existing timeout if any
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
      }

      // Set new timeout
      state.timeoutTimer = setTimeout(() => {
        this.handleHeartbeatTimeout(sessionId);
      }, this.config.heartbeatTimeout);
    }
  }

  // ===========================================================================
  // Message Serialization
  // ===========================================================================

  /**
   * Parse a WebSocket message
   */
  private parseMessage(data: Buffer): WsMessage | null {
    try {
      // Decode as UTF-8
      const str = data.toString("utf8");

      // Parse JSON
      const parsed = JSON.parse(str);

      // Validate structure - must have type field
      if (!parsed || typeof parsed.type !== "string") {
        return null;
      }

      return parsed as WsMessage;
    } catch {
      return null;
    }
  }

  /**
   * Serialize a message for sending
   */
  private serializeMessage(message: WsMessage): string {
    return JSON.stringify(message);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new WebSocket server instance
 */
export function createWsServer(config: DaemonConfig): WsServer {
  return new WsServer(config);
}
