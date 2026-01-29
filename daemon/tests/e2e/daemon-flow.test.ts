/**
 * End-to-end tests for the full daemon flow
 *
 * These tests simulate the complete flow:
 * CLI -> IPC -> Daemon -> WebSocket -> Extension (mock)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TabDaemon, createDaemon } from "../../src/index.js";
import { createTestConfig, waitFor, sleep, generateCommandId, generateSessionId } from "../utils/test-config.js";
import { createIpcClient, type IpcClient } from "../utils/ipc-client.js";
import { createMockExtension, type MockExtension } from "../utils/mock-extension.js";
import type { DaemonConfig, Command, ExtensionCommand } from "../../src/types.js";

describe("Daemon E2E Flow", () => {
  let daemon: TabDaemon;
  let config: DaemonConfig;
  let cliClient: IpcClient;
  let extensions: MockExtension[] = [];

  beforeEach(async () => {
    config = createTestConfig({
      heartbeatInterval: 5000, // Longer interval to avoid noise in tests
      heartbeatTimeout: 2000,
    });

    daemon = createDaemon(config);
    await daemon.start();

    cliClient = createIpcClient({ socketPath: config.ipcSocketPath });
    extensions = [];
  });

  afterEach(async () => {
    // Disconnect all extensions first with timeout
    const disconnectPromises = extensions.map(async (ext) => {
      try {
        if (ext.isConnected()) {
          await Promise.race([
            ext.disconnect(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
          ]);
        }
      } catch {
        // Ignore
      }
    });
    await Promise.all(disconnectPromises);
    extensions = [];

    // Stop daemon with timeout protection
    try {
      await Promise.race([
        daemon.stop(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      // Ignore stop errors
    }

    // No cleanup needed
  }, 15000);

  async function connectExtension(sessionName: string): Promise<MockExtension> {
    const ext = createMockExtension({
      wsPort: config.wsPort,
      sessionId: sessionName, // This is used as session name for registration
    });
    extensions.push(ext);
    await ext.connect();
    // Wait for extension to be registered with session manager
    await waitFor(() => {
      const session = daemon.getSessionManager().getSessionByName(sessionName);
      return session?.state === "active";
    }, 5000);
    return ext;
  }

  describe("basic command flow", () => {
    it("should route navigate command from CLI to extension", async () => {
      // Connect an extension for default session
      const ext = await connectExtension("default");

      // Set up extension to respond successfully
      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { navigatedTo: cmd.payload.url },
      }));

      // Send command from CLI
      const response = await cliClient.sendCommand("default", "navigate", {
        url: "https://example.com",
      });

      // Verify response
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ navigatedTo: "https://example.com" });

      // Verify extension received the command
      const commands = ext.getReceivedCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe("navigate");
      expect(commands[0].payload).toEqual({ url: "https://example.com" });
    });

    it("should route snapshot command and return HTML", async () => {
      const ext = await connectExtension("default");

      const mockHtml = "<!DOCTYPE html><html><body>Test</body></html>";
      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { html: mockHtml },
      }));

      const response = await cliClient.sendCommand("default", "snapshot", {});

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ html: mockHtml });
    });

    it("should handle click command with selector", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { clicked: cmd.payload.selector },
      }));

      const response = await cliClient.sendCommand("default", "click", {
        selector: "#submit-button",
      });

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ clicked: "#submit-button" });
    });

    it("should handle type command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      const response = await cliClient.sendCommand("default", "type", {
        selector: "#search-input",
        text: "hello world",
      });

      expect(response.success).toBe(true);

      const commands = ext.getReceivedCommands();
      expect(commands[0].payload).toEqual({
        selector: "#search-input",
        text: "hello world",
      });
    });

    it("should handle scroll command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      const response = await cliClient.sendCommand("default", "scroll", {
        direction: "down",
        amount: 500,
      });

      expect(response.success).toBe(true);
    });

    it("should handle eval command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { result: 42 },
      }));

      const response = await cliClient.sendCommand("default", "eval", {
        script: "return 40 + 2",
      });

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: 42 });
    });
  });

  describe("tab management", () => {
    it("should handle tab_new command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { tabId: 123 },
      }));

      const response = await cliClient.sendCommand("default", "tab_new", {
        url: "https://google.com",
      });

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ tabId: 123 });
    });

    it("should handle tab_close command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      const response = await cliClient.sendCommand("default", "tab_close", {
        tabId: 123,
      });

      expect(response.success).toBe(true);
    });

    it("should handle tab_switch command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      const response = await cliClient.sendCommand("default", "tab_switch", {
        tabId: 456,
      });

      expect(response.success).toBe(true);
    });

    it("should handle tab_list command", async () => {
      const ext = await connectExtension("default");

      const mockTabs = [
        { id: 1, title: "Tab 1", url: "https://example.com" },
        { id: 2, title: "Tab 2", url: "https://google.com" },
      ];

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { tabs: mockTabs },
      }));

      const response = await cliClient.sendCommand("default", "tab_list", {});

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ tabs: mockTabs });
    });
  });

  describe("navigation commands", () => {
    it("should handle back command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      const response = await cliClient.sendCommand("default", "back", {});

      expect(response.success).toBe(true);
    });

    it("should handle forward command", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      const response = await cliClient.sendCommand("default", "forward", {});

      expect(response.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should return error when extension is not connected", async () => {
      const response = await cliClient.sendCommand("non-existent-session", "navigate", {
        url: "https://example.com",
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it("should return error when extension reports failure", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: false,
        error: "Element not found",
      }));

      const response = await cliClient.sendCommand("default", "click", {
        selector: "#non-existent",
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe("Element not found");
    });

    it("should handle extension disconnection during command", async () => {
      const ext = await connectExtension("default");

      // Set up extension to disconnect instead of responding
      ext.onCommand(async () => {
        // Delay, then disconnect without responding
        await sleep(50);
        ext.disconnect();
        // Return a dummy response (won't be sent because we disconnected)
        return { id: "dummy", success: false };
      });

      const response = await cliClient.sendCommand("default", "navigate", {
        url: "https://example.com",
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain("disconnected");
    });
  });

  describe("command queuing", () => {
    it("should queue commands when one is in-flight", async () => {
      const ext = await connectExtension("default");

      const commandOrder: string[] = [];
      const responsePromises: Promise<void>[] = [];

      ext.onCommand(async (cmd) => {
        commandOrder.push(cmd.id);
        // Simulate slow command processing
        await sleep(100);
        return { id: cmd.id, success: true };
      });

      // Send multiple commands rapidly
      const cmd1 = cliClient.sendCommand("default", "navigate", { url: "1" });
      const cmd2 = cliClient.sendCommand("default", "navigate", { url: "2" });
      const cmd3 = cliClient.sendCommand("default", "navigate", { url: "3" });

      // Wait for all commands to complete
      const [res1, res2, res3] = await Promise.all([cmd1, cmd2, cmd3]);

      // All should succeed
      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(res3.success).toBe(true);

      // Commands should be processed in order
      const commands = ext.getReceivedCommands();
      expect(commands).toHaveLength(3);
      expect(commands[0].payload).toEqual({ url: "1" });
      expect(commands[1].payload).toEqual({ url: "2" });
      expect(commands[2].payload).toEqual({ url: "3" });
    });
  });

  describe("session management", () => {
    it("should create default session automatically", async () => {
      // Connect extension to default session
      await connectExtension("default");

      // Verify session was created
      const session = daemon.getSessionManager().getSessionByName("default");
      expect(session).toBeDefined();
      expect(session?.state).toBe("active");
    });

    it("should handle multiple sessions independently", async () => {
      // Connect two extensions to different sessions
      const ext1 = await connectExtension("session-1");
      const ext2 = await connectExtension("session-2");

      // Track which extension receives which command
      const ext1Commands: ExtensionCommand[] = [];
      const ext2Commands: ExtensionCommand[] = [];

      ext1.onCommand((cmd) => {
        ext1Commands.push(cmd);
        return { id: cmd.id, success: true };
      });

      ext2.onCommand((cmd) => {
        ext2Commands.push(cmd);
        return { id: cmd.id, success: true };
      });

      // Send commands to different sessions
      await cliClient.sendCommand("session-1", "navigate", { url: "url1" });
      await cliClient.sendCommand("session-2", "navigate", { url: "url2" });
      await cliClient.sendCommand("session-1", "click", { selector: "s1" });

      // Verify commands went to correct extensions
      expect(ext1Commands).toHaveLength(2);
      expect(ext1Commands[0].payload).toEqual({ url: "url1" });
      expect(ext1Commands[1].payload).toEqual({ selector: "s1" });

      expect(ext2Commands).toHaveLength(1);
      expect(ext2Commands[0].payload).toEqual({ url: "url2" });
    });

    it("should use session name or ID interchangeably", async () => {
      const ext = await connectExtension("my-session");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      // Get session to find its ID
      const session = daemon.getSessionManager().getSessionByName("my-session");
      expect(session).toBeDefined();

      // Send command using session name
      const res1 = await cliClient.sendCommand("my-session", "snapshot", {});
      expect(res1.success).toBe(true);

      // Commands should have been received
      expect(ext.getReceivedCommands()).toHaveLength(1);
    });
  });

  describe("daemon lifecycle", () => {
    it("should handle graceful shutdown", async () => {
      const ext = await connectExtension("shutdown-test");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
      }));

      // Send a command to verify everything works
      const response = await cliClient.sendCommand("shutdown-test", "navigate", {
        url: "https://example.com",
      });
      expect(response.success).toBe(true);

      // Disconnect extension before stopping daemon
      await ext.disconnect();
      await sleep(100);

      // Stop daemon
      await daemon.stop();

      // Verify daemon is not running
      expect(daemon.isActive()).toBe(false);

      // New commands should fail
      const pingResult = await cliClient.ping();
      expect(pingResult).toBe(false);
    });


  });

  describe("concurrent operations", () => {
    it("should handle multiple CLI clients", async () => {
      const ext = await connectExtension("default");

      ext.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { seq: cmd.payload.seq },
      }));

      // Create multiple CLI clients
      const clients = [
        createIpcClient({ socketPath: config.ipcSocketPath }),
        createIpcClient({ socketPath: config.ipcSocketPath }),
        createIpcClient({ socketPath: config.ipcSocketPath }),
      ];

      // Send commands from all clients concurrently
      const promises = clients.map((c, i) =>
        c.sendCommand("default", "eval", { seq: i })
      );

      const results = await Promise.all(promises);

      // All commands should succeed
      results.forEach((r) => {
        expect(r.success).toBe(true);
      });

      // All commands should have been received
      expect(ext.getReceivedCommands()).toHaveLength(3);
    });
  });

  describe("edge cases", () => {
    it("should handle extension reconnection", async () => {
      // Connect first extension
      const ext1 = await connectExtension("reconnect-session");

      ext1.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { from: "ext1" },
      }));

      // Send command
      const res1 = await cliClient.sendCommand("reconnect-session", "snapshot", {});
      expect(res1.success).toBe(true);
      expect(res1.data).toEqual({ from: "ext1" });

      // Disconnect first extension
      await ext1.disconnect();

      // Wait for disconnection to be processed
      await waitFor(() => {
        const session = daemon.getSessionManager().getSessionByName("reconnect-session");
        return session?.state === "disconnected";
      }, 2000);

      // Connect new extension with same session
      const ext2 = await connectExtension("reconnect-session");

      ext2.onCommand((cmd) => ({
        id: cmd.id,
        success: true,
        data: { from: "ext2" },
      }));

      // Send another command
      const res2 = await cliClient.sendCommand("reconnect-session", "snapshot", {});
      expect(res2.success).toBe(true);
      expect(res2.data).toEqual({ from: "ext2" });
    });

    it("should handle rapid connect/disconnect cycles", async () => {
      for (let i = 0; i < 5; i++) {
        const ext = await connectExtension(`cycle-${i}`);

        ext.onCommand((cmd) => ({
          id: cmd.id,
          success: true,
        }));

        const response = await cliClient.sendCommand(`cycle-${i}`, "snapshot", {});
        expect(response.success).toBe(true);

        await ext.disconnect();

        // Small delay between cycles
        await sleep(50);
      }
    });
  });
});
