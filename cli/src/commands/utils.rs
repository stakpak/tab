use crate::error::CliError;
use crate::error::Result;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

pub fn validate_ref(element_ref: &str) -> Result<()> {
    // Must not be empty
    if element_ref.trim().is_empty() {
        return Err(CliError::InvalidArguments(
            "Element reference cannot be empty".to_string(),
        ));
    }

    Ok(())
}

pub fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }

    // Add https:// if missing
    format!("https://{}", trimmed)
}

pub fn validate_url(url: &str) -> Result<()> {
    if url.trim().is_empty() {
        return Err(CliError::InvalidArguments(
            "URL cannot be empty".to_string(),
        ));
    }

    // Must not be a chrome:// or about: URL
    let lower = url.to_lowercase();
    if lower.starts_with("chrome://") || lower.starts_with("about:") {
        return Err(CliError::InvalidArguments(
            "Chrome internal URLs are not allowed".to_string(),
        ));
    }

    Ok(())
}

pub fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .expect("format timestamp")
}
