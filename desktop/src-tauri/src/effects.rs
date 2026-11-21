//! Effect windows. Each received (or previewed) effect gets its own window, which asks Rust what to
//! render via `effect_launch` and reports back via `effect_finished`.
//!
//! In overlay mode the window is transparent, click-through and covers the whole screen, so the effect
//! plays on top of the desktop while the user keeps working. Full-screen mode is an opaque window.

use crate::core::engine::{Engine, IncomingEffect};
use crate::settings::{DisplayMode, SendZone, Settings};
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
    /// Screen edge the effect enters from (this computer's Send Zone).
    pub edge: SendZone,
    pub overlay: bool,
}

impl EffectLaunch {
    pub fn incoming(e: IncomingEffect, settings: &Settings) -> Self {
        Self {
            event_id: Some(e.event_id),
            effect_id: e.effect_id,
            duration: e.duration,
            intensity: e.intensity,
            sound: e.sound && settings.sound,
            from_name: Some(e.from_name),
            edge: settings.send_zone,
            overlay: settings.display_mode == DisplayMode::Overlay,
        }
    }
}

#[derive(Default)]
pub struct Effects {
    launches: Mutex<HashMap<String, EffectLaunch>>,
    counter: AtomicU64,
}

impl Effects {
    /// Opens a window for an effect, as an overlay or full screen depending on the launch.
    pub fn open(&self, app: &AppHandle, launch: EffectLaunch) -> Result<(), String> {
        let label = format!("{WINDOW_PREFIX}{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let overlay = launch.overlay;
        self.launches.lock().unwrap().insert(label.clone(), launch);
        let result = if overlay { build_overlay(app, &label) } else { build_fullscreen(app, &label) };
        if let Err(e) = result {
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

fn build_fullscreen(app: &AppHandle, label: &str) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Lumio")
        .decorations(false)
        .fullscreen(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()?;
    Ok(())
}

/// A borderless, transparent window covering the monitor the main window is on.
fn build_overlay(app: &AppHandle, label: &str) -> tauri::Result<()> {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Lumio")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .background_color(tauri::window::Color(0, 0, 0, 0));
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let (pos, size) = (m.position(), m.size());
        builder = builder
            .position(pos.x as f64 / scale, pos.y as f64 / scale)
            .inner_size(size.width as f64 / scale, size.height as f64 / scale);
    } else {
        builder = builder.maximized(true);
    }
    let window = builder.build()?;
    // Clicks and scrolling pass straight through to whatever is underneath.
    window.set_ignore_cursor_events(true)?;
    Ok(())
}
