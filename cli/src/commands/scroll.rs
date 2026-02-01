//! Scroll command implementation
//!
//! Scrolls the page or a specific element.

use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType, ScrollDirection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollCommand {
    pub r#ref: Option<String>,
    pub direction: ScrollDirection,
    pub amount: Option<i32>,
}

impl ScrollCommand {
    pub fn new(direction: ScrollDirection, r#ref: Option<String>, amount: Option<i32>) -> Self {
        Self {
            direction,
            r#ref,
            amount,
        }
    }
}

impl Execute for ScrollCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        let payload_json = serde_json::to_value(self)?;
        ctx.execute(CommandType::Scroll, payload_json)
    }
}
