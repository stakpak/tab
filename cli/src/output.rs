//! Output formatting for the Vibe CLI
//!
//! Handles formatting command responses for terminal display.
//! Supports both human-readable and JSON output formats.

use crate::error::Result;
use crate::types::{CommandResponse, SnapshotData, TabListData};

// =============================================================================
// Output Format
// =============================================================================

/// Supported output formats
#[derive(Debug, Clone, Copy, Default)]
pub enum OutputFormat {
    /// Human-readable output (default)
    #[default]
    Human,
    /// JSON output for scripting
    Json,
    /// Quiet mode - minimal output
    Quiet,
}

// =============================================================================
// Output Formatter
// =============================================================================

/// Formats command responses for display
pub struct OutputFormatter {
    format: OutputFormat,
}

impl OutputFormatter {
    /// Create a new formatter with the given format
    pub fn new(format: OutputFormat) -> Self {
        Self { format }
    }

    /// Format and print a command response
    pub fn print_response(&self, response: &CommandResponse) -> Result<()> {
        if response.success {
            let output = self.format_success(response);
            if !output.is_empty() {
                print_success(&output);
            }
        } else {
            let output = self.format_error(response);
            print_error(&output);
        }
        Ok(())
    }

    /// Format a success response
    fn format_success(&self, response: &CommandResponse) -> String {
        match self.format {
            OutputFormat::Human => {
                if let Some(data) = &response.data {
                    serde_json::to_string_pretty(data)
                        .unwrap_or_default()
                        .to_string()
                } else {
                    "Success".to_string()
                }
            }
            OutputFormat::Json => serde_json::to_string(response).unwrap_or_default(),
            OutputFormat::Quiet => String::new(),
        }
    }

    /// Format an error response
    fn format_error(&self, response: &CommandResponse) -> String {
        let error_msg = response.error.as_deref().unwrap_or("Unknown error");
        match self.format {
            OutputFormat::Human => format!("Error: {}", error_msg),
            OutputFormat::Json => serde_json::to_string(response).unwrap_or_default(),
            OutputFormat::Quiet => error_msg.to_string(),
        }
    }
}

// =============================================================================
// Specialized Formatters
// =============================================================================

/// Format snapshot data for human-readable output
pub fn format_snapshot(data: &SnapshotData) -> String {
    let mut output = String::new();
    output.push_str(&format!(
        "Found {} interactive elements:\n\n",
        data.refs.len()
    ));

    for ref_info in &data.refs {
        output.push_str(&format!("[{}] {} ", ref_info.r#ref, ref_info.tag));
        if let Some(text) = &ref_info.text {
            let truncated = if text.len() > 50 {
                format!("{}...", &text[..50])
            } else {
                text.clone()
            };
            output.push_str(&format!("\"{}\"", truncated));
        }
        output.push('\n');
    }

    output
}

/// Format tab list for human-readable output
pub fn format_tab_list(data: &TabListData) -> String {
    let mut output = String::new();
    output.push_str("Open tabs:\n\n");

    for tab in &data.tabs {
        let marker = if tab.id == data.active_tab_id {
            "* "
        } else {
            "  "
        };
        output.push_str(&format!("{}[{}] {}\n", marker, tab.id, tab.title));
        output.push_str(&format!("      {}\n", tab.url));
    }

    output
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::RefInfo;
    use serde_json::json;

    #[test]
    fn output_formatter_new_stores_format() {
        let formatter = OutputFormatter::new(OutputFormat::Json);
        assert!(matches!(formatter.format, OutputFormat::Json));
    }

    #[test]
    fn format_success_human_with_data() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({"result": "test"})),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert!(output.contains("result"));
        assert!(output.contains("test"));
    }

    #[test]
    fn format_success_human_without_data() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: None,
            error: None,
        };

        let output = formatter.format_success(&response);
        assert_eq!(output, "Success");
    }

    #[test]
    fn format_success_json() {
        let formatter = OutputFormatter::new(OutputFormat::Json);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({"result": "test"})),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert!(output.contains("\"success\":true"));
        assert!(output.contains("\"id\":\"cmd-1\""));
    }

    #[test]
    fn format_success_quiet_returns_empty() {
        let formatter = OutputFormatter::new(OutputFormat::Quiet);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({"result": "test"})),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert_eq!(output, "");
    }

    #[test]
    fn format_error_human() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: false,
            data: None,
            error: Some("Something went wrong".to_string()),
        };

        let output = formatter.format_error(&response);
        assert_eq!(output, "Error: Something went wrong");
    }

    #[test]
    fn format_error_json() {
        let formatter = OutputFormatter::new(OutputFormat::Json);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: false,
            data: None,
            error: Some("Something went wrong".to_string()),
        };

        let output = formatter.format_error(&response);
        assert!(output.contains("\"success\":false"));
        assert!(output.contains("Something went wrong"));
    }

    #[test]
    fn format_error_quiet() {
        let formatter = OutputFormatter::new(OutputFormat::Quiet);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: false,
            data: None,
            error: Some("Something went wrong".to_string()),
        };

        let output = formatter.format_error(&response);
        assert_eq!(output, "Something went wrong");
    }

    #[test]
    fn format_snapshot_displays_refs() {
        let data = SnapshotData {
            html: "<html></html>".to_string(),
            refs: vec![
                RefInfo {
                    r#ref: "1".to_string(),
                    tag: "button".to_string(),
                    text: Some("Click me".to_string()),
                },
                RefInfo {
                    r#ref: "2".to_string(),
                    tag: "a".to_string(),
                    text: Some("Link text".to_string()),
                },
            ],
        };

        let output = format_snapshot(&data);
        assert!(output.contains("Found 2 interactive elements"));
        assert!(output.contains("[1] button"));
        assert!(output.contains("Click me"));
        assert!(output.contains("[2] a"));
        assert!(output.contains("Link text"));
    }

    #[test]
    fn format_snapshot_truncates_long_text() {
        let data = SnapshotData {
            html: "<html></html>".to_string(),
            refs: vec![RefInfo {
                r#ref: "1".to_string(),
                tag: "button".to_string(),
                text: Some("a".repeat(60)),
            }],
        };

        let output = format_snapshot(&data);
        assert!(output.contains("..."));
    }

    #[test]
    fn format_tab_list_displays_tabs() {
        let data = TabListData {
            tabs: vec![
                crate::types::TabInfo {
                    id: 1,
                    url: "https://example.com".to_string(),
                    title: "Example".to_string(),
                },
                crate::types::TabInfo {
                    id: 2,
                    url: "https://test.com".to_string(),
                    title: "Test".to_string(),
                },
            ],
            active_tab_id: 1,
        };

        let output = format_tab_list(&data);
        assert!(output.contains("Open tabs"));
        assert!(output.contains("* [1] Example"));
        assert!(output.contains("  [2] Test"));
        assert!(output.contains("https://example.com"));
        assert!(output.contains("https://test.com"));
    }

    #[test]
    fn print_json_serializes_data() {
        let data = json!({"test": "value"});
        let result = print_json(&data);
        assert!(result.is_ok());
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Print a success message to stdout
pub fn print_success(message: &str) {
    println!("{}", message);
}

/// Print an error message to stderr
pub fn print_error(message: &str) {
    eprintln!("{}", message);
}

/// Print JSON data to stdout
pub fn print_json<T: serde::Serialize>(data: &T) -> Result<()> {
    let json = serde_json::to_string_pretty(data)?;
    println!("{}", json);
    Ok(())
}
