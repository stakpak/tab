//! Eval command implementation
//!
//! Evaluates JavaScript in the context of the active tab.

use crate::commands::{CommandContext, Execute};
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvalCommand {
    pub script: String,
}

impl EvalCommand {
    pub fn new(script: String) -> Self {
        Self { script }
    }
}

impl Execute for EvalCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        validate_script(&self.script)?;

        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::Eval, payload_json)
    }
}

fn validate_script(script: &str) -> Result<()> {
    if script.trim().is_empty() {
        return Err(CliError::InvalidArguments(
            "Script cannot be empty".to_string(),
        ));
    }

    Ok(())
}
