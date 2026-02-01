pub mod cli;
pub mod commands;
pub mod config;
pub mod daemon;
pub mod error;
pub mod ipc;
pub mod output;
pub mod types;

use crate::types::ScrollDirection;
use cli::{Cli, Commands, TabCommands};
use commands::Execute;
use config::{Config, ENV_PROFILE, ENV_SESSION_NAME};
use error::{CliError, Result};
use ipc::IpcClient;
use output::OutputFormatter;
use std::process::ExitCode;
use std::str::FromStr;

fn main() -> ExitCode {
    let cli = cli::parse();

    match run(cli) {
        Ok(()) => ExitCode::from(0_u8),
        Err(e) => {
            eprintln!("Error: {}", e);
            ExitCode::from(e.exit_code() as u8)
        }
    }
}

pub fn run(cli: Cli) -> Result<()> {
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

    let config = config::load_config();
    let session_id = resolve_session_id(&config, cli.session.as_deref());
    let profile = resolve_profile(cli.profile.as_deref());

    daemon::ensure_daemon_running(&config)?;
    let client = IpcClient::new(config);

    let ctx = commands::CommandContext::new(client, session_id, profile);

    let response = match cli.command {
        Commands::Navigate(args) => commands::NavigateCommand::new(args.url).execute(&ctx)?,
        Commands::Snapshot => commands::SnapshotCommand::default().execute(&ctx)?,
        Commands::Click(args) => commands::ClickCommand::new(args.r#ref).execute(&ctx)?,
        Commands::Type(args) => commands::TypeCommand::new(args.r#ref, args.text).execute(&ctx)?,
        Commands::Scroll(args) => {
            let direction = ScrollDirection::from_str(&args.direction)?;
            commands::ScrollCommand::new(direction, args.r#ref, args.amount).execute(&ctx)?
        }
        Commands::Tab(tab_cmd) => match tab_cmd {
            TabCommands::New(args) => commands::TabNewCommand::new(args.url).execute(&ctx)?,
            TabCommands::Close => commands::TabCloseCommand::default().execute(&ctx)?,
            TabCommands::Switch(args) => {
                commands::TabSwitchCommand::new(args.tab_id).execute(&ctx)?
            }
            TabCommands::List => commands::TabListCommand::default().execute(&ctx)?,
        },
        Commands::Back => commands::BackCommand::default().execute(&ctx)?,
        Commands::Forward => commands::ForwardCommand::default().execute(&ctx)?,
        Commands::Eval(args) => commands::EvalCommand::new(args.script).execute(&ctx)?,
        Commands::Ping => unreachable!(),
    };

    let formatter = OutputFormatter::new(cli.output);
    formatter.print_response(&response)?;
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

fn resolve_session_id(config: &Config, session_id: Option<&str>) -> String {
    if let Some(session) = session_id {
        return session.to_string();
    }

    if let Ok(session) = std::env::var(ENV_SESSION_NAME) {
        return session;
    }

    config.default_session.clone()
}

fn resolve_profile(profile: Option<&str>) -> Option<String> {
    if let Some(profile) = profile {
        return Some(profile.to_string());
    }

    std::env::var(ENV_PROFILE).ok()
}
