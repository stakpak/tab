// Types text into an element identified by a ref.
//! Ref must be valid (from the current snapshot).
//!
//! Note: Module named type_cmd.rs because "type" is a Rust keyword.

use crate::commands::utils::validate_ref;
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType, TypePayload};

pub struct TypeCommand {
    pub element_ref: String,
    pub text: String,
}

impl TypeCommand {
    pub fn new(element_ref: String, text: String) -> Self {
        Self { element_ref, text }
    }
}

impl Execute for TypeCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        validate_ref(&self.element_ref)?;

        let payload = TypePayload {
            r#ref: self.element_ref.to_string(),
            text: self.text.to_string(),
        };

        let payload_json = serde_json::to_value(payload)?;

        ctx.execute(CommandType::Type, payload_json)
    }
}
