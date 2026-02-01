//! Daemon management for auto-starting the tab-daemon
//!
//! Provides functionality to:
//! - Check if daemon is running
//! - Start daemon if not running
//! - Wait for daemon to be ready

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::config::Config;
use crate::error::{CliError, Result};
use crate::ipc::IpcClient;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

// =============================================================================
// Constants
// =============================================================================

/// Maximum time to wait for daemon to start (in milliseconds)
const DAEMON_STARTUP_TIMEOUT_MS: u64 = 10000;

/// Polling interval when waiting for daemon to start (in milliseconds)
const DAEMON_POLL_INTERVAL_MS: u64 = 100;

/// Daemon executable name
const DAEMON_EXECUTABLE: &str = "agent-tab-daemon";

// =============================================================================
// Daemon Manager
// =============================================================================

/// Ensures the daemon is running, starting it if necessary
///
/// Returns Ok(()) if daemon is running (or was successfully started)
/// Returns Err if daemon could not be started or reached
pub fn ensure_daemon_running(config: &Config) -> Result<()> {
    if is_daemon_running(config) {
        return Ok(());
    }

    start_daemon(config)?;
    wait_for_daemon_ready(config)?;

    Ok(())
}

/// Check if daemon is running by attempting a ping
fn is_daemon_running(config: &Config) -> bool {
    // Quick check: if socket doesn't exist, daemon is definitely not running
    if !config.ipc_socket_path.exists() {
        return false;
    }

    // Try to ping the daemon
    let client = IpcClient::new(config.clone());
    client.ping().unwrap_or(false)
}

/// Start the daemon process
fn start_daemon(config: &Config) -> Result<()> {
    let daemon_path = find_daemon_executable()?;

    // Build command arguments
    let args = vec![
        "--socket".to_string(),
        config.ipc_socket_path.to_string_lossy().to_string(),
    ];

    // Spawn daemon as background process
    #[cfg(unix)]
    {
        // Use setsid to start the daemon in a new session (detached from terminal)
        // without exiting the parent process (CLI)
        // unsafe block for setsid
        unsafe {
            Command::new(&daemon_path)
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .pre_exec(|| {
                    // detaches the child from the terminal
                    libc::setsid();
                    Ok(())
                })
                .spawn()
                .map_err(|e| {
                    CliError::DaemonNotRunning(format!("failed to start daemon: {}", e))
                })?;
        }

        Ok(())
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new(&daemon_path)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x00000008) // DETACHED_PROCESS
            .spawn()
            .map_err(|e| CliError::DaemonNotRunning(format!("failed to start daemon: {}", e)))?;

        Ok(())
    }
}

/// Wait for daemon to become ready (respond to ping)
fn wait_for_daemon_ready(config: &Config) -> Result<()> {
    let timeout = Duration::from_millis(DAEMON_STARTUP_TIMEOUT_MS);
    let poll_interval = Duration::from_millis(DAEMON_POLL_INTERVAL_MS);
    let start = Instant::now();

    loop {
        // Check if we've exceeded timeout
        if start.elapsed() > timeout {
            return Err(CliError::DaemonNotRunning(
                "daemon failed to start within timeout".to_string(),
            ));
        }

        // Try to ping
        if is_daemon_running(config) {
            return Ok(());
        }

        // Wait before next attempt
        thread::sleep(poll_interval);
    }
}

/// Find the daemon executable
fn find_daemon_executable() -> Result<PathBuf> {
    // 1. Check same directory as CLI binary
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let daemon_path = exe_dir.join(DAEMON_EXECUTABLE);
            if daemon_path.exists() {
                return Ok(daemon_path);
            }
        }
    }

    // 2. Check if it's in PATH (just use the name, let OS resolve it)
    if is_in_path(DAEMON_EXECUTABLE) {
        return Ok(PathBuf::from(DAEMON_EXECUTABLE));
    }

    Err(CliError::DaemonNotRunning(format!(
        "'{}' executable not found. Ensure it is in the same directory as 'tab' or in your PATH.",
        DAEMON_EXECUTABLE
    )))
}

/// Check if an executable exists in PATH
fn is_in_path(name: &str) -> bool {
    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            let full_path = PathBuf::from(dir).join(name);
            if full_path.exists() {
                return true;
            }
            // On Windows, also check with .exe extension
            #[cfg(windows)]
            {
                let with_exe = PathBuf::from(dir).join(format!("{}.exe", name));
                if with_exe.exists() {
                    return true;
                }
            }
        }
    }
    false
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_daemon_running_returns_false_when_socket_missing() {
        let config = Config {
            ipc_socket_path: PathBuf::from("/tmp/nonexistent-socket-12345.sock"),
            ..Default::default()
        };
        assert!(!is_daemon_running(&config));
    }

    #[test]
    fn find_daemon_executable_returns_error_when_not_found() {
        // Temporarily modify PATH to ensure daemon isn't found
        let original_path = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", "/nonexistent");

        let result = find_daemon_executable();
        assert!(result.is_err());

        std::env::set_var("PATH", original_path);
    }

    #[test]
    fn is_in_path_returns_false_for_nonexistent() {
        assert!(!is_in_path("nonexistent-binary-12345"));
    }
}
