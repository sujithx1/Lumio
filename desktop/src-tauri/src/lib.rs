mod commands;
pub mod core;
mod effects;
pub mod protocol;
pub mod settings;

use crate::core::api::{ApiClient, DeviceInfo};
use crate::core::engine::{CoreEvent, Engine};
use crate::core::identity::{FileStore, Identity, KeyStore, KeychainStore};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

pub const EVENT_CHANNEL: &str = "lumio://event";

fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        _ => "linux",
    }
}

/// `LUMIO_PROFILE` lets several instances (each its own device) run on one machine during development.
fn profile() -> String {
    let raw = std::env::var("LUMIO_PROFILE").unwrap_or_else(|_| "default".into());
    let clean: String = raw.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(32).collect();
    if clean.is_empty() { "default".into() } else { clean }
}

fn device_name(profile: &str) -> String {
    let host = gethostname::gethostname().to_string_lossy().trim_end_matches(".local").to_string();
    let base = if host.is_empty() { "This computer".to_string() } else { host };
    let name = if profile == "default" { base } else { format!("{base} ({profile})") };
    name.chars().take(64).collect()
}

/// Uses the OS keychain unless `LUMIO_KEYSTORE=file` (or no keychain is available).
fn open_identity(app: &tauri::App, profile: &str) -> Result<Identity, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(profile);
    let file = FileStore::new(dir.join("identity.key"));
    if std::env::var("LUMIO_KEYSTORE").as_deref() == Ok("file") {
        return Identity::load_or_create(&file);
    }
    let keychain = KeychainStore::new("app.lumio.desktop", &format!("device-identity-{profile}"));
    match keychain.load() {
        Ok(_) => Identity::load_or_create(&keychain),
        Err(e) => {
            log::warn!("{e}; falling back to {}", file.describe());
            Identity::load_or_create(&file)
        }
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .level_for("tungstenite", log::LevelFilter::Warn)
                .level_for("tokio_tungstenite", log::LevelFilter::Warn)
                .build(),
        )
        .manage(effects::Effects::default())
        .setup(|app| {
            let profile = profile();
            let identity = Arc::new(open_identity(app, &profile)?);
            let data_dir = app.path().app_data_dir()?.join(&profile);
            app.manage(settings::SettingsStore::load(data_dir.join("settings.json")));
            let server_url = std::env::var("LUMIO_SERVER_URL").unwrap_or_else(|_| "http://localhost:8787".into());
            let app_version = app.package_info().version.to_string();
            let api = Arc::new(ApiClient::new(
                &server_url,
                identity.clone(),
                DeviceInfo { name: device_name(&profile), platform: platform().into(), app_version: app_version.clone() },
            ));
            let (engine, mut events, outgoing) = Engine::new(api, identity);
            app.manage(commands::AppState::new(engine.clone(), platform(), app_version));
            log::info!("Lumio starting (profile {profile}, server {server_url})");

            tauri::async_runtime::spawn(core::relay::run(engine, outgoing));

            // Forward core events to every window; open a window for each incoming effect.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match &event {
                        CoreEvent::EffectIncoming { effect } => {
                            let fx = handle.state::<effects::Effects>();
                            let prefs = handle.state::<settings::SettingsStore>().get();
                            if let Err(e) = fx.open(&handle, effects::EffectLaunch::incoming(effect.clone(), &prefs)) {
                                log::error!("{e}");
                                handle.state::<commands::AppState>().engine.finish_incoming(&effect.event_id, false);
                            }
                        }
                        CoreEvent::PairRequest { .. } => show_main(&handle),
                        _ => {}
                    }
                    let _ = handle.emit(EVENT_CHANNEL, &event);
                }
            });

            // Tray: Lumio keeps running (and receiving effects) when its window is closed.
            let show = MenuItem::with_id(app, "show", "Open Lumio", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Lumio", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("lumio").tooltip("Lumio").menu(&menu).show_menu_on_left_click(true);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => show_main(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label().to_string();
            match event {
                // Closing the main window hides it; the relay connection stays up in the background.
                WindowEvent::CloseRequested { api, .. } if label == "main" => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                WindowEvent::Destroyed if label.starts_with(effects::WINDOW_PREFIX) => {
                    let app = window.app_handle();
                    app.state::<effects::Effects>().on_destroyed(app, &label);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::refresh_peers,
            commands::rename_device,
            commands::remove_device,
            commands::create_pairing,
            commands::claim_pairing,
            commands::approve_pairing,
            commands::reject_pairing,
            commands::recent_effects,
            commands::send_effect,
            commands::preview_effect,
            commands::effect_launch,
            commands::effect_finished,
            commands::server_status,
            commands::get_settings,
            commands::update_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lumio");

    app.run(|app, event| {
        // macOS: clicking the Dock icon reopens the hidden window.
        if let RunEvent::Reopen { .. } = event {
            show_main(app);
        }
    });
}
