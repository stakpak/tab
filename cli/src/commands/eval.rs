//! Eval command implementation
//!
//! Evaluates JavaScript in the context of the active tab.

use crate::commands::CommandContext;
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType, EvalPayload};

/// Execute the eval command
///
/// # Arguments
/// * `ctx` - Command execution context
/// * `script` - JavaScript code to evaluate
///
/// # Returns
/// Command response containing the evaluation result
pub fn execute(ctx: &CommandContext, script: &str) -> Result<CommandResponse> {
    // 1. Validate script is not empty
    validate_script(script)?;

    // 2. Build EvalPayload
    let payload = EvalPayload {
        script: script.to_string(),
    };

    // 3. Serialize payload to JSON
    let payload_json = serde_json::to_value(payload)?;

    // 4. Execute command via context
    ctx.execute(CommandType::Eval, payload_json)
}

/// Validate script is not empty
fn validate_script(script: &str) -> Result<()> {
    // Must not be empty
    if script.trim().is_empty() {
        return Err(CliError::InvalidArguments(
            "Script cannot be empty".to_string(),
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
    fn validate_script_accepts_non_empty() {
        assert!(validate_script("console.log('test')").is_ok());
    }

    #[test]
    fn validate_script_rejects_empty() {
        assert!(validate_script("").is_err());
        assert!(validate_script("   ").is_err());
    }
}
