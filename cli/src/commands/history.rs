//! Browser history navigation commands
//!
//! Commands for navigating browser history:
//! - back: Go back in history
//! - forward: Go forward in history

use crate::commands::CommandContext;
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde_json::json;

/// Navigate back in browser history
///
/// # Arguments
/// * `ctx` - Command execution context
///
/// # Returns
/// Command response indicating success or failure
pub fn back(ctx: &CommandContext) -> Result<CommandResponse> {
    // 1. Build empty payload
    let payload = json!({});

    // 2. Execute command via context (CommandType::Back)
    ctx.execute(CommandType::Back, payload)
}

/// Navigate forward in browser history
///
/// # Arguments
/// * `ctx` - Command execution context
///
/// # Returns
/// Command response indicating success or failure
pub fn forward(ctx: &CommandContext) -> Result<CommandResponse> {
    // 1. Build empty payload
    let payload = json!({});

    // 2. Execute command via context (CommandType::Forward)
    ctx.execute(CommandType::Forward, payload)
}
