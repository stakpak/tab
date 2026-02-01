use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde_json::json;

#[derive(Default)]
pub struct BackCommand {}

impl Execute for BackCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        ctx.execute(CommandType::Back, json!({}))
    }
}
