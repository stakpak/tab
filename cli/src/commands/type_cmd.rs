// Types text into an element identified by a ref.
//! Ref must be valid (from the current snapshot).
//!
//! Note: Module named type_cmd.rs because "type" is a Rust keyword.

use crate::commands::utils::validate_ref;
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeCommand {
    pub r#ref: String,
    pub text: String,
}

impl TypeCommand {
    pub fn new(r#ref: String, text: String) -> Self {
        Self { r#ref, text }
    }
}

impl Execute for TypeCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        validate_ref(&self.r#ref)?;
        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::Type, payload_json)
    }
}
