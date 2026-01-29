//! Navigate command implementation
//!
//! Navigates the active tab to a URL.
//! Note: Navigation is asynchronous and does NOT wait for page load.

use crate::commands::CommandContext;
use crate::error::{CliError, Result};
use crate::types::{CommandResponse, CommandType, NavigatePayload};

/// Execute the navigate command
///
/// # Arguments
/// * `ctx` - Command execution context
/// * `url` - URL to navigate to
///
/// # Returns
/// Command response indicating success or failure
pub fn execute(ctx: &CommandContext, url: &str) -> Result<CommandResponse> {
    // 1. Validate URL format
    validate_url(url)?;

    // 2. Normalize URL (add https:// if missing)
    let normalized_url = normalize_url(url);

    // 3. Build NavigatePayload
    let payload = NavigatePayload {
        url: normalized_url,
    };

    // 4. Serialize payload to JSON
    let payload_json = serde_json::to_value(payload)?;

    // 5. Execute command via context
    ctx.execute(CommandType::Navigate, payload_json)
}

/// Validate URL format
fn validate_url(url: &str) -> Result<()> {
    // Must not be empty
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

/// Normalize URL (add https:// if missing)
fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();

    // If it already has a scheme, return as-is
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }

    // Add https:// if missing
    format!("https://{}", trimmed)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_url_accepts_http_urls() {
        assert!(validate_url("http://example.com").is_ok());
    }

    #[test]
    fn validate_url_accepts_https_urls() {
        assert!(validate_url("https://example.com").is_ok());
    }

    #[test]
    fn validate_url_accepts_urls_without_scheme() {
        assert!(validate_url("example.com").is_ok());
    }

    #[test]
    fn validate_url_rejects_empty() {
        assert!(validate_url("").is_err());
        assert!(validate_url("   ").is_err());
    }

    #[test]
    fn validate_url_rejects_chrome_urls() {
        assert!(validate_url("chrome://settings").is_err());
    }

    #[test]
    fn validate_url_rejects_about_urls() {
        assert!(validate_url("about:blank").is_err());
    }

    #[test]
    fn normalize_url_adds_https_when_missing() {
        assert_eq!(normalize_url("example.com"), "https://example.com");
    }

    #[test]
    fn normalize_url_preserves_http() {
        assert_eq!(normalize_url("http://example.com"), "http://example.com");
    }

    #[test]
    fn normalize_url_preserves_https() {
        assert_eq!(normalize_url("https://example.com"), "https://example.com");
    }

    #[test]
    fn normalize_url_trims_whitespace() {
        assert_eq!(normalize_url("  example.com  "), "https://example.com");
    }
}
