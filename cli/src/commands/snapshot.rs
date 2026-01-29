//! Snapshot command implementation
//!
//! Takes a snapshot of the current page DOM.
//! Returns HTML and element refs for subsequent commands.

use crate::commands::CommandContext;
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType, SnapshotData};
use serde_json::json;

/// Execute the snapshot command
///
/// # Arguments
/// * `ctx` - Command execution context
///
/// # Returns
/// Command response containing snapshot data (HTML and refs)
pub fn execute(ctx: &CommandContext) -> Result<CommandResponse> {
    // 1. Build empty payload (snapshot has no parameters)
    let payload = json!({});

    // 2. Execute command via context
    ctx.execute(CommandType::Snapshot, payload)
}

/// Parse snapshot data from response
pub fn parse_snapshot_data(response: &CommandResponse) -> Result<SnapshotData> {
    // 1. Check if response.data is Some
    let data = response
        .data
        .as_ref()
        .ok_or_else(|| CliError::ProtocolError("No data in snapshot response".to_string()))?;

    // 2. Deserialize into SnapshotData
    let snapshot: SnapshotData = serde_json::from_value(data.clone())?;
    Ok(snapshot)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::RefInfo;
    use serde_json::json;

    #[test]
    fn parse_snapshot_data_deserializes_correctly() {
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({
                "html": "<html></html>",
                "refs": [
                    {"ref": "1", "tag": "button", "text": "Click me"}
                ]
            })),
            error: None,
        };

        let data = parse_snapshot_data(&response).unwrap();
        assert_eq!(data.html, "<html></html>");
        assert_eq!(data.refs.len(), 1);
        assert_eq!(data.refs[0].r#ref, "1");
    }

    #[test]
    fn parse_snapshot_data_errors_without_data() {
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: None,
            error: None,
        };

        assert!(parse_snapshot_data(&response).is_err());
    }
}
