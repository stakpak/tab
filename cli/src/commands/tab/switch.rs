use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::TabSwitch, payload_json)
    }
}
