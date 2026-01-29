# Architecture

## Overview

This document defines the high-level architecture for an LLM-controlled browser extension designed for real-time agent interaction with web applications. The purpose of this document is to establish system boundaries, responsibilities, and input/output contracts while intentionally deferring implementation details for later, more robust iterations.

---

## Design Goals

* **Agent-optimized**: Compact, semantically meaningful UI state for LLM reasoning
* **Deterministic actions**: Ref-based targeting instead of selectors
* **Real-time capable**: Low-latency bidirectional communication
* **Maintainable**: Clear separation of concerns with minimal moving parts

---

## High-Level Architecture

```
    Any Client
        │
        │ WebSocket (bidirectional)
        ▼
Background Service Worker (MV3)
  ├─ Transport & protocol handling
  ├─ Command routing
  ├─ Active tab management
  └─ Session coordination
        │
        │ chrome.runtime messaging
        ▼
Content Script (per tab / frame)
  ├─ Action execution (snapshot, click, fill, etc.)
        │
        ▼
Web Page DOM
```

---

## Core Components

### 1. Background Service Worker (Manifest V3)

**Role:** Orchestration and transport layer

Responsibilities:

* Maintain the WebSocket connection to the external agent
* Receive, validate, and route incoming commands
* Identify and target the active browser tab
* Relay messages between the agent and content scripts
* Handle lifecycle events (e.g., tab close, navigation, reload)

Non-responsibilities:

* No direct DOM access
* No page-specific logic
* No snapshot generation or action execution

---

### 2. Content Script

**Role:** Execution layer and page interaction boundary

Responsibilities:

* Execute commands against the current webpage
* Act as the sole component allowed to interact with the DOM
* Treat all commands as black-box requests defined by the protocol

---

## Communication Protocol

* The agent and extension communicate over a persistent, bidirectional channel
* Messages represent high-level intents such as requesting a snapshot or executing a command
* Input and output are treated as opaque payloads at the architectural level
* Message structure, validation rules, and execution semantics are intentionally unspecified and deferred to implementation design

---

## Architectural Notes

* Snapshot generation, ref assignment, and command execution semantics are explicitly considered internal implementation details
* This document defines *what* capabilities exist and *where* they live, not *how* they are implemented
* Future refinements should extend this architecture via separate design or protocol documents, not by expanding this file
* For detailed implementation architecture of the extension, see [Extension Architecture](extension/ARCHITECTURE.md)
