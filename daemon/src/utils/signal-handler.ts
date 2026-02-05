import type { BrowserDaemon } from "../daemon.js";

export function setupSignalHandlers(daemon: BrowserDaemon): void {

    process.on("SIGTERM", () => {
        console.log("Received SIGTERM signal");
        daemon.stop().catch((err) => {
            console.error("Error during shutdown:", err);
            process.exit(1);
        });
    });

    process.on("SIGINT", () => {
        console.log("Received SIGINT signal");
        daemon.stop().then(() => {
            process.exit(0);
        }).catch((err) => {
            console.error("Error during shutdown:", err);
            process.exit(1);
        });
    });

    process.on("uncaughtException", (err) => {
        console.error("Uncaught exception:", err);
        daemon.stop().finally(() => {
            process.exit(1);
        });
    });

    process.on("unhandledRejection", (reason, promise) => {
        console.error("Unhandled rejection at:", promise, "reason:", reason);
    });
}
