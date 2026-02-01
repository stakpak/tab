import { spawn, type ChildProcess } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { platform } from "node:os";
import type {
  SessionId,
  BrowserLaunchOptions,
  BrowserProcessInfo,
  DaemonConfig
} from "./types.js";

export interface BrowserEventHandlers {
  onBrowserStarted: (sessionId: SessionId, process: ChildProcess) => void;
  onBrowserExited: (sessionId: SessionId, code: number | null) => void;
  onBrowserError: (sessionId: SessionId, error: Error) => void;
}

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

class BrowserInstance {
  private process: ChildProcess;
  private info: BrowserProcessInfo;
  private exitPromise: Promise<number | null>;
  private resolveExit?: (code: number | null) => void;

  constructor(
    process: ChildProcess,
    public readonly sessionId: SessionId,
    private eventHandlers: BrowserEventHandlers | null,
  ) {
    this.process = process;
    this.info = {
      pid: process.pid!,
      sessionId,
      launchedAt: new Date(),
    };

    // Create promise that resolves when process exits
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
    });

    // Set up all event handlers immediately
    this.setupEventHandlers();
  }

  /**
   * Set up process event handlers
   */
  private setupEventHandlers(): void {
    this.process.on("exit", (code, signal) => {
      this.handleExit(code, signal);
    });

    this.process.on("error", (error) => {
      this.handleError(error);
    });

    // Notify that browser has started
    if (this.eventHandlers) {
      this.eventHandlers.onBrowserStarted(this.sessionId, this.process);
    }
  }

  /**
   * Handle process exit event
   */
  private handleExit(code: number | null, signal: string | null): void {
    // Log exit reason
    if (signal) {
      console.log(`Browser for session ${this.sessionId} exited with signal: ${signal}`);
    } else {
      console.log(`Browser for session ${this.sessionId} exited with code: ${code}`);
    }

    // Notify via event handler
    if (this.eventHandlers) {
      this.eventHandlers.onBrowserExited(this.sessionId, code);
    }

    // Resolve the exit promise
    if (this.resolveExit) {
      this.resolveExit(code);
    }
  }

  /**
   * Handle process error event
   */
  private handleError(error: Error): void {
    console.error(`Browser error for session ${this.sessionId}:`, error.message);

    // Notify via event handler
    if (this.eventHandlers) {
      this.eventHandlers.onBrowserError(this.sessionId, error);
    }
  }

  /**
   * Kill the browser process
   */
  async kill(): Promise<boolean> {
    if (!this.isRunning()) {
      return false;
    }

    return new Promise((resolve) => {
      let killed = false;

      // Set up exit handler
      const onExit = () => {
        killed = true;
        resolve(true);
      };

      this.process.once("exit", onExit);

      // Send SIGTERM for graceful shutdown
      this.process.kill("SIGTERM");

      // Wait for graceful exit with timeout (5 seconds)
      setTimeout(() => {
        if (!killed) {
          // Force kill with SIGKILL
          this.process.kill("SIGKILL");
          // Give it a moment then resolve
          setTimeout(() => {
            this.process.removeListener("exit", onExit);
            resolve(true);
          }, 500);
        }
      }, 5000);
    });
  }

  /**
   * Wait for the process to exit
   */
  async waitForExit(): Promise<number | null> {
    return this.exitPromise;
  }

  /**
   * Check if the browser process is still running
   */
  isRunning(): boolean {
    return this.process.exitCode === null && !this.process.killed;
  }

  /**
   * Get the underlying process
   */
  getProcess(): ChildProcess {
    return this.process;
  }

  /**
   * Get process information
   */
  getInfo(): BrowserProcessInfo {
    return { ...this.info };
  }
}

export class BrowserManager {
  private instances: Map<SessionId, BrowserInstance> = new Map();
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

    // Create browser instance - it will set up all event handlers
    const instance = new BrowserInstance(
      browserProcess,
      sessionId,
      this.eventHandlers,
    );

    // Store instance
    this.instances.set(sessionId, instance);

    // Set up cleanup when process exits
    instance.waitForExit().then(() => {
      this.instances.delete(sessionId);
    });

    return browserProcess;
  }

  /**
   * Kill a browser process for a session
   */
  async killBrowser(sessionId: SessionId): Promise<boolean> {
    const instance = this.instances.get(sessionId);
    if (!instance) {
      return false;
    }

    return instance.kill();
  }

  /**
   * Kill all managed browser processes
   */
  async killAllBrowsers(): Promise<void> {
    const sessionIds = Array.from(this.instances.keys());
    await Promise.all(sessionIds.map((id) => this.killBrowser(id)));
  }

  // ===========================================================================
  // Process Queries
  // ===========================================================================

  /**
   * Get the browser process for a session
   */
  getProcess(sessionId: SessionId): ChildProcess | null {
    const instance = this.instances.get(sessionId);
    return instance ? instance.getProcess() : null;
  }

  /**
   * Get process info for a session
   */
  getProcessInfo(sessionId: SessionId): BrowserProcessInfo | null {
    const instance = this.instances.get(sessionId);
    return instance ? instance.getInfo() : null;
  }

  /**
   * Check if a session has a running browser
   */
  hasBrowser(sessionId: SessionId): boolean {
    const instance = this.instances.get(sessionId);
    if (!instance) {
      return false;
    }
    return instance.isRunning();
  }

  /**
   * List all running browser processes
   */
  listBrowsers(): BrowserProcessInfo[] {
    return Array.from(this.instances.values()).map((instance) => instance.getInfo());
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

