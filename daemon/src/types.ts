/**
 * Type definitions for tab-daemon
 *
 * This module defines all shared types used across the daemon.
 */

import type { WebSocket } from "ws";
import type { ChildProcess } from "node:child_process";

// =============================================================================
// Session Types
// =============================================================================

/**
 * Represents a unique session identifier
 */
export type SessionId = string;

/**
 * Session state enumeration
 */
export type SessionState = "active" | "disconnected" | "pending" | "awaiting_extension";

/**
 * A session represents a browser window instance.
 * ONE WINDOW = ONE SESSION. Each browser window has its own unique session ID.
 * 
 * Multiple windows can share the same profile (1 profile → many windows/sessions).
 * The 'default' session name is scoped per profile, but each window still has
 * its own unique session ID even if they share the same profile.
 */
export interface Session {
  id: SessionId;
  name: string;
  /** Browser profile directory. Undefined means default profile. */
  profileDir: string | undefined;
  state: SessionState;
  createdAt: Date;
  extensionConnection: WebSocket | null;
  browserProcess: ChildProcess | null;
}

// =============================================================================
// Command Types
// =============================================================================

/**
 * Unique identifier for a command request
 */
export type CommandId = string;

/**
 * All supported command types
 * These map to extension command types (some have transformations)
 */
export type CommandType =
  // Navigation commands
  | "navigate"  // Maps to "open" in extension
  | "open"      // Direct open command
  | "back"
  | "forward"
  | "reload"
  | "close"
  // Snapshot
  | "snapshot"
  // Element interactions
  | "click"
  | "dblclick"
  | "fill"
  | "type"
  | "press"
  | "hover"
  | "focus"
  | "check"
  | "uncheck"
  | "select"
  // Scroll
  | "scroll"
  | "scrollintoview"
  // Element queries
  | "get"
  | "is"
  | "find"
  // Advanced interactions
  | "drag"
  | "upload"
  | "mouse"
  | "wait"
  // Tab management (mapped to "tab" with action param)
  | "tab"
  | "tab_new"
  | "tab_close"
  | "tab_switch"
  | "tab_list"
  // Capture
  | "screenshot"
  | "pdf"
  // Script execution
  | "eval";

/**
 * Command sent from CLI to daemon
 * 
 * The profile field specifies which browser profile directory to use.
 * This is required when creating new sessions (especially default sessions).
 * Profile is undefined for default profile, or a path to the profile directory.
 */
export interface Command {
  id: CommandId;
  sessionId: SessionId;
  profile: string | undefined;
  type: CommandType;
  params?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Command forwarded from daemon to extension
 * Uses 'params' per protocol specification (not 'payload')
 */
export interface ExtensionCommand {
  id: CommandId;
  type: string;  // Allow any string type for extension commands
  params?: Record<string, unknown>;
}

/**
 * Response from extension back to daemon
 */
export interface ExtensionResponse {
  id: CommandId;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Response from daemon back to CLI
 */
export interface CommandResponse {
  id: CommandId;
  success: boolean;
  data?: unknown;
  error?: string;
}

// =============================================================================
// IPC Types (CLI <-> Daemon)
// =============================================================================

/**
 * Message types for IPC communication
 */
export type IpcMessageType = "command" | "response" | "ping" | "pong" | "get_endpoint" | "endpoint" | "register_extension" | "registration";

/**
 * IPC message envelope
 */
export interface IpcMessage {
  type: IpcMessageType;
  payload: Command | CommandResponse | null;
}

// =============================================================================
// WebSocket Types (Daemon <-> Extension)
// =============================================================================

/**
 * Message types for WebSocket communication
 */
export type WsMessageType =
  | "command"
  | "response"
  | "heartbeat"
  | "heartbeat_ack"
  | "register"
  | "ping"
  | "pong";

/**
 * WebSocket message envelope
 */
export interface WsMessage {
  type: WsMessageType;
  sessionId?: SessionId;
  payload: ExtensionCommand | ExtensionResponse | null;
}

/**
 * Extension registration payload
 * 
 * When extension reconnects, it sends its cached session_id for reattachment.
 * If valid, daemon reattaches to that session.
 * If invalid/absent, daemon uses heuristic matching or creates new session.
 */
export interface ExtensionRegistration {
  windowId: number;
  cachedSessionId: SessionId | undefined;
}

// =============================================================================
// Browser Types
// =============================================================================

/**
 * Browser launch options
 * 
 * profileDir specifies which browser profile directory to use.
 * This maps to Chrome's --user-data-dir flag.
 * Undefined means use default profile.
 * 
 * url specifies the initial URL to open. If provided, the browser
 * will launch directly to this URL using --new-window flag.
 */
export interface BrowserLaunchOptions {
  sessionId: SessionId;
  profileDir: string | undefined;
  url?: string;
  executablePath?: string;
  args?: string[];
}

/**
 * Browser process info
 */
export interface BrowserProcessInfo {
  pid: number;
  sessionId: SessionId;
  launchedAt: Date;
}

// =============================================================================
// Daemon Configuration
// =============================================================================

/**
 * Daemon configuration options
 */
export interface DaemonConfig {
  ipcSocketPath: string;
  wsPort: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  defaultBrowserPath?: string;
}

/**
 * Default daemon configuration
 */
export const DEFAULT_CONFIG: DaemonConfig = {
  ipcSocketPath: "/tmp/tab-daemon.sock",
  wsPort: 9222,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
};

// =============================================================================
// Error Types
// =============================================================================

/**
 * Daemon error codes
 */
export type DaemonErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_DISCONNECTED"
  | "COMMAND_TIMEOUT"
  | "EXTENSION_NOT_CONNECTED"
  | "BROWSER_LAUNCH_FAILED"
  | "INVALID_COMMAND"
  | "INTERNAL_ERROR";

/**
 * Structured daemon error
 */
export class DaemonError extends Error {
  constructor(
    public code: DaemonErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DaemonError";
  }
}
