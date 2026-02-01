use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

/// Payload for tab switch command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabSwitchPayload {
    pub tab_id: i32,
}

pub struct TabSwitchCommand {
    pub tab_id: i32,
}

impl TabSwitchCommand {
    pub fn new(tab_id: i32) -> Self {
        Self { tab_id }
    }
}

impl Execute for TabSwitchCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        let payload = TabSwitchPayload {
            tab_id: self.tab_id,
        };

        let payload_json = serde_json::to_value(payload)?;
        ctx.execute(CommandType::TabSwitch, payload_json)
    }
}
