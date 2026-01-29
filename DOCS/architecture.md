# tab Architecture

This document defines the **system components, boundaries, responsibilities, and target output** of tab. It is intentionally explicit and conservative. Anything not described here is **out of scope for v1**.

---

## 1. System Overview

tab is a system that allows controlling a **real, headed browser** via a **CLI**, using a **browser extension** as the execution environment.

The system is split into **three processes** with strict responsibility boundaries:

```
[tab CLI]  →  [tab-daemon]  ⇄  [Browser Extension] (DONE)  →  [Browser / Web Page]
```

Only one component is long-running: **tab-daemon**.

---

## 2. Components

### 2.1 tab CLI

**Role**: User-facing command-line interface

**Responsibilities**:

* Parse user commands and arguments
* Resolve the active session (via environment or defaults)
* Send commands to `tab-daemon`
* Print results or errors
* Exit immediately after command completion

**Non-responsibilities**:

* Does NOT maintain state
* Does NOT speak WebSocket
* Does NOT communicate directly with the browser or extension
* Does NOT retry or reorder commands

**Lifecycle**:

* Short-lived
* One invocation = one request

---

### 2.2 tab-daemon

**Role**: Central coordinator and state owner

**This is the core of the system.**

**Responsibilities**:

* Run as a long-lived background process
* Expose a local IPC interface for the CLI (Unix socket / named pipe / localhost TCP)
* Host the WebSocket server used by browser extensions
* Manage sessions
* Launch and manage browser processes (headed only)
* Route commands between CLI and extension
* Enforce command ordering
* Does NOT track or validate refs (ref lifecycle is owned entirely by the extension)
* Detect disconnections and stale state

**Non-responsibilities**:

* Does NOT execute DOM actions
* Does NOT inspect or modify page content
* Does NOT interpret JavaScript results beyond forwarding them

**Key invariants**:

* Commands are forwarded to the extension **in strict arrival order**
* Only one command is in-flight per session
* The daemon is authoritative; extensions are execution workers

---

### 2.3 Browser Extension

**Role**: Execution engine inside the browser

**Responsibilities**:

* Connect to `tab-daemon` via WebSocket
* Execute commands exactly as received
* Interact with the active browser tab
* Collect DOM snapshots and generate element refs
* Enforce snapshot-scoped ref validity
* Report success or failure for each command
* Respond to heartbeat messages

**Non-responsibilities**:

* Does NOT maintain long-term state
* Does NOT retry commands
* Does NOT reorder commands
* Does NOT make decisions about sessions
* Does NOT talk to the CLI

**Trust model**:

* Extension is trusted to act correctly but is not authoritative

---

## 3. Browser

**Type**: Headed browser only (Chromium-based for v1)

**Constraints**:

* No headless mode
* No CDP usage exposed to users
* Internal browser pages (`chrome://`, `about:`) are not controllable

The browser is treated as an opaque environment controlled only via standard extension APIs.

---

## 4. Sessions

A **session** represents a persistent browser context.

### Session properties

* Has a unique name
* Is a logical routing identifier only
* Does NOT map to a browser profile directory
* Does NOT affect cookies, local storage, history, or browser identity
* Owns no browser state

### Session resolution

* Default session is used unless overridden
* Session name may be provided via environment variable

### Lifecycle

* Sessions persist across CLI invocations
* Sessions persist across daemon restarts
* Browser may be restarted and reattached to an existing session

---

## 5. Command Flow

### High-level flow

1. User runs a CLI command
2. CLI sends a request to `tab-daemon`
3. Daemon validates session and state
4. Daemon forwards the command to the extension
5. Extension executes the command in the browser
6. Extension replies with success or failure
7. Daemon forwards the response to the CLI
8. CLI prints output and exits

---

## 6. Snapshot and Ref Model

### Snapshot

* A snapshot represents a point-in-time view of the DOM
* Snapshot generation is explicit via the `snapshot` command

### Refs

* Refs are opaque identifiers for DOM nodes
* Refs are **valid only for the snapshot that created them**

### Invalidation rules

Refs are invalidated immediately when:

* A new snapshot is taken
* Any navigation occurs (`navigate`, `tab new`, `back`, etc.)

Any command using an invalid ref must fail.

There is **no ref recovery** in v1.

---

## 7. Tab Model

* There is always at most one **active tab** per session
* All DOM and input commands target the active tab
* `tab switch` changes the active tab
* `tab new` creates a new tab and makes it active

No command accepts an explicit tab identifier unless explicitly stated.

---

## 8. Navigation Model

### Supported navigation mechanisms

* `navigate <url>` (active tab only)
* `tab new <url>`
* Browser history commands (`back`, optionally `forward`)
* User-triggered navigation (clicks, form submissions, JS redirects)

### Navigation semantics

* Navigation is asynchronous
* Commands do NOT wait for page load
* Navigation always invalidates the current snapshot

---

## 9. Error Handling (v1 scope)

* Errors are returned as human-readable strings
* No structured error codes are required in v1
* Failures are deterministic and immediate

Examples:

* "ref is no longer valid"
* "no active tab"
* "snapshot failed"

---

## 10. Boundaries and Non-Goals

### Explicit non-goals for v1

* No headless automation
* No implicit waiting or retries
* No selector-based commands
* No parallel command execution
* No test framework semantics
* No guarantee of determinism across page changes

tab v1 prioritizes **explicit control, simplicity, and observability** over convenience.

---

## 11. Target Output

The target output of the system is:

* A deterministic, scriptable CLI for controlling a real browser
* A stable daemon that owns state and sessions
* A thin, predictable extension that executes commands
* Clear failure modes instead of hidden magic

The system should feel:

* Explicit
* Predictable
* Inspectable
* Boring in the best possible way

---

**This document defines the architectural contract for tab v1.**
Any feature or behavior not described here must be considered out of scope unless explicitly added in a future revision.
