/**
 * Unit tests for SessionManager
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionManager, type SessionManager, DEFAULT_SESSION_NAME } from "../../src/session-manager.js";
import { createTestConfig } from "../utils/test-config.js";

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  const config = createTestConfig();

  beforeEach(() => {
    sessionManager = createSessionManager(config);
  });

  afterEach(async () => {
    // No cleanup needed
  });

  describe("createSession", () => {
    it("should create a new session with valid name", () => {
      const session = sessionManager.createSession("test-session");

      expect(session).toBeDefined();
      expect(session.name).toBe("test-session");
      expect(session.state).toBe("pending");
      expect(session.id).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.extensionConnection).toBeNull();
      expect(session.browserProcess).toBeNull();
    });

    it("should generate unique session IDs", () => {
      const session1 = sessionManager.createSession("session-1");
      const session2 = sessionManager.createSession("session-2");

      expect(session1.id).not.toBe(session2.id);
    });

    it("should throw error for duplicate session name", () => {
      sessionManager.createSession("duplicate");

      expect(() => sessionManager.createSession("duplicate")).toThrow(
        'Session with name "duplicate" already exists'
      );
    });

    it("should throw error for invalid session name (empty)", () => {
      expect(() => sessionManager.createSession("")).toThrow(
        "Invalid session name"
      );
    });

    it("should throw error for invalid session name (too long)", () => {
      const longName = "a".repeat(65);
      expect(() => sessionManager.createSession(longName)).toThrow(
        "Invalid session name"
      );
    });

    it("should throw error for invalid session name (special characters)", () => {
      expect(() => sessionManager.createSession("test@session")).toThrow(
        "Invalid session name"
      );
    });

    it("should accept valid session names with dashes and underscores", () => {
      const session1 = sessionManager.createSession("test-session-1");
      const session2 = sessionManager.createSession("test_session_2");

      expect(session1.name).toBe("test-session-1");
      expect(session2.name).toBe("test_session_2");
    });
  });

  describe("getSession", () => {
    it("should return session by ID", () => {
      const created = sessionManager.createSession("my-session");
      const retrieved = sessionManager.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("my-session");
    });

    it("should return null for non-existent session", () => {
      const session = sessionManager.getSession("non-existent-id");
      expect(session).toBeNull();
    });
  });

  describe("getSessionByName", () => {
    it("should return session by name", () => {
      const created = sessionManager.createSession("named-session");
      const retrieved = sessionManager.getSessionByName("named-session");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return null for non-existent name", () => {
      const session = sessionManager.getSessionByName("non-existent");
      expect(session).toBeNull();
    });
  });

  describe("getOrCreateDefaultSession", () => {
    it("should create default session if it does not exist", () => {
      const session = sessionManager.getOrCreateDefaultSession();

      expect(session).toBeDefined();
      expect(session.name).toBe(DEFAULT_SESSION_NAME);
    });

    it("should return existing default session", () => {
      const first = sessionManager.getOrCreateDefaultSession();
      const second = sessionManager.getOrCreateDefaultSession();

      expect(first.id).toBe(second.id);
    });
  });

  describe("listSessions", () => {
    it("should return empty array when no sessions exist", () => {
      const sessions = sessionManager.listSessions();
      expect(sessions).toEqual([]);
    });

    it("should return all created sessions", () => {
      sessionManager.createSession("session-1");
      sessionManager.createSession("session-2");
      sessionManager.createSession("session-3");

      const sessions = sessionManager.listSessions();
      expect(sessions).toHaveLength(3);
    });
  });

  describe("deleteSession", () => {
    it("should delete existing session", () => {
      const session = sessionManager.createSession("to-delete");
      
      const result = sessionManager.deleteSession(session.id);
      
      expect(result).toBe(true);
      expect(sessionManager.getSession(session.id)).toBeNull();
      expect(sessionManager.getSessionByName("to-delete")).toBeNull();
    });

    it("should return false for non-existent session", () => {
      const result = sessionManager.deleteSession("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("updateSessionState", () => {
    it("should update session state", () => {
      const session = sessionManager.createSession("state-test");
      
      sessionManager.updateSessionState(session.id, "active");
      
      expect(sessionManager.getSession(session.id)?.state).toBe("active");
    });

    it("should throw error for non-existent session", () => {
      expect(() => {
        sessionManager.updateSessionState("non-existent", "active");
      }).toThrow("Session not found");
    });
  });

  describe("hasSession / hasSessionName", () => {
    it("should return true for existing session", () => {
      const session = sessionManager.createSession("exists");
      
      expect(sessionManager.hasSession(session.id)).toBe(true);
      expect(sessionManager.hasSessionName("exists")).toBe(true);
    });

    it("should return false for non-existent session", () => {
      expect(sessionManager.hasSession("nope")).toBe(false);
      expect(sessionManager.hasSessionName("nope")).toBe(false);
    });
  });

  describe("getActiveSessions / getDisconnectedSessions", () => {
    it("should filter sessions by state", () => {
      const session1 = sessionManager.createSession("s1");
      const session2 = sessionManager.createSession("s2");
      const session3 = sessionManager.createSession("s3");

      sessionManager.updateSessionState(session1.id, "active");
      sessionManager.updateSessionState(session2.id, "disconnected");
      sessionManager.updateSessionState(session3.id, "active");

      const active = sessionManager.getActiveSessions();
      const disconnected = sessionManager.getDisconnectedSessions();

      expect(active).toHaveLength(2);
      expect(disconnected).toHaveLength(1);
    });
  });


});
