/**
 * Integration tests for WebSocket Server
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createWsServer, type WsServer } from "../../src/ws-server.js";
import { createTestConfig, waitFor, sleep } from "../utils/test-config.js";
import { createMockExtension, type MockExtension } from "../utils/mock-extension.js";
import type { DaemonConfig, SessionId, ExtensionResponse } from "../../src/types.js";
import type { WebSocket } from "ws";

describe("WsServer", () => {
  let server: WsServer;
  let config: DaemonConfig;
  let extensions: MockExtension[] = [];

  // Track event handler calls
  let connectedSessions: SessionId[] = [];
  let disconnectedSessions: SessionId[] = [];
  let receivedResponses: Array<{ sessionId: SessionId; response: ExtensionResponse }> = [];

  beforeEach(async () => {
    config = createTestConfig();
    server = createWsServer(config);
    extensions = [];
    connectedSessions = [];
    disconnectedSessions = [];
    receivedResponses = [];

    server.setEventHandlers({
      onExtensionConnected: (sessionId: SessionId, _ws: WebSocket) => {
        connectedSessions.push(sessionId);
      },
      onExtensionDisconnected: (sessionId: SessionId) => {
        disconnectedSessions.push(sessionId);
      },
      onExtensionResponse: (sessionId: SessionId, response: ExtensionResponse) => {
        receivedResponses.push({ sessionId, response });
      },
    });
  });

  afterEach(async () => {
    // Disconnect all extensions with timeout
    const disconnectPromises = extensions.map(async (ext) => {
      try {
        if (ext.isConnected()) {
          await Promise.race([
            ext.disconnect(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
          ]);
        }
      } catch {
        // Ignore disconnect errors
      }
    });
    await Promise.all(disconnectPromises);
    extensions = [];

    // Stop server with timeout protection
    try {
      await Promise.race([
        server.stop(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Ignore stop errors
    }
  });

  async function createAndConnectExtension(sessionId: string): Promise<MockExtension> {
    const ext = createMockExtension({
      wsPort: config.wsPort,
      sessionId,
    });
    extensions.push(ext);
    await ext.connect();
    // Wait for registration to complete
    await waitFor(() => connectedSessions.includes(sessionId), 2000);
    return ext;
  }

  describe("lifecycle", () => {
    it("should start and stop successfully", async () => {
      await server.start();
      await server.stop();
    });

    it("should accept extension connections", async () => {
      await server.start();

      const ext = await createAndConnectExtension("test-session");

      expect(ext.isConnected()).toBe(true);
      expect(connectedSessions).toContain("test-session");
    });

    it("should handle extension disconnection", async () => {
      await server.start();

      const ext = await createAndConnectExtension("disconnect-test");
      await ext.disconnect();

      await waitFor(() => disconnectedSessions.includes("disconnect-test"), 2000);

      expect(disconnectedSessions).toContain("disconnect-test");
    });
  });

  describe("connection management", () => {
    beforeEach(async () => {
      await server.start();
    });

    it("should track connected sessions", async () => {
      await createAndConnectExtension("session-1");
      await createAndConnectExtension("session-2");

      expect(server.isConnected("session-1")).toBe(true);
      expect(server.isConnected("session-2")).toBe(true);
      expect(server.isConnected("session-3")).toBe(false);
    });

    it("should return connection by session ID", async () => {
      await createAndConnectExtension("get-connection-test");

      const connection = server.getConnection("get-connection-test");

      expect(connection).toBeDefined();
      expect(connection).not.toBeNull();
    });

    it("should return null for unknown session", () => {
      const connection = server.getConnection("unknown-session");
      expect(connection).toBeNull();
    });

    it("should replace existing connection for same session", async () => {
      // Connect first extension
      const ext1 = await createAndConnectExtension("replace-test");
      const conn1 = server.getConnection("replace-test");
      expect(conn1).toBeDefined();

      // Connect second extension with same session
      const ext2 = createMockExtension({
        wsPort: config.wsPort,
        sessionId: "replace-test",
      });
      extensions.push(ext2);
      await ext2.connect();

      // Wait for new connection to be established and old one closed
      await waitFor(() => !ext1.isConnected(), 5000);
      await sleep(100); // Extra time for connection replacement

      // New connection should be active
      expect(server.isConnected("replace-test")).toBe(true);
      const conn2 = server.getConnection("replace-test");
      expect(conn2).toBeDefined();
      // Connections should be different (new one replaced old)
    });
  });

  describe("command sending", () => {
    beforeEach(async () => {
      await server.start();
    });

    it("should send commands to extension", async () => {
      const ext = await createAndConnectExtension("command-test");

      const sent = server.sendCommand("command-test", {
        id: "cmd-1",
        type: "open",
        params: { url: "https://example.com" },
      });

      expect(sent).toBe(true);

      // Wait for command to be received
      await waitFor(() => ext.getReceivedCommands().length > 0, 2000);

      const commands = ext.getReceivedCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0].id).toBe("cmd-1");
      expect(commands[0].type).toBe("open");
      expect(commands[0].params).toEqual({ url: "https://example.com" });
    });

    it("should return false when sending to disconnected session", async () => {
      const sent = server.sendCommand("non-existent", {
        id: "cmd-2",
        type: "snapshot",
      });

      expect(sent).toBe(false);
    });

    it("should receive responses from extension", async () => {
      const ext = await createAndConnectExtension("response-test");

      // Set up command handler to respond
      ext.onCommand((command) => ({
        id: command.id,
        success: true,
        data: { snapshot: "<html></html>" },
      }));

      // Send command
      server.sendCommand("response-test", {
        id: "cmd-3",
        type: "snapshot",
      });

      // Wait for response
      await waitFor(() => receivedResponses.length > 0, 2000);

      expect(receivedResponses).toHaveLength(1);
      expect(receivedResponses[0].sessionId).toBe("response-test");
      expect(receivedResponses[0].response.id).toBe("cmd-3");
      expect(receivedResponses[0].response.success).toBe(true);
    });
  });

  describe("heartbeat", () => {
    it("should send heartbeats and receive acks", async () => {
      // Use faster heartbeat for testing
      config.heartbeatInterval = 100;
      config.heartbeatTimeout = 200;

      server = createWsServer(config);
      server.setEventHandlers({
        onExtensionConnected: (sessionId: SessionId) => {
          connectedSessions.push(sessionId);
        },
        onExtensionDisconnected: (sessionId: SessionId) => {
          disconnectedSessions.push(sessionId);
        },
        onExtensionResponse: () => {},
      });
      await server.start();

      const ext = await createAndConnectExtension("heartbeat-test");

      // Wait for a heartbeat cycle
      await sleep(300);

      // Connection should still be active (extension auto-responds to heartbeat)
      expect(server.isConnected("heartbeat-test")).toBe(true);
      expect(ext.isConnected()).toBe(true);
    });
  });

  describe("event handler validation", () => {
    it("should throw error for invalid handlers object", () => {
      const newServer = createWsServer(config);

      expect(() => {
        newServer.setEventHandlers(null as unknown as Parameters<typeof newServer.setEventHandlers>[0]);
      }).toThrow("Invalid event handlers");
    });

    it("should throw error for missing handler functions", () => {
      const newServer = createWsServer(config);

      expect(() => {
        newServer.setEventHandlers({
          onExtensionConnected: () => {},
          onExtensionDisconnected: () => {},
          onExtensionResponse: "not a function",
        } as unknown as Parameters<typeof newServer.setEventHandlers>[0]);
      }).toThrow("onExtensionResponse handler must be a function");
    });
  });
});
