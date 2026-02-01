use std::process::{Command, Stdio};

/// Pass-through to agent-tab plugin. All args after 'tab' are forwarded directly.
/// Run `stakpak tab --help` for available commands.
pub async fn run_tab(args: Vec<String>) -> Result<(), String> {
    let tab_path = get_tab_plugin_path().await;
    let mut cmd = Command::new(&tab_path);
    cmd.args(&args);
    
    cmd.stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .stdin(Stdio::inherit());

    let status = cmd
        .status()
        .map_err(|e| format!("Failed to run agent-tab: {}", e))?;

    std::process::exit(status.code().unwrap_or(1));
}

async fn get_tab_plugin_path() -> String {
    // Check if we have an existing installation first
    let existing = get_existing_tab_path().ok();
    let current_version = existing
        .as_ref()
        .and_then(|path| get_tab_version(path).ok());

    // If we have an existing installation, check if update needed
    if let Some(ref path) = existing {
        // Try to get latest version from GitHub API
        match get_latest_github_release_version().await {
            Ok(target_version) => {
                if let Some(ref current) = current_version {
                    if is_version_match(current, &target_version) {
                        // Already up to date, use existing
                        return path.clone();
                    }
                    println!(
                        "agent-tab {} is outdated (target: {}), updating...",
                        current, target_version
                    );
                }
                // Need to update - download new version
                match download_tab_binary().await {
                    Ok(new_path) => {
                        println!(
                            "Successfully installed agent-tab {} -> {}",
                            target_version, new_path
                        );
                        return new_path;
                    }
                    Err(e) => {
                        eprintln!("Failed to update agent-tab: {}", e);
                        eprintln!("Using existing version");
                        return path.clone();
                    }
                }
            }
            Err(_) => {
                // Can't check version, use existing installation
                return path.clone();
            }
        }
    }

    // No existing installation - must download
    match get_latest_github_release_version().await {
        Ok(target_version) => match download_tab_binary().await {
            Ok(path) => {
                println!(
                    "Successfully installed agent-tab {} -> {}",
                    target_version, path
                );
                path
            }
            Err(e) => {
                eprintln!("Failed to download agent-tab: {}", e);
                "agent-tab".to_string()
            }
        },
        Err(e) => {
            // Try download anyway (uses /latest/ URL)
            eprintln!("Warning: Failed to check version: {}", e);
            match download_tab_binary().await {
                Ok(path) => {
                    println!("Successfully installed agent-tab -> {}", path);
                    path
                }
                Err(e) => {
                    eprintln!("Failed to download agent-tab: {}", e);
                    "agent-tab".to_string()
                }
            }
        }
    }
}

async fn get_latest_github_release_version() -> Result<String, String> {
    use stakpak_shared::tls_client::{TlsClientConfig, create_tls_client};

    let client = create_tls_client(TlsClientConfig::default())?;
    
    // Fetch CLI releases (tagged as cli-vX.Y.Z)
    let response = client
        .get("https://api.github.com/repos/stakpak/tab/releases")
        .header("User-Agent", "stakpak-cli")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API returned: {}", response.status()));
    }

    let releases: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    // Find the latest CLI release (cli-vX.Y.Z)
    for release in releases {
        if let Some(tag_name) = release["tag_name"].as_str() {
            if let Some(version) = tag_name.strip_prefix("cli-v") {
                return Ok(version.to_string());
            }
        }
    }

    Err("No CLI release found".to_string())
}

fn get_platform_artifact_name() -> Result<String, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let platform = match os {
        "linux" => "linux",
        "macos" => "darwin",
        "windows" => "windows",
        _ => return Err(format!("Unsupported OS: {}", os)),
    };

    let arch_name = match arch {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        _ => return Err(format!("Unsupported architecture: {}", arch)),
    };

    Ok(format!("agent-tab-{}-{}", platform, arch_name))
}

fn get_binary_name() -> &'static str {
    if cfg!(windows) {
        "agent-tab.exe"
    } else {
        "agent-tab"
    }
}

fn get_home_dir() -> Result<String, String> {
    // Try HOME first (Unix), then USERPROFILE (Windows)
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "HOME/USERPROFILE environment variable not set".to_string())
}

fn get_existing_tab_path() -> Result<String, String> {
    let home_dir = get_home_dir()?;

    let binary_path = std::path::PathBuf::from(&home_dir)
        .join(".stakpak")
        .join("plugins")
        .join(get_binary_name());

    if binary_path.exists() {
        Ok(binary_path.to_string_lossy().to_string())
    } else {
        Err("agent-tab binary not found".to_string())
    }
}

fn get_tab_version(path: &str) -> Result<String, String> {
    let output = std::process::Command::new(path)
        .arg("version")
        .output()
        .map_err(|e| format!("Failed to run agent-tab version: {}", e))?;

    if !output.status.success() {
        return Err("agent-tab version command failed".to_string());
    }

    let version_output = String::from_utf8_lossy(&output.stdout);
    // Parse version from output like "agent-tab v0.1.0" or just "v0.1.0"
    let trimmed = version_output.trim();
    if let Some(v) = trimmed.split_whitespace().find(|s| {
        s.starts_with('v')
            || s.chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
    }) {
        Ok(v.to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn is_version_match(current: &str, target: &str) -> bool {
    let current_clean = current.strip_prefix('v').unwrap_or(current);
    let target_clean = target.strip_prefix('v').unwrap_or(target);
    current_clean == target_clean
}

async fn download_tab_binary() -> Result<String, String> {
    use stakpak_shared::tls_client::{TlsClientConfig, create_tls_client};

    let home_dir = get_home_dir()?;

    let plugins_dir = std::path::PathBuf::from(&home_dir)
        .join(".stakpak")
        .join("plugins");

    std::fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;

    let artifact_name = get_platform_artifact_name()?;
    let extension = if cfg!(windows) { "zip" } else { "tar.gz" };

    let download_url = format!(
        "https://github.com/stakpak/tab/releases/latest/download/{}.{}",
        artifact_name, extension
    );

    eprintln!("{}", download_url);
    println!("Downloading agent-tab binary...");

    let client = create_tls_client(TlsClientConfig::default())?;
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download agent-tab: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let archive_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    let binary_path = plugins_dir.join(get_binary_name());

    if cfg!(windows) {
        extract_zip(&archive_bytes, &plugins_dir)?;
    } else {
        extract_tar_gz(&archive_bytes, &plugins_dir)?;
    }

    // Make binary executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&binary_path)
            .map_err(|e| format!("Failed to get binary metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&binary_path, perms)
            .map_err(|e| format!("Failed to set binary permissions: {}", e))?;
    }

    Ok(binary_path.to_string_lossy().to_string())
}

fn extract_tar_gz(data: &[u8], dest_dir: &std::path::Path) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use std::io::Cursor;
    use tar::Archive;

    let cursor = Cursor::new(data);
    let tar = GzDecoder::new(cursor);
    let mut archive = Archive::new(tar);

    for entry in archive.entries().map_err(|e| format!("Failed to read archive: {}", e))? {
        let mut entry = entry.map_err(|e| format!("Failed to read archive entry: {}", e))?;
        let path = entry.path().map_err(|e| format!("Failed to get entry path: {}", e))?;
        
        // Extract only the binary file (skip directories)
        if let Some(file_name) = path.file_name() {
            if file_name == "agent-tab" || file_name == "agent-tab.exe" {
                let dest_path = dest_dir.join(file_name);
                entry.unpack(&dest_path)
                    .map_err(|e| format!("Failed to extract binary: {}", e))?;
                return Ok(());
            }
        }
    }

    Err("Binary not found in archive".to_string())
}

#[cfg(windows)]
fn extract_zip(data: &[u8], dest_dir: &std::path::Path) -> Result<(), String> {
    use std::io::Cursor;
    use zip::ZipArchive;

    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        
        let file_name = file.name().to_string();
        if file_name.ends_with("agent-tab.exe") {
            let dest_path = dest_dir.join("agent-tab.exe");
            let mut outfile = std::fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write binary: {}", e))?;
            return Ok(());
        }
    }

    Err("Binary not found in archive".to_string())
}

#[cfg(not(windows))]
fn extract_zip(_data: &[u8], _dest_dir: &std::path::Path) -> Result<(), String> {
    Err("ZIP extraction not supported on this platform".to_string())
}
