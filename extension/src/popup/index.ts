/**
 * Popup UI Logic
 * Handles communication with background service worker and UI updates
 */

import type {
  PopupMessage,
  StatusResponse,
  ActivityLogEntry,
  ConnectionStatus,
} from '../shared/messages';

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
  statusBadge: document.getElementById('status-badge') as HTMLDivElement,
  statusText: document.getElementById('status-text') as HTMLSpanElement,
  wsUrlInput: document.getElementById('ws-url') as HTMLInputElement,
  saveUrlBtn: document.getElementById('save-url-btn') as HTMLButtonElement,
  connectBtn: document.getElementById('connect-btn') as HTMLButtonElement,
  disconnectBtn: document.getElementById('disconnect-btn') as HTMLButtonElement,
  reconnectHint: document.getElementById('reconnect-hint') as HTMLParagraphElement,
  activityLog: document.getElementById('activity-log') as HTMLDivElement,
  clearLogBtn: document.getElementById('clear-log-btn') as HTMLButtonElement,
};

// =============================================================================
// STATE
// =============================================================================

let currentStatus: ConnectionStatus = 'DISCONNECTED';
let activityEntries: ActivityLogEntry[] = [];

// =============================================================================
// MESSAGE SENDING
// =============================================================================

async function sendMessage<T>(message: PopupMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response as T);
      }
    });
  });
}

// =============================================================================
// UI UPDATE FUNCTIONS
// =============================================================================

function updateConnectionStatus(status: ConnectionStatus): void {
  currentStatus = status;

  // Update badge class
  elements.statusBadge.className = 'status-badge ' + status.toLowerCase();

  // Update text
  const statusLabels: Record<ConnectionStatus, string> = {
    CONNECTED: 'Connected',
    CONNECTING: 'Connecting...',
    DISCONNECTED: 'Disconnected',
  };
  elements.statusText.textContent = statusLabels[status];

  // Update button states
  elements.connectBtn.disabled = status === 'CONNECTED' || status === 'CONNECTING';
  elements.disconnectBtn.disabled = status === 'DISCONNECTED';
  elements.wsUrlInput.disabled = status === 'CONNECTED' || status === 'CONNECTING';
  elements.saveUrlBtn.disabled = status === 'CONNECTED' || status === 'CONNECTING';
}

function updateReconnectHint(attempts: number, maxAttempts: number): void {
  if (currentStatus === 'DISCONNECTED' && attempts > 0) {
    elements.reconnectHint.textContent = `Reconnect attempts: ${attempts}/${maxAttempts}`;
  } else {
    elements.reconnectHint.textContent = '';
  }
}

function renderActivityLog(): void {
  if (activityEntries.length === 0) {
    elements.activityLog.innerHTML = '<p class="log-empty">No activity yet</p>';
    return;
  }

  // Show most recent entries first, limit to 50
  const entries = activityEntries.slice(-50).reverse();

  elements.activityLog.innerHTML = entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const icons: Record<string, string> = {
        command: '\u2192',   // →
        response: '\u2190',  // ←
        connection: '\u26A1', // ⚡
        error: '\u2716',     // ✖
      };

      return `
        <div class="log-entry ${entry.type}">
          <span class="log-time">${time}</span>
          <span class="log-icon">${icons[entry.type] || '\u2022'}</span>
          <span class="log-message">${escapeHtml(entry.summary)}</span>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addLocalLogEntry(type: ActivityLogEntry['type'], summary: string): void {
  activityEntries.push({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    summary,
  });
  renderActivityLog();
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleConnect(): Promise<void> {
  try {
    updateConnectionStatus('CONNECTING');
    await sendMessage({ type: 'CONNECT' });
    addLocalLogEntry('connection', 'Connection initiated');
  } catch (error) {
    console.error('Connect error:', error);
    addLocalLogEntry('error', `Failed to connect: ${error}`);
    updateConnectionStatus('DISCONNECTED');
  }
}

async function handleDisconnect(): Promise<void> {
  try {
    await sendMessage({ type: 'DISCONNECT' });
    updateConnectionStatus('DISCONNECTED');
    addLocalLogEntry('connection', 'Disconnected');
  } catch (error) {
    console.error('Disconnect error:', error);
    addLocalLogEntry('error', `Disconnect error: ${error}`);
  }
}

async function handleSaveUrl(): Promise<void> {
  const url = elements.wsUrlInput.value.trim();
  if (!url) {
    return;
  }

  // Basic URL validation
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    addLocalLogEntry('error', 'Invalid URL: must start with ws:// or wss://');
    return;
  }

  try {
    await sendMessage({ type: 'UPDATE_URL', payload: { url } });
    addLocalLogEntry('connection', `Server URL updated: ${url}`);
  } catch (error) {
    console.error('Save URL error:', error);
    addLocalLogEntry('error', `Failed to save URL: ${error}`);
  }
}

function handleClearLog(): void {
  activityEntries = [];
  renderActivityLog();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

async function loadStatus(): Promise<void> {
  try {
    const status = await sendMessage<StatusResponse>({ type: 'GET_STATUS' });
    updateConnectionStatus(status.connectionStatus);
    elements.wsUrlInput.value = status.websocketUrl;
    updateReconnectHint(status.reconnectAttempts, status.maxReconnectAttempts);
  } catch (error) {
    console.error('Failed to load status:', error);
    addLocalLogEntry('error', 'Failed to load status from background');
  }
}

async function loadActivityLog(): Promise<void> {
  try {
    const response = await sendMessage<{ entries: ActivityLogEntry[] }>({
      type: 'GET_ACTIVITY_LOG',
    });
    activityEntries = response.entries || [];
    renderActivityLog();
  } catch (error) {
    console.error('Failed to load activity log:', error);
  }
}

function setupEventListeners(): void {
  elements.connectBtn.addEventListener('click', handleConnect);
  elements.disconnectBtn.addEventListener('click', handleDisconnect);
  elements.saveUrlBtn.addEventListener('click', handleSaveUrl);
  elements.clearLogBtn.addEventListener('click', handleClearLog);

  // Enter key in URL input triggers save
  elements.wsUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSaveUrl();
    }
  });
}

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_UPDATE') {
    updateConnectionStatus(message.status);
    if (message.reconnectAttempts !== undefined) {
      updateReconnectHint(message.reconnectAttempts, message.maxReconnectAttempts);
    }
  } else if (message.type === 'ACTIVITY_LOG_ENTRY') {
    activityEntries.push(message.entry);
    renderActivityLog();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadStatus();
  await loadActivityLog();
});
