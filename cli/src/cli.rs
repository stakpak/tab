//! CLI argument parsing using clap
//!
//! Defines all commands and their arguments.

use crate::types::OutputFormat;
use clap::{Args, Parser, Subcommand};

/// Browser CLI - Browser Automation for AI Agents
#[derive(Debug, Parser)]
#[command(name = "browser")]
#[command(
    author,
    version,
    about = "Browser CLI - Browser Automation for AI Agents",
    long_about = None,
    help_template = "{about}\n\nUsage: {usage}\n\nOptions:\n{options}\n\n{after-help}",
    after_help = "COMMANDS:\n  navigate <URL>            Navigate the active tab to a URL\n  snapshot                  Take a snapshot of the current page\n  click <REF>               Click on an element\n  type <REF> <TEXT>         Type text into an element\n  scroll <DIRECTION>        Scroll the page or an element\n  tab                       Tab management commands\n  back                      Go back in browser history\n  forward                   Go forward in browser history\n  eval <SCRIPT>             Evaluate JavaScript in the page\n  ping                      Check if daemon is running\n  version                   Show version information\n\nTAB SUBCOMMANDS:\n  browser tab new [URL]             Create a new tab, optionally with a starting URL\n  browser tab close                 Close the active tab\n  browser tab switch <TAB_ID>       Switch to a tab by its ID\n  browser tab list                  List all open tabs with their IDs\n\nQUICK START:\n  browser navigate example.com\n  browser tab new google.com\n  browser snapshot\n  browser click e2\n  browser type e3 \"testexample.com\"\n  browser tab close\n\nTYPICAL WORKFLOW:\n  navigate > snapshot > interact (click/type/scroll/eval) > snapshot (optional)\n\nOUTPUT FORMATS:\n  - human (default)  Plain text output for humans\n  - json             Pretty-printed JSON output for scripting\n  - quiet            No output except for errors\n\nENVIRONMENT VARIABLES:\n  BROWSER_SESSION    Default session name to use\n\nSESSION MANAGEMENT:\n  Sessions allow multiple independent browser windows belonging to the same instance.\n  Each session has its own browser context, cookies, and state.\n  Example:\n    browser -s work navigate https://work.example.com\n    browser -s personal navigate https://personal.example.com\n\nPROFILE MANAGEMENT:\n  Use --profile to specify a custom browser profile directory:\n    browser --profile /path/to/custom/profile navigate example.com\n  This allows using existing browser profiles with saved cookies, bookmarks, etc.\n\nHELP:\n  browser --help\n  browser navigate --help\n  browser tab --help\n  browser tab new --help"
)]
pub struct Cli {
    /// Session name to use (overrides BROWSER_SESSION env var)
    #[arg(short, long, global = true)]
    pub session: Option<String>,

    /// Browser profile directory to use (default: system default profile)
    #[arg(long, global = true)]
    pub profile: Option<String>,

    /// Output format: human (plain text), json (pretty JSON), quiet (errors only)
    #[arg(short, long, global = true, default_value = "human")]
    pub output: OutputFormat,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Navigate the active tab to a URL
    #[command(
        about = "Navigate the active tab to a URL",
        long_about = "Navigate the active tab to a URL.\n\nUSAGE:\n  browser navigate [OPTIONS] <URL>\n\nARGUMENTS:\n  <URL>  URL to navigate to\n\nEXAMPLES:\n  browser navigate https://example.com\n  browser navigate example.com\n  browser navigate -o json example.com"
    )]
    Navigate(NavigateArgs),

    /// Take a snapshot of the current page
    #[command(
        about = "Take a snapshot of the current page",
        long_about = "Take a snapshot of the current page, returning the accessibility tree with element references.\n\nUSAGE:\n  browser snapshot [OPTIONS]\n\nEXAMPLES:\n  browser snapshot\n  browser snapshot -o json"
    )]
    Snapshot,

    /// Click on an element
    #[command(
        about = "Click on an element",
        long_about = "Click on an element using its reference from a snapshot.\n\nUSAGE:\n  browser click [OPTIONS] <REF>\n\nARGUMENTS:\n  <REF>  Element ref to click (from snapshot, e.g., e2)\n\nEXAMPLES:\n  browser click e2\n  browser click -s mysession submit-btn"
    )]
    Click(ClickArgs),

    /// Type text into an element
    #[command(
        about = "Type text into an element",
        long_about = "Type text into an input element.\n\nUSAGE:\n  browser type [OPTIONS] <REF> <TEXT>\n\nARGUMENTS:\n  <REF>   Element ref to type into (from snapshot)\n  <TEXT>  Text to type\n\nEXAMPLES:\n  browser type e3 \"testexample.com\"\n  browser type password \"mysecretpassword\""
    )]
    Type(TypeArgs),

    /// Scroll the page or an element
    #[command(
        about = "Scroll the page or an element",
        long_about = "Scroll the page or an element.\n\nUSAGE:\n  browser scroll [OPTIONS] <DIRECTION>\n\nARGUMENTS:\n  <DIRECTION>  Direction to scroll: up, down, left, right\n\nOPTIONS:\n  -r, --ref <REF>        Element ref to scroll within (optional)\n  -a, --amount <AMOUNT>  Amount to scroll in pixels (optional)\n\nEXAMPLES:\n  browser scroll down\n  browser scroll down -a 500\n  browser scroll right -r e5 -a 200"
    )]
    Scroll(ScrollArgs),

    /// Tab management commands
    #[command(subcommand)]
    #[command(
        about = "Tab management commands",
        long_about = "Tab management commands.\n\nUSAGE:\n  browser tab <SUBCOMMAND>\n\nSUBCOMMANDS:\n  new [URL]       Create a new tab, optionally with a starting URL\n  close           Close the active tab\n  switch <TAB_ID> Switch to a tab by its ID\n  list            List all open tabs with their IDs\n\nEXAMPLES:\n  browser tab new\n  browser tab new https://google.com\n  browser tab list\n  browser tab switch 3\n  browser tab close"
    )]
    Tab(TabCommands),

    /// Go back in browser history
    #[command(
        about = "Go back in browser history",
        long_about = "Go back in browser history.\n\nUSAGE:\n  browser back [OPTIONS]\n\nEXAMPLES:\n  browser back"
    )]
    Back,

    /// Go forward in browser history
    #[command(
        about = "Go forward in browser history",
        long_about = "Go forward in browser history.\n\nUSAGE:\n  browser forward [OPTIONS]\n\nEXAMPLES:\n  browser forward"
    )]
    Forward,

    /// Evaluate JavaScript in the page
    #[command(
        about = "Evaluate JavaScript in the page",
        long_about = "Evaluate JavaScript in the current page.\n\nUSAGE:\n  browser eval [OPTIONS] <SCRIPT>\n\nARGUMENTS:\n  <SCRIPT>  JavaScript code to evaluate\n\nEXAMPLES:\n  browser eval \"document.title\"\n  browser eval \"Array.from(document.links).length\""
    )]
    Eval(EvalArgs),

    /// Check if daemon is running
    #[command(
        about = "Check if daemon is running",
        long_about = "Check if the browser daemon is running.\n\nUSAGE:\n  browser ping [OPTIONS]\n\nEXAMPLES:\n  browser ping"
    )]
    Ping,

    /// Show version information
    #[command(
        about = "Show version information",
        long_about = "Show version information.\n\nUSAGE:\n  browser version"
    )]
    Version,

    /// Start Deamon
    #[command(
        disable_help_flag = true,
        about = "Start the browser daemon",
        long_about = "Start the browser daemon."
    )]
    Daemon {
        /// Arguments to pass to the daemon
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum TabCommands {
    /// Create a new tab
    #[command(
        about = "Create a new tab",
        long_about = "Create a new tab, optionally with a starting URL.\n\nUSAGE:\n  browser tab new [OPTIONS] [URL]\n\nARGUMENTS:\n  [URL]  URL to open in the new tab (optional)\n\nEXAMPLES:\n  browser tab new\n  browser tab new https://google.com"
    )]
    New(TabNewArgs),

    /// Close the active tab
    #[command(
        about = "Close the active tab",
        long_about = "Close the active tab.\n\nUSAGE:\n  browser tab close [OPTIONS]\n\nEXAMPLES:\n  browser tab close"
    )]
    Close,

    /// Switch to a tab by ID
    #[command(
        about = "Switch to a tab by ID",
        long_about = "Switch to a tab by its ID.\n\nUSAGE:\n  browser tab switch [OPTIONS] <TAB_ID>\n\nARGUMENTS:\n  <TAB_ID>  Tab ID to switch to\n\nEXAMPLES:\n  browser tab switch 3\n  browser tab switch 7"
    )]
    Switch(TabSwitchArgs),

    /// List all tabs
    #[command(
        about = "List all tabs",
        long_about = "List all open tabs with their IDs.\n\nUSAGE:\n  browser tab list [OPTIONS]\n\nEXAMPLES:\n  browser tab list\n  browser tab list -o json"
    )]
    List,
}

#[derive(Debug, Args)]
pub struct NavigateArgs {
    /// URL to navigate to
    pub url: String,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    /// Element ref to click (from snapshot)
    pub r#ref: String,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    /// Element ref to type into (from snapshot)
    pub r#ref: String,

    /// Text to type
    pub text: String,
}

#[derive(Debug, Args)]
pub struct ScrollArgs {
    /// Direction to scroll: up, down, left, right
    pub direction: String,

    /// Element ref to scroll within (optional)
    #[arg(short, long)]
    pub r#ref: Option<String>,

    /// Amount to scroll in pixels (optional)
    #[arg(short, long)]
    pub amount: Option<i32>,
}

#[derive(Debug, Args)]
pub struct EvalArgs {
    /// JavaScript code to evaluate
    pub script: String,
}

#[derive(Debug, Args)]
pub struct TabNewArgs {
    /// URL to open in the new tab (optional)
    pub url: Option<String>,
}

#[derive(Debug, Args)]
pub struct TabSwitchArgs {
    /// Tab ID to switch to
    pub tab_id: i32,
}

// =============================================================================
// Parse Function
// =============================================================================

/// Parse command line arguments from iterator (for testing)
pub fn parse_from<I, T>(iter: I) -> Cli
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    Cli::parse_from(iter)
}
