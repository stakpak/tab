use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde_json::json;

#[derive(Default)]
pub struct ForwardCommand {}

impl Execute for ForwardCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        ctx.execute(CommandType::Forward, json!({}))
    }
}
