
import type { WebSocket } from "ws";
import type { DaemonConfig, SessionId, Command, CommandResponse } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { IpcServer } from "./ipc-server.js";
import { WsServer } from "./ws-server.js";
import { SessionManager } from "./session-manager.js";
import { BrowserManager } from "./browser-manager.js";
import { CommandRouter } from "./command-router.js";
import { setupSignalHandlers } from "./utils/signal-handler.js";
import type { ChildProcess } from "node:child_process";

const SHUTDOWN_TIMEOUT = 10000;

export class TabDaemon {

    private config: DaemonConfig;
    private ipcServer: IpcServer;
    private wsServer: WsServer;
    private sessionManager: SessionManager;
    private browserManager: BrowserManager;
    private commandRouter: CommandRouter;
    private isRunning: boolean = false;
    private shutdownPromise: Promise<void> | null = null;

    constructor(config: Partial<DaemonConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.sessionManager = new SessionManager(this.config);
        this.wsServer = new WsServer(this.config);
        this.wsServer.setSessionManager(this.sessionManager);
        this.browserManager = new BrowserManager(this.config);
        this.commandRouter = new CommandRouter(
            this.config,
            this.sessionManager,
            this.wsServer,
        );
        this.commandRouter.setBrowserManager(this.browserManager);
        this.ipcServer = new IpcServer(this.config);
    }

    // ===========================================================================
    // Lifecycle Methods
    // ===========================================================================

    async start(): Promise<void> {

        if (this.isRunning) {
            throw new Error("Daemon is already running");
        }

        this.setupEventHandlers();

        await this.wsServer.start();
        console.log(`WebSocket server listening on port ${this.config.wsPort}`);

        await this.ipcServer.start();
        console.log(`IPC server listening on ${this.config.ipcSocketPath}`);

        setupSignalHandlers(this);

        this.isRunning = true;
        console.log("tab-daemon started successfully");
    }

    async stop(): Promise<void> {

        if (!this.isRunning) {
            return;
        }

        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }

        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    private async performShutdown(): Promise<void> {
        console.log("Stopping tab-daemon...");

        this.isRunning = false;

        // Cancel all pending commands
        this.commandRouter.cancelAll();
        console.log("Cancelled pending commands");

        // Wait for in-flight commands to complete (with timeout)
        const pendingCount = this.commandRouter.getPendingCommandIds().length;
        if (pendingCount > 0) {
            console.log(`Waiting for ${pendingCount} in-flight commands...`);
            await this.waitForCommandsWithTimeout(SHUTDOWN_TIMEOUT);
        }

        console.log("Stopping browser processes...");
        await this.browserManager.killAllBrowsers();

        console.log("Stopping IPC server...");
        await this.ipcServer.stop();

        console.log("Stopping WebSocket server...");
        await this.wsServer.stop();

        console.log("tab-daemon stopped");
    }

    private async waitForCommandsWithTimeout(timeout: number): Promise<void> {
        const startTime = Date.now();

        while (this.commandRouter.getPendingCommandIds().length > 0) {
            if (Date.now() - startTime > timeout) {
                console.warn("Shutdown timeout reached, forcing command cancellation");
                this.commandRouter.cancelAll();
                break;
            }
            // Wait a bit before checking again
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    // ===========================================================================
    // Event Handlers
    // ===========================================================================

    private setupEventHandlers(): void {
        this.ipcServer.onCommand((command) => this.handleCliCommand(command));
        this.wsServer.setEventHandlers({
            onExtensionConnected: (sessionId, ws) => this.handleExtensionConnected(sessionId, ws),
            onExtensionDisconnected: (sessionId) => this.handleExtensionDisconnected(sessionId),
            onExtensionResponse: (sessionId, response) =>
                this.commandRouter.handleExtensionResponse(sessionId, response),
        });

        this.browserManager.setEventHandlers({
            onBrowserStarted: (sessionId, process) => this.handleBrowserStarted(sessionId, process),
            onBrowserExited: (sessionId, code) => this.handleBrowserExited(sessionId, code),
            onBrowserError: (sessionId, error) => {
                console.error(`Browser error for session ${sessionId}:`, error.message);
            },
        });
    }

    private async handleCliCommand(command: Command): Promise<CommandResponse> {

        if (!this.isActive()) {
            return {
                id: command.id,
                success: false,
                error: "Daemon is shutting down",
            };
        }

        // Try to find existing session by ID
        let session = this.sessionManager.getSession(command.sessionId);

        // If not found by ID, try to find by name
        if (!session) {
            session = this.sessionManager.getSessionByName(command.sessionId);
        }

        // Session not found - need to create it
        if (!session) {
            const sessionName = command.sessionId || "default";

            if (sessionName === "default") {
                session = this.sessionManager.getOrCreateDefaultSession(command.profile);
            } else {
                try {
                    session = this.sessionManager.createSession(sessionName, command.profile);
                } catch (error) {
                    return {
                        id: command.id,
                        success: false,
                        error: `Failed to create session "${sessionName}": ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
            }
        }

        // Update command with the actual session ID
        command = { ...command, sessionId: session.id };

        return this.commandRouter.submitCommand(command);
    }

    private handleExtensionConnected(sessionId: SessionId, ws: WebSocket): void {

        // Each extension connection is a separate browser window (separate session)
        let session = this.sessionManager.getSession(sessionId);
        if (!session) {
            // Try to get by name
            session = this.sessionManager.getSessionByName(sessionId);
        }
        if (!session) {
            // Assign the next awaiting session (daemon-launched browser) if available
            session = this.sessionManager.assignNextAwaitingSession();
            if (!session) {
                // Create a new session for this extension (already launched browser)
                try {
                    session = this.sessionManager.createSession(sessionId);
                } catch {
                    // If session name is invalid, use it as a generated name
                    console.warn(`Extension connected with invalid session ID: ${sessionId}, creating default session`);
                    session = this.sessionManager.getOrCreateDefaultSession();
                }
            }
        }

        // Update the WsServer's connection mapping to use actual session ID
        if (sessionId !== session.id) {
            this.wsServer.updateSessionId(sessionId, session.id);
        }

        // Associate WebSocket with session
        this.sessionManager.setExtensionConnection(session.id, ws);

        // Notify command router that extension connected
        this.commandRouter.notifyExtensionConnected(session.id);

        // Inform extension of assigned session ID
        try {
            ws.send(JSON.stringify({ type: "session_assigned", sessionId: session.id }));
        } catch (error) {
            console.warn(`Failed to send session assignment to extension: ${session.id}`, error);
        }

        console.log(`Extension connected for session: ${session.name} (${session.id})`);
    }

    private handleExtensionDisconnected(sessionId: SessionId): void {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            console.warn(`Extension disconnected for unknown session: ${sessionId}`);
            return;
        }

        this.sessionManager.setExtensionConnection(sessionId, null);
        this.commandRouter.handleExtensionDisconnected(sessionId);

        console.log(`Extension disconnected for session: ${session.name} (${session.id})`);
    }

    private handleBrowserStarted(sessionId: SessionId, process: ChildProcess): void {
        let session = this.sessionManager.getSession(sessionId);
        if (!session) {
            session = this.sessionManager.getSessionByName(sessionId);
        }
        if (!session) {
            console.warn(`Browser started for unknown session: ${sessionId}`);
            return;
        }

        this.sessionManager.setBrowserProcess(session.id, process);
        console.log(`Browser started for session: ${session.name} (PID: ${process.pid})`);
    }

    private handleBrowserExited(sessionId: SessionId, code: number | null): void {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            console.warn(`Browser exited for unknown session: ${sessionId}`);
            return;
        }

        this.sessionManager.setBrowserProcess(sessionId, null);

        if (!session.extensionConnection && session.state !== "awaiting_extension") {
            this.sessionManager.updateSessionState(sessionId, "disconnected");
        }

        console.log(`Browser exited for session: ${session.name} (code: ${code})`);
    }

    // ===========================================================================
    // Accessors (for testing/debugging)
    // ===========================================================================

    isActive(): boolean { return this.isRunning; }
    getSessionManager(): SessionManager { return this.sessionManager; }
    getBrowserManager(): BrowserManager { return this.browserManager; }
    getCommandRouter(): CommandRouter { return this.commandRouter; }
    getWsServer(): WsServer { return this.wsServer; }
    getIpcServer(): IpcServer { return this.ipcServer; }
    getConfig(): DaemonConfig { return { ...this.config }; }
}

