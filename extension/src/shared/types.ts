/**
 * Protocol Types
 * Defines the WebSocket communication protocol between external agents and the extension
 */

// =============================================================================
// COMMAND TYPES (Agent -> Extension)
// =============================================================================

export type CommandType =
  | 'snapshot' | 'click' | 'dblclick' | 'fill' | 'type' | 'press' | 'hover' | 'focus' | 'check' | 'uncheck' | 'select'
  | 'tab' | 'open' | 'get' | 'is'
  | 'drag' | 'upload' | 'scroll' | 'scrollintoview' | 'wait' | 'screenshot' | 'pdf' | 'eval' | 'close'
  | 'back' | 'forward' | 'reload' | 'find' | 'mouse';

export interface SnapshotParams {
  timeout?: number;
}

export interface ClickParams {
  ref: string;
}

export interface FillParams {
  ref: string;
  value: string;
}

export interface TypeParams {
  ref: string;
  text: string;
  delay?: number;
}

export interface PressParams {
  ref?: string;
  key: string;
}

export interface HoverParams {
  ref: string;
}

export interface FocusParams {
  ref: string;
}

export interface CheckParams {
  ref: string;
}

export interface UncheckParams {
  ref: string;
}

export interface SelectParams {
  ref: string;
  value: string;
}

export interface OpenParams {
  url: string;
}

export interface GetParams {
  what: 'text' | 'html' | 'value' | 'attr' | 'title' | 'url' | 'count' | 'box';
  ref?: string;
  selector?: string;
  attrName?: string;
}

export interface IsParams {
  what: 'visible' | 'enabled' | 'checked';
  ref: string;
}

export interface DragParams {
  src: string;
  dst: string;
}

export interface UploadParams {
  ref: string;
  files: string[];
}

export interface ScrollParams {
  direction: 'up' | 'down' | 'left' | 'right';
  pixels?: number;
}

export interface WaitParams {
  ref?: string;
  selector?: string;
  ms?: number;
}

export interface ScreenshotParams {
  path?: string;
}

export interface PdfParams {
  path: string;
}

export interface EvalParams {
  script: string;
}

export interface FindParams {
  locator: 'role' | 'text' | 'label' | 'placeholder' | 'alt' | 'title' | 'testid' | 'first' | 'last' | 'nth';
  value: string;
  action?: string;
  text?: string;
}

export interface MouseParams {
  action: 'move' | 'down' | 'up' | 'wheel';
  x?: number;
  y?: number;
  button?: number;
  dx?: number;
  dy?: number;
}

export interface TabParams {
  action: 'new' | 'list' | 'close' | 'switch';
  url?: string;
  tabId?: number;
}

export type CommandParams =
  | SnapshotParams
  | ClickParams
  | FillParams
  | TypeParams
  | PressParams
  | HoverParams
  | FocusParams
  | CheckParams
  | UncheckParams
  | SelectParams
  | TabParams
  | OpenParams
  | GetParams
  | IsParams
  | DragParams
  | UploadParams
  | ScrollParams
  | WaitParams
  | ScreenshotParams
  | PdfParams
  | EvalParams
  | FindParams
  | MouseParams;

/**
 * Command sent from agent to extension via WebSocket
 */
export interface AgentCommand {
  id: string;
  type: CommandType;
  params?: CommandParams;
}

// =============================================================================
// RESPONSE TYPES (Extension -> Agent)
// =============================================================================

export interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
  active: boolean;
}

export interface ResponseData {
  executed?: boolean;
  snapshot?: string;
  result?: any;
  tabs?: TabInfo[];
  activeTabId?: number;
  screenshot?: string;
  pdf?: string;
  url?: string;
  title?: string;
}

/**
 * Response sent from extension to agent via WebSocket
 */
export interface AgentResponse {
  id: string;
  success: boolean;
  data?: ResponseData;
  error?: string;
}

// =============================================================================
// REF REGISTRY (Snapshot-local element references)
// =============================================================================

export interface RefEntry {
  ref: string;
  element: Element;
}

export interface RefRegistry {
  entries: Map<string, Element>;
  clear(): void;
  set(ref: string, element: Element): void;
  get(ref: string): Element | undefined;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ExtensionConfig {
  websocketUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
}

declare const process: { env: { WS_URL: string } };

export const DEFAULT_CONFIG: ExtensionConfig = {
  websocketUrl: process.env.WS_URL || 'ws://localhost:9222',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,  // Send ping every 30 seconds
  heartbeatTimeout: 10000,   // Wait 10 seconds for pong (aligned with daemon)
};
