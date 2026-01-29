/**
 * Integration tests for IPC Server
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createIpcServer, type IpcServer } from "../../src/ipc-server.js";
import { createTestConfig, sleep } from "../utils/test-config.js";
import { createIpcClient, type IpcClient } from "../utils/ipc-client.js";
import type { Command, CommandResponse, DaemonConfig } from "../../src/types.js";

describe("IpcServer", () => {
  let server: IpcServer;
  let client: IpcClient;
  let config: DaemonConfig;

  beforeEach(async () => {
    config = createTestConfig();
    server = createIpcServer(config);
    client = createIpcClient({ socketPath: config.ipcSocketPath });
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("lifecycle", () => {
    it("should start and stop successfully", async () => {
      await server.start();
      await server.stop();
      // No assertions needed - test passes if no errors
    });

    it("should allow ping after starting", async () => {
      await server.start();
      
      const result = await client.ping();
      
      expect(result).toBe(true);
    });

    it("should fail ping after stopping", async () => {
      await server.start();
      await server.stop();
      
      const result = await client.ping();
      
      expect(result).toBe(false);
    });
  });

  describe("command handling", () => {
    beforeEach(async () => {
      await server.start();
    });

    it("should receive and process commands", async () => {
      let receivedCommand: Command | null = null;

      server.onCommand(async (command) => {
        receivedCommand = command;
        return {
          id: command.id,
          success: true,
          data: { result: "test" },
        };
      });

      const response = await client.sendCommand("test-session", "navigate", {
        url: "https://example.com",
      });

      expect(receivedCommand).toBeDefined();
      expect(receivedCommand?.type).toBe("navigate");
      expect(receivedCommand?.sessionId).toBe("test-session");
      expect(receivedCommand?.payload).toEqual({ url: "https://example.com" });

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: "test" });
    });

    it("should return error when no command handler registered", async () => {
      const response = await client.sendCommand("test-session", "navigate", {});

      expect(response.success).toBe(false);
      expect(response.error).toContain("No command handler registered");
    });

    it("should handle command handler errors gracefully", async () => {
      server.onCommand(async () => {
        throw new Error("Handler error");
      });

      const response = await client.sendCommand("test-session", "navigate", {});

      expect(response.success).toBe(false);
      expect(response.error).toContain("Handler error");
    });

    it("should handle multiple sequential commands", async () => {
      let commandCount = 0;

      server.onCommand(async (command) => {
        commandCount++;
        return {
          id: command.id,
          success: true,
          data: { count: commandCount },
        };
      });

      const response1 = await client.sendCommand("s1", "navigate", {});
      const response2 = await client.sendCommand("s1", "snapshot", {});
      const response3 = await client.sendCommand("s1", "click", {});

      expect(response1.data).toEqual({ count: 1 });
      expect(response2.data).toEqual({ count: 2 });
      expect(response3.data).toEqual({ count: 3 });
    });

    it("should handle concurrent commands from multiple clients", async () => {
      const responses: CommandResponse[] = [];

      server.onCommand(async (command) => {
        // Simulate some async work
        await sleep(50);
        return {
          id: command.id,
          success: true,
          data: { sessionId: command.sessionId },
        };
      });

      // Create multiple clients and send commands concurrently
      const clients = [
        createIpcClient({ socketPath: config.ipcSocketPath }),
        createIpcClient({ socketPath: config.ipcSocketPath }),
        createIpcClient({ socketPath: config.ipcSocketPath }),
      ];

      const promises = clients.map((c, i) =>
        c.sendCommand(`session-${i}`, "navigate", {})
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((r, i) => {
        expect(r.success).toBe(true);
        expect(r.data).toEqual({ sessionId: `session-${i}` });
      });
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await server.start();
      server.onCommand(async (command) => ({
        id: command.id,
        success: true,
      }));
    });

    it("should handle invalid JSON gracefully", async () => {
      const response = await client.sendInvalidMessage("not json at all");
      const parsed = JSON.parse(response);

      expect(parsed.type).toBe("response");
      expect(parsed.payload.success).toBe(false);
      expect(parsed.payload.error).toContain("Invalid message");
    });

    it("should handle missing message type", async () => {
      const response = await client.sendInvalidMessage('{"payload": {}}');
      const parsed = JSON.parse(response);

      expect(parsed.payload.success).toBe(false);
    });

    it("should handle unknown message type", async () => {
      const response = await client.sendInvalidMessage(
        '{"type": "unknown", "payload": {}}'
      );
      const parsed = JSON.parse(response);

      expect(parsed.payload.success).toBe(false);
      expect(parsed.payload.error).toContain("Unknown message type");
    });
  });

  describe("handler registration", () => {
    it("should throw error for invalid handler", () => {
      expect(() => {
        server.onCommand("not a function" as unknown as (cmd: Command) => Promise<CommandResponse>);
      }).toThrow("Command handler must be a function");
    });
  });
});
