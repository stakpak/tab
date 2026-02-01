import { TabDaemon } from "./daemon.js";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { DaemonConfig, DEFAULT_CONFIG } from "./types.js";

const DAEMON_VERSION = "0.1.0";

export function loadConfig(argv: string[]): DaemonConfig {
  const program = new Command();

  program
    .name("agent-tab-daemon")
    .description("Browser automation daemon for Stakpak Agent")
    .version(DAEMON_VERSION)
    .option("-s, --socket <path>", "IPC socket path", process.env.TAB_SOCKET_PATH || DEFAULT_CONFIG.ipcSocketPath)
    .option("-p, --port <number>", "WebSocket server port", (val) => parseInt(val, 10), process.env.TAB_WS_PORT || DEFAULT_CONFIG.wsPort)
    .option("-b, --browser <path>", "Path to Chrome/Chromium executable", process.env.TAB_BROWSER_PATH || DEFAULT_CONFIG.defaultBrowserPath)
    .addHelpText("after", `
Environment Variables:
  TAB_SOCKET_PATH       IPC socket path
  TAB_WS_PORT           WebSocket server port
  TAB_BROWSER_PATH      Browser executable path

Examples:
  agent-tab-daemon                Start with default settings
  agent-tab-daemon -p 9333        Use port 9333 for WebSocket server
  agent-tab-daemon --browser /usr/bin/chromium
        `);

  program.parse(argv);

  const options = program.opts();

  return {
    ...DEFAULT_CONFIG,
    ipcSocketPath: options.socket,
    wsPort: options.port,
    defaultBrowserPath: options.browser,
  };
}

async function main(): Promise<void> {
  const config = loadConfig(process.argv);
  const daemon = new TabDaemon(config);

  await daemon.start();
  console.log("Daemon is running. Press Ctrl+C to stop.");
}

// Run main when executed directly (ESM or CJS)
// In bundled CJS, this is always the entry point
// In ESM dev, check if this file is the main module
const isMainModule = (() => {
  try {
    // ESM check
    // @ts-ignore
    if (import.meta.url) {
      // @ts-ignore
      return process.argv[1] === fileURLToPath(import.meta.url);
    }
  } catch {
    // import.meta not available (CJS)
  }
  // CJS check or assume we're main if import.meta not available
  // @ts-ignore
  return typeof require === "undefined" || require.main === module;
})();

if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
