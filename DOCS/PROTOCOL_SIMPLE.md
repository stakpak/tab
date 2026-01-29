WS Protocol — Request / Response Quick Reference

This file lists every WebSocket request (Agent -> Extension) and the expected success and failure responses (Extension -> Agent). Use the `id` field to correlate requests and responses.

General envelope
- Request (Agent -> Extension): JSON object `AgentCommand` with fields:
  - `id`: string (unique)
  - `type`: command name (see list below)
  - `params`: object (optional)

- Success response (Extension -> Agent):
  { "id": "<id>", "success": true, "data": { ... } }

- Failure response (Extension -> Agent):
  { "id": "<id>", "success": false, "error": "<error message>" }

Heartbeat
- Server -> Agent: { "type": "ping" }
- Agent -> Server: { "type": "pong" }

Note: The server sends `ping` objects; the client must reply with a JSON object `{ "type": "pong" }` (not plain string) to keep the connection alive.

---

Snapshot
- Request: { "id": "1", "type": "snapshot", "params": { "timeout": 5000 } }
- Success: { "id": "1", "success": true, "data": { "snapshot": "<serialized snapshot>" } }
- Failure: { "id": "1", "success": false, "error": "snapshot failed: <reason>" }

Click
- Request: { "id": "2", "type": "click", "params": { "ref": "e1" } }
- Success: { "id": "2", "success": true, "data": { "executed": true } }
- Failure: { "id": "2", "success": false, "error": "element not found" }

Double-click
- Request: { "id": "3", "type": "dblclick", "params": { "ref": "e1" } }
- Success: { "id": "3", "success": true, "data": { "executed": true } }
- Failure: { "id": "3", "success": false, "error": "dblclick failed" }

Fill
- Request: { "id": "4", "type": "fill", "params": { "ref": "input1", "value": "hello" } }
- Success: { "id": "4", "success": true, "data": { "executed": true } }
- Failure: { "id": "4", "success": false, "error": "fill failed" }

Type
- Request: { "id": "5", "type": "type", "params": { "ref": "input1", "text": "hello", "delay": 50 } }
- Success: { "id": "5", "success": true, "data": { "executed": true } }
- Failure: { "id": "5", "success": false, "error": "type failed" }

Press (keyboard)
- Request: { "id": "6", "type": "press", "params": { "key": "Enter", "ref": "optionalRef" } }
- Success: { "id": "6", "success": true, "data": { "executed": true } }
- Failure: { "id": "6", "success": false, "error": "key press failed" }

Hover
- Request: { "id": "7", "type": "hover", "params": { "ref": "e1" } }
- Success: { "id": "7", "success": true, "data": { "executed": true } }
- Failure: { "id": "7", "success": false, "error": "hover failed" }

Focus
- Request: { "id": "8", "type": "focus", "params": { "ref": "e1" } }
- Success: { "id": "8", "success": true, "data": { "executed": true } }
- Failure: { "id": "8", "success": false, "error": "focus failed" }

Check / Uncheck
- Request (check): { "id": "9", "type": "check", "params": { "ref": "checkbox1" } }
- Request (uncheck): { "id": "10", "type": "uncheck", "params": { "ref": "checkbox1" } }
- Success: { "id": "9", "success": true, "data": { "executed": true } }
- Failure: { "id": "9", "success": false, "error": "checkbox not found" }

Select
- Request: { "id": "11", "type": "select", "params": { "ref": "select1", "value": "optionValue" } }
- Success: { "id": "11", "success": true, "data": { "executed": true } }
- Failure: { "id": "11", "success": false, "error": "select failed" }

Tab management (tab)
- Open new: { "id": "12", "type": "tab", "params": { "action": "new", "url": "https://example.com" } }
- List: { "id": "13", "type": "tab", "params": { "action": "list" } }
- Close: { "id": "14", "type": "tab", "params": { "action": "close", "tabId": 123 } }
- Switch: { "id": "15", "type": "tab", "params": { "action": "switch", "tabId": 123 } }
- List success example: { "id": "13", "success": true, "data": { "tabs": [ { "id": 1, "url": "...", "title": "...", "active": true } ] } }

Open (navigate current tab)
- Request: { "id": "16", "type": "open", "params": { "url": "https://example.com" } }
- Success: { "id": "16", "success": true, "data": { "executed": true } }
- Failure: { "id": "16", "success": false, "error": "navigation failed" }

Get (read values)
- Request: { "id": "17", "type": "get", "params": { "what": "text", "ref": "e1" } }
- Success: { "id": "17", "success": true, "data": { "result": "...value..." } }
- Failure: { "id": "17", "success": false, "error": "get failed" }

Is (assert state)
- Request: { "id": "18", "type": "is", "params": { "what": "visible", "ref": "e1" } }
- Success: { "id": "18", "success": true, "data": { "result": true } }
- Failure: { "id": "18", "success": false, "error": "is check failed" }

Drag
- Request: { "id": "19", "type": "drag", "params": { "src": "refSrc", "dst": "refDst" } }
- Success: { "id": "19", "success": true, "data": { "executed": true } }
- Failure: { "id": "19", "success": false, "error": "drag failed" }

Upload
- Request: { "id": "20", "type": "upload", "params": { "ref": "fileInput", "files": ["/path/a","/path/b"] } }
- Success: { "id": "20", "success": true, "data": { "executed": true } }
- Failure: { "id": "20", "success": false, "error": "upload failed" }

Scroll
- Request: { "id": "21", "type": "scroll", "params": { "direction": "down", "pixels": 200 } }
- Success: { "id": "21", "success": true, "data": { "executed": true } }
- Failure: { "id": "21", "success": false, "error": "scroll failed" }

ScrollIntoView
- Request: { "id": "22", "type": "scrollintoview", "params": { "ref": "e1" } }
- Success: { "id": "22", "success": true, "data": { "executed": true } }

Wait
- Request: { "id": "23", "type": "wait", "params": { "selector": "#el", "ms": 5000 } }
- Success: { "id": "23", "success": true, "data": { "result": true } }
- Failure: { "id": "23", "success": false, "error": "timeout waiting for selector" }

Screenshot
- Request: { "id": "24", "type": "screenshot", "params": { "path": "/tmp/shot.png" } }
- Success: { "id": "24", "success": true, "data": { "screenshot": "<base64 or path>" } }
- Failure: { "id": "24", "success": false, "error": "screenshot failed" }

PDF
- Request: { "id": "25", "type": "pdf", "params": { "path": "/tmp/out.pdf" } }
- Success: { "id": "25", "success": true, "data": { "pdf": "<path or base64>" } }
- Failure: { "id": "25", "success": false, "error": "pdf generation failed" }

Eval (run script in page)
- Request: { "id": "26", "type": "eval", "params": { "script": "document.title" } }
- Success: { "id": "26", "success": true, "data": { "result": "Page Title" } }
- Failure: { "id": "26", "success": false, "error": "eval failed" }

Find
- Request: { "id": "27", "type": "find", "params": { "locator": "text", "value": "Submit" } }
- Success: { "id": "27", "success": true, "data": { "result": [ { "ref": "e12", "nodeId": "..." } ] } }
- Failure: { "id": "27", "success": false, "error": "find failed" }

Mouse actions
- Request: { "id": "28", "type": "mouse", "params": { "action": "move", "x": 100, "y": 200 } }
- Success: { "id": "28", "success": true, "data": { "executed": true } }
- Failure: { "id": "28", "success": false, "error": "mouse action failed" }

Navigation helpers (close/back/forward/reload)
- Request (close): { "id": "29", "type": "close" }
- Request (back): { "id": "30", "type": "back" }
- Success: { "id": "29", "success": true, "data": { "executed": true } }
- Failure: { "id": "29", "success": false, "error": "navigation failed" }

---

If you want this file placed inside `extension/` (for closer proximity to code), or want example client scripts added to the repo, tell me and I will add them.