//! Lumio client core: identity, server API, relay connection, effects and file sharing.
//! Independent of Tauri so it can be tested headless (see tests/relay_e2e.rs).

pub mod api;
pub mod catalog;
pub mod engine;
pub mod files;
pub mod identity;
pub mod relay;

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Tolerated clock difference between devices.
pub const MAX_CLOCK_SKEW_MS: u64 = 30_000;
/// Lifetime of messages this client creates.
pub const MESSAGE_TTL_MS: u64 = 30_000;

/// Remembers message ids until they expire, so each is processed at most once.
pub struct ReplayGuard {
    seen: HashMap<String, u64>,
    capacity: usize,
}

impl ReplayGuard {
    pub fn new(capacity: usize) -> Self {
        Self { seen: HashMap::new(), capacity }
    }

    /// True the first time an id is seen.
    pub fn accept(&mut self, id: &str, expires_at: u64, now: u64) -> bool {
        self.seen.retain(|_, until| *until >= now);
        if self.seen.contains_key(id) {
            return false;
        }
        if self.seen.len() >= self.capacity {
            if let Some(oldest) = self.seen.iter().min_by_key(|(_, until)| **until).map(|(k, _)| k.clone()) {
                self.seen.remove(&oldest);
            }
        }
        self.seen.insert(id.to_string(), expires_at + MAX_CLOCK_SKEW_MS);
        true
    }
}

/// Rejects messages that expired or claim to come from the future, allowing for clock skew.
pub fn is_fresh(created_at: u64, expires_at: u64, now: u64) -> bool {
    created_at <= now + MAX_CLOCK_SKEW_MS && expires_at + MAX_CLOCK_SKEW_MS >= now
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replay_guard_accepts_once_and_forgets_after_expiry() {
        let mut g = ReplayGuard::new(10);
        assert!(g.accept("a", 1_000, 0));
        assert!(!g.accept("a", 1_000, 10));
        assert!(g.accept("a", 1_000, 1_000 + MAX_CLOCK_SKEW_MS + 1));
    }

    #[test]
    fn freshness_window() {
        let now = 1_000_000;
        assert!(is_fresh(now, now + 30_000, now));
        assert!(!is_fresh(now + 31_000, now + 60_000, now));
        assert!(!is_fresh(now - 100_000, now - 31_000, now));
    }
}
