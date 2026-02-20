/**
 * Internal Chrome Runtime Message Types
 * Communication between background service worker, content scripts, and popup
 */

// =============================================================================
// CONTENT SCRIPT REQUEST/RESPONSE
// =============================================================================

export type ActionType =
  | 'snapshot' | 'click' | 'dblclick' | 'fill' | 'type' | 'press' | 'hover' | 'focus' | 'check' | 'uncheck' | 'select' | 'get' | 'is'
  | 'drag' | 'scroll' | 'scrollintoview' | 'wait' | 'find' | 'mouse';

export interface ContentRequest {
  action: ActionType;
  params?: {
    ref?: string;
    value?: string;
    text?: string;
    key?: string;
    what?: string;
    selector?: string;
    attrName?: string;
    script?: string;
    direction?: string;
    pixels?: number;
    ms?: number;
    src?: string;
    dst?: string;
    files?: string[];
    locator?: string;
    action?: string;
    x?: number;
    y?: number;
    button?: number;
    dx?: number;
    dy?: number;
    delay?: number;
    timeout?: number;
  };
}

export interface ContentResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// =============================================================================
// POPUP <-> BACKGROUND MESSAGES
// =============================================================================

export type PopupMessageType =
  | 'GET_STATUS'
  | 'GET_SESSION_ID'
  | 'CONNECT'
  | 'DISCONNECT'
  | 'UPDATE_URL'
  | 'GET_ACTIVITY_LOG';

export interface PopupMessage {
  type: PopupMessageType;
  payload?: {
    url?: string;
    windowId?: number;
  };
}

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  type: 'command' | 'response' | 'connection' | 'error';
  summary: string;
}

export interface StatusResponse {
  connectionStatus: ConnectionStatus;
  websocketUrl: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

export interface ActivityLogResponse {
  entries: ActivityLogEntry[];
}

export interface SessionIdResponse {
  sessionId: string | null;
  windowId: number;
}

export type PopupResponse = StatusResponse | ActivityLogResponse | SessionIdResponse | { success: boolean };
