//! Tauri commands: the only surface the React UI can call into.

use crate::core::api::{DeviceSummary, PairingClaimed, RecentEffect};
use crate::core::engine::{Engine, Peer, Snapshot};
use crate::effects::{EffectLaunch, Effects};
use crate::settings::{DisplayMode, Settings, SettingsStore};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, State, WebviewWindow};

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
#[tauri::command]
pub fn send_effect(state: State<'_, AppState>, request: SendRequest) -> CmdResult<String> {
    state.engine.send_effect(&request.device_id, &request.effect_id, request.duration, request.intensity, request.sound)
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
        },
    )
}

#[tauri::command]
pub fn get_settings(settings: State<'_, SettingsStore>) -> Settings {
    settings.get()
}

#[tauri::command]
pub fn update_settings(settings: State<'_, SettingsStore>, value: Settings) -> CmdResult<Settings> {
    settings.set(value)
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
