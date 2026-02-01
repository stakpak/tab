# Tab CLI - Browser Automation for AI Agents

A command-line interface for controlling a real browser through the StakPak extension. Navigate websites, interact with elements, take snapshots, manage tabs, and execute JavaScript—all from your terminal.

> **Note:** The StakPak extension must be installed in the browser profile for Tab CLI to control the browser.

## Quick Start

```bash
# Navigate to a website
tab navigate example.com

# Create a new tab with a URL
tab tab new google.com

# Get accessibility tree with element refs
tab snapshot

# Click an element using its ref from snapshot
tab click @e2

# Type text into a form field
tab type @e3 "test@example.com"

# Close the current tab
tab tab close
```

## Global Options

These options are available for all commands:

- `-s, --session <SESSION>` - Session name to use (overrides `TAB_SESSION` env var)
- `--profile <PROFILE>` - Browser profile directory to use (default: system default profile)
- `-o, --output <OUTPUT>` - Output format: `human`, `json`, `quiet` [default: human]

## Commands

### Core Navigation

#### `navigate <URL>`
Navigate the active tab to a URL.

**Usage:**
```bash
tab navigate [OPTIONS] <URL>
```

**Arguments:**
- `URL` - URL to navigate to (required)

**Example:**
```bash
tab navigate https://example.com
tab navigate example.com
tab navigate -o json example.com
```

---

#### `snapshot`
Take a snapshot of the current page, returning the accessibility tree with element references.

**Usage:**
```bash
tab snapshot [OPTIONS]
```

**Example:**
```bash
tab snapshot
tab snapshot -o json
```

---

### Element Interaction

#### `click <REF>`
Click on an element using its reference from a snapshot.

**Usage:**
```bash
tab click [OPTIONS] <REF>
```

**Arguments:**
- `REF` - Element ref to click (from snapshot, e.g., `@e2`)

**Example:**
```bash
tab click @e2
tab click -s mysession @submit-btn
```

---

#### `type <REF> <TEXT>`
Type text into an input element.

**Usage:**
```bash
tab type [OPTIONS] <REF> <TEXT>
```

**Arguments:**
- `REF` - Element ref to type into (from snapshot)
- `TEXT` - Text to type

**Example:**
```bash
tab type @e3 "test@example.com"
tab type @password "mysecretpassword"
```

---

#### `scroll <DIRECTION>`
Scroll the page or an element.

**Usage:**
```bash
tab scroll [OPTIONS] <DIRECTION>
```

**Arguments:**
- `DIRECTION` - Direction to scroll: `up`, `down`, `left`, `right`

**Options:**
- `-r, --ref <REF>` - Element ref to scroll within (optional)
- `-a, --amount <AMOUNT>` - Amount to scroll in pixels (optional)

**Example:**
```bash
tab scroll down
tab scroll down -a 500
tab scroll right -r @e5 -a 200
```

---

### Tab Management

#### `tab new [URL]`
Create a new tab, optionally with a starting URL.

**Usage:**
```bash
tab tab new [OPTIONS] [URL]
```

**Arguments:**
- `URL` - URL to open in the new tab (optional)

**Example:**
```bash
tab tab new
tab tab new https://google.com
```

---

#### `tab close`
Close the active tab.

**Usage:**
```bash
tab tab close [OPTIONS]
```

**Example:**
```bash
tab tab close
```

---

#### `tab switch <TAB_ID>`
Switch to a tab by its ID.

**Usage:**
```bash
tab tab switch [OPTIONS] <TAB_ID>
```

**Arguments:**
- `TAB_ID` - Tab ID to switch to (required)

**Example:**
```bash
tab tab switch 3
tab tab switch 7
```

---

#### `tab list`
List all open tabs with their IDs.

**Usage:**
```bash
tab tab list [OPTIONS]
```

**Example:**
```bash
tab tab list
tab tab list -o json
```

---

### Browser History

#### `back`
Go back in browser history.

**Usage:**
```bash
tab back [OPTIONS]
```

**Example:**
```bash
tab back
```

---

#### `forward`
Go forward in browser history.

**Usage:**
```bash
tab forward [OPTIONS]
```

**Example:**
```bash
tab forward
```
---

### Daemon Control

#### `ping`
Check if the browser daemon is running.

**Usage:**
```bash
tab ping [OPTIONS]
```

**Example:**
```bash
tab ping
```

---

## Workflow Example

Here's a complete example of using Tab CLI to interact with a website:

```bash
# 1. Navigate to a website
tab navigate https://example.com

# 2. Take a snapshot to see available elements
tab snapshot
# Output: Shows accessibility tree with refs like @e1, @e2, etc.

# 3. Click a button (assuming @e2 is the button)
tab click @e2

# 4. Fill out a form
tab type @e3 "myemail@example.com"
tab type @e4 "password123"

# 5. Submit the form by clicking the submit button
tab click @e5

# 6. Take another snapshot to see the result
tab snapshot

# 7. Navigate back if needed
tab back

# 8. Open a new tab for parallel work
tab tab new https://google.com

# 9. List all tabs
tab tab list

# 10. Switch back to first tab
tab tab switch 1

# 11. Close the current tab when done
tab tab close
```

## Output Formats

The CLI supports three output formats:

- **human** (default) - Human-readable output with colors and formatting
- **json** - Machine-readable JSON output for scripting
- **quiet** - No output except for errors

Use `-o, --output` flag to specify format:
```bash
tab snapshot -o json
tab navigate example.com -o quiet
```

## Environment Variables

- `TAB_SESSION` - Default session name to use

## Session Management

Sessions allow multiple independent browser windows belonging to the same instance. Use `-s` or `--session` flag to specify:

```bash
tab -s work navigate https://work.example.com
tab -s personal navigate https://personal.example.com
```

Each session has its own browser context, cookies, and state.

## Profile Management

Use `--profile` to specify a custom browser profile directory:

```bash
tab --profile /path/to/custom/profile navigate example.com
```

This allows using existing browser profiles with saved cookies, bookmarks, etc.

## Help

Get help for any command:

```bash
tab --help
tab navigate --help
tab tab --help
tab tab new --help
```

## License

[Your License Here]

## Contributing

Contributions welcome! Please see the repository for contribution guidelines.
