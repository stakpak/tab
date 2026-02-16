import { BrowserDaemon } from "./daemon.js";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Command } from "commander";
import { DaemonConfig, DEFAULT_CONFIG } from "./types.js";


const DAEMON_VERSION = "0.1.10"

export function loadConfig(argv: string[]): DaemonConfig {
  const program = new Command();

  program
    .name("browser-daemon")
    .description("Browser automation daemon")
    .version(DAEMON_VERSION)
    .option("-s, --socket <path>", "IPC socket path", process.env.BROWSER_SOCKET_PATH || DEFAULT_CONFIG.ipcSocketPath)
    .option("-p, --port <number>", "WebSocket server port", (val) => parseInt(val, 10), process.env.BROWSER_WS_PORT || DEFAULT_CONFIG.wsPort)
    .option("-b, --browser <path>", "Path to Chrome/Chromium executable", process.env.BROWSER_PATH || DEFAULT_CONFIG.defaultBrowserPath)
    .addHelpText("after", `
Environment Variables:
  BROWSER_SOCKET_PATH   IPC socket path
  BROWSER_WS_PORT       WebSocket server port
  BROWSER_PATH          Browser executable path

Examples:
  browser-daemon                Start with default settings
  browser-daemon -p 9333        Use port 9333 for WebSocket server
  browser-daemon --browser /usr/bin/chromium
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
  const daemon = new BrowserDaemon(config);

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
