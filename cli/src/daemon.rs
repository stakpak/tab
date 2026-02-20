//! Daemon management for auto-starting the browser-daemon
//!
//! Provides functionality to:
//! - Check if daemon is running
//! - Start daemon if not running
//! - Wait for daemon to be ready

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
    let self_exe = std::env::current_exe().map_err(|e| {
        CliError::DaemonNotRunning(format!("failed to determine current executable: {}", e))
    })?;

    // Build command arguments: "daemon --socket <path>"
    let args = vec![
        "daemon".to_string(),
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
            Command::new(&self_exe)
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
        Command::new(&self_exe)
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

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn is_daemon_running_returns_false_when_socket_missing() {
        let config = Config {
            ipc_socket_path: PathBuf::from("/tmp/nonexistent-socket-12345.sock"),
            ..Default::default()
        };
        assert!(!is_daemon_running(&config));
    }
}
