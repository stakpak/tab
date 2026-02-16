//! Type definitions for CLI <-> Daemon IPC communication
//!
//! These types mirror the daemon's IPC protocol (newline-delimited JSON).
//! See: packages/daemon/src/types.ts and packages/daemon/src/ipc-server.ts

use crate::error::CliError;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, Default, clap::ValueEnum)]
pub enum OutputFormat {
    #[default]
    Human,
    Json,
    Quiet,
}

// =============================================================================
// Command Types
// =============================================================================

/// Unique identifier for a command request
pub type CommandId = String;

/// All supported command types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandType {
    // Navigation
    Navigate,
    Open,
    Back,
    Forward,
    Reload,
    Close,
    // Snapshot
    Snapshot,
    // Element interactions
    Click,
    Dblclick,
    Fill,
    Type,
    Press,
    Hover,
    Focus,
    Check,
    Uncheck,
    Select,
    // Scroll
    Scroll,
    Scrollintoview,
    // Element queries
    Get,
    Is,
    Find,
    // Advanced interactions
    Drag,
    Upload,
    Mouse,
    Wait,
    // Tab management
    Tab,
    TabNew,
    TabClose,
    TabSwitch,
    TabList,
    // Capture
    Screenshot,
    Pdf,
    // Script execution
    Eval,
}

/// Command sent from CLI to daemon
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub id: CommandId,
    pub session_id: String,
    /// Browser profile directory. None means default profile.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(rename = "type")]
    pub command_type: CommandType,
    /// Command parameters (renamed from 'payload' to align with protocol)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    pub timestamp: String, // ISO 8601 format
}

/// Response from daemon back to CLI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse {
    pub id: CommandId,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// =============================================================================
// IPC Message Types
// =============================================================================

/// Message types for IPC communication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IpcMessageType {
    Command,
    Response,
    Ping,
    Pong,
}

/// IPC message envelope
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcMessage {
    #[serde(rename = "type")]
    pub message_type: IpcMessageType,
    pub payload: Option<serde_json::Value>,
}

// =============================================================================
// Command Payloads
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

impl FromStr for ScrollDirection {
    type Err = CliError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "up" => Ok(ScrollDirection::Up),
            "down" => Ok(ScrollDirection::Down),
            "left" => Ok(ScrollDirection::Left),
            "right" => Ok(ScrollDirection::Right),
            _ => Err(CliError::InvalidArguments(format!(
                "Invalid scroll direction: {}. Must be up, down, left, or right",
                s
            ))),
        }
    }
}

// =============================================================================
// Response Data Types
// =============================================================================

/// Data returned from tab list command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabListData {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: i64,
}

/// Information about a browser tab
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: i64,
    pub url: String,
    pub title: String,
    #[serde(default)]
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotData {
    pub snapshot: String,
    pub title: String,
    pub url: String,
}
