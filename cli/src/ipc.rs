//! IPC Client for CLI <-> Daemon communication
//!
//! Implements the client side of the newline-delimited JSON protocol
//! over Unix sockets (or named pipes on Windows).
//!
//! Protocol reference: packages/daemon/src/ipc-server.ts

use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::net::UnixStream;

#[cfg(windows)]
use std::fs::OpenOptions;
#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;

use crate::config::Config;
use crate::error::{CliError, Result};
use crate::types::{Command, CommandResponse, IpcMessage, IpcMessageType};

// =============================================================================
// Platform-specific stream types
// =============================================================================

#[cfg(unix)]
type IpcStream = UnixStream;

#[cfg(windows)]
type IpcStream = std::fs::File;

// =============================================================================
// Constants
// =============================================================================

/// Message delimiter for framing (newline-delimited JSON)
const MESSAGE_DELIMITER: u8 = b'\n';

/// IPC client for communicating with tab-daemon
pub struct IpcClient {
    config: Config,
}

impl IpcClient {
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    pub fn ping(&self) -> Result<bool> {
        let timeout = Duration::from_millis(self.config.connection_timeout_ms);
        let socket_path = self.config.ipc_socket_path.as_path();
        let mut stream = connect_to_daemon(socket_path, timeout)?;

        let message = IpcMessage {
            message_type: IpcMessageType::Ping,
            payload: None,
        };

        let bytes = serialize_message(&message)?;
        send_bytes(&mut stream, &bytes)?;

        let response_bytes = read_message(&mut stream)?;
        let response = deserialize_message(&response_bytes)?;

        Ok(matches!(response.message_type, IpcMessageType::Pong))
    }

    /// Send a command to the daemon and wait for response
    pub fn send_command(&self, command: Command) -> Result<CommandResponse> {
        let connect_timeout = Duration::from_millis(self.config.connection_timeout_ms);
        let _command_timeout = Duration::from_millis(self.config.command_timeout_ms);
        let socket_path = self.config.ipc_socket_path.as_path();
        let mut stream = connect_to_daemon(socket_path, connect_timeout)?;

        #[cfg(unix)]
        {
            stream.set_read_timeout(Some(_command_timeout))?;
            stream.set_write_timeout(Some(_command_timeout))?;
        }

        let payload = serde_json::to_value(command)?;
        let message = IpcMessage {
            message_type: IpcMessageType::Command,
            payload: Some(payload),
        };

        let bytes = serialize_message(&message)?;
        send_bytes(&mut stream, &bytes)?;

        let response_bytes = read_message(&mut stream)?;
        let response = deserialize_message(&response_bytes)?;

        if !matches!(response.message_type, IpcMessageType::Response) {
            return Err(CliError::ProtocolError(
                "unexpected response type".to_string(),
            ));
        }

        let payload = response
            .payload
            .ok_or_else(|| CliError::ProtocolError("missing response payload".to_string()))?;

        let command_response: CommandResponse = serde_json::from_value(payload)?;
        Ok(command_response)
    }
}

#[cfg(unix)]
fn connect_to_daemon(socket_path: &Path, timeout: Duration) -> Result<IpcStream> {
    if !socket_path.exists() {
        return Err(CliError::DaemonNotRunning(format!(
            "socket not found at {}",
            socket_path.display()
        )));
    }

    let stream = UnixStream::connect(socket_path)
        .map_err(|err| CliError::ConnectionFailed(err.to_string()))?;

    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(timeout))?;

    Ok(stream)
}

#[cfg(windows)]
fn connect_to_daemon(pipe_path: &Path, _timeout: Duration) -> Result<IpcStream> {
    // Windows named pipe path format: \\.\pipe\pipe-name
    // The config should provide the full pipe path
    let pipe_path_str = pipe_path.to_string_lossy();

    // Convert Unix-style socket path to Windows named pipe if needed
    let pipe_name = if pipe_path_str.starts_with(r"\\.\pipe\") {
        pipe_path_str.to_string()
    } else {
        // Extract the filename and create a named pipe path
        let name = pipe_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("tab-daemon");
        format!(r"\\.\pipe\{}", name)
    };

    let stream = OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(0) // FILE_FLAG_OVERLAPPED can be added if async needed
        .open(&pipe_name)
        .map_err(|err| {
            if err.kind() == std::io::ErrorKind::NotFound {
                CliError::DaemonNotRunning(format!("pipe not found at {}", pipe_name))
            } else {
                CliError::ConnectionFailed(err.to_string())
            }
        })?;

    Ok(stream)
}

fn serialize_message(message: &IpcMessage) -> Result<Vec<u8>> {
    let mut json = serde_json::to_vec(message)?;
    json.push(MESSAGE_DELIMITER);
    Ok(json)
}
fn deserialize_message(data: &[u8]) -> Result<IpcMessage> {
    let message: IpcMessage = serde_json::from_slice(data)?;
    Ok(message)
}

// =============================================================================
fn send_bytes<W: Write>(stream: &mut W, data: &[u8]) -> Result<()> {
    stream.write_all(data)?;
    stream.flush()?;
    Ok(())
}

fn read_message<R: Read>(stream: &mut R) -> Result<Vec<u8>> {
    let mut reader = BufReader::new(stream);
    let mut buf = Vec::new();
    let bytes = reader.read_until(MESSAGE_DELIMITER, &mut buf)?;

    if bytes == 0 {
        return Err(CliError::ProtocolError("empty response".to_string()));
    }

    if buf.last().copied() != Some(MESSAGE_DELIMITER) {
        return Err(CliError::ProtocolError(
            "missing message delimiter".to_string(),
        ));
    }

    buf.pop();
    Ok(buf)
}

pub fn create_client() -> IpcClient {
    let config = crate::config::load_config();
    IpcClient::new(config)
}
pub fn create_client_with_config(config: Config) -> IpcClient {
    IpcClient::new(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serialize_message_appends_newline_delimiter() {
        let message = IpcMessage {
            message_type: IpcMessageType::Command,
            payload: Some(json!({"id": "cmd-1"})),
        };

        let bytes = serialize_message(&message).expect("serialize message");

        assert!(!bytes.is_empty());
        assert_eq!(bytes.last().copied(), Some(MESSAGE_DELIMITER));

        let mut trimmed = bytes.clone();
        trimmed.pop();
        let parsed: serde_json::Value = serde_json::from_slice(&trimmed).expect("parse json");
        assert_eq!(
            parsed,
            json!({"type": "command", "payload": {"id": "cmd-1"}})
        );
    }

    #[test]
    fn deserialize_message_round_trips_json() {
        let raw = br#"{"type":"pong","payload":null}"#;
        let message = deserialize_message(raw).expect("deserialize message");

        let value = serde_json::to_value(&message).expect("message to value");
        assert_eq!(value, json!({"type": "pong", "payload": null}));
    }

    #[test]
    fn create_client_returns_client_with_default_config() {
        let client = create_client();
        // Just verify that it creates a client without panicking
        assert_eq!(client.config.connection_timeout_ms, 5000);
        assert_eq!(client.config.command_timeout_ms, 30000);
    }
}

#[cfg(all(test, unix))]
mod unix_tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::PathBuf;
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[test]
    fn read_message_reads_until_delimiter() {
        let (mut writer, mut reader) = UnixStream::pair().expect("create unix pair");
        let payload = b"{\"type\":\"ping\",\"payload\":null}\n";

        let handle = thread::spawn(move || {
            writer.write_all(payload).expect("write payload");
            writer.flush().expect("flush payload");
        });

        let read = read_message(&mut reader).expect("read message");
        handle.join().expect("writer thread");

        assert_eq!(read, b"{\"type\":\"ping\",\"payload\":null}");
    }

    #[test]
    fn connect_to_daemon_returns_error_when_missing() {
        let socket_path = unique_socket_path("missing");
        let result = connect_to_daemon(&socket_path, Duration::from_millis(50));

        assert!(matches!(result, Err(CliError::DaemonNotRunning(_))));
    }

    #[test]
    fn connect_to_daemon_connects_to_listener() {
        let socket_path = unique_socket_path("listener");
        cleanup_socket(&socket_path);

        let listener = UnixListener::bind(&socket_path).expect("bind listener");

        let handle = thread::spawn(move || {
            let (_stream, _addr) = listener.accept().expect("accept connection");
        });

        let result = connect_to_daemon(&socket_path, Duration::from_millis(50));
        assert!(result.is_ok());

        handle.join().expect("listener thread");
        cleanup_socket(&socket_path);
    }

    #[test]
    fn ping_sends_ping_and_expects_pong() {
        let socket_path = unique_socket_path("ping");
        cleanup_socket(&socket_path);

        let listener = UnixListener::bind(&socket_path).expect("bind listener");

        let handle = thread::spawn(move || {
            let (stream, _addr) = listener.accept().expect("accept connection");
            let mut reader = BufReader::new(stream);
            let mut buf = String::new();
            reader.read_line(&mut buf).expect("read line");

            let incoming: serde_json::Value =
                serde_json::from_str(buf.trim_end()).expect("parse json");
            assert_eq!(incoming["type"], "ping");
            assert!(incoming.get("payload").unwrap().is_null());

            let response = json!({"type": "pong", "payload": null});
            let response_bytes = serde_json::to_vec(&response).expect("serialize response");
            let mut stream = reader.into_inner();
            stream.write_all(&response_bytes).expect("write response");
            stream.write_all(b"\n").expect("write delimiter");
        });

        let config = Config {
            ipc_socket_path: socket_path.clone(),
            default_session: "default".to_string(),
            connection_timeout_ms: 100,
            command_timeout_ms: 100,
        };
        let client = IpcClient::new(config);
        let result = client.ping().expect("ping result");
        assert!(result);

        handle.join().expect("listener thread");
        cleanup_socket(&socket_path);
    }

    #[test]
    fn send_command_round_trips_response() {
        let socket_path = unique_socket_path("command");
        cleanup_socket(&socket_path);

        let listener = UnixListener::bind(&socket_path).expect("bind listener");

        let handle = thread::spawn(move || {
            let (stream, _addr) = listener.accept().expect("accept connection");
            let mut reader = BufReader::new(stream);
            let mut buf = String::new();
            reader.read_line(&mut buf).expect("read line");

            let incoming: serde_json::Value =
                serde_json::from_str(buf.trim_end()).expect("parse json");
            assert_eq!(incoming["type"], "command");
            let payload = incoming.get("payload").expect("payload");
            assert_eq!(payload["sessionId"], "session-1");
            assert_eq!(payload["type"], "navigate");
            assert_eq!(payload["id"], "cmd-1");

            let response = json!({
                "type": "response",
                "payload": {"id": "cmd-1", "success": true}
            });
            let response_bytes = serde_json::to_vec(&response).expect("serialize response");
            let mut stream = reader.into_inner();
            stream.write_all(&response_bytes).expect("write response");
            stream.write_all(b"\n").expect("write delimiter");
        });

        let config = Config {
            ipc_socket_path: socket_path.clone(),
            default_session: "default".to_string(),
            connection_timeout_ms: 100,
            command_timeout_ms: 100,
        };
        let client = IpcClient::new(config);
        let command = Command {
            id: "cmd-1".to_string(),
            session_id: "session-1".to_string(),
            profile: None,
            command_type: crate::types::CommandType::Navigate,
            params: Some(json!({"url": "https://example.com"})),
            timestamp: "2026-01-01T00:00:00Z".to_string(),
        };

        let response = client.send_command(command).expect("send command");
        assert_eq!(response.id, "cmd-1");
        assert!(response.success);

        handle.join().expect("listener thread");
        cleanup_socket(&socket_path);
    }

    fn unique_socket_path(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("tab-cli-{}-{}.sock", prefix, nanos))
    }

    fn cleanup_socket(path: &PathBuf) {
        let _ = fs::remove_file(path);
    }
}
