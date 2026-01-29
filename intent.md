## Intent: Native Messaging bootstrap for daemon endpoint discovery

### Goal

Native Messaging is used **only for bootstrap and recovery**, never for steady-state communication.

## High-level flow

1. User installs:

   * Chrome extension
   * Local daemon (installer auto-registers native host manifest)

2. Daemon:

   * Launches browser 
   * Keeps browser running independently

3. Extension:

   * On startup or first use, requests daemon endpoint from daemon via Native Messaging
   * Caches `{ ip, port }`
   * Connects directly to daemon (WebSocket)

4. On connection loss:

   * Extension re-requests endpoint via Native Messaging
   * Updates cache
   * Reconnects

---

## Native Messaging usage constraints

* **Direction**: Extension → Daemon (daemon never pushes)
* **API**: `chrome.runtime.sendNativeMessage` (one-shot)
* **Frequency**:

  * Once at startup or first connection attempt
  * Again **only on disconnection**
* **Not used** during normal operation

---

## Extension responsibilities

* Initiate native messaging
* Cache browser endpoint in persistent storage (`chrome.storage.local`)
* Establish and maintain browser connection
* Detect disconnection and trigger refresh
* Debounce native messaging calls (no loops)

---

## Daemon responsibilities

* Install native messaging manifest at install time
* Launch Chrome 
* Discover and store browser IP + port
* Respond to one native request:

  ```json
  { "type": "get_browser_endpoint" }
  ```
* Return:

  ```json
  { "ip": "127.0.0.1", "port": <number> }
  ```
* Exit after responding (one-shot native host)

---

## Failure & recovery model

* If browser connection fails:

  * Extension retries native messaging
* If daemon is unavailable:

  * Extension surfaces error / retries later
* If port changes:

  * Daemon returns updated endpoint
* System must tolerate:

  * Extension service worker restarts
  * Browser restarts
  * Daemon restarts

---

## Explicit non-goals

* No persistent native messaging connection
* No daemon-initiated communication
* No native messaging for command/control
* No user-managed Chrome configuration
* No localhost server for bootstrap

