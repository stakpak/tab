//! Scroll command implementation
//!
//! Scrolls the page or a specific element.

use crate::commands::CommandContext;
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType, ScrollDirection, ScrollPayload};

/// Execute the scroll command
///
/// # Arguments
/// * `ctx` - Command execution context
/// * `direction` - Direction to scroll (up, down, left, right)
/// * `element_ref` - Optional element ref to scroll within
/// * `amount` - Optional scroll amount in pixels
///
/// # Returns
/// Command response indicating success or failure
pub fn execute(
    ctx: &CommandContext,
    direction: ScrollDirection,
    element_ref: Option<&str>,
    amount: Option<i32>,
) -> Result<CommandResponse> {
    // 1. Build ScrollPayload
    let payload = ScrollPayload {
        r#ref: element_ref.map(|s| s.to_string()),
        direction,
        amount,
    };

    // 2. Serialize payload to JSON
    let payload_json = serde_json::to_value(payload)?;

    // 3. Execute command via context
    ctx.execute(CommandType::Scroll, payload_json)
}

/// Parse scroll direction from string
pub fn parse_direction(s: &str) -> Result<ScrollDirection> {
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

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_direction_accepts_valid_directions() {
        assert!(matches!(
            parse_direction("up").unwrap(),
            ScrollDirection::Up
        ));
        assert!(matches!(
            parse_direction("down").unwrap(),
            ScrollDirection::Down
        ));
        assert!(matches!(
            parse_direction("left").unwrap(),
            ScrollDirection::Left
        ));
        assert!(matches!(
            parse_direction("right").unwrap(),
            ScrollDirection::Right
        ));
    }

    #[test]
    fn parse_direction_is_case_insensitive() {
        assert!(matches!(
            parse_direction("UP").unwrap(),
            ScrollDirection::Up
        ));
        assert!(matches!(
            parse_direction("Down").unwrap(),
            ScrollDirection::Down
        ));
    }

    #[test]
    fn parse_direction_rejects_invalid() {
        assert!(parse_direction("invalid").is_err());
        assert!(parse_direction("").is_err());
    }
}
