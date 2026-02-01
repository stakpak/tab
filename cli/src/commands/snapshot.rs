//! Snapshot command implementation
//!
//! Takes a snapshot of the current page DOM.
//! Returns HTML and element refs for subsequent commands.

use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType};
use serde_json::json;

#[derive(Default)]
pub struct SnapshotCommand {}

impl Execute for SnapshotCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        ctx.execute(CommandType::Snapshot, json!({}))
    }
}
