//! TAB CLI Library
//!
//! This module exposes the CLI functionality as a library,
//! allowing for programmatic use and testing.

pub mod cli;
pub mod commands;
pub mod config;
pub mod error;
pub mod ipc;
pub mod output;
pub mod session;
pub mod types;

// Re-exports for convenience
pub use cli::{Cli, Commands, OutputFormat};
pub use config::Config;
pub use error::{CliError, Result};
pub use ipc::IpcClient;
pub use output::OutputFormatter;
pub use session::SessionResolver;

// =============================================================================
// Main Entry Point
// =============================================================================

/// Run the CLI with parsed arguments
pub fn run(cli: Cli) -> Result<()> {
    use cli::Commands;
    use cli::TabCommands;

    // Handle ping command separately (doesn't need session)
    if matches!(cli.command, Commands::Ping) {
        let config = config::load_config();
        let client = IpcClient::new(config);
        let is_running = client.ping()?;
        if is_running {
            println!("Daemon is running");
            return Ok(());
        } else {
            return Err(CliError::DaemonNotRunning(
                "Daemon is not responding".to_string(),
            ));
        }
    }

    // 1. Load configuration
    let config = config::load_config();

    // 2. Create IPC client
    let client = IpcClient::new(config);

    // 3. Resolve session
    let session_id = session::resolve_session(cli.session.as_deref());

    // 4. Create command context
    let ctx = commands::CommandContext::new(client, session_id);

    // 5. Match on command and execute
    let response = match cli.command {
        Commands::Navigate(args) => commands::navigate(&ctx, &args.url)?,
        Commands::Snapshot => commands::snapshot(&ctx)?,
        Commands::Click(args) => commands::click(&ctx, &args.r#ref)?,
        Commands::Type(args) => commands::type_text(&ctx, &args.r#ref, &args.text)?,
        Commands::Scroll(args) => {
            let direction = commands::scroll::parse_direction(&args.direction)?;
            commands::scroll(&ctx, direction, args.r#ref.as_deref(), args.amount)?
        }
        Commands::Tab(tab_cmd) => match tab_cmd {
            TabCommands::New(args) => commands::tab_new(&ctx, args.url.as_deref())?,
            TabCommands::Close => commands::tab_close(&ctx)?,
            TabCommands::Switch(args) => commands::tab_switch(&ctx, args.tab_id)?,
            TabCommands::List => commands::tab_list(&ctx)?,
        },
        Commands::Back => commands::back(&ctx)?,
        Commands::Forward => commands::forward(&ctx)?,
        Commands::Eval(args) => commands::eval(&ctx, &args.script)?,
        Commands::Ping => unreachable!(), // Handled above
    };

    // 6. Format and print output
    let output_format = match cli.output {
        cli::OutputFormat::Human => output::OutputFormat::Human,
        cli::OutputFormat::Json => output::OutputFormat::Json,
        cli::OutputFormat::Quiet => output::OutputFormat::Quiet,
    };
    let formatter = OutputFormatter::new(output_format);
    formatter.print_response(&response)?;

    // 7. Return result
    if response.success {
        Ok(())
    } else {
        Err(CliError::CommandFailed(
            response
                .error
                .unwrap_or_else(|| "Unknown error".to_string()),
        ))
    }
}

/// Execute the CLI and handle errors
pub fn execute() -> i32 {
    // 1. Parse CLI arguments
    let cli = cli::parse();

    // 2. Call run()
    match run(cli) {
        Ok(()) => 0,
        Err(e) => {
            // 3. Handle errors, print to stderr
            eprintln!("Error: {}", e);

            // 4. Return appropriate exit code
            e.exit_code()
        }
    }
}
