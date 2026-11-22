//! Tauri commands: the only surface the React UI can call into.

use crate::core::api::{DeviceSummary, PairingClaimed, RecentEffect};
use crate::core::engine::{Engine, Peer, Snapshot, Transfer};
use crate::effects::{EffectLaunch, Effects};
use crate::settings::{DisplayMode, Settings, SettingsStore};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    pub engine: Arc<Engine>,
    pub http: reqwest::Client,
    pub platform: &'static str,
    pub app_version: String,
}

impl AppState {
    pub fn new(engine: Arc<Engine>, platform: &'static str, app_version: String) -> Self {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(3)).build().expect("HTTP client");
        Self { engine, http, platform, app_version }
    }
}

type CmdResult<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    #[serde(flatten)]
    core: Snapshot,
    platform: &'static str,
    app_version: String,
    device_name: String,
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> AppSnapshot {
    AppSnapshot {
        core: state.engine.snapshot(),
        platform: state.platform,
        app_version: state.app_version.clone(),
        device_name: state.engine.api().device_info().name.clone(),
    }
}

#[tauri::command]
pub async fn refresh_peers(state: State<'_, AppState>) -> CmdResult<Vec<Peer>> {
    state.engine.refresh_peers().await.map_err(|e| e.message)
}

#[tauri::command]
pub async fn rename_device(state: State<'_, AppState>, name: String) -> CmdResult<DeviceSummary> {
    state.engine.rename(name.trim()).await.map_err(|e| e.message)
}

#[tauri::command]
pub async fn remove_device(state: State<'_, AppState>, device_id: String) -> CmdResult<()> {
    state.engine.unpair(&device_id).await.map_err(|e| e.message)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrMatrix {
    size: usize,
    /// Row-major, "1" = dark module.
    modules: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingSession {
    pairing_id: String,
    code: String,
    expires_at: u64,
    uri: String,
    qr: QrMatrix,
}

/// Starts pairing: returns a one-time code and the QR matrix encoding `lumio://pair?...`.
#[tauri::command]
pub async fn create_pairing(state: State<'_, AppState>) -> CmdResult<PairingSession> {
    let created = state.engine.api().create_pairing().await.map_err(|e| e.message)?;
    let mut uri = url::Url::parse("lumio://pair").map_err(|e| e.to_string())?;
    uri.query_pairs_mut().append_pair("code", &created.code).append_pair("server", state.engine.api().base_url());
    let qr = qrcode::QrCode::with_error_correction_level(uri.as_str(), qrcode::EcLevel::M).map_err(|e| e.to_string())?;
    let size = qr.width();
    let modules = qr.to_colors().iter().map(|c| if *c == qrcode::Color::Dark { '1' } else { '0' }).collect();
    Ok(PairingSession {
        pairing_id: created.pairing_id,
        code: created.code,
        expires_at: created.expires_at,
        uri: uri.to_string(),
        qr: QrMatrix { size, modules },
    })
}

#[tauri::command]
pub async fn claim_pairing(state: State<'_, AppState>, code: String) -> CmdResult<PairingClaimed> {
    state.engine.api().claim_pairing(code.trim()).await.map_err(|e| e.message)
}

#[tauri::command]
pub async fn approve_pairing(state: State<'_, AppState>, pairing_id: String) -> CmdResult<()> {
    state.engine.api().approve_pairing(&pairing_id).await.map_err(|e| e.message)?;
    Ok(())
}

#[tauri::command]
pub async fn reject_pairing(state: State<'_, AppState>, pairing_id: String) -> CmdResult<()> {
    state.engine.api().reject_pairing(&pairing_id).await.map_err(|e| e.message)
}

#[tauri::command]
pub async fn recent_effects(state: State<'_, AppState>) -> CmdResult<Vec<RecentEffect>> {
    state.engine.api().recent_effects().await.map_err(|e| e.message)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequest {
    device_id: String,
    effect_id: String,
    duration: u32,
    intensity: f64,
    sound: bool,
}

/// Signs and sends an effect. Delivery progress arrives as `delivery` events.
///
/// The effect first leaves this screen (a short departure through the Send Zone edge); the signed
/// trigger goes out as the departure reaches the edge, so the receiver's arrival follows it.
#[tauri::command]
pub fn send_effect(
    app: AppHandle,
    state: State<'_, AppState>,
    effects: State<'_, Effects>,
    settings: State<'_, SettingsStore>,
    request: SendRequest,
) -> CmdResult<String> {
    let (event_id, message) =
        state.engine.prepare_effect(&request.device_id, &request.effect_id, request.duration, request.intensity, request.sound)?;
    if effects.depart(&app, &request.effect_id, &settings.get()) {
        let engine = state.engine.clone();
        let id = event_id.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(crate::effects::DEPARTURE_HANDOFF).await;
            engine.dispatch_effect(&id, message);
        });
    } else {
        state.engine.dispatch_effect(&event_id, message);
    }
    Ok(event_id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    effect_id: String,
    duration: u32,
    intensity: f64,
    sound: bool,
}

/// Plays an effect locally, without the network, using this computer's display settings.
#[tauri::command]
pub fn preview_effect(
    app: AppHandle,
    effects: State<'_, Effects>,
    settings: State<'_, SettingsStore>,
    request: PreviewRequest,
) -> CmdResult<()> {
    let spec = crate::core::catalog::effect(&request.effect_id).ok_or("Unknown effect.")?;
    let s = settings.get();
    effects.open(
        &app,
        EffectLaunch {
            event_id: None,
            effect_id: spec.id.clone(),
            duration: crate::core::catalog::clamp_duration(spec, request.duration),
            intensity: request.intensity.clamp(0.0, 1.0),
            sound: request.sound && s.sound,
            from_name: None,
            edge: s.send_zone,
            overlay: s.display_mode == DisplayMode::Overlay,
            phase: crate::effects::Phase::Arrive,
        },
    )
}

#[tauri::command]
pub fn get_settings(settings: State<'_, SettingsStore>) -> Settings {
    settings.get()
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    state: State<'_, AppState>,
    value: Settings,
) -> CmdResult<Settings> {
    let saved = settings.set(value)?;
    state.engine.set_download_dir(saved.resolved_download_dir(&downloads_dir(&app)));
    Ok(saved)
}

/// The user's Downloads folder (falls back to ~/Downloads).
pub fn downloads_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .download_dir()
        .or_else(|_| app.path().home_dir().map(|h| h.join("Downloads")))
        .unwrap_or_else(|_| std::env::temp_dir())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesInfo {
    /// Where received files are saved right now.
    download_dir: String,
    /// The folder used when none is chosen.
    default_download_dir: String,
}

#[tauri::command]
pub fn files_info(app: AppHandle, state: State<'_, AppState>) -> FilesInfo {
    FilesInfo {
        download_dir: state.engine.download_dir().to_string_lossy().into_owned(),
        default_download_dir: downloads_dir(&app).join("Lumio").to_string_lossy().into_owned(),
    }
}

/// Lets the user pick the folder for received files. Returns the saved settings, or None if cancelled.
#[tauri::command]
pub async fn choose_download_dir(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    state: State<'_, AppState>,
) -> CmdResult<Option<Settings>> {
    let current = state.engine.download_dir();
    let start = if current.exists() { current } else { downloads_dir(&app) };
    let picked = app.dialog().file().set_title("Save received files to").set_directory(start).blocking_pick_folder();
    let Some(folder) = picked else { return Ok(None) };
    let folder = folder.into_path().map_err(|e| e.to_string())?;
    let value = Settings { download_dir: Some(folder.to_string_lossy().into_owned()), ..settings.get() };
    update_settings(app.clone(), settings, state, value).map(Some)
}

/// Shows a received file (or the download folder) in Finder / Explorer.
/// Only paths Lumio saved, or the download folder itself, can be revealed.
#[tauri::command]
pub fn reveal_file(app: AppHandle, state: State<'_, AppState>, path: Option<String>) -> CmdResult<()> {
    let dir = state.engine.download_dir();
    let target = match path {
        None => {
            std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
            dir
        }
        Some(p) => {
            let known = state.engine.transfers().iter().any(|t| t.path.as_deref() == Some(p.as_str()));
            if !known {
                return Err("That file isn't one Lumio received.".into());
            }
            PathBuf::from(p)
        }
    };
    if !target.exists() {
        return Err("The file has been moved or deleted.".into());
    }
    app.opener().reveal_item_in_dir(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_transfers(state: State<'_, AppState>) -> Vec<Transfer> {
    state.engine.transfers()
}

/// Sends files (e.g. dropped onto the window) to a paired device with this computer's file effect.
#[tauri::command]
pub fn send_files(
    app: AppHandle,
    state: State<'_, AppState>,
    effects: State<'_, Effects>,
    settings: State<'_, SettingsStore>,
    device_id: String,
    paths: Vec<String>,
) -> CmdResult<Vec<String>> {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).filter(|p| p.is_absolute()).collect();
    let prefs = settings.get();
    let keys = state.engine.send_files(&device_id, paths, &prefs.file_effect)?;
    // One departure per batch; the uploads are not delayed.
    effects.depart(&app, &prefs.file_effect, &prefs);
    Ok(keys)
}

/// Opens a file picker and sends the chosen files. Returns no keys if the user cancelled.
#[tauri::command]
pub async fn choose_and_send_files(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: State<'_, SettingsStore>,
    device_id: String,
) -> CmdResult<Vec<String>> {
    let name = state.engine.snapshot().peers.into_iter().find(|p| p.device_id == device_id).map(|p| p.name);
    let title = name.map(|n| format!("Send files to {n}")).unwrap_or_else(|| "Send files".into());
    let Some(picked) = app.dialog().file().set_title(title).blocking_pick_files() else { return Ok(vec![]) };
    let paths: Vec<PathBuf> = picked.into_iter().filter_map(|p| p.into_path().ok()).collect();
    let prefs = settings.get();
    let keys = state.engine.send_files(&device_id, paths, &prefs.file_effect)?;
    app.state::<Effects>().depart(&app, &prefs.file_effect, &prefs);
    Ok(keys)
}


/// Called by an effect window on load to learn what to render.
#[tauri::command]
pub fn effect_launch(window: WebviewWindow, effects: State<'_, Effects>) -> CmdResult<EffectLaunch> {
    effects.launch(window.label()).ok_or_else(|| "No effect is scheduled for this window.".into())
}

/// Called by an effect window when the animation ends or the user dismisses it.
#[tauri::command]
pub fn effect_finished(
    window: WebviewWindow,
    effects: State<'_, Effects>,
    state: State<'_, AppState>,
    completed: bool,
) -> CmdResult<()> {
    effects.finish(window.label(), &state.engine, completed);
    window.close().map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    url: String,
    reachable: bool,
    healthy: bool,
    server_version: Option<String>,
    protocol_compatible: Option<bool>,
    error: Option<String>,
}

/// Probes the relay's /health endpoint.
#[tauri::command]
pub async fn server_status(state: State<'_, AppState>) -> CmdResult<ServerStatus> {
    #[derive(Deserialize)]
    struct Health {
        status: String,
        db: String,
        version: String,
        protocol: u64,
    }
    let url = state.engine.api().base_url().to_string();
    let down = |error: &str| ServerStatus {
        url: url.clone(),
        reachable: false,
        healthy: false,
        server_version: None,
        protocol_compatible: None,
        error: Some(error.into()),
    };
    let res = match state.http.get(format!("{url}/health")).send().await {
        Ok(r) => r,
        Err(e) => return Ok(down(if e.is_timeout() { "timed out" } else { "connection refused" })),
    };
    let Ok(h) = res.json::<Health>().await else { return Ok(down("unexpected response")) };
    Ok(ServerStatus {
        url: url.clone(),
        reachable: true,
        healthy: h.status == "ok" && h.db == "ok",
        server_version: Some(h.version),
        protocol_compatible: Some(h.protocol == crate::protocol::PROTOCOL_VERSION),
        error: None,
    })
}
