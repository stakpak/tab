use flate2::read::GzDecoder;
use std::fs;
use std::io::Cursor;
use std::path::Path;
use tar::Archive;
use zip::ZipArchive;

/// Check if a file is executable
pub fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(path) {
            let permissions = metadata.permissions();
            return permissions.mode() & 0o111 != 0;
        }
    }

    #[cfg(windows)]
    {
        // On Windows, .exe files are executable
        return path.extension().map_or(false, |ext| ext == "exe");
    }

    false
}

/// Get Home Directory
pub fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "HOME/USERPROFILE environment variable not set".to_string())
}

/// Extract tar.gz archive
pub fn extract_tar_gz(archive_bytes: &[u8], dest_dir: &Path) -> Result<(), String> {
    let cursor = Cursor::new(archive_bytes);
    let tar = GzDecoder::new(cursor);
    let mut archive = Archive::new(tar);

    archive
        .unpack(dest_dir)
        .map_err(|e| format!("Failed to extract tar.gz archive: {}", e))?;

    Ok(())
}

/// Extract zip archive
pub fn extract_zip(archive_bytes: &[u8], dest_dir: &Path) -> Result<(), String> {
    let cursor = Cursor::new(archive_bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to access file {} in zip: {}", i, e))?;

        let outpath = match file.enclosed_name() {
            Some(path) => dest_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory {}: {}", outpath.display(), e))?;
        } else {
            if let Some(p) = outpath.parent()
                && !p.exists()
            {
                fs::create_dir_all(p).map_err(|e| {
                    format!("Failed to create parent directory {}: {}", p.display(), e)
                })?;
            }
            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create file {}: {}", outpath.display(), e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file {}: {}", outpath.display(), e))?;
        }

        // Set permissions on Unix systems
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                fs::set_permissions(&outpath, fs::Permissions::from_mode(mode)).map_err(|e| {
                    format!("Failed to set permissions for {}: {}", outpath.display(), e)
                })?;
            }
        }
    }

    Ok(())
}
