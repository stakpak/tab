//! Session resolution for the TAB CLI
//!
//! Handles resolving which session to use for commands based on:
//! - Explicit --session flag
//! - TAB_SESSION environment variable
//! - Default session name
//!
//! Handles resolving which profile to use based on:
//! - Explicit --profile flag
//! - TAB_PROFILE environment variable
//! - Default (None = system default profile)

use crate::config::{Config, ENV_PROFILE, ENV_SESSION_NAME};
use crate::types::SessionId;

/// Profile directory type (None = default profile)
pub type ProfileDir = Option<String>;

// =============================================================================
// Session Resolver
// =============================================================================

/// Resolves the session ID to use for a command
pub struct SessionResolver {
    config: Config,
}

impl SessionResolver {
    /// Create a new session resolver
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    /// Resolve the session ID to use
    ///
    /// Priority order:
    /// 1. Explicit session name (from --session flag)
    /// 2. TAB_SESSION environment variable
    /// 3. Default session name from config
    pub fn resolve(&self, explicit_session: Option<&str>) -> SessionId {
        // 1. If explicit_session is Some, use it
        if let Some(session) = explicit_session {
            return session.to_string();
        }

        // 2. Else check ENV_SESSION_NAME environment variable
        if let Some(session) = self.session_from_env() {
            return session;
        }

        // 3. Else use config.default_session
        self.config.default_session.clone()
    }

    /// Resolve the profile directory to use
    ///
    /// Priority order:
    /// 1. Explicit profile directory (from --profile flag)
    /// 2. TAB_PROFILE environment variable
    /// 3. Default (None = system default profile)
    pub fn resolve_profile(&self, explicit_profile: Option<&str>) -> ProfileDir {
        // 1. If explicit_profile is Some, use it
        if let Some(profile) = explicit_profile {
            return Some(profile.to_string());
        }

        // 2. Else check ENV_PROFILE environment variable
        self.profile_from_env()
    }

    /// Get session from environment variable only
    pub fn session_from_env(&self) -> Option<SessionId> {
        std::env::var(ENV_SESSION_NAME).ok()
    }

    /// Get profile from environment variable only
    pub fn profile_from_env(&self) -> ProfileDir {
        std::env::var(ENV_PROFILE).ok()
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Resolve session ID using default config
pub fn resolve_session(explicit_session: Option<&str>) -> SessionId {
    let config = crate::config::load_config();
    let resolver = SessionResolver::new(config);
    resolver.resolve(explicit_session)
}

/// Resolve both session and profile using default config
pub fn resolve_session_and_profile(
    explicit_session: Option<&str>,
    explicit_profile: Option<&str>,
) -> (SessionId, ProfileDir) {
    let config = crate::config::load_config();
    let resolver = SessionResolver::new(config);
    let session = resolver.resolve(explicit_session);
    let profile = resolver.resolve_profile(explicit_profile);
    (session, profile)
}

/// Validate a session name
pub fn validate_session_name(name: &str) -> bool {
    const MAX_LENGTH: usize = 64;

    // Must be non-empty
    if name.is_empty() {
        return false;
    }

    // Must not exceed max length
    if name.len() > MAX_LENGTH {
        return false;
    }

    // Must contain only alphanumeric, dash, underscore
    name.chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_SESSION_NAME;
    use std::env;

    #[test]
    fn validate_session_name_accepts_alphanumeric() {
        assert!(validate_session_name("session123"));
        assert!(validate_session_name("Session"));
        assert!(validate_session_name("123"));
    }

    #[test]
    fn validate_session_name_accepts_dashes_and_underscores() {
        assert!(validate_session_name("my-session"));
        assert!(validate_session_name("my_session"));
        assert!(validate_session_name("my-session_1"));
    }

    #[test]
    fn validate_session_name_rejects_empty() {
        assert!(!validate_session_name(""));
    }

    #[test]
    fn validate_session_name_rejects_special_chars() {
        assert!(!validate_session_name("my session"));
        assert!(!validate_session_name("my@session"));
        assert!(!validate_session_name("my.session"));
        assert!(!validate_session_name("my/session"));
    }

    #[test]
    fn validate_session_name_rejects_too_long() {
        let long_name = "a".repeat(65);
        assert!(!validate_session_name(&long_name));
    }

    #[test]
    fn validate_session_name_accepts_max_length() {
        let max_name = "a".repeat(64);
        assert!(validate_session_name(&max_name));
    }

    #[test]
    fn session_resolver_new_stores_config() {
        let config = Config::default();
        let resolver = SessionResolver::new(config.clone());
        assert_eq!(resolver.config.default_session, config.default_session);
    }

    #[test]
    fn session_resolver_resolve_uses_explicit_session() {
        env::remove_var(ENV_SESSION_NAME);
        let config = Config::default();
        let resolver = SessionResolver::new(config);

        let session = resolver.resolve(Some("explicit-session"));
        assert_eq!(session, "explicit-session");
    }

    #[test]
    fn session_resolver_resolve_uses_env_when_no_explicit() {
        env::set_var(ENV_SESSION_NAME, "env-session");
        let config = Config::default();
        let resolver = SessionResolver::new(config);

        let session = resolver.resolve(None);
        assert_eq!(session, "env-session");

        env::remove_var(ENV_SESSION_NAME);
    }

    #[test]
    fn session_resolver_resolve_uses_config_default_when_no_explicit_or_env() {
        env::remove_var(ENV_SESSION_NAME);
        let config = Config {
            default_session: "config-session".to_string(),
            ..Default::default()
        };
        let resolver = SessionResolver::new(config);

        let session = resolver.resolve(None);
        assert_eq!(session, "config-session");
    }

    #[test]
    fn session_resolver_session_from_env_returns_none_when_not_set() {
        env::remove_var(ENV_SESSION_NAME);
        let config = Config::default();
        let resolver = SessionResolver::new(config);

        assert_eq!(resolver.session_from_env(), None);
    }

    #[test]
    fn session_resolver_session_from_env_returns_value_when_set() {
        env::set_var(ENV_SESSION_NAME, "test-session");
        let config = Config::default();
        let resolver = SessionResolver::new(config);

        assert_eq!(
            resolver.session_from_env(),
            Some("test-session".to_string())
        );

        env::remove_var(ENV_SESSION_NAME);
    }

    #[test]
    fn resolve_session_uses_default_config() {
        env::remove_var(ENV_SESSION_NAME);
        let session = resolve_session(None);
        assert_eq!(session, DEFAULT_SESSION_NAME);
    }

    #[test]
    fn resolve_session_prefers_explicit_over_env() {
        env::set_var(ENV_SESSION_NAME, "env-session");
        let session = resolve_session(Some("explicit-session"));
        assert_eq!(session, "explicit-session");
        env::remove_var(ENV_SESSION_NAME);
    }
}
