//! Click command implementation
//!
//! Clicks on an element identified by a ref.
//! Ref must be valid (from the current snapshot).

use crate::commands::utils::validate_ref;
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickCommand {
    pub r#ref: String,
}

impl ClickCommand {
    pub fn new(r#ref: String) -> Self {
        Self { r#ref }
    }
}

impl Execute for ClickCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        validate_ref(&self.r#ref)?;
        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::Click, payload_json)
    }
}
