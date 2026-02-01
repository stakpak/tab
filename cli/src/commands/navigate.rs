use crate::commands::utils::{normalize_url, validate_url};
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigateCommand {
    pub url: String,
}

impl NavigateCommand {
    pub fn new(url: String) -> Self {
        Self {
            url: normalize_url(&url),
        }
    }
}

impl Execute for NavigateCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        validate_url(&self.url)?;
        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::Navigate, payload_json)
    }
}
