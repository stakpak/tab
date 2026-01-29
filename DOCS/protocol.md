# tab WebSocket Protocol (v1)

This document defines the **WebSocket protocol** used between `tab-daemon` and the browser extension. The protocol assumes **v1 constraints**:

* The daemon does **not own refs**; they are extension-only.
* Refs are valid only per snapshot.
* Commands act on the active tab only.
* No structured error codes; error is a human-readable string.
* No `wait` or headless mode.

All messages are JSON objects.

---

## 1. General Envelope

### Request (Daemon -> Extension)

```json
{
  "id": "<unique string>",
  "type": "<command>",
  "params": { ... }  // optional, command-specific
}
```

### Success Response (Extension -> Daemon)

```json
{
  "id": "<same id as request>",
  "success": true,
  "data": { ... } // command-specific
}
```

### Failure Response (Extension -> Daemon)

```json
{
  "id": "<same id as request>",
  "success": false,
  "error": "<human-readable message>"
}
```

### Heartbeat

Daemon sends pings; extension responds with pongs:

```json
{ "type": "ping" }  // from daemon
{ "type": "pong" }  // from extension
```

---

## 2. Commands

### 2.1 Snapshot

```json
Request: { "id": "1", "type": "snapshot", "params": { "timeout": 5000 } }
Success: { "id": "1", "success": true, "data": { "snapshot": "<DOM snapshot>", "refs": ["e1","e2"] } }
Failure: { "id": "1", "success": false, "error": "snapshot failed" }
```

### 2.2 Click

```json
Request: { "id": "2", "type": "click", "params": { "ref": "e1" } }
Success: { "id": "2", "success": true, "data": { "executed": true } }
Failure: { "id": "2", "success": false, "error": "element not found" }
```

### 2.3 Double-click

```json
Request: { "id": "3", "type": "dblclick", "params": { "ref": "e1" } }
Success: { "id": "3", "success": true, "data": { "executed": true } }
Failure: { "id": "3", "success": false, "error": "dblclick failed" }
```

### 2.4 Fill

```json
Request: { "id": "4", "type": "fill", "params": { "ref": "input1", "value": "hello" } }
Success: { "id": "4", "success": true, "data": { "executed": true } }
Failure: { "id": "4", "success": false, "error": "fill failed" }
```

### 2.5 Type

```json
Request: { "id": "5", "type": "type", "params": { "ref": "input1", "text": "hello", "delay": 50 } }
Success: { "id": "5", "success": true, "data": { "executed": true } }
Failure: { "id": "5", "success": false, "error": "type failed" }
```

### 2.6 Press (Keyboard)

```json
Request: { "id": "6", "type": "press", "params": { "key": "Enter", "ref": "optionalRef" } }
Success: { "id": "6", "success": true, "data": { "executed": true } }
Failure: { "id": "6", "success": false, "error": "key press failed" }
```

### 2.7 Hover

```json
Request: { "id": "7", "type": "hover", "params": { "ref": "e1" } }
Success: { "id": "7", "success": true, "data": { "executed": true } }
Failure: { "id": "7", "success": false, "error": "hover failed" }
```

### 2.8 Focus

```json
Request: { "id": "8", "type": "focus", "params": { "ref": "e1" } }
Success: { "id": "8", "success": true, "data": { "executed": true } }
Failure: { "id": "8", "success": false, "error": "focus failed" }
```

### 2.9 Check / Uncheck

```json
Request (check): { "id": "9", "type": "check", "params": { "ref": "checkbox1" } }
Request (uncheck): { "id": "10", "type": "uncheck", "params": { "ref": "checkbox1" } }
Success: { "id": "9", "success": true, "data": { "executed": true } }
Failure: { "id": "9", "success": false, "error": "checkbox not found" }
```

### 2.10 Select

```json
Request: { "id": "11", "type": "select", "params": { "ref": "select1", "value": "optionValue" } }
Success: { "id": "11", "success": true, "data": { "executed": true } }
Failure: { "id": "11", "success": false, "error": "select failed" }
```

### 2.11 Tab Management

```json
Open new: { "id": "12", "type": "tab", "params": { "action": "new", "url": "https://example.com" } }
List: { "id": "13", "type": "tab", "params": { "action": "list" } }
Close: { "id": "14", "type": "tab", "params": { "action": "close", "tabId": 123 } }
Switch: { "id": "15", "type": "tab", "params": { "action": "switch", "tabId": 123 } }
```

### 2.12 Navigate (Active Tab Only)

```json
Request: { "id": "16", "type": "navigate", "params": { "url": "https://example.com" } }
Success: { "id": "16", "success": true, "data": { "executed": true } }
Failure: { "id": "16", "success": false, "error": "navigation failed or no active tab" }
```

### 2.13 Get (Read Values)

```json
Request: { "id": "17", "type": "get", "params": { "what": "text", "ref": "e1" } }
Success: { "id": "17", "success": true, "data": { "result": "...value..." } }
Failure: { "id": "17", "success": false, "error": "get failed" }
```

### 2.14 Is (Assert State)

```json
Request: { "id": "18", "type": "is", "params": { "what": "visible", "ref": "e1" } }
Success: { "id": "18", "success": true, "data": { "result": true } }
Failure: { "id": "18", "success": false, "error": "is check failed" }
```

### 2.15 Drag

```json
Request: { "id": "19", "type": "drag", "params": { "src": "refSrc", "dst": "refDst" } }
Success: { "id": "19", "success": true, "data": { "executed": true } }
Failure: { "id": "19", "success": false, "error": "drag failed" }
```

### 2.16 Upload

```json
Request: { "id": "20", "type": "upload", "params": { "ref": "fileInput", "files": ["/path/a","/path/b"] } }
Success: { "id": "20", "success": true, "data": { "executed": true } }
Failure: { "id": "20", "success": false, "error": "upload failed" }
```

### 2.17 Scroll

```json
Request: { "id": "21", "type": "scroll", "params": { "direction": "down", "pixels": 200 } }
Success: { "id": "21", "success": true, "data": { "executed": true } }
Failure: { "id": "21", "success": false, "error": "scroll failed" }
```

### 2.18 ScrollIntoView

```json
Request: { "id": "22", "type": "scrollintoview", "params": { "ref": "e1" } }
Success: { "id": "22", "success": true, "data": { "executed": true } }
```

### 2.19 Screenshot

```json
Request: { "id": "24", "type": "screenshot", "params": { "path": "/tmp/shot.png" } }
Success: { "id": "24", "success": true, "data": { "screenshot": "" } }
Failure: { "id": "24", "success": false, "error": "screenshot failed" }
```

### 2.20 PDF

```json
Request: { "id": "25", "type": "pdf", "params": { "path": "/tmp/out.pdf" } }
Success: { "id": "25", "success": true, "data": { "pdf": "" } }
Failure: { "id": "25", "success": false, "error": "pdf generation failed" }
```

### 2.21 Eval

```json
Request: { "id": "26", "type": "eval", "params": { "script": "document.title" } }
Success: { "id": "26", "success": true, "data": { "result": "Page Title" } }
Failure: { "id": "26", "success": false, "error": "eval failed" }
```

### 2.22 Find

```json
Request: { "id": "27", "type": "find", "params": { "locator": "text", "value": "Submit" } }
Success: { "id": "27", "success": true, "data": { "result": [ { "ref": "e12", "nodeId": "..." } ] } }
Failure: { "id": "27", "success": false, "error": "find failed" }
```

### 2.23 Mouse Actions

```json
Request: { "id": "28", "type": "mouse", "params": { "action": "move", "x": 100, "y": 200 } }
Success: { "id": "28", "success": true, "data": { "executed": true } }
Fai
```
