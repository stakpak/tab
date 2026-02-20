//! Output formatting for the Vibe CLI
//!
//! Handles formatting command responses for terminal display.
//! Supports both human-readable and JSON output formats.

use crate::error::Result;
use crate::types::{CommandResponse, OutputFormat, SnapshotData, TabListData};

// =============================================================================
// Output Format
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
        } 

        Ok(())
    }

    /// Format a success response
    fn format_success(&self, response: &CommandResponse) -> String {
        match self.format {
            OutputFormat::Human => format_human_success(&response.data),
            OutputFormat::Json => {
                if let Some(data) = &response.data {
                    serde_json::to_string_pretty(data).unwrap_or_default()
                } else {
                    "{}".to_string()
                }
            }
            OutputFormat::Quiet => String::new(),
        }
    }
}

// =============================================================================
// Specialized Formatters
// =============================================================================

/// Normalize a URL by stripping trailing slashes
fn normalize_url(url: &str) -> &str {
    url.trim_end_matches('/')
}

/// Format the data payload as human-readable plain text
fn format_human_success(data: &Option<serde_json::Value>) -> String {
    let Some(data) = data else {
        return "Success".to_string();
    };

    // Try snapshot format: { snapshot, title, url }
    if let Ok(snapshot) = serde_json::from_value::<SnapshotData>(data.clone()) {
        return format_snapshot(&snapshot);
    }

    // Try tab list format: { tabs, active_tab_id }
    if let Ok(tab_list) = serde_json::from_value::<TabListData>(data.clone()) {
        return format_tab_list(&tab_list);
    }

    // Generic: if it's just { "executed": true } or similar simple object, show "Success"
    if let Some(obj) = data.as_object() {
        if obj.len() == 1
            && let Some(val) = obj.get("executed")
            && val.as_bool() == Some(true)
        {
            return "Success".to_string();
        }

        // Otherwise display as key-value pairs
        let mut output = String::new();
        for (key, value) in obj {
            let display_value = match value {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            output.push_str(&format!("{}: {}\n", key, display_value));
        }
        return output.trim_end().to_string();
    }

    // Fallback for non-object data
    match data {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Format snapshot data for human-readable output
pub fn format_snapshot(data: &SnapshotData) -> String {
    let mut output = String::new();
    output.push_str(&format!("Title: {}\n", data.title));
    output.push_str(&format!("URL: {}\n\n", normalize_url(&data.url)));
    output.push_str(&data.snapshot);
    output
}

/// Format tab list for human-readable output
pub fn format_tab_list(data: &TabListData) -> String {
    let mut output = String::new();
    output.push_str("Open tabs:\n");

    for tab in &data.tabs {
        let marker = if tab.active { "* " } else { "  " };
        output.push_str(&format!(
            "{}[{}] {} {} \n",
            marker, tab.id, tab.title, tab.url
        ));
    }

    output
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn output_formatter_new_stores_format() {
        let formatter = OutputFormatter::new(OutputFormat::Json);
        assert!(matches!(formatter.format, OutputFormat::Json));
    }

    #[test]
    fn format_success_human_with_executed_data() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({"executed": true})),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert_eq!(output, "Success");
    }

    #[test]
    fn format_success_human_with_generic_data() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({"result": "test"})),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert!(output.contains("result: test"));
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
        assert!(output.contains("\"result\""));
        assert!(output.contains("\"test\""));
        // Json format outputs only the data, not the full response envelope
        assert!(!output.contains("\"success\""));
    }

    #[test]
    fn format_success_json_without_data() {
        let formatter = OutputFormatter::new(OutputFormat::Json);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: None,
            error: None,
        };

        let output = formatter.format_success(&response);
        assert_eq!(output, "{}");
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
    fn format_snapshot_displays_tree() {
        let data = SnapshotData {
            snapshot: "- RootWebArea \"Example\" [ref=e1]\n  - link \"Home\" [ref=e2]".to_string(),
            title: "Example".to_string(),
            url: "https://example.com/".to_string(),
        };

        let output = format_snapshot(&data);
        assert!(output.contains("Title: Example"));
        assert!(output.contains("URL: https://example.com"));
        assert!(!output.contains("URL: https://example.com/"));
        assert!(output.contains("RootWebArea"));
        assert!(output.contains("link \"Home\""));
    }

    #[test]
    fn format_snapshot_normalizes_url() {
        let data = SnapshotData {
            snapshot: "- RootWebArea".to_string(),
            title: "Test".to_string(),
            url: "https://example.com/path/".to_string(),
        };

        let output = format_snapshot(&data);
        assert!(output.contains("URL: https://example.com/path"));
    }

    #[test]
    fn format_tab_list_displays_tabs() {
        let data = TabListData {
            tabs: vec![
                crate::types::TabInfo {
                    id: 1,
                    url: "https://example.com".to_string(),
                    title: "Example".to_string(),
                    active: true,
                },
                crate::types::TabInfo {
                    id: 2,
                    url: "https://test.com".to_string(),
                    title: "Test".to_string(),
                    active: false,
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
    fn format_human_snapshot_via_formatter() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({
                "snapshot": "- RootWebArea \"Google\" [ref=e1]",
                "title": "Google",
                "url": "https://www.google.com/"
            })),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert!(output.contains("Title: Google"));
        assert!(output.contains("URL: https://www.google.com"));
        assert!(output.contains("RootWebArea"));
    }

    #[test]
    fn format_human_tab_list_via_formatter() {
        let formatter = OutputFormatter::new(OutputFormat::Human);
        let response = CommandResponse {
            id: "cmd-1".to_string(),
            success: true,
            data: Some(json!({
                "activeTabId": 1408441702_i64,
                "tabs": [
                    {"active": false, "id": 1408441701_i64, "title": "Google Images", "url": "https://www.google.com/imghp?hl=en&authuser=0&ogbl"},
                    {"active": true, "id": 1408441702_i64, "title": "Google", "url": "https://www.google.com/"}
                ]
            })),
            error: None,
        };

        let output = formatter.format_success(&response);
        assert!(
            output.contains("Open tabs"),
            "Expected tab list format, got: {}",
            output
        );
        assert!(output.contains("* [1408441702] Google"));
        assert!(output.contains("  [1408441701] Google Images"));
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
