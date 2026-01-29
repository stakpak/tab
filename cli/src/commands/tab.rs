//! Tab management commands
//!
//! Commands for managing browser tabs:
//! - tab new: Create a new tab
//! - tab close: Close the active tab
//! - tab switch: Switch to a different tab
//! - tab list: List all tabs

use crate::commands::CommandContext;
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType, TabListData, TabNewPayload, TabSwitchPayload};
use serde_json::json;

/// Create a new tab
///
/// # Arguments
/// * `ctx` - Command execution context
/// * `url` - Optional URL to open in the new tab
///
/// # Returns
/// Command response indicating success or failure
pub fn new(ctx: &CommandContext, url: Option<&str>) -> Result<CommandResponse> {
    // 1. Normalize URL if provided (add https:// if missing)
    let normalized_url = url.map(|s| normalize_url(s));

    // 2. Build TabNewPayload with normalized URL
    let payload = TabNewPayload {
        url: normalized_url,
    };

    // 3. Serialize payload to JSON
    let payload_json = serde_json::to_value(payload)?;

    // 4. Execute command via context (CommandType::TabNew)
    ctx.execute(CommandType::TabNew, payload_json)
}

/// Normalize URL (add https:// if missing)
fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();

    // If it already has a scheme, return as-is
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }

    // Add https:// if missing
    format!("https://{}", trimmed)
}

/// Close the active tab
///
/// # Arguments
/// * `ctx` - Command execution context
///
/// # Returns
/// Command response indicating success or failure
pub fn close(ctx: &CommandContext) -> Result<CommandResponse> {
    // 1. Build empty payload
    let payload = json!({});

    // 2. Execute command via context (CommandType::TabClose)
    ctx.execute(CommandType::TabClose, payload)
}

/// Switch to a different tab
///
/// # Arguments
/// * `ctx` - Command execution context
/// * `tab_id` - ID of the tab to switch to
///
/// # Returns
/// Command response indicating success or failure
pub fn switch(ctx: &CommandContext, tab_id: i32) -> Result<CommandResponse> {
    // 1. Build TabSwitchPayload
    let payload = TabSwitchPayload { tab_id };

    // 2. Serialize payload to JSON
    let payload_json = serde_json::to_value(payload)?;

    // 3. Execute command via context (CommandType::TabSwitch)
    ctx.execute(CommandType::TabSwitch, payload_json)
}

/// List all tabs
///
/// # Arguments
/// * `ctx` - Command execution context
///
/// # Returns
/// Command response containing tab list data
pub fn list(ctx: &CommandContext) -> Result<CommandResponse> {
    // 1. Build empty payload
    let payload = json!({});

    // 2. Execute command via context (CommandType::TabList)
    ctx.execute(CommandType::TabList, payload)
}

/// Parse tab list data from response
pub fn parse_tab_list(response: &CommandResponse) -> Result<TabListData> {
    // 1. Check if response.data is Some
    let data = response
        .data
        .as_ref()
        .ok_or_else(|| CliError::ProtocolError("No data in tab list response".to_string()))?;

    // 2. Deserialize into TabListData
    let tab_list: TabListData = serde_json::from_value(data.clone())?;
    Ok(tab_list)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TabInfo;
    use serde_json::json;

    #[test]
    fn parse_tab_list_deserializes_correctly() {
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({
                "tabs": [
                    {"id": 1, "url": "https://example.com", "title": "Example"}
                ],
                "active_tab_id": 1
            })),
            error: None,
        };

        let data = parse_tab_list(&response).unwrap();
        assert_eq!(data.tabs.len(), 1);
        assert_eq!(data.active_tab_id, 1);
    }

    #[test]
    fn parse_tab_list_errors_without_data() {
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: None,
            error: None,
        };

        assert!(parse_tab_list(&response).is_err());
    }
}
