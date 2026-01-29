# Extension Architecture

This document details the technical architecture of the LLM Browser Agent extension.

## System Overview

The extension facilitates real-time, bidirectional communication between an external AI Agent and the browser. It allows the agent to "see" the page (via snapshots) and "act" on it (via clicks/fills) using a deterministic reference system.

### High-Level Components

1.  **Background Service Worker (`src/background/`)**: The central hub. Manages the WebSocket connection to the Agent and routes commands to the appropriate Content Script.
2.  **Content Script (`src/content/`)**: The execution arm. Injected into web pages to traverse the DOM, generate snapshots, and execute actions.
3.  **Popup (`src/popup/`)**: The user interface. Displays connection status and activity logs.
4.  **Shared (`src/shared/`)**: Common type definitions and message protocols.

---

## Component Details

### 1. Background Service Worker
**Entry Point:** `src/background/index.ts`

*   **WebSocket Manager (`websocket.ts`)**:
    *   Maintains a persistent WebSocket connection to the Agent (default: `ws://localhost:8080`).
    *   Handles heartbeats (ping/pong) and automatic reconnection logic.
    *   Receives `AgentCommand` messages (`snapshot`, `click`, `dblclick`, `fill`, `type`, `press`, `hover`, `focus`, `check`, `uncheck`, `select`, `tab`, `open`, `get`, `is`).
*   **Router (`router.ts`)**:
    *   Determines which tab to send commands to.
    *   Prioritizes the *active* tab.
    *   For non-snapshot commands, it attempts to target the last used tab to maintain context, falling back to the active tab.
    *   Forwards commands to Content Scripts via `chrome.tabs.sendMessage`.
    *   Handles the `open` command by updating the tab's URL.
*   **Tab Manager (`tabs.ts`)**:
    *   Handles tab-level actions (`new`, `list`, `close`, `switch`) directly in the background script.

### 2. Content Script
**Entry Point:** `src/content/index.ts`

*   **Executor (`executor.ts`)**:
    *   Listens for `ContentRequest` messages from the Background script.
    *   Dispatches requests to specific action handlers.
    *   Maintains the **Ref Registry** (see below).
*   **Snapshot Action (`actions/snapshot.ts`)**:
    *   Traverses the DOM to build a simplified, text-based representation for the LLM.
    *   Assigns unique IDs (`e1`, `e2`, ...) to interactive elements.
    *   Populates the `RefRegistry`.
*   **Interaction Actions (`actions/click.ts`, `actions/dblclick.ts`, `actions/fill.ts`, `actions/type.ts`, `actions/press.ts`, `actions/hover.ts`, `actions/focus.ts`, `actions/check.ts`, `actions/select.ts`, `actions/get.ts`, `actions/is.ts`)**:
    *   Resolve `ref` strings (e.g., "e1") to actual DOM elements using the `RefRegistry`.
    *   Perform the requested DOM event (click, dblclick, input, keydown/keyup, mouseover, etc.).
    *   `type` command simulates realistic typing (appending) while `fill` replaces the entire value.
    *   `press` handles keyboard shortcuts and special keys.
    *   `check`/`uncheck` manages checkboxes and radio buttons.
    *   `select` handles dropdown menus.
    *   `get` retrieves information about elements or the page.
    *   `is` checks the state of elements.

### 3. Ref Registry & State Management
**Location:** `src/content/executor.ts` & `src/shared/types.ts`

The extension uses a **stateful, ephemeral reference system**:

1.  **Generation**: When a `snapshot` is requested, a new `RefRegistry` is created.
2.  **Mapping**: As the DOM is traversed, interactive elements are stored in the registry: `Map<"e1", HTMLElement>`.
3.  **Usage**: Subsequent interaction commands (`click`, `dblclick`, `fill`, `type`, `press`, `hover`, `focus`, `check`, `uncheck`, `select`, `get`, `is`) *must* refer to these generated IDs.
4.  **Scope**: The registry is local to the Content Script and is **replaced** on every new snapshot. This ensures that the Agent always acts on the most recent view of the page.

---

## Data Flow

### 1. Snapshot Flow
1.  **Agent** sends `{"type": "snapshot"}` via WebSocket.
2.  **Background** receives command, finds active tab, sends internal message.
3.  **Content Script** receives message:
    *   Traverses DOM.
    *   Builds text tree (e.g., `- button "Submit" [ref=e1]`).
    *   Stores `e1` -> `<button>` in `RefRegistry`.
    *   Returns text tree.
4.  **Background** forwards response to Agent.

### 2. Action Flow (e.g., Click, Type, Press, Dblclick, Get, Is)
1.  **Agent** sends `{"type": "click", "params": {"ref": "e1"}}`.
2.  **Background** routes to the tab that generated the last snapshot.
3.  **Content Script** receives message:
    *   Looks up `e1` in `RefRegistry`.
    *   If found, triggers event.
    *   Returns success/failure.
4.  **Background** forwards response to Agent.

### 3. Tab/Navigation Flow
1.  **Agent** sends `{"type": "tab", "params": {"action": "new", "url": "..."}}` or `{"type": "open", "params": {"url": "..."}}`.
2.  **Background** handles the command directly using `chrome.tabs` API.
3.  **Background** returns success/failure to Agent.

---

## Protocols

### Agent <-> Extension (WebSocket)
Defined in `src/shared/types.ts`.

*   **Commands**: `AgentCommand`
    *   `snapshot`: `{ type: 'snapshot' }`
    *   `click`: `{ type: 'click', params: { ref: 'e1' } }`
    *   `dblclick`: `{ type: 'dblclick', params: { ref: 'e1' } }`
    *   `fill`: `{ type: 'fill', params: { ref: 'e1', value: 'text' } }`
    *   `type`: `{ type: 'type', params: { ref: 'e1', text: 'text', delay: 50 } }`
    *   `press`: `{ type: 'press', params: { key: 'Enter', ref: 'e1' } }`
    *   `hover`: `{ type: 'hover', params: { ref: 'e1' } }`
    *   `focus`: `{ type: 'focus', params: { ref: 'e1' } }`
    *   `check`: `{ type: 'check', params: { ref: 'e1' } }`
    *   `uncheck`: `{ type: 'uncheck', params: { ref: 'e1' } }`
    *   `select`: `{ type: 'select', params: { ref: 'e1', value: 'option1' } }`
    *   `tab`: `{ type: 'tab', params: { action: 'list' } }`
    *   `open`: `{ type: 'open', params: { url: 'https://example.com' } }`
    *   `get`: `{ type: 'get', params: { what: 'text', ref: 'e1' } }`
    *   `is`: `{ type: 'is', params: { what: 'visible', ref: 'e1' } }`
*   **Responses**: `AgentResponse`
    *   Success: `{ id: '...', success: true, data: ... }`
    *   Error: `{ id: '...', success: false, error: '...' }`

### Internal (Chrome Runtime)
Defined in `src/shared/messages.ts`.

*   **ContentRequest**: Mirrors Agent commands but used for internal routing.
*   **Popup Messages**: `GET_STATUS`, `CONNECT`, `DISCONNECT`, `UPDATE_URL`, `GET_ACTIVITY_LOG`.
