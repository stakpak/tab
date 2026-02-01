use crate::commands::utils::{normalize_url, validate_url};
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType, NavigatePayload};

pub struct NavigateCommand {
    pub url: String,
}

impl NavigateCommand {
    pub fn new(url: String) -> Self {
        Self { url }
    }
}

impl Execute for NavigateCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        validate_url(&self.url)?;
        let normalized_url = normalize_url(&self.url);

        let payload = NavigatePayload {
            url: normalized_url,
        };

        let payload_json = serde_json::to_value(payload)?;
        ctx.execute(CommandType::Navigate, payload_json)
    }
}
