//! Type definitions for CLI <-> Daemon IPC communication
//!
//! These types mirror the daemon's IPC protocol (newline-delimited JSON).
//! See: packages/daemon/src/types.ts and packages/daemon/src/ipc-server.ts

use serde::{Deserialize, Serialize};

// =============================================================================
// Session Types
// =============================================================================

/// Unique session identifier
pub type SessionId = String;

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
    pub session_id: SessionId,
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

/// Payload for navigate command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigatePayload {
    pub url: String,
}

/// Payload for click command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickPayload {
    pub r#ref: String,
}

/// Payload for type command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypePayload {
    pub r#ref: String,
    pub text: String,
}

/// Payload for scroll command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollPayload {
    pub r#ref: Option<String>,
    pub direction: ScrollDirection,
    pub amount: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

/// Payload for tab new command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabNewPayload {
    pub url: Option<String>,
}

/// Payload for tab switch command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabSwitchPayload {
    pub tab_id: i32,
}

/// Payload for eval command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvalPayload {
    pub script: String,
}

// =============================================================================
// Response Data Types
// =============================================================================

/// Data returned from snapshot command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotData {
    pub html: String,
    pub refs: Vec<RefInfo>,
}

/// Reference information for a DOM element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefInfo {
    pub r#ref: String,
    pub tag: String,
    pub text: Option<String>,
}

/// Data returned from tab list command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabListData {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: i32,
}

/// Information about a browser tab
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: i32,
    pub url: String,
    pub title: String,
}
