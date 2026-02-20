use crate::utils::plugins::{PluginConfig, execute_plugin_command, get_plugin_path};
use std::process::Command;

fn get_daemon_config() -> PluginConfig {
    PluginConfig {
        name: "browser-daemon".to_string(),
        base_url: "https://github.com/stakpak/tab".to_string(),
        targets: vec![
            "linux-x86_64".to_string(),
            "darwin-x86_64".to_string(),
            "darwin-aarch64".to_string(),
            "windows-x86_64".to_string(),
        ],
        version: None,
        repo: Some("tab".to_string()),
        owner: Some("stakpak".to_string()),
        version_arg: Some("--version".to_string()),
    }
}

pub async fn run_daemon(args: Vec<String>) -> Result<(), String> {
    let plugin_config = get_daemon_config();
    let plugin_path = get_plugin_path(plugin_config).await;

    let mut cmd = Command::new(&plugin_path);
    cmd.args(&args);
    execute_plugin_command(cmd, "daemon".to_string())
}
