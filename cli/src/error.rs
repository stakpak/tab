//! Error types for the TAB CLI

use thiserror::Error;

/// Result type alias for CLI operations
pub type Result<T> = std::result::Result<T, CliError>;

/// CLI error types
#[derive(Debug, Error)]
pub enum CliError {
    /// Daemon is not running or unreachable
    #[error("daemon not running: {0}")]
    DaemonNotRunning(String),

    /// Connection to daemon failed
    #[error("connection failed: {0}")]
    ConnectionFailed(String),

    /// Connection timed out
    #[error("connection timed out")]
    ConnectionTimeout,

    /// Command execution failed
    #[error("command failed: {0}")]
    CommandFailed(String),

    /// Command timed out
    #[error("command timed out")]
    CommandTimeout,

    /// Invalid command arguments
    #[error("invalid arguments: {0}")]
    InvalidArguments(String),

    /// Invalid session name
    #[error("invalid session: {0}")]
    InvalidSession(String),

    /// Protocol error (malformed message)
    #[error("protocol error: {0}")]
    ProtocolError(String),

    /// IO error
    #[error("io error: {0}")]
    IoError(#[from] std::io::Error),

    /// JSON serialization error
    #[error("serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

impl CliError {
    /// Get the exit code for this error
    pub fn exit_code(&self) -> i32 {
        match self {
            CliError::DaemonNotRunning(_) => 2,
            CliError::ConnectionFailed(_) | CliError::ConnectionTimeout => 3,
            CliError::CommandFailed(_) | CliError::CommandTimeout => 1,
            CliError::InvalidArguments(_) => 64,   // EX_USAGE
            CliError::InvalidSession(_) => 65,     // EX_DATAERR
            CliError::ProtocolError(_) => 76,      // EX_PROTOCOL
            CliError::IoError(_) => 74,            // EX_IOERR
            CliError::SerializationError(_) => 65, // EX_DATAERR
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daemon_not_running_returns_exit_code_2() {
        let err = CliError::DaemonNotRunning("test".to_string());
        assert_eq!(err.exit_code(), 2);
    }

    #[test]
    fn connection_failed_returns_exit_code_3() {
        let err = CliError::ConnectionFailed("test".to_string());
        assert_eq!(err.exit_code(), 3);
    }

    #[test]
    fn connection_timeout_returns_exit_code_3() {
        let err = CliError::ConnectionTimeout;
        assert_eq!(err.exit_code(), 3);
    }

    #[test]
    fn command_failed_returns_exit_code_1() {
        let err = CliError::CommandFailed("test".to_string());
        assert_eq!(err.exit_code(), 1);
    }

    #[test]
    fn command_timeout_returns_exit_code_1() {
        let err = CliError::CommandTimeout;
        assert_eq!(err.exit_code(), 1);
    }

    #[test]
    fn invalid_arguments_returns_exit_code_64() {
        let err = CliError::InvalidArguments("test".to_string());
        assert_eq!(err.exit_code(), 64);
    }

    #[test]
    fn invalid_session_returns_exit_code_65() {
        let err = CliError::InvalidSession("test".to_string());
        assert_eq!(err.exit_code(), 65);
    }

    #[test]
    fn protocol_error_returns_exit_code_76() {
        let err = CliError::ProtocolError("test".to_string());
        assert_eq!(err.exit_code(), 76);
    }
}
