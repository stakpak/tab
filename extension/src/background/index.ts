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
import { routeCommand } from './router';
import { handleTabCommand } from './tabs';

// =============================================================================
// STATE
// =============================================================================

let wsManager: WebSocketManager | null = null;
let config: ExtensionConfig = { ...DEFAULT_CONFIG };
let activityLog: ActivityLogEntry[] = [];
const MAX_LOG_ENTRIES = 100;

// =============================================================================
// WEBSOCKET LIFECYCLE
// =============================================================================

function createManager(): void {
  wsManager = createWebSocketManager(config, handleCommand, {
    onStateChange: (state: ConnectionState) => {
      const stateMap: Record<ConnectionState, ConnectionStatus> = {
        [ConnectionState.CONNECTED]: 'CONNECTED',
        [ConnectionState.CONNECTING]: 'CONNECTING',
        [ConnectionState.DISCONNECTED]: 'DISCONNECTED',
      };

      const status = stateMap[state];
      addLogEntry('connection', `Status: ${status.toLowerCase()}`);
      broadcastStatusUpdate();
    },
  });
}

function initWebSocket(): void {
  if (!wsManager) {
    createManager();
  }
  wsManager!.connect();
}



async function handleCommand(command: AgentCommand): Promise<AgentResponse> {
  console.log('[Background] Received command:', command.id, command.type);
  addLogEntry('command', `${command.type} (${command.id.slice(0, 8)}...)`);

  try {
    let response: AgentResponse;

    if (command.type === 'tab') {
      const result = await handleTabCommand(command.params as any);
      response = {
        id: command.id,
        ...result,
      };
    } else {
      response = await routeCommand(command);
    }

    console.log('[Background] Command completed:', command.id);
    addLogEntry('response', `${command.type} ${response.success ? 'success' : 'failed'}`);
    return response;
  } catch (error) {
    console.error('[Background] Command failed:', command.id, error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addLogEntry('error', `${command.type} error: ${errorMsg}`);
    return {
      id: command.id,
      success: false,
      error: errorMsg,
    };
  }
}

function init(): void {
  createManager();
  wsManager!.connect();
  console.log('[Background] Service worker initialized');
  addLogEntry('connection', 'Extension started');
}

// Initialize on load
init();

// =============================================================================
// POPUP COMMUNICATION
// =============================================================================

function handlePopupMessage(
  message: PopupMessage,
  sendResponse: (response: unknown) => void
): boolean {
  switch (message.type) {
    case 'GET_STATUS': {
      if (!wsManager) {
        createManager();
      }

      const stateMap: Record<ConnectionState, ConnectionStatus> = {
        [ConnectionState.CONNECTED]: 'CONNECTED',
        [ConnectionState.CONNECTING]: 'CONNECTING',
        [ConnectionState.DISCONNECTED]: 'DISCONNECTED',
      };

      const response: StatusResponse = {
        connectionStatus: stateMap[wsManager!.getState()],
        websocketUrl: config.websocketUrl,
        reconnectAttempts: wsManager!.getReconnectAttempts(),
        maxReconnectAttempts: config.maxReconnectAttempts,
      };
      sendResponse(response);
      return true;
    }

    case 'CONNECT': {
      initWebSocket();
      sendResponse({ success: true });
      return true;
    }

    case 'DISCONNECT': {
      if (wsManager) {
        wsManager.disconnect();
      }
      sendResponse({ success: true });
      return true;
    }

    case 'UPDATE_URL': {
      const url = message.payload?.url;
      if (url) {
        config.websocketUrl = url;
        // Recreate manager with new URL on next connect
        if (wsManager) {
          wsManager.disconnect();
          wsManager = null;
        }
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
  if (!wsManager) return;

  const stateMap: Record<ConnectionState, ConnectionStatus> = {
    [ConnectionState.CONNECTED]: 'CONNECTED',
    [ConnectionState.CONNECTING]: 'CONNECTING',
    [ConnectionState.DISCONNECTED]: 'DISCONNECTED',
  };

  broadcastToPopup({
    type: 'STATUS_UPDATE',
    status: stateMap[wsManager.getState()],
    reconnectAttempts: wsManager.getReconnectAttempts(),
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

