//! Local preferences for this computer (not synced): where the phone sits, how effects are shown.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// The screen edge next to which the user keeps their phone. Effects enter from this side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SendZone {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayMode {
    /// See-through, click-through window over the desktop.
    Overlay,
    /// Opaque full-screen window.
    Fullscreen,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub send_zone: SendZone,
    pub display_mode: DisplayMode,
    /// Play effect sounds on this computer (senders choose per effect; this can mute them all).
    pub sound: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { send_zone: SendZone::Right, display_mode: DisplayMode::Overlay, sound: true }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    /// Loads settings from disk, falling back to defaults when the file is missing or unreadable.
    pub fn load(path: PathBuf) -> Self {
        let current = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self { path, current: Mutex::new(current) }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    pub fn set(&self, settings: Settings) -> Result<Settings, String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        std::fs::write(&self.path, json).map_err(|e| format!("could not save settings: {e}"))?;
        *self.current.lock().unwrap_or_else(|p| p.into_inner()) = settings.clone();
        Ok(settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_then_round_trips_through_disk() {
        let path = std::env::temp_dir().join(format!("lumio-settings-{}.json", uuid::Uuid::now_v7()));
        let store = SettingsStore::load(path.clone());
        assert_eq!(store.get(), Settings::default());
        let changed = Settings { send_zone: SendZone::Left, display_mode: DisplayMode::Fullscreen, sound: false };
        store.set(changed.clone()).unwrap();
        assert_eq!(SettingsStore::load(path.clone()).get(), changed);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn tolerates_partial_or_corrupt_files() {
        let path = std::env::temp_dir().join(format!("lumio-settings-{}.json", uuid::Uuid::now_v7()));
        std::fs::write(&path, r#"{"sendZone":"left"}"#).unwrap();
        let s = SettingsStore::load(path.clone()).get();
        assert_eq!(s.send_zone, SendZone::Left);
        assert_eq!(s.display_mode, DisplayMode::Overlay);
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(SettingsStore::load(path.clone()).get(), Settings::default());
        std::fs::remove_file(path).ok();
    }
}
