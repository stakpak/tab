# Browser CLI - Browser Automation for AI Agents

A command-line interface for controlling a real browser through the Browser extension. Navigate websites, interact with elements, take snapshots, manage tabs from your terminal.

> **Note:** The Browser extension must be installed in the browser profile for Browser CLI to control the browser.

## Quick Start

```bash
# Navigate to a website
browser navigate example.com

# Create a new tab with a URL
browser tab new google.com

# Get accessibility tree with element refs
browser snapshot

# Click an element using its ref from snapshot
browser click e2

# Type text into a form field
browser type e3 "test@example.com"

# Close the current tab
browser tab close
```

## Global Options

These options are available for all commands:

- `-s, --session <SESSION>` - Session name to use (overrides `BROWSER_SESSION` env var)
- `--profile <PROFILE>` - Browser profile directory to use (default: system default profile)
- `-o, --output <OUTPUT>` - Output format: `human`, `json`, `quiet` [default: human]

## Commands

### Core Navigation

#### `navigate <URL>`
Navigate the active tab to a URL.

**Usage:**
```bash
browser navigate [OPTIONS] <URL>
```

**Arguments:**
- `URL` - URL to navigate to (required)

**Example:**
```bash
browser navigate https://example.com
browser navigate example.com
browser navigate -o json example.com
```

---

#### `snapshot`
Take a snapshot of the current page, returning the accessibility tree with element references.

**Usage:**
```bash
browser snapshot [OPTIONS]
```

**Example:**
```bash
browser snapshot
browser snapshot -o json
```

---

### Element Interaction

#### `click <REF>`
Click on an element using its reference from a snapshot.

**Usage:**
```bash
browser click [OPTIONS] <REF>
```

**Arguments:**
- `REF` - Element ref to click (from snapshot, e.g., `e2`)

**Example:**
```bash
browser click e2
browser click -s mysession @submit-btn
```

---

#### `type <REF> <TEXT>`
Type text into an input element.

**Usage:**
```bash
browser type [OPTIONS] <REF> <TEXT>
```

**Arguments:**
- `REF` - Element ref to type into (from snapshot)
- `TEXT` - Text to type

**Example:**
```bash
browser type e3 "test@example.com"
```

---

#### `scroll <DIRECTION>`
Scroll the page or an element.

**Usage:**
```bash
browser scroll [OPTIONS] <DIRECTION>
```

**Arguments:**
- `DIRECTION` - Direction to scroll: `up`, `down`, `left`, `right`

**Options:**
- `-r, --ref <REF>` - Element ref to scroll within (optional)
- `-a, --amount <AMOUNT>` - Amount to scroll in pixels (optional)

**Example:**
```bash
browser scroll down
browser scroll down -a 500
browser scroll right -r e5 -a 200
```

---

### Tab Management

#### `tab new [URL]`
Create a new tab, optionally with a starting URL.

**Usage:**
```bash
browser tab new [OPTIONS] [URL]
```

**Arguments:**
- `URL` - URL to open in the new tab (optional)

**Example:**
```bash
browser tab new
browser tab new https://google.com
```

---

#### `tab close`
Close the active tab.

**Usage:**
```bash
browser tab close [OPTIONS]
```

**Example:**
```bash
browser tab close
```

---

#### `tab switch <TAB_ID>`
Switch to a tab by its ID.

**Usage:**
```bash
browser tab switch [OPTIONS] <TAB_ID>
```

**Arguments:**
- `TAB_ID` - Tab ID to switch to (required)

**Example:**
```bash
browser tab switch 3
browser tab switch 7
```

---

#### `tab list`
List all open tabs with their IDs.

**Usage:**
```bash
browser tab list [OPTIONS]
```

**Example:**
```bash
browser tab list
browser tab list -o json
```

---

### Browser History

#### `back`
Go back in browser history.

**Usage:**
```bash
browser back [OPTIONS]
```

**Example:**
```bash
browser back
```

---

#### `forward`
Go forward in browser history.

**Usage:**
```bash
browser forward [OPTIONS]
```

**Example:**
```bash
browser forward
```
---

### Daemon Control

#### `ping`
Check if the browser daemon is running.

**Usage:**
```bash
browser ping [OPTIONS]
```

**Example:**
```bash
browser ping
```

---

## Workflow Example

Here's a complete example of using Browser CLI to interact with a website:

```bash
# 1. Navigate to a website
browser navigate https://example.com

# 2. Take a snapshot to see available elements
browser snapshot
# Output: Shows accessibility tree with refs like e1, e2, etc.

# 3. Click a button (assuming e2 is the button)
browser click e2

# 4. Fill out a form
browser type e3 "myemail@example.com"
browser type e4 "password123"

# 5. Submit the form by clicking the submit button
browser click e5

# 6. Take another snapshot to see the result
browser snapshot

# 7. Navigate back if needed
browser back

# 8. Open a new tab for parallel work
browser tab new https://google.com

# 9. List all tabs
browser tab list

# 10. Switch back to first tab
browser tab switch 1

# 11. Close the current tab when done
browser tab close
```

## Output Formats

The CLI supports three output formats:

- **human** (default) - Human-readable output with colors and formatting
- **json** - Machine-readable JSON output for scripting
- **quiet** - No output except for errors

Use `-o, --output` flag to specify format:
```bash
browser snapshot -o json
browser navigate example.com -o quiet
```

## Environment Variables

- `BROWSER_SESSION` - Default session name to use

## Session Management

Sessions allow multiple independent browser windows belonging to the same instance. Use `-s` or `--session` flag to specify:

```bash
browser -s work navigate https://work.example.com
browser -s personal navigate https://personal.example.com
```

Each session has its own browser context, cookies, and state.

## Profile Management

Use `--profile` to specify a custom browser profile directory:

```bash
browser --profile /path/to/custom/profile navigate example.com
```

This allows using existing browser profiles with saved cookies, bookmarks, etc.

## Help

Get help for any command:

```bash
browser --help
browser navigate --help
browser tab --help
browser tab new --help
```
