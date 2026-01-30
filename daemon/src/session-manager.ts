/**
 * Session Manager - Manages browser sessions
 *
 * A session represents a logical routing identifier for browser contexts.
 */

import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { ChildProcess } from "node:child_process";
import type {
  Session,
  SessionId,
  SessionState,
  DaemonConfig,
} from "./types.js";

/**
 * Default session name
 */
export const DEFAULT_SESSION_NAME = "default";

/**
 * Session Manager class
 * Handles creation, retrieval, and state management of sessions
 * 
 * SESSION MODEL:
 * - ONE WINDOW = ONE SESSION. Each browser window has its own unique session ID.
 * - 1 profile → many sessions (windows). Multiple windows can share the same profile.
 * - Sessions are created either by CLI command or when extension connects.
 */
export class SessionManager {
  private sessions: Map<SessionId, Session> = new Map();
  // Each session ID maps to one browser window
  private sessionsByName: Map<string, SessionId> = new Map();
  // Maps profile directory to default session ID for that profile
  // Key is profileDir (or "__default__" for undefined profile)
  private profileDefaultSessions: Map<string, SessionId> = new Map();

  constructor(private config: DaemonConfig) { }

  // ===========================================================================
  // Session CRUD Operations
  // ===========================================================================

  /**
   * Create a new session
   * 
   * @param name - Session name (e.g., "default", "work-session")
   * @param profileDir - Browser profile directory. Undefined means default profile.
   * @returns The created session
   */
  createSession(name: string, profileDir: string | undefined = undefined): Session {
    // Validate session name
    if (!this.validateSessionName(name)) {
      throw new Error(`Invalid session name: "${name}". Must be alphanumeric with dashes/underscores, 1-64 characters.`);
    }

    // Check if session name already exists
    if (this.hasSessionName(name)) {
      throw new Error(`Session with name "${name}" already exists`);
    }

    // Generate unique session ID
    const id = this.generateSessionId();

    // Create session object
    const session: Session = {
      id,
      name,
      profileDir,
      state: "pending",
      createdAt: new Date(),
      extensionConnection: null,
      browserProcess: null,
    };

    // Store in sessions map
    this.sessions.set(id, session);

    // Store name -> ID mapping
    this.sessionsByName.set(name, id);

    // If this is a default session, track it per profile
    if (name === DEFAULT_SESSION_NAME) {
      const profileKey = profileDir ?? "__default__";
      this.profileDefaultSessions.set(profileKey, id);
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: SessionId): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get a session by name
   */
  getSessionByName(name: string): Session | null {
    const sessionId = this.sessionsByName.get(name);
    if (!sessionId) {
      return null;
    }
    return this.getSession(sessionId);
  }

  /**
   * Get or create the default session for a profile
   * 
   * @param profileDir - Browser profile directory. Undefined means default profile.
   * @returns The default session for this profile
   */
  getOrCreateDefaultSession(profileDir: string | undefined = undefined): Session {
    const profileKey = profileDir ?? "__default__";
    
    // Check if we already have a default session for this profile
    const existingId = this.profileDefaultSessions.get(profileKey);
    if (existingId) {
      const existing = this.getSession(existingId);
      if (existing) {
        return existing;
      }
      // Session was deleted, clean up the stale reference
      this.profileDefaultSessions.delete(profileKey);
    }
    
    // Create new default session for this profile
    return this.createSession(DEFAULT_SESSION_NAME, profileDir);
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: SessionId): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Close any associated WebSocket connection
    if (session.extensionConnection) {
      try {
        session.extensionConnection.close();
      } catch {
        // Ignore close errors
      }
    }

    // Note: Browser process cleanup should be handled by BrowserManager
    // We just clear the reference here

    // Remove from maps
    this.sessions.delete(sessionId);
    this.sessionsByName.delete(session.name);

    // Clean up profile default session reference if this was a default session
    if (session.name === DEFAULT_SESSION_NAME) {
      const profileKey = session.profileDir ?? "__default__";
      if (this.profileDefaultSessions.get(profileKey) === sessionId) {
        this.profileDefaultSessions.delete(profileKey);
      }
    }

    return true;
  }

  // ===========================================================================
  // Session State Management
  // ===========================================================================

  /**
   * Update session state
   */
  updateSessionState(sessionId: SessionId, state: SessionState): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.state = state;
  }

  /**
   * Associate an extension WebSocket connection with a session
   */
  setExtensionConnection(sessionId: SessionId, ws: WebSocket | null): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.extensionConnection = ws;
    // Update state based on connection status
    session.state = ws ? "active" : "disconnected";
  }

  /**
   * Associate a browser process with a session
   */
  setBrowserProcess(sessionId: SessionId, process: ChildProcess | null): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.browserProcess = process;
  }



  // ===========================================================================
  // Session Queries
  // ===========================================================================

  /**
   * Check if a session exists
   */
  hasSession(sessionId: SessionId): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Check if a session name is taken
   */
  hasSessionName(name: string): boolean {
    return this.sessionsByName.has(name);
  }

  /**
   * Get all active sessions (with connected extensions)
   */
  getActiveSessions(): Session[] {
    return this.listSessions().filter((s) => s.state === "active");
  }

  /**
   * Get all disconnected sessions
   */
  getDisconnectedSessions(): Session[] {
    return this.listSessions().filter((s) => s.state === "disconnected");
  }

  /**
   * Get all sessions awaiting extension connection
   */
  getAwaitingExtensionSessions(): Session[] {
    return this.listSessions().filter((s) => s.state === "awaiting_extension");
  }

  /**
   * Assign the next session awaiting an extension connection (FIFO order)
   * Returns the session and marks it as pending (caller will set to active when WS connects)
   */
  assignNextAwaitingSession(): Session | null {
    const awaiting = this.getAwaitingExtensionSessions();
    if (awaiting.length === 0) {
      return null;
    }
    // Sort by createdAt (oldest first) and return first
    awaiting.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return awaiting[0];
  }

  /**
   * Get the default session for a profile (if it exists)
   * 
   * @param profileDir - Browser profile directory. Undefined means default profile.
   * @returns The default session for this profile, or null if not found
   */
  getDefaultSessionByProfile(profileDir: string | undefined): Session | null {
    const profileKey = profileDir ?? "__default__";
    const sessionId = this.profileDefaultSessions.get(profileKey);
    if (!sessionId) {
      return null;
    }
    return this.getSession(sessionId);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): SessionId {
    return randomUUID();
  }

  /**
   * Validate session name format
   */
  private validateSessionName(name: string): boolean {
    // Check non-empty
    if (!name || name.length === 0) {
      return false;
    }

    // Check reasonable length (1-64 characters)
    if (name.length > 64) {
      return false;
    }

    // Check valid characters (alphanumeric, dash, underscore)
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(name);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new session manager instance
 */
export function createSessionManager(config: DaemonConfig): SessionManager {
  return new SessionManager(config);
}
