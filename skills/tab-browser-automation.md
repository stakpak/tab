# Tab CLI - Browser Automation Skill

Control a real browser from the command line. The `tab` CLI communicates with a daemon that manages browser sessions.

## Quick Reference

```bash
# Navigation
tab navigate <url>          # Go to URL
tab back                    # Browser back
tab forward                 # Browser forward

# Page Inspection
tab snapshot                # Get interactive elements with refs

# Interactions (use refs from snapshot)
tab click <ref>             # Click element
tab type <ref> "text"       # Type into element
tab scroll <direction>      # Scroll: up, down, left, right

# Tabs
tab tab list                # List all tabs
tab tab new [url]           # Open new tab
tab tab switch <id>         # Switch to tab
tab tab close               # Close current tab

# Advanced
tab eval "javascript"       # Run JS in page
tab ping                    # Check if daemon is running
```

## Core Workflow

The fundamental pattern for browser automation:

```
1. snapshot  ->  2. find ref  ->  3. interact  ->  4. verify
```

### Example: Login Flow

```bash
# 1. Navigate to login page
tab navigate https://example.com/login

# 2. Take snapshot to find elements
tab snapshot
# Output shows: [1] input "Email" [2] input "Password" [3] button "Sign In"

# 3. Fill in credentials
tab type 1 "user@example.com"
tab type 2 "password123"

# 4. Click submit
tab click 3

# 5. Verify success (take another snapshot or check URL)
tab snapshot
```

## Commands

### navigate

Navigate the active tab to a URL. If no browser is running, this command launches a new browser window directly to the specified URL.

```bash
tab navigate https://example.com
tab navigate example.com              # https:// added automatically
```

When the browser is launched, it opens directly to the target URL (not `chrome://newtab`).

### snapshot

Capture the current page state. Returns a list of interactive elements with refs.

```bash
tab snapshot
```

Output:
```
Found 5 interactive elements:

[1] input "Search..."
[2] button "Search"
[3] a "Home"
[4] a "About"
[5] button "Login"
```

Use refs (numbers) in subsequent commands.

### click

Click an element by ref.

```bash
tab click 2                           # Click element with ref 2
```

### type

Type text into an input element.

```bash
tab type 1 "search query"             # Type into element with ref 1
tab type 1 "hello world"              # Replaces existing text
```

### scroll

Scroll the page or a specific element.

```bash
tab scroll down                       # Scroll page down
tab scroll up                         # Scroll page up
tab scroll left                       # Scroll page left
tab scroll right                      # Scroll page right

tab scroll down --ref 5               # Scroll within element 5
tab scroll down --amount 500          # Scroll 500 pixels
```

### back / forward

Browser history navigation.

```bash
tab back                              # Go back
tab forward                           # Go forward
```

### eval

Execute JavaScript in the page context.

```bash
tab eval "document.title"
tab eval "window.location.href"
tab eval "document.querySelector('h1').textContent"
```

### Tab Management

```bash
tab tab list                          # List all tabs with IDs
tab tab new                           # Open blank new tab
tab tab new https://example.com       # Open URL in new tab
tab tab switch 2                      # Switch to tab ID 2
tab tab close                         # Close current tab
```

## Global Options

### Session (`-s, --session`)

Isolate browser sessions by name.

```bash
tab -s work navigate https://work.example.com
tab -s personal navigate https://personal.example.com

# Or use environment variable
export TAB_SESSION=work
tab navigate https://work.example.com
```

### Profile (`--profile`)

Use a specific browser profile directory.

```bash
tab --profile /path/to/chrome/profile navigate https://example.com

# Or use environment variable
export TAB_PROFILE=/path/to/profile
```

### Output Format (`-o, --output`)

Control output format for scripting.

```bash
tab snapshot                          # Human readable (default)
tab -o json snapshot                  # JSON output
tab -o quiet navigate https://x.com   # Minimal output
```

JSON output example:
```json
{
  "id": "cmd-123",
  "success": true,
  "data": {
    "refs": [
      {"ref": "1", "tag": "input", "text": "Search..."},
      {"ref": "2", "tag": "button", "text": "Submit"}
    ]
  }
}
```

## Scripting Patterns

### Parse JSON Output

```bash
# Get all refs as JSON
refs=$(tab -o json snapshot | jq '.data.refs')

# Find a specific element
button_ref=$(tab -o json snapshot | jq -r '.data.refs[] | select(.text | contains("Submit")) | .ref')
tab click "$button_ref"
```

### Wait for Page Load

```bash
tab navigate https://example.com
sleep 2  # Simple wait
tab snapshot
```

### Conditional Actions

```bash
# Check if element exists
if tab -o json snapshot | jq -e '.data.refs[] | select(.text == "Login")' > /dev/null; then
    echo "Login button found"
    tab click $(tab -o json snapshot | jq -r '.data.refs[] | select(.text == "Login") | .ref')
fi
```

### Loop Through Elements

```bash
# Click all "Read more" links
tab -o json snapshot | jq -r '.data.refs[] | select(.text | contains("Read more")) | .ref' | while read ref; do
    tab click "$ref"
    sleep 1
    tab back
    sleep 1
done
```

## Error Handling

Exit codes:
- `0`: Success
- `1`: Command failed
- `2`: Daemon not running
- `3`: Connection failed

```bash
if ! tab navigate https://example.com; then
    echo "Navigation failed"
    exit 1
fi
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TAB_SESSION` | Default session name |
| `TAB_PROFILE` | Browser profile directory |
| `TAB_SOCKET_PATH` | Custom daemon socket path |

## Tips

1. **Always snapshot first** - Refs change after page updates
2. **Use sessions** - Isolate different automation tasks
3. **JSON for scripts** - Use `-o json` when parsing output programmatically
4. **Check daemon** - Run `tab ping` to verify daemon is running
5. **Wait after navigation** - Pages need time to load before snapshot
6. **Navigate launches browser** - If no browser is running, `tab navigate <url>` automatically launches one directly to the URL
