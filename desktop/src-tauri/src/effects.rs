//! Full-screen effect windows. Each received (or previewed) effect gets its own window,
//! which asks Rust what to render via `effect_launch` and reports back via `effect_finished`.

use crate::core::engine::{Engine, IncomingEffect};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const WINDOW_PREFIX: &str = "effect-";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectLaunch {
    /// Present for effects received from another device; absent for local previews.
    pub event_id: Option<String>,
    pub effect_id: String,
    pub duration: u32,
    pub intensity: f64,
    pub sound: bool,
    pub from_name: Option<String>,
}

impl From<IncomingEffect> for EffectLaunch {
    fn from(e: IncomingEffect) -> Self {
        Self {
            event_id: Some(e.event_id),
            effect_id: e.effect_id,
            duration: e.duration,
            intensity: e.intensity,
            sound: e.sound,
            from_name: Some(e.from_name),
        }
    }
}

#[derive(Default)]
pub struct Effects {
    launches: Mutex<HashMap<String, EffectLaunch>>,
    counter: AtomicU64,
}

impl Effects {
    /// Opens a full-screen, always-on-top window for an effect.
    pub fn open(&self, app: &AppHandle, launch: EffectLaunch) -> Result<(), String> {
        let label = format!("{WINDOW_PREFIX}{}", self.counter.fetch_add(1, Ordering::Relaxed));
        self.launches.lock().unwrap().insert(label.clone(), launch);
        let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
            .title("Synq")
            .decorations(false)
            .fullscreen(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(true)
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .build();
        if let Err(e) = built {
            self.launches.lock().unwrap().remove(&label);
            return Err(format!("could not open the effect window: {e}"));
        }
        Ok(())
    }

    pub fn launch(&self, label: &str) -> Option<EffectLaunch> {
        self.launches.lock().unwrap().get(label).cloned()
    }

    /// Records the outcome once per window and acknowledges received effects to their sender.
    pub fn finish(&self, label: &str, engine: &Engine, completed: bool) {
        let launch = self.launches.lock().unwrap().remove(label);
        if let Some(event_id) = launch.and_then(|l| l.event_id) {
            engine.finish_incoming(&event_id, completed);
        }
    }

    /// A window that was closed some other way (Cmd+W, crash) still counts as finished.
    pub fn on_destroyed(&self, app: &AppHandle, label: &str) {
        if let Some(state) = app.try_state::<crate::commands::AppState>() {
            self.finish(label, &state.engine, true);
        }
    }
}
