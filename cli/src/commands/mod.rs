//! Command implementations for the tab CLI
//!
//! Each command module handles:
//! - Building the command payload
//! - Sending via IPC client
//! - Formatting the response

pub mod click;
pub mod eval;
pub mod history;
pub mod navigate;
pub mod scroll;
pub mod snapshot;
pub mod tab;
pub mod type_cmd;
pub mod utils;

pub use click::ClickCommand;
pub use eval::EvalCommand;
pub use history::back::BackCommand;
pub use history::forward::ForwardCommand;
pub use navigate::NavigateCommand;
pub use scroll::ScrollCommand;
pub use snapshot::SnapshotCommand;
pub use tab::close::TabCloseCommand;
pub use tab::list::TabListCommand;
pub use tab::new::TabNewCommand;
pub use tab::switch::TabSwitchCommand;
pub use type_cmd::TypeCommand;

use crate::commands::utils::current_timestamp;
use crate::error::Result;
use crate::ipc::IpcClient;
use crate::types::{Command, CommandResponse, CommandType};
use uuid::Uuid;

pub trait Execute {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse>;
}

pub struct CommandContext {
    pub client: IpcClient,
    pub session_id: String,
    pub profile: Option<String>,
}

impl CommandContext {
    pub fn new(client: IpcClient, session_id: String, profile: Option<String>) -> Self {
        Self {
            client,
            session_id,
            profile,
        }
    }

    pub fn execute(
        &self,
        command_type: CommandType,
        payload: serde_json::Value,
    ) -> Result<crate::types::CommandResponse> {
        let params = match payload.as_object() {
            Some(o) if !o.is_empty() => Some(payload),
            _ => None,
        };

        let command = Command {
            id: Uuid::new_v4().to_string(),
            session_id: self.session_id.clone(),
            profile: self.profile.clone(),
            command_type,
            params,
            timestamp: current_timestamp(),
        };

        self.client.send_command(command)
    }
}
