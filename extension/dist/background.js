// src/shared/types.ts
var DEFAULT_CONFIG = {
  websocketUrl: "ws://localhost:8080",
  reconnectInterval: 3e3,
  maxReconnectAttempts: 10,
  heartbeatInterval: 3e4,
  // Send ping every 30 seconds
  heartbeatTimeout: 5e3
  // Wait 5 seconds for pong
};

// src/background/websocket.ts
function createWebSocketManager(config2, onCommand, callbacks) {
  let ws = null;
  let state = "DISCONNECTED" /* DISCONNECTED */;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let pongTimer = null;
  let awaitingPong = false;
  let shouldReconnect = true;
  function setState(newState) {
    if (state !== newState) {
      state = newState;
      callbacks?.onStateChange?.(newState);
    }
  }
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      if (awaitingPong) {
        console.warn("[WebSocket] Heartbeat timeout - connection stale");
        ws.close();
        return;
      }
      try {
        if (pongTimer) {
          clearTimeout(pongTimer);
          pongTimer = null;
        }
        ws.send(JSON.stringify({ type: "ping" }));
        awaitingPong = true;
        console.log("[WebSocket] Ping sent");
        pongTimer = setTimeout(() => {
          if (awaitingPong) {
            console.warn("[WebSocket] Pong timeout - closing connection");
            ws?.close();
          }
        }, config2.heartbeatTimeout);
      } catch (error) {
        console.error("[WebSocket] Failed to send ping:", error);
      }
    }, config2.heartbeatInterval);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
    awaitingPong = false;
  }
  function handlePong() {
    awaitingPong = false;
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
    console.log("[WebSocket] Pong received");
  }
  const manager = {
    connect() {
      if (state === "CONNECTING" /* CONNECTING */) {
        console.log("[WebSocket] Already connecting");
        return;
      }
      if (state === "CONNECTED" /* CONNECTED */) {
        console.log("[WebSocket] Already connected");
        return;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setState("CONNECTING" /* CONNECTING */);
      shouldReconnect = true;
      console.log("[WebSocket] Connecting to", config2.websocketUrl);
      try {
        ws = new WebSocket(config2.websocketUrl);
        ws.onopen = () => {
          setState("CONNECTED" /* CONNECTED */);
          reconnectAttempts = 0;
          console.log("[WebSocket] Connected");
          startHeartbeat();
        };
        ws.onmessage = async (event) => {
          let payload = event.data;
          if (typeof event.data === "string") {
            try {
              payload = JSON.parse(event.data);
            } catch {
              payload = event.data;
            }
          }
          if (isPongMessage(payload)) {
            handlePong();
            return;
          }
          const command = parseCommand(payload);
          if (!command) {
            console.error("[WebSocket] Invalid command format:", event.data);
            return;
          }
          console.log("[WebSocket] Received command:", command.id);
          try {
            const response = await onCommand(command);
            manager.send(response);
          } catch (error) {
            console.error("[WebSocket] Command handler error:", error);
            manager.send({
              id: command.id,
              success: false,
              error: error instanceof Error ? error.message : "Unknown error"
            });
          }
        };
        ws.onerror = (error) => {
          console.error("[WebSocket] Error:", error);
        };
        ws.onclose = () => {
          setState("DISCONNECTED" /* DISCONNECTED */);
          ws = null;
          stopHeartbeat();
          console.log("[WebSocket] Disconnected");
          if (shouldReconnect) {
            manager.attemptReconnect();
          }
        };
      } catch (error) {
        setState("DISCONNECTED" /* DISCONNECTED */);
        console.error("[WebSocket] Connection failed:", error);
        manager.attemptReconnect();
      }
    },
    disconnect() {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = 0;
      stopHeartbeat();
      if (ws) {
        ws.close();
        ws = null;
      }
      setState("DISCONNECTED" /* DISCONNECTED */);
      console.log("[WebSocket] Disconnected");
    },
    send(response) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("[WebSocket] Cannot send: not connected");
        return;
      }
      try {
        ws.send(JSON.stringify(response));
      } catch (error) {
        console.error("[WebSocket] Send error:", error);
      }
    },
    isConnected() {
      return state === "CONNECTED" /* CONNECTED */;
    },
    getState() {
      return state;
    },
    getReconnectAttempts() {
      return reconnectAttempts;
    },
    attemptReconnect() {
      if (reconnectAttempts >= config2.maxReconnectAttempts) {
        console.error("[WebSocket] Max reconnection attempts reached");
        return;
      }
      if (state === "CONNECTING" /* CONNECTING */ || state === "CONNECTED" /* CONNECTED */) {
        return;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts++;
      const delay = Math.min(
        config2.reconnectInterval * Math.pow(2, reconnectAttempts - 1),
        3e4
        // Cap at 30 seconds
      );
      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      reconnectTimer = setTimeout(() => {
        manager.connect();
      }, delay);
    }
  };
  return manager;
}
function parseCommand(data) {
  try {
    if (typeof data === "string") {
      const parsed = JSON.parse(data);
      return validateCommand(parsed);
    }
    return validateCommand(data);
  } catch (error) {
    console.error("[WebSocket] Parse error:", error);
    return null;
  }
}
function isPongMessage(payload) {
  return payload !== null && typeof payload === "object" && "type" in payload && payload.type === "pong";
}
function validateCommand(obj) {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const cmd = obj;
  if (typeof cmd.id !== "string" || !cmd.id) {
    return null;
  }
  if (typeof cmd.type !== "string" || ![
    "snapshot",
    "click",
    "dblclick",
    "fill",
    "type",
    "press",
    "hover",
    "focus",
    "check",
    "uncheck",
    "select",
    "tab",
    "open",
    "get",
    "is",
    "drag",
    "upload",
    "scroll",
    "scrollintoview",
    "wait",
    "screenshot",
    "pdf",
    "eval",
    "close",
    "back",
    "forward",
    "reload",
    "find",
    "mouse"
  ].includes(cmd.type)) {
    return null;
  }
  const params = cmd.params;
  if (params !== void 0 && (typeof params !== "object" || params === null)) {
    return null;
  }
  return {
    id: cmd.id,
    type: cmd.type,
    params
  };
}

// src/background/router.ts
var lastTargetTabId = null;
async function routeCommand(command) {
  const tab = await getTargetTab(command.type);
  if (!tab) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  if (!tab.id) {
    return {
      id: command.id,
      success: false,
      error: "Tab has no ID"
    };
  }
  if (!tab.url || !isValidTabUrl(tab.url)) {
    return {
      id: command.id,
      success: false,
      error: "Tab has invalid URL (likely a browser page)"
    };
  }
  if (command.type === "snapshot") {
    lastTargetTabId = tab.id;
  }
  if (command.type === "open") {
    const url = command.params?.url;
    if (!url) {
      return { id: command.id, success: false, error: "Missing URL for open command" };
    }
    await chrome.tabs.update(tab.id, { url });
    lastTargetTabId = tab.id;
    return { id: command.id, success: true, data: { executed: true } };
  }
  if (command.type === "back") {
    await chrome.tabs.goBack(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }
  if (command.type === "forward") {
    await chrome.tabs.goForward(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }
  if (command.type === "reload") {
    await chrome.tabs.reload(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }
  if (command.type === "close") {
    await chrome.tabs.remove(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }
  if (command.type === "screenshot") {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    return { id: command.id, success: true, data: { screenshot: dataUrl } };
  }
  if (command.type === "pdf") {
    return new Promise((resolve) => {
      const target = { tabId: tab.id };
      chrome.debugger.attach(target, "1.3", async () => {
        if (chrome.runtime.lastError) {
          resolve({ id: command.id, success: false, error: chrome.runtime.lastError.message });
          return;
        }
        chrome.debugger.sendCommand(target, "Page.printToPDF", {}, (result) => {
          const error = chrome.runtime.lastError;
          chrome.debugger.detach(target);
          if (error) {
            resolve({ id: command.id, success: false, error: error.message });
          } else {
            resolve({ id: command.id, success: true, data: { result: result.data } });
          }
        });
      });
    });
  }
  if (command.type === "upload") {
    const ref = command.params?.ref;
    const files = command.params?.files;
    if (!ref || !files) return { id: command.id, success: false, error: "Missing ref or files" };
    return new Promise((resolve) => {
      const target = { tabId: tab.id };
      chrome.debugger.attach(target, "1.3", async () => {
        if (chrome.runtime.lastError) {
          resolve({ id: command.id, success: false, error: chrome.runtime.lastError.message });
          return;
        }
        chrome.debugger.sendCommand(target, "DOM.getDocument", {}, async (doc) => {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (refId) => {
              const el = window.__REF_REGISTRY__?.get(refId);
              if (el) el.setAttribute("data-upload-target", "true");
            },
            args: [ref]
          });
          chrome.debugger.sendCommand(target, "DOM.querySelector", {
            nodeId: doc.root.nodeId,
            selector: '[data-upload-target="true"]'
          }, (node) => {
            if (!node || !node.nodeId) {
              chrome.debugger.detach(target);
              resolve({ id: command.id, success: false, error: "Could not find upload target element" });
              return;
            }
            chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
              nodeId: node.nodeId,
              files
            }, () => {
              const error = chrome.runtime.lastError;
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.querySelector('[data-upload-target="true"]')?.removeAttribute("data-upload-target")
              });
              chrome.debugger.detach(target);
              if (error) {
                resolve({ id: command.id, success: false, error: error.message });
              } else {
                resolve({ id: command.id, success: true, data: { executed: true } });
              }
            });
          });
        });
      });
    });
  }
  if (command.type === "eval") {
    const script = command.params?.script;
    if (!script) return { id: command.id, success: false, error: "Missing script" };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: (scriptStr) => {
          try {
            return new Function(scriptStr)();
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [script]
      });
      const result = results[0]?.result;
      if (result && typeof result === "object" && "error" in result) {
        return { id: command.id, success: false, error: result.error };
      }
      return { id: command.id, success: true, data: { result } };
    } catch (error) {
      console.error("[Router] Eval failed:", error);
      return { id: command.id, success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  const contentRequest = {
    action: command.type,
    params: command.params
  };
  try {
    const contentResponse = await sendToContentScript(tab.id, contentRequest);
    return {
      id: command.id,
      success: contentResponse.success,
      data: contentResponse.data,
      error: contentResponse.error
    };
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : "Failed to send message to content script"
    };
  }
}
async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tabs[0] || null;
}
async function getTargetTab(commandType) {
  if (commandType !== "snapshot" && lastTargetTabId !== null) {
    try {
      const previousTab = await chrome.tabs.get(lastTargetTabId);
      if (previousTab?.url && isValidTabUrl(previousTab.url)) {
        return previousTab;
      }
    } catch {
    }
  }
  return getActiveTab();
}
function isValidTabUrl(url) {
  if (url === "about:blank") return true;
  return !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("about:") && !url.startsWith("edge://") && !url.startsWith("moz-extension://") && !url.startsWith("devtools://");
}
async function ensureContentScriptInjected(tabId) {
  try {
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  } catch {
    console.log("[Router] Content script not found, injecting...");
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content.js"]
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("[Router] Content script injected");
  }
}
async function sendToContentScript(tabId, request) {
  await ensureContentScriptInjected(tabId);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Content script message timeout"));
    }, 1e4);
    chrome.tabs.sendMessage(tabId, request, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response) {
        resolve(response);
      } else {
        reject(new Error("No response from content script"));
      }
    });
  });
}

// src/background/tabs.ts
async function handleTabCommand(params) {
  const { action, url, tabId } = params;
  switch (action) {
    case "new": {
      await chrome.tabs.create({ url });
      return { success: true, data: { executed: true } };
    }
    case "list": {
      const tabs = await chrome.tabs.query({});
      const tabList = tabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active
      }));
      return { success: true, data: { tabs: tabList } };
    }
    case "close": {
      if (tabId === void 0) throw new Error("tabId required for close action");
      await chrome.tabs.remove(tabId);
      return { success: true, data: { executed: true } };
    }
    case "switch": {
      if (tabId === void 0) throw new Error("tabId required for switch action");
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return { success: true, data: { executed: true } };
    }
    default:
      throw new Error(`Unknown tab action: ${action}`);
  }
}

// src/background/index.ts
var wsManager = null;
var config = { ...DEFAULT_CONFIG };
var activityLog = [];
var MAX_LOG_ENTRIES = 100;
function createManager() {
  wsManager = createWebSocketManager(config, handleCommand, {
    onStateChange: (state) => {
      const stateMap = {
        ["CONNECTED" /* CONNECTED */]: "CONNECTED",
        ["CONNECTING" /* CONNECTING */]: "CONNECTING",
        ["DISCONNECTED" /* DISCONNECTED */]: "DISCONNECTED"
      };
      const status = stateMap[state];
      addLogEntry("connection", `Status: ${status.toLowerCase()}`);
      broadcastStatusUpdate();
    }
  });
}
function initWebSocket() {
  if (!wsManager) {
    createManager();
  }
  wsManager.connect();
}
async function handleCommand(command) {
  console.log("[Background] Received command:", command.id, command.type);
  addLogEntry("command", `${command.type} (${command.id.slice(0, 8)}...)`);
  try {
    let response;
    if (command.type === "tab") {
      const result = await handleTabCommand(command.params);
      response = {
        id: command.id,
        ...result
      };
    } else {
      response = await routeCommand(command);
    }
    console.log("[Background] Command completed:", command.id);
    addLogEntry("response", `${command.type} ${response.success ? "success" : "failed"}`);
    return response;
  } catch (error) {
    console.error("[Background] Command failed:", command.id, error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    addLogEntry("error", `${command.type} error: ${errorMsg}`);
    return {
      id: command.id,
      success: false,
      error: errorMsg
    };
  }
}
function init() {
  createManager();
  wsManager.connect();
  console.log("[Background] Service worker initialized");
  addLogEntry("connection", "Extension started");
}
init();
function handlePopupMessage(message, sendResponse) {
  switch (message.type) {
    case "GET_STATUS": {
      if (!wsManager) {
        createManager();
      }
      const stateMap = {
        ["CONNECTED" /* CONNECTED */]: "CONNECTED",
        ["CONNECTING" /* CONNECTING */]: "CONNECTING",
        ["DISCONNECTED" /* DISCONNECTED */]: "DISCONNECTED"
      };
      const response = {
        connectionStatus: stateMap[wsManager.getState()],
        websocketUrl: config.websocketUrl,
        reconnectAttempts: wsManager.getReconnectAttempts(),
        maxReconnectAttempts: config.maxReconnectAttempts
      };
      sendResponse(response);
      return true;
    }
    case "CONNECT": {
      initWebSocket();
      sendResponse({ success: true });
      return true;
    }
    case "DISCONNECT": {
      if (wsManager) {
        wsManager.disconnect();
      }
      sendResponse({ success: true });
      return true;
    }
    case "UPDATE_URL": {
      const url = message.payload?.url;
      if (url) {
        config.websocketUrl = url;
        if (wsManager) {
          wsManager.disconnect();
          wsManager = null;
        }
        addLogEntry("connection", `Server URL changed: ${url}`);
      }
      sendResponse({ success: true });
      return true;
    }
    case "GET_ACTIVITY_LOG": {
      const response = {
        entries: activityLog.slice(-50)
        // Return last 50 entries
      };
      sendResponse(response);
      return true;
    }
    default:
      return false;
  }
}
function addLogEntry(type, summary) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    summary
  };
  activityLog.push(entry);
  if (activityLog.length > MAX_LOG_ENTRIES) {
    activityLog = activityLog.slice(-MAX_LOG_ENTRIES);
  }
  broadcastToPopup({ type: "ACTIVITY_LOG_ENTRY", entry });
}
function broadcastToPopup(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      chrome.runtime.lastError;
    });
  } catch (e) {
  }
}
function broadcastStatusUpdate() {
  if (!wsManager) return;
  const stateMap = {
    ["CONNECTED" /* CONNECTED */]: "CONNECTED",
    ["CONNECTING" /* CONNECTING */]: "CONNECTING",
    ["DISCONNECTED" /* DISCONNECTED */]: "DISCONNECTED"
  };
  broadcastToPopup({
    type: "STATUS_UPDATE",
    status: stateMap[wsManager.getState()],
    reconnectAttempts: wsManager.getReconnectAttempts(),
    maxReconnectAttempts: config.maxReconnectAttempts
  });
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type && ["GET_STATUS", "CONNECT", "DISCONNECT", "UPDATE_URL", "GET_ACTIVITY_LOG"].includes(message.type)) {
    return handlePopupMessage(message, sendResponse);
  }
  return false;
});
//# sourceMappingURL=background.js.map
