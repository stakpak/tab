import { TabDaemon } from "./daemon.js";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { DaemonConfig, DEFAULT_CONFIG } from "./types.js";


export function loadConfig(argv: string[]): DaemonConfig {
  const program = new Command();

  program
    .name("tab-daemon")
    .description("tab - browser automation daemon")
    .version("0.1.0")
    .option("-s, --socket <path>", "IPC socket path", process.env.TAB_SOCKET_PATH || DEFAULT_CONFIG.ipcSocketPath)
    .option("-p, --port <number>", "WebSocket server port", (val) => parseInt(val, 10), process.env.TAB_WS_PORT || DEFAULT_CONFIG.wsPort)
    .option("-b, --browser <path>", "Path to Chrome/Chromium executable", process.env.TAB_BROWSER_PATH || DEFAULT_CONFIG.defaultBrowserPath)
    .addHelpText("after", `
Environment Variables:
  TAB_SOCKET_PATH       IPC socket path
  TAB_WS_PORT           WebSocket server port
  TAB_BROWSER_PATH      Browser executable path

Examples:
  tab-daemon                      Start with default settings
  tab-daemon -p 9333              Use port 9333 for WebSocket server
  tab-daemon --browser /usr/bin/chromium
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

const isMainModule =
  // @ts-ignore
  (typeof require !== "undefined" && require.main === module) ||
  // @ts-ignore
  (import.meta.url && process.argv[1] === fileURLToPath(import.meta.url));

if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
