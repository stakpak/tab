//! CLI argument parsing using clap
//!
//! Defines all commands and their arguments.

use clap::{Args, Parser, Subcommand};

// =============================================================================
// Main CLI Structure
// =============================================================================

/// tab - Control a real browser from the command line
#[derive(Debug, Parser)]
#[command(name = "tab")]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    /// Session name to use (overrides TAB_SESSION env var)
    #[arg(short, long, global = true)]
    pub session: Option<String>,

    /// Output format: human, json, quiet
    #[arg(short, long, global = true, default_value = "human")]
    pub output: OutputFormat,

    #[command(subcommand)]
    pub command: Commands,
}

/// Output format options
#[derive(Debug, Clone, Copy, Default, clap::ValueEnum)]
pub enum OutputFormat {
    /// Human-readable output
    #[default]
    Human,
    /// JSON output for scripting
    Json,
    /// Minimal output
    Quiet,
}

// =============================================================================
// Commands
// =============================================================================

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Navigate the active tab to a URL
    Navigate(NavigateArgs),

    /// Take a snapshot of the current page
    Snapshot,

    /// Click on an element
    Click(ClickArgs),

    /// Type text into an element
    Type(TypeArgs),

    /// Scroll the page or an element
    Scroll(ScrollArgs),

    /// Tab management commands
    #[command(subcommand)]
    Tab(TabCommands),

    /// Go back in browser history
    Back,

    /// Go forward in browser history
    Forward,

    /// Evaluate JavaScript in the page
    Eval(EvalArgs),

    /// Check if daemon is running
    Ping,
}

// =============================================================================
// Command Arguments
// =============================================================================

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

// =============================================================================
// Tab Subcommands
// =============================================================================

#[derive(Debug, Subcommand)]
pub enum TabCommands {
    /// Create a new tab
    New(TabNewArgs),

    /// Close the active tab
    Close,

    /// Switch to a tab by ID
    Switch(TabSwitchArgs),

    /// List all tabs
    List,
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

/// Parse command line arguments
pub fn parse() -> Cli {
    Cli::parse()
}

/// Parse command line arguments from iterator (for testing)
pub fn parse_from<I, T>(iter: I) -> Cli
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    Cli::parse_from(iter)
}
