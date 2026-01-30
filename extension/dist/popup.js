// src/popup/index.ts
var elements = {
  statusBadge: document.getElementById("status-badge"),
  statusText: document.getElementById("status-text"),
  sessionId: document.getElementById("session-id"),
  copySessionBtn: document.getElementById("copy-session-btn"),
  wsUrlInput: document.getElementById("ws-url"),
  saveUrlBtn: document.getElementById("save-url-btn"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  reconnectHint: document.getElementById("reconnect-hint"),
  activityLog: document.getElementById("activity-log"),
  clearLogBtn: document.getElementById("clear-log-btn")
};
var currentStatus = "DISCONNECTED";
var currentSessionId = null;
var activityEntries = [];
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
function updateConnectionStatus(status) {
  currentStatus = status;
  elements.statusBadge.className = "status-badge " + status.toLowerCase();
  const statusLabels = {
    CONNECTED: "Connected",
    CONNECTING: "Connecting...",
    DISCONNECTED: "Disconnected"
  };
  elements.statusText.textContent = statusLabels[status];
  elements.connectBtn.disabled = status === "CONNECTED" || status === "CONNECTING";
  elements.disconnectBtn.disabled = status === "DISCONNECTED";
  elements.wsUrlInput.disabled = status === "CONNECTED" || status === "CONNECTING";
  elements.saveUrlBtn.disabled = status === "CONNECTED" || status === "CONNECTING";
}
function updateReconnectHint(attempts, maxAttempts) {
  if (currentStatus === "DISCONNECTED" && attempts > 0) {
    elements.reconnectHint.textContent = `Reconnect attempts: ${attempts}/${maxAttempts}`;
  } else {
    elements.reconnectHint.textContent = "";
  }
}
function updateSessionId(sessionId) {
  currentSessionId = sessionId;
  if (sessionId) {
    elements.sessionId.textContent = sessionId;
    elements.sessionId.classList.remove("not-connected");
    elements.copySessionBtn.disabled = false;
  } else {
    elements.sessionId.textContent = "Not connected";
    elements.sessionId.classList.add("not-connected");
    elements.copySessionBtn.disabled = true;
  }
}
async function handleCopySessionId() {
  if (!currentSessionId) return;
  try {
    await navigator.clipboard.writeText(currentSessionId);
    const originalText = elements.copySessionBtn.textContent;
    elements.copySessionBtn.textContent = "Copied!";
    setTimeout(() => {
      elements.copySessionBtn.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error("Failed to copy:", error);
  }
}
function renderActivityLog() {
  if (activityEntries.length === 0) {
    elements.activityLog.innerHTML = '<p class="log-empty">No activity yet</p>';
    return;
  }
  const entries = activityEntries.slice(-50).reverse();
  elements.activityLog.innerHTML = entries.map((entry) => {
    const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const icons = {
      command: "\u2192",
      // →
      response: "\u2190",
      // ←
      connection: "\u26A1",
      // ⚡
      error: "\u2716"
      // ✖
    };
    return `
        <div class="log-entry ${entry.type}">
          <span class="log-time">${time}</span>
          <span class="log-icon">${icons[entry.type] || "\u2022"}</span>
          <span class="log-message">${escapeHtml(entry.summary)}</span>
        </div>
      `;
  }).join("");
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function addLocalLogEntry(type, summary) {
  activityEntries.push({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    summary
  });
  renderActivityLog();
}
async function handleConnect() {
  try {
    updateConnectionStatus("CONNECTING");
    await sendMessage({ type: "CONNECT" });
    addLocalLogEntry("connection", "Connection initiated");
  } catch (error) {
    console.error("Connect error:", error);
    addLocalLogEntry("error", `Failed to connect: ${error}`);
    updateConnectionStatus("DISCONNECTED");
  }
}
async function handleDisconnect() {
  try {
    await sendMessage({ type: "DISCONNECT" });
    updateConnectionStatus("DISCONNECTED");
    addLocalLogEntry("connection", "Disconnected");
  } catch (error) {
    console.error("Disconnect error:", error);
    addLocalLogEntry("error", `Disconnect error: ${error}`);
  }
}
async function handleSaveUrl() {
  const url = elements.wsUrlInput.value.trim();
  if (!url) {
    return;
  }
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    addLocalLogEntry("error", "Invalid URL: must start with ws:// or wss://");
    return;
  }
  try {
    await sendMessage({ type: "UPDATE_URL", payload: { url } });
    addLocalLogEntry("connection", `Server URL updated: ${url}`);
  } catch (error) {
    console.error("Save URL error:", error);
    addLocalLogEntry("error", `Failed to save URL: ${error}`);
  }
}
function handleClearLog() {
  activityEntries = [];
  renderActivityLog();
}
async function loadStatus() {
  try {
    const status = await sendMessage({ type: "GET_STATUS" });
    updateConnectionStatus(status.connectionStatus);
    elements.wsUrlInput.value = status.websocketUrl;
    updateReconnectHint(status.reconnectAttempts, status.maxReconnectAttempts);
  } catch (error) {
    console.error("Failed to load status:", error);
    addLocalLogEntry("error", "Failed to load status from background");
  }
}
async function loadSessionId() {
  try {
    const response = await sendMessage({ type: "GET_SESSION_ID" });
    updateSessionId(response.sessionId);
  } catch (error) {
    console.error("Failed to load session ID:", error);
    updateSessionId(null);
  }
}
async function loadActivityLog() {
  try {
    const response = await sendMessage({
      type: "GET_ACTIVITY_LOG"
    });
    activityEntries = response.entries || [];
    renderActivityLog();
  } catch (error) {
    console.error("Failed to load activity log:", error);
  }
}
function setupEventListeners() {
  elements.connectBtn.addEventListener("click", handleConnect);
  elements.disconnectBtn.addEventListener("click", handleDisconnect);
  elements.saveUrlBtn.addEventListener("click", handleSaveUrl);
  elements.clearLogBtn.addEventListener("click", handleClearLog);
  elements.copySessionBtn.addEventListener("click", handleCopySessionId);
  elements.wsUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleSaveUrl();
    }
  });
}
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS_UPDATE") {
    updateConnectionStatus(message.status);
    if (message.reconnectAttempts !== void 0) {
      updateReconnectHint(message.reconnectAttempts, message.maxReconnectAttempts);
    }
    loadSessionId();
  } else if (message.type === "ACTIVITY_LOG_ENTRY") {
    activityEntries.push(message.entry);
    renderActivityLog();
  }
});
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await loadStatus();
  await loadSessionId();
  await loadActivityLog();
});
//# sourceMappingURL=popup.js.map
