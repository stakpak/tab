#!/usr/bin/env rust
//! Tab CLI - Control a real browser from the command line
//!
//! This is the main entry point for the tab CLI binary.
//!
//! Usage:
//!   tab navigate https://example.com
//!   tab snapshot
//!   tab click @ref123
//!   tab type @ref456 "Hello world"
//!   tab tab list
//!   tab --help

use std::process::ExitCode;

fn main() -> ExitCode {
    // Execute the CLI and get the exit code
    let code = tab::execute();

    // Convert to ExitCode
    ExitCode::from(code as u8)
}
