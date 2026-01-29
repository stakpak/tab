//! Type command implementation
//!
//! Types text into an element identified by a ref.
//! Ref must be valid (from the current snapshot).
//!
//! Note: Module named type_cmd.rs because "type" is a Rust keyword.

use crate::commands::CommandContext;
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType, TypePayload};

/// Execute the type command
///
/// # Arguments
/// * `ctx` - Command execution context
/// * `element_ref` - Reference to the element to type into
/// * `text` - Text to type
///
/// # Returns
/// Command response indicating success or failure
pub fn execute(ctx: &CommandContext, element_ref: &str, text: &str) -> Result<CommandResponse> {
    // 1. Validate ref is not empty
    validate_ref(element_ref)?;

    // 2. Build TypePayload
    let payload = TypePayload {
        r#ref: element_ref.to_string(),
        text: text.to_string(),
    };

    // 3. Serialize payload to JSON
    let payload_json = serde_json::to_value(payload)?;

    // 4. Execute command via context
    ctx.execute(CommandType::Type, payload_json)
}

/// Validate element ref format
fn validate_ref(element_ref: &str) -> Result<()> {
    // Must not be empty
    if element_ref.trim().is_empty() {
        return Err(CliError::InvalidArguments(
            "Element reference cannot be empty".to_string(),
        ));
    }

    Ok(())
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_ref_accepts_non_empty() {
        assert!(validate_ref("123").is_ok());
        assert!(validate_ref("abc").is_ok());
    }

    #[test]
    fn validate_ref_rejects_empty() {
        assert!(validate_ref("").is_err());
        assert!(validate_ref("   ").is_err());
    }
}
