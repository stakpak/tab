/**
 * Background Service Worker Entry Point
 * Orchestrates WebSocket communication, command routing, and popup communication
 */

import { DEFAULT_CONFIG } from '../shared/types';
import type { AgentCommand, AgentResponse, ExtensionConfig } from '../shared/types';
import type {
  PopupMessage,
  StatusResponse,
  ActivityLogEntry,
  ActivityLogResponse,
  ConnectionStatus,
} from '../shared/messages';
import { createWebSocketManager, type WebSocketManager, ConnectionState } from './websocket';
import { routeCommand, clearTargetTabIfMatch } from './router';
import { handleTabCommand } from './tabs';
import { createEndpointManager, type EndpointManager } from './endpoint-manager';
import { isNativeMessagingAvailable } from './native-messaging';

// =============================================================================
// STATE
// =============================================================================

const wsManagers = new Map<number, WebSocketManager>();
let config: ExtensionConfig = { ...DEFAULT_CONFIG };
let activityLog: ActivityLogEntry[] = [];
const MAX_LOG_ENTRIES = 100;

// Endpoint manager for daemon discovery via native messaging
let endpointManager: EndpointManager | null = null;

// =============================================================================
// WEBSOCKET LIFECYCLE
// =============================================================================

function createManager(windowId: number): WebSocketManager {
  const manager = createWebSocketManager(config, windowId, handleCommand, {
    onStateChange: (state: ConnectionState) => {
      const stateMap: Record<ConnectionState, ConnectionStatus> = {
        [ConnectionState.CONNECTED]: 'CONNECTED',
        [ConnectionState.CONNECTING]: 'CONNECTING',
        [ConnectionState.DISCONNECTED]: 'DISCONNECTED',
      };

      const status = stateMap[state];
      addLogEntry('connection', `Window ${windowId}: ${status.toLowerCase()}`);
      broadcastStatusUpdate();
    },
    onMaxReconnectAttemptsReached: () => {
      addLogEntry('error', `Window ${windowId}: Max reconnect attempts reached`);
      void refreshEndpointAndReconnect(windowId);
    },
  });

  wsManagers.set(windowId, manager);
  return manager;
}

function getOrCreateManager(windowId: number): WebSocketManager {
  return wsManagers.get(windowId) ?? createManager(windowId);
}

/**
 * Refresh daemon endpoint and reconnect a specific window.
 * Called when max reconnect attempts are reached.
 */
async function refreshEndpointAndReconnect(windowId: number): Promise<void> {
  if (!endpointManager) {
    console.warn('[Background] No endpoint manager, cannot refresh');
    return;
  }

  try {
    addLogEntry('connection', 'Refreshing daemon endpoint...');
    const endpoint = await endpointManager.refreshEndpoint();
    const newUrl = endpointManager.buildWebSocketUrl(endpoint);

    if (newUrl !== config.websocketUrl) {
      config.websocketUrl = newUrl;
      addLogEntry('connection', `Endpoint updated: ${newUrl}`);
      const oldManager = wsManagers.get(windowId);
      if (oldManager) {
        oldManager.disconnect();
        wsManagers.delete(windowId);
      }

      const newManager = createManager(windowId);
      newManager.connect();
    } else {
      addLogEntry('connection', 'Endpoint unchanged, not reconnecting');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    addLogEntry('error', `Endpoint refresh failed: ${msg}`);
  }
}

async function initWebSocket(): Promise<void> {

  // Initialize endpoint manager if native messaging is available
  if (!endpointManager && isNativeMessagingAvailable()) {
    endpointManager = createEndpointManager({
      onEndpointResolved: (endpoint, fromCache) => {
        const source = fromCache ? 'cache' : 'native messaging';
        addLogEntry('connection', `Endpoint resolved from ${source}: ${endpoint.ip}:${endpoint.port}`);
      },
      onEndpointError: (error) => {
        addLogEntry('error', `Endpoint discovery failed: ${error.message}`);
      },
    });
  }

  // Get daemon endpoint via native messaging (or use default)
  if (endpointManager) {
    try {
      const endpoint = await endpointManager.getEndpoint();
      config.websocketUrl = endpointManager.buildWebSocketUrl(endpoint);
      console.log('[Background] Using daemon endpoint:', config.websocketUrl);
    } catch (error) {
      console.warn('[Background] Failed to get daemon endpoint, using default:', error);
      addLogEntry('error', 'Using default endpoint - native messaging failed');
    }
  }

  const windows = await chrome.windows.getAll();
  windows.forEach((window) => {
    if (window.id === undefined) return;
    const manager = getOrCreateManager(window.id);
    manager.connect();
  });
}

async function handleCommand(command: AgentCommand, windowId: number): Promise<AgentResponse> {
  console.log(`[Background:${windowId}] Received command:`, command.id, command.type);
  addLogEntry('command', `Window ${windowId}: ${command.type} (${command.id.slice(0, 8)}...)`);

  try {
    let response: AgentResponse;

    if (command.type === 'tab') {
      const result = await handleTabCommand(command.params as any, windowId);
      response = {
        id: command.id,
        ...result,
      };
    } else {
      response = await routeCommand(command, windowId);
    }

    console.log(`[Background:${windowId}] Command completed:`, command.id);
    addLogEntry('response', `Window ${windowId}: ${command.type} ${response.success ? 'success' : 'failed'}`);
    return response;
  } catch (error) {
    console.error(`[Background:${windowId}] Command failed:`, command.id, error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addLogEntry('error', `Window ${windowId}: ${command.type} error: ${errorMsg}`);
    return {
      id: command.id,
      success: false,
      error: errorMsg,
    };
  }
}

async function init(): Promise<void> {
  await initWebSocket();
  console.log('[Background] Service worker initialized');
  addLogEntry('connection', 'Extension started');
}

// =============================================================================
// POPUP COMMUNICATION
// =============================================================================

function handlePopupMessage(
  message: PopupMessage,
  sendResponse: (response: unknown) => void
): boolean {
  switch (message.type) {
    case 'GET_STATUS': {
      const states = Array.from(wsManagers.values()).map((manager) => manager.getState());
      let connectionStatus: ConnectionStatus = 'DISCONNECTED';
      if (states.some((state) => state === ConnectionState.CONNECTED)) {
        connectionStatus = 'CONNECTED';
      } else if (states.some((state) => state === ConnectionState.CONNECTING)) {
        connectionStatus = 'CONNECTING';
      }

      const reconnectAttempts = states.length
        ? Math.max(...Array.from(wsManagers.values()).map((manager) => manager.getReconnectAttempts()))
        : 0;

      const response: StatusResponse = {
        connectionStatus,
        websocketUrl: config.websocketUrl,
        reconnectAttempts,
        maxReconnectAttempts: config.maxReconnectAttempts,
      };
      sendResponse(response);
      return true;
    }

    case 'CONNECT': {
      void initWebSocket();
      sendResponse({ success: true });
      return true;
    }

    case 'DISCONNECT': {
      wsManagers.forEach((manager) => manager.disconnect());
      sendResponse({ success: true });
      return true;
    }

    case 'UPDATE_URL': {
      const url = message.payload?.url;
      if (url) {
        config.websocketUrl = url;
        // Recreate manager with new URL on next connect
        wsManagers.forEach((manager) => manager.disconnect());
        wsManagers.clear();
        addLogEntry('connection', `Server URL changed: ${url}`);
      }
      sendResponse({ success: true });
      return true;
    }

    case 'GET_ACTIVITY_LOG': {
      const response: ActivityLogResponse = {
        entries: activityLog.slice(-50), // Return last 50 entries
      };
      sendResponse(response);
      return true;
    }

    default:
      return false;
  }
}

function addLogEntry(type: ActivityLogEntry['type'], summary: string): void {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    summary,
  };

  activityLog.push(entry);

  // Trim log to max entries
  if (activityLog.length > MAX_LOG_ENTRIES) {
    activityLog = activityLog.slice(-MAX_LOG_ENTRIES);
  }

  // Broadcast to popup if open
  broadcastToPopup({ type: 'ACTIVITY_LOG_ENTRY', entry });
}

function broadcastToPopup(message: unknown): void {
  // Use callback form to avoid treating chrome.runtime.sendMessage as a Promise
  // and to safely ignore errors when the popup is not open.
  try {
    chrome.runtime.sendMessage(message, () => {
      // swallow possible lastError when popup is not listening
      // (e.g. popup closed) — nothing to do here
      // eslint-disable-next-line no-unused-expressions
      chrome.runtime.lastError;
    });
  } catch (e) {
    // In some environments sendMessage may throw synchronously; ignore
  }
}

function broadcastStatusUpdate(): void {
  const states = Array.from(wsManagers.values()).map((manager) => manager.getState());
  let status: ConnectionStatus = 'DISCONNECTED';
  if (states.some((state) => state === ConnectionState.CONNECTED)) {
    status = 'CONNECTED';
  } else if (states.some((state) => state === ConnectionState.CONNECTING)) {
    status = 'CONNECTING';
  }

  const reconnectAttempts = states.length
    ? Math.max(...Array.from(wsManagers.values()).map((manager) => manager.getReconnectAttempts()))
    : 0;

  broadcastToPopup({
    type: 'STATUS_UPDATE',
    status,
    reconnectAttempts,
    maxReconnectAttempts: config.maxReconnectAttempts,
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Check if this is a popup message
  if (message.type && ['GET_STATUS', 'CONNECT', 'DISCONNECT', 'UPDATE_URL', 'GET_ACTIVITY_LOG'].includes(message.type)) {
    return handlePopupMessage(message as PopupMessage, sendResponse);
  }
  return false;
});

// Clear target tab ID when a tab is closed to prevent commands running on wrong tabs
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  clearTargetTabIfMatch(tabId, removeInfo.windowId);
});

// Track new windows and create a connection per window
chrome.windows.onCreated.addListener((window) => {
  if (window.id === undefined) return;
  const manager = getOrCreateManager(window.id);
  manager.connect();
});

chrome.windows.onRemoved.addListener((windowId) => {
  const manager = wsManagers.get(windowId);
  if (manager) {
    manager.disconnect();
    wsManagers.delete(windowId);
  }
});

// Initialize on service worker start
void init();
