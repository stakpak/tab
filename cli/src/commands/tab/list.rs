use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde_json::json;

#[derive(Default)]
pub struct TabListCommand {}

impl Execute for TabListCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        ctx.execute(CommandType::TabList, json!({}))
    }
}
