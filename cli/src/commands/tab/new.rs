use crate::commands::utils::normalize_url;
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabNewCommand {
    pub url: Option<String>,
}

impl TabNewCommand {
    pub fn new(url: Option<String>) -> Self {
        Self {
            url: url.as_deref().map(normalize_url),
        }
    }
}

impl Execute for TabNewCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::TabNew, payload_json)
    }
}
