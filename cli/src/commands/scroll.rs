//! Scroll command implementation
//!
//! Scrolls the page or a specific element.

use crate::commands::{CommandContext, Execute};
use crate::error::Result;
use crate::types::{CommandResponse, CommandType, ScrollDirection, ScrollPayload};

pub struct ScrollCommand {
    pub direction: ScrollDirection,
    pub element_ref: Option<String>,
    pub amount: Option<i32>,
}

impl ScrollCommand {
    pub fn new(
        direction: ScrollDirection,
        element_ref: Option<String>,
        amount: Option<i32>,
    ) -> Self {
        Self {
            direction,
            element_ref,
            amount,
        }
    }
}

impl Execute for ScrollCommand {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse> {
        let payload = ScrollPayload {
            r#ref: self.element_ref.clone(),
            direction: self.direction.clone(),
            amount: self.amount,
        };

        let payload_json = serde_json::to_value(payload)?;

        ctx.execute(CommandType::Scroll, payload_json)
    }
}
