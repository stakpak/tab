use crate::commands::utils::normalize_url;
use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType, TabNewPayload};

pub struct TabNewCommand {
    pub url: Option<String>,
}

impl TabNewCommand {
    pub fn new(url: Option<String>) -> Self {
        Self { url }
    }
}

impl Execute for TabNewCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        let normalized_url = self.url.as_deref().map(normalize_url);

        let payload = TabNewPayload {
            url: normalized_url,
        };

        let payload_json = serde_json::to_value(payload)?;

        ctx.execute(CommandType::TabNew, payload_json)
    }
}
