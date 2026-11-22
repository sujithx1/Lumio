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
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const WINDOW_PREFIX: &str = "effect-";

/// How long the sender's departure animation runs.
pub const DEPARTURE_MS: u32 = 1100;
/// When the departure reaches the Send Zone edge. The effect is sent then, so the receiver's arrival
/// follows the departure instead of racing it.
pub const DEPARTURE_HANDOFF: Duration = Duration::from_millis(650);

/// Whether a window shows an effect arriving on this computer or leaving it for another device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    #[default]
    Arrive,
    Depart,
}

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
    pub phase: Phase,
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
            phase: Phase::Arrive,
        }
    }

    /// The short animation that plays on this computer as it sends `effect_id`, leaving through the
    /// Send Zone edge (towards the phone). Always a click-through overlay, whatever the display mode.
    pub fn departure(effect_id: &str, settings: &Settings) -> Self {
        Self {
            event_id: None,
            effect_id: effect_id.to_string(),
            duration: DEPARTURE_MS,
            intensity: 0.8,
            sound: settings.sound,
            from_name: None,
            edge: settings.send_zone,
            overlay: true,
            phase: Phase::Depart,
        }
    }
}

#[derive(Default)]
pub struct Effects {
    launches: Mutex<HashMap<String, EffectLaunch>>,
    counter: AtomicU64,
    /// When the current departure started; one departure plays at a time.
    departing_since: Mutex<Option<Instant>>,
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

    /// Plays the departure for an effect this computer is sending. Returns false (and plays nothing)
    /// if a departure is already on screen or the window could not be opened; the caller then sends
    /// straight away.
    pub fn depart(&self, app: &AppHandle, effect_id: &str, settings: &Settings) -> bool {
        {
            let mut since = self.departing_since.lock().unwrap();
            let busy = since.is_some_and(|at| at.elapsed() < Duration::from_millis(u64::from(DEPARTURE_MS) + 200));
            if busy {
                return false;
            }
            *since = Some(Instant::now());
        }
        match self.open(app, EffectLaunch::departure(effect_id, settings)) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("{e}");
                *self.departing_since.lock().unwrap() = None;
                false
            }
        }
    }

    pub fn launch(&self, label: &str) -> Option<EffectLaunch> {
        self.launches.lock().unwrap().get(label).cloned()
    }

    /// Records the outcome once per window and acknowledges received effects to their sender.
    pub fn finish(&self, label: &str, engine: &Engine, completed: bool) {
        let launch = self.launches.lock().unwrap().remove(label);
        if launch.as_ref().is_some_and(|l| l.phase == Phase::Depart) {
            *self.departing_since.lock().unwrap() = None;
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn departures_are_click_through_overlays_towards_the_send_zone() {
        let settings = Settings { send_zone: SendZone::Left, display_mode: DisplayMode::Fullscreen, sound: false, ..Settings::default() };
        let d = EffectLaunch::departure("tiny-ronin", &settings);
        assert!(d.overlay, "departures never take over the sender's screen");
        assert_eq!(d.phase, Phase::Depart);
        assert_eq!(d.edge, SendZone::Left);
        assert_eq!(d.duration, DEPARTURE_MS);
        assert!(d.event_id.is_none() && !d.sound);
        assert!(u128::from(DEPARTURE_MS) > DEPARTURE_HANDOFF.as_millis());

        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["phase"], "depart");
        assert_eq!(json["edge"], "left");
    }
}
