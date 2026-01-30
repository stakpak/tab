/**
 * Browser Manager - Launches and manages browser processes
 *
 * Responsible for starting headed Chromium-based browsers with the tab extension loaded.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { access, constants, mkdir } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import type {
  SessionId,
  BrowserLaunchOptions,
  BrowserProcessInfo,
  DaemonConfig,
} from "./types.js";

/**
 * Event handlers for browser process events
 */
export interface BrowserEventHandlers {
  onBrowserStarted: (sessionId: SessionId, process: ChildProcess) => void;
  onBrowserExited: (sessionId: SessionId, code: number | null) => void;
  onBrowserError: (sessionId: SessionId, error: Error) => void;
}

/**
 * Common browser executable paths by platform
 */
const BROWSER_PATHS: Record<string, string[]> = {
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/brave-browser",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "C:\\Program Files\\Chromium\\Application\\chrome.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ],
};

/**
 * Browser Manager class
 * Handles launching and monitoring browser processes
 */
export class BrowserManager {
  private processes: Map<SessionId, ChildProcess> = new Map();
  private processInfo: Map<SessionId, BrowserProcessInfo> = new Map();
  private eventHandlers: BrowserEventHandlers | null = null;

  constructor(private config: DaemonConfig) { }

  // ===========================================================================
  // Event Handler Registration
  // ===========================================================================

  /**
   * Register event handlers for browser events
   */
  setEventHandlers(handlers: BrowserEventHandlers): void {
    if (!handlers || typeof handlers !== "object") {
      throw new Error("Invalid event handlers object");
    }
    if (typeof handlers.onBrowserStarted !== "function") {
      throw new Error("onBrowserStarted handler must be a function");
    }
    if (typeof handlers.onBrowserExited !== "function") {
      throw new Error("onBrowserExited handler must be a function");
    }
    if (typeof handlers.onBrowserError !== "function") {
      throw new Error("onBrowserError handler must be a function");
    }
    this.eventHandlers = handlers;
  }

  // ===========================================================================
  // Browser Lifecycle
  // ===========================================================================

  async launchBrowser(options: BrowserLaunchOptions): Promise<ChildProcess> {
    const { sessionId } = options;

    // Check if session already has a browser
    if (this.hasBrowser(sessionId)) {
      throw new Error(`Session ${sessionId} already has a running browser`);
    }

    // Determine browser executable path
    const executablePath = options.executablePath ?? await this.findBrowserExecutable();
    if (!executablePath) {
      throw new Error("Could not find a Chrome/Chromium browser. Please install Chrome or specify executablePath.");
    }

    // Verify the executable exists
    if (!(await this.verifyBrowserExecutable(executablePath))) {
      throw new Error(`Browser executable not found or not executable: ${executablePath}`);
    }

    const args = this.buildBrowserArgs(options);

    // Spawn browser process
    const browserProcess = spawn(executablePath, args, {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Set up process event handlers
    browserProcess.on("exit", (code, signal) => {
      this.handleProcessExit(sessionId, code, signal);
    });

    browserProcess.on("error", (error) => {
      this.handleProcessError(sessionId, error);
    });

    // Store in processes map
    this.processes.set(sessionId, browserProcess);

    // Store process info
    const info: BrowserProcessInfo = {
      pid: browserProcess.pid!,
      sessionId,
      launchedAt: new Date(),
    };
    this.processInfo.set(sessionId, info);

    // Notify via onBrowserStarted
    if (this.eventHandlers) {
      this.eventHandlers.onBrowserStarted(sessionId, browserProcess);
    }

    return browserProcess;
  }

  /**
   * Kill a browser process for a session
   */
  async killBrowser(sessionId: SessionId): Promise<boolean> {
    const process = this.processes.get(sessionId);
    if (!process) {
      return false;
    }

    return new Promise((resolve) => {
      let killed = false;

      // Set up exit handler
      const onExit = () => {
        killed = true;
        resolve(true);
      };

      process.once("exit", onExit);

      // Send SIGTERM for graceful shutdown
      process.kill("SIGTERM");

      // Wait for graceful exit with timeout (5 seconds)
      setTimeout(() => {
        if (!killed) {
          // Force kill with SIGKILL
          process.kill("SIGKILL");
          // Give it a moment then resolve
          setTimeout(() => {
            process.removeListener("exit", onExit);
            resolve(true);
          }, 500);
        }
      }, 5000);
    });
  }

  /**
   * Kill all managed browser processes
   */
  async killAllBrowsers(): Promise<void> {
    const sessionIds = Array.from(this.processes.keys());
    await Promise.all(sessionIds.map((id) => this.killBrowser(id)));
  }

  // ===========================================================================
  // Process Event Handling
  // ===========================================================================

  /**
   * Handle browser process exit
   */
  private handleProcessExit(sessionId: SessionId, code: number | null, signal: string | null): void {
    // Remove from processes map
    this.processes.delete(sessionId);

    // Remove from processInfo map
    this.processInfo.delete(sessionId);

    // Log exit reason
    if (signal) {
      console.log(`Browser for session ${sessionId} exited with signal: ${signal}`);
    } else {
      console.log(`Browser for session ${sessionId} exited with code: ${code}`);
    }

    // Notify via onBrowserExited
    if (this.eventHandlers) {
      this.eventHandlers.onBrowserExited(sessionId, code);
    }
  }

  /**
   * Handle browser process error
   */
  private handleProcessError(sessionId: SessionId, error: Error): void {
    console.error(`Browser error for session ${sessionId}:`, error.message);

    // Notify via onBrowserError
    if (this.eventHandlers) {
      this.eventHandlers.onBrowserError(sessionId, error);
    }

    // Clean up if process is no longer running
    const process = this.processes.get(sessionId);
    if (process && process.killed) {
      this.processes.delete(sessionId);
      this.processInfo.delete(sessionId);
    }
  }

  // ===========================================================================
  // Process Queries
  // ===========================================================================

  /**
   * Get the browser process for a session
   */
  getProcess(sessionId: SessionId): ChildProcess | null {
    return this.processes.get(sessionId) ?? null;
  }

  /**
   * Get process info for a session
   */
  getProcessInfo(sessionId: SessionId): BrowserProcessInfo | null {
    return this.processInfo.get(sessionId) ?? null;
  }

  /**
   * Check if a session has a running browser
   */
  hasBrowser(sessionId: SessionId): boolean {
    const process = this.processes.get(sessionId);
    if (!process) {
      return false;
    }
    // Verify process is still running (exitCode is null if still running)
    return process.exitCode === null && !process.killed;
  }

  /**
   * List all running browser processes
   */
  listBrowsers(): BrowserProcessInfo[] {
    return Array.from(this.processInfo.values());
  }

  // ===========================================================================
  // Browser Discovery
  // ===========================================================================

  /**
   * Find the Chrome/Chromium executable path
   */
  async findBrowserExecutable(): Promise<string | null> {
    // Check config for custom path
    if (this.config.defaultBrowserPath) {
      if (await this.verifyBrowserExecutable(this.config.defaultBrowserPath)) {
        return this.config.defaultBrowserPath;
      }
    }

    // Get paths for current platform
    const currentPlatform = platform();
    const paths = BROWSER_PATHS[currentPlatform] ?? [];

    // Check each path
    for (const browserPath of paths) {
      if (await this.verifyBrowserExecutable(browserPath)) {
        return browserPath;
      }
    }

    return null;
  }

  /**
   * Verify browser executable exists and is runnable
   */
  async verifyBrowserExecutable(path: string): Promise<boolean> {
    try {
      // Check file exists and is executable
      await access(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Browser Arguments
  // ===========================================================================


  private buildBrowserArgs(options: BrowserLaunchOptions): string[] {
    const args: string[] = [];

    // Add flags to prevent first-run dialogs and improve automation
    args.push(
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
      "--disable-popup-blocking",
      "--disable-translate",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    );

    // Add profile directory if specified
    if (options.profileDir) {
      args.push(`--user-data-dir=${options.profileDir}`);
    }

    // Add any user-specified args
    if (options.args) {
      args.push(...options.args);
    }

    // Add URL to open directly (must be last argument)
    if (options.url) {
      args.push(`--new-window`, options.url);
    }

    return args;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new browser manager instance
 */
export function createBrowserManager(config: DaemonConfig): BrowserManager {
  return new BrowserManager(config);
}
