//! Configuration for the TAB CLI
//!
//! Handles configuration loading from environment variables and defaults.

use std::path::PathBuf;

// =============================================================================
// Constants
// =============================================================================

/// Default Unix socket path for IPC communication
#[cfg(unix)]
pub const DEFAULT_IPC_SOCKET_PATH: &str = "/tmp/tab-daemon.sock";

/// Default named pipe path for IPC communication (Windows)
#[cfg(windows)]
pub const DEFAULT_IPC_SOCKET_PATH: &str = r"\\.\pipe\tab-daemon";

/// Environment variable for custom socket path
pub const ENV_IPC_SOCKET_PATH: &str = "TAB_SOCKET_PATH";

/// Environment variable for session name
pub const ENV_SESSION_NAME: &str = "TAB_SESSION";

/// Default session name
pub const DEFAULT_SESSION_NAME: &str = "default";

// =============================================================================
// Config Struct
// =============================================================================

/// CLI configuration
#[derive(Debug, Clone)]
pub struct Config {
    /// Path to the IPC socket for daemon communication
    pub ipc_socket_path: PathBuf,

    /// Default session name to use
    pub default_session: String,

    /// Connection timeout in milliseconds
    pub connection_timeout_ms: u64,

    /// Command timeout in milliseconds
    pub command_timeout_ms: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            ipc_socket_path: PathBuf::from(DEFAULT_IPC_SOCKET_PATH),
            default_session: DEFAULT_SESSION_NAME.to_string(),
            connection_timeout_ms: 5000,
            command_timeout_ms: 30000,
        }
    }
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let mut config = Self::default();

        // Override socket path from environment
        if let Ok(socket_path) = std::env::var(ENV_IPC_SOCKET_PATH) {
            config.ipc_socket_path = PathBuf::from(socket_path);
        }

        // Override default session from environment
        if let Ok(session_name) = std::env::var(ENV_SESSION_NAME) {
            config.default_session = session_name;
        }

        config
    }

    /// Get the IPC socket path, with environment override
    pub fn get_socket_path(&self) -> PathBuf {
        // Check environment variable first
        if let Ok(socket_path) = std::env::var(ENV_IPC_SOCKET_PATH) {
            PathBuf::from(socket_path)
        } else {
            self.ipc_socket_path.clone()
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Load the global CLI configuration
pub fn load_config() -> Config {
    Config::from_env()
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn default_config_has_correct_values() {
        let config = Config::default();
        assert_eq!(
            config.ipc_socket_path,
            PathBuf::from(DEFAULT_IPC_SOCKET_PATH)
        );
        assert_eq!(config.default_session, DEFAULT_SESSION_NAME);
        assert_eq!(config.connection_timeout_ms, 5000);
        assert_eq!(config.command_timeout_ms, 30000);
    }

    #[test]
    fn from_env_loads_socket_path_from_environment() {
        let test_path = "/tmp/test-socket.sock";
        env::set_var(ENV_IPC_SOCKET_PATH, test_path);

        let config = Config::from_env();
        assert_eq!(config.ipc_socket_path, PathBuf::from(test_path));

        env::remove_var(ENV_IPC_SOCKET_PATH);
    }

    #[test]
    fn from_env_loads_session_name_from_environment() {
        let test_session = "test-session";
        env::set_var(ENV_SESSION_NAME, test_session);

        let config = Config::from_env();
        assert_eq!(config.default_session, test_session);

        env::remove_var(ENV_SESSION_NAME);
    }

    #[test]
    fn from_env_uses_defaults_when_env_vars_not_set() {
        env::remove_var(ENV_IPC_SOCKET_PATH);
        env::remove_var(ENV_SESSION_NAME);

        let config = Config::from_env();
        assert_eq!(
            config.ipc_socket_path,
            PathBuf::from(DEFAULT_IPC_SOCKET_PATH)
        );
        assert_eq!(config.default_session, DEFAULT_SESSION_NAME);
    }

    #[test]
    fn get_socket_path_returns_env_var_when_set() {
        let test_path = "/tmp/override-socket.sock";
        env::set_var(ENV_IPC_SOCKET_PATH, test_path);

        let config = Config::default();
        assert_eq!(config.get_socket_path(), PathBuf::from(test_path));

        env::remove_var(ENV_IPC_SOCKET_PATH);
    }

    #[test]
    fn get_socket_path_returns_config_value_when_env_not_set() {
        env::remove_var(ENV_IPC_SOCKET_PATH);

        let config = Config {
            ipc_socket_path: PathBuf::from("/custom/path.sock"),
            ..Default::default()
        };
        assert_eq!(config.get_socket_path(), PathBuf::from("/custom/path.sock"));
    }

    #[test]
    fn load_config_returns_env_based_config() {
        env::remove_var(ENV_IPC_SOCKET_PATH);
        env::remove_var(ENV_SESSION_NAME);

        let config = load_config();
        assert_eq!(
            config.ipc_socket_path,
            PathBuf::from(DEFAULT_IPC_SOCKET_PATH)
        );
        assert_eq!(config.default_session, DEFAULT_SESSION_NAME);
    }
}
