//! Local preferences for this computer (not synced): where the phone sits, how effects are shown,
//! where received files go and which effect accompanies files sent from here.

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
    /// Folder for received files. `None` means the default, `~/Downloads/Lumio`.
    pub download_dir: Option<String>,
    /// Effect that plays on the other device when this computer sends files.
    pub file_effect: String,
}

pub const DEFAULT_FILE_EFFECT: &str = "cosmic-portal";

impl Default for Settings {
    fn default() -> Self {
        Self {
            send_zone: SendZone::Right,
            display_mode: DisplayMode::Overlay,
            sound: true,
            download_dir: None,
            file_effect: DEFAULT_FILE_EFFECT.into(),
        }
    }
}

impl Settings {
    /// Repairs values that are no longer valid (an effect removed from the catalog, a relative path).
    pub fn normalized(mut self) -> Self {
        if crate::core::catalog::effect(&self.file_effect).is_none() {
            self.file_effect = DEFAULT_FILE_EFFECT.into();
        }
        if self.download_dir.as_deref().is_some_and(|d| d.trim().is_empty() || !std::path::Path::new(d).is_absolute()) {
            self.download_dir = None;
        }
        self
    }

    /// Where received files are saved: the chosen folder, or `<downloads>/Lumio`.
    pub fn resolved_download_dir(&self, downloads: &std::path::Path) -> PathBuf {
        match &self.download_dir {
            Some(d) => PathBuf::from(d),
            None => downloads.join("Lumio"),
        }
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
            .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .unwrap_or_default()
            .normalized();
        Self { path, current: Mutex::new(current) }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    pub fn set(&self, settings: Settings) -> Result<Settings, String> {
        if crate::core::catalog::effect(&settings.file_effect).is_none() {
            return Err("Unknown effect.".into());
        }
        if let Some(dir) = &settings.download_dir {
            if !std::path::Path::new(dir).is_absolute() {
                return Err("Choose a folder for received files.".into());
            }
        }
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
        let changed = Settings {
            send_zone: SendZone::Left,
            display_mode: DisplayMode::Fullscreen,
            sound: false,
            download_dir: Some("/tmp/lumio-received".into()),
            file_effect: "aurora".into(),
        };
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
        assert_eq!(s.file_effect, DEFAULT_FILE_EFFECT);
        assert_eq!(s.download_dir, None);
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(SettingsStore::load(path.clone()).get(), Settings::default());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn files_settings_are_validated() {
        let path = std::env::temp_dir().join(format!("lumio-settings-{}.json", uuid::Uuid::now_v7()));
        std::fs::write(&path, r#"{"fileEffect":"no-such-effect","downloadDir":"relative/dir"}"#).unwrap();
        let s = SettingsStore::load(path.clone()).get();
        assert_eq!(s.file_effect, DEFAULT_FILE_EFFECT);
        assert_eq!(s.download_dir, None);

        let store = SettingsStore::load(path.clone());
        let bad_effect = Settings { file_effect: "nope".into(), ..Settings::default() };
        assert!(store.set(bad_effect).is_err());
        let bad_dir = Settings { download_dir: Some("Downloads".into()), ..Settings::default() };
        assert!(store.set(bad_dir).is_err());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn resolves_the_default_download_folder() {
        let downloads = std::path::Path::new("/Users/me/Downloads");
        assert_eq!(Settings::default().resolved_download_dir(downloads), downloads.join("Lumio"));
        let chosen = Settings { download_dir: Some("/Volumes/Photos".into()), ..Settings::default() };
        assert_eq!(chosen.resolved_download_dir(downloads), PathBuf::from("/Volumes/Photos"));
    }
}
