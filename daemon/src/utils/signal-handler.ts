/**
 * Signal handler for tab-daemon graceful shutdown
 */

import type { TabDaemon } from "../daemon.js";

/**
 * Set up process signal handlers for graceful shutdown
 */
export function setupSignalHandlers(daemon: TabDaemon): void {
    // Handle SIGTERM - graceful shutdown
    process.on("SIGTERM", () => {
        console.log("Received SIGTERM signal");
        daemon.stop().catch((err) => {
            console.error("Error during shutdown:", err);
            process.exit(1);
        });
    });

    // Handle SIGINT - graceful shutdown (Ctrl+C)
    process.on("SIGINT", () => {
        console.log("Received SIGINT signal");
        daemon.stop().then(() => {
            process.exit(0);
        }).catch((err) => {
            console.error("Error during shutdown:", err);
            process.exit(1);
        });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
        console.error("Uncaught exception:", err);
        daemon.stop().finally(() => {
            process.exit(1);
        });
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
        console.error("Unhandled rejection at:", promise, "reason:", reason);
    });
}
