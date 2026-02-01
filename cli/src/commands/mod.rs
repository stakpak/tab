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

use crate::error::Result;
use crate::ipc::IpcClient;
use crate::session::ProfileDir;
use crate::types::CommandResponse;
use crate::types::{Command, CommandId, CommandType, SessionId};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

pub trait Execute {
    fn execute(&self, ctx: &CommandContext) -> Result<CommandResponse>;
}

// =============================================================================
// Command Builder
// =============================================================================

/// Helper to build commands with common fields
pub struct CommandBuilder {
    session_id: SessionId,
    profile: ProfileDir,
}

impl CommandBuilder {
    /// Create a new command builder for a session and profile
    pub fn new(session_id: SessionId, profile: ProfileDir) -> Self {
        Self {
            session_id,
            profile,
        }
    }

    /// Build a command with the given type and params
    pub fn build(&self, command_type: CommandType, params: serde_json::Value) -> Command {
        // Convert empty object to None, otherwise Some
        let params_opt = if params.is_object() && params.as_object().is_none_or(|o| o.is_empty()) {
            None
        } else {
            Some(params)
        };

        Command {
            id: generate_command_id(),
            session_id: self.session_id.clone(),
            profile: self.profile.clone(),
            command_type,
            params: params_opt,
            timestamp: current_timestamp(),
        }
    }
}

/// Generate a unique command ID
pub fn generate_command_id() -> CommandId {
    Uuid::new_v4().to_string()
}

/// Get current timestamp in ISO 8601 format
pub fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .expect("format timestamp")
}

// =============================================================================
// Command Execution Context
// =============================================================================

/// Context passed to command handlers
pub struct CommandContext {
    pub client: IpcClient,
    pub session_id: SessionId,
    pub profile: ProfileDir,
}

impl CommandContext {
    /// Create a new command context
    pub fn new(client: IpcClient, session_id: SessionId, profile: ProfileDir) -> Self {
        Self {
            client,
            session_id,
            profile,
        }
    }

    /// Execute a command and return the response
    pub fn execute(
        &self,
        command_type: CommandType,
        payload: serde_json::Value,
    ) -> Result<crate::types::CommandResponse> {
        let builder = CommandBuilder::new(self.session_id.clone(), self.profile.clone());
        let command = builder.build(command_type, payload);
        self.client.send_command(command)
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use time::UtcOffset;

    #[test]
    fn generate_command_id_is_uuid() {
        let id = generate_command_id();
        assert!(Uuid::parse_str(&id).is_ok());
    }

    #[test]
    fn current_timestamp_is_rfc3339_utc() {
        let timestamp = current_timestamp();
        let parsed = OffsetDateTime::parse(&timestamp, &Rfc3339).expect("parse timestamp");
        assert_eq!(parsed.offset(), UtcOffset::UTC);
    }

    #[test]
    fn command_builder_builds_command_fields() {
        let builder = CommandBuilder::new(
            "session-1".to_string(),
            Some("/path/to/profile".to_string()),
        );
        let params = json!({"url": "https://example.com"});
        let command = builder.build(CommandType::Navigate, params.clone());

        assert_eq!(command.session_id, "session-1");
        assert_eq!(command.profile, Some("/path/to/profile".to_string()));
        assert!(matches!(command.command_type, CommandType::Navigate));
        assert_eq!(command.params, Some(params));
        assert!(Uuid::parse_str(&command.id).is_ok());
        assert!(OffsetDateTime::parse(&command.timestamp, &Rfc3339).is_ok());
    }

    #[test]
    fn command_context_new_stores_fields() {
        let config = crate::config::Config::default();
        let client = IpcClient::new(config);
        let ctx = CommandContext::new(
            client,
            "session-1".to_string(),
            Some("/path/to/profile".to_string()),
        );

        assert_eq!(ctx.session_id, "session-1");
        assert_eq!(ctx.profile, Some("/path/to/profile".to_string()));
    }
}
