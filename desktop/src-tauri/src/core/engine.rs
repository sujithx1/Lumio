//! The client state machine: peers, presence, pairing events and effects in both directions.
//!
//! Incoming effects pass, in order: schema validation -> addressed to us -> freshness -> replay ->
//! known paired sender -> Ed25519 signature -> trusted catalog -> not busy. Only then does the UI render.
//!
//! Files: the sender uploads to the relay, then signs a FILE_OFFER. The receiver applies the same
//! checks as for effects, plays the offer's effect (at most one per burst of files), downloads the
//! bytes and saves them only if their size and SHA-256 match the signed offer.

use super::api::{ApiClient, ApiError, DeviceSummary, PeerRecord};
use super::files::{self, SaveError};
use super::identity::{verify, Identity};
use super::{catalog, is_fresh, now_ms, ReplayGuard, MESSAGE_TTL_MS};
use crate::protocol::{self, Body, EffectFailureReason, FileFailureReason, FileOfferPayload, Message};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::sync::mpsc;

/// A burst of files plays one effect: no new file effect within this window of the last one.
pub const FILE_EFFECT_COOLDOWN_MS: u64 = 8_000;
const FILE_EFFECT_DURATION_MS: u32 = 6_000;
const FILE_EFFECT_INTENSITY: f64 = 0.8;
/// Transfers remembered for the UI's list.
const TRANSFER_HISTORY: usize = 100;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionState {
    Connecting,
    Online,
    Offline,
    Revoked,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub device_id: String,
    pub name: String,
    pub platform: String,
    #[serde(skip)]
    pub public_key: String,
    pub online: bool,
    pub last_seen_at: Option<u64>,
    pub paired_at: u64,
}

impl From<PeerRecord> for Peer {
    fn from(r: PeerRecord) -> Self {
        Self {
            device_id: r.device_id,
            name: r.name,
            platform: r.platform,
            public_key: r.public_key,
            online: r.online,
            last_seen_at: r.last_seen_at,
            paired_at: r.paired_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingEffect {
    pub event_id: String,
    pub from_device_id: String,
    pub from_name: String,
    pub effect_id: String,
    pub duration: u32,
    pub intensity: f64,
    pub sound: bool,
    /// False for effects that accompany a file: they have no effect event to acknowledge.
    #[serde(skip)]
    pub acknowledge: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferDirection {
    Send,
    Receive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Queued,
    Preparing,
    Uploading,
    Offered,
    Delivered,
    Downloading,
    Saved,
    Failed,
}

/// One file going to or coming from a paired device, as the UI shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    /// Stable local id for the UI.
    pub key: String,
    /// The relay's id once known.
    pub transfer_id: Option<String>,
    pub direction: TransferDirection,
    pub peer_device_id: String,
    pub peer_name: String,
    pub name: String,
    pub size: u64,
    pub bytes: u64,
    pub status: TransferStatus,
    pub detail: Option<String>,
    /// Where a received file was saved.
    pub path: Option<String>,
    pub started_at: u64,
}

/// Everything the UI needs to know about, as it happens.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CoreEvent {
    Connection { state: ConnectionState, detail: Option<String> },
    Me { device: DeviceSummary },
    Peers { peers: Vec<Peer> },
    Presence { device_id: String, online: bool, last_seen_at: Option<u64> },
    PairRequest { pairing_id: String, claimant: DeviceSummary, sas: String },
    PairApproved { peer: DeviceSummary },
    PairRejected { pairing_id: String },
    PairRevoked { peer_device_id: String },
    EffectIncoming { effect: IncomingEffect },
    EffectRejected { from_name: String, reason: String },
    Delivery { event_id: String, status: String, detail: Option<String> },
    Transfer { transfer: Transfer },
    Error { message: String },
}

struct State {
    me: Option<DeviceSummary>,
    connection: ConnectionState,
    connection_detail: Option<String>,
    peers: HashMap<String, Peer>,
    replay: ReplayGuard,
    /// Outgoing effects awaiting acknowledgement: event id -> receiver id.
    sent: HashMap<String, String>,
    /// The incoming effect currently on screen.
    active: Option<IncomingEffect>,
    /// Folder received files are saved to.
    download_dir: PathBuf,
    /// When the last file effect started, so a burst of files plays one effect.
    last_file_effect: Option<u64>,
    /// Transfers by local key, oldest first.
    transfers: Vec<Transfer>,
    /// Outgoing offers awaiting FILE_RECEIVED / FILE_FAILED: relay transfer id -> (local key, receiver).
    offered: HashMap<String, (String, String)>,
    /// FILE_OFFER message id -> relay transfer id, to match server ERRORs.
    offer_ids: HashMap<String, String>,
    /// Incoming transfers being downloaded (a re-sent offer must not start a second download).
    receiving: HashSet<String>,
}

pub struct Engine {
    api: Arc<ApiClient>,
    identity: Arc<Identity>,
    events: mpsc::UnboundedSender<CoreEvent>,
    outgoing: mpsc::UnboundedSender<String>,
    state: Mutex<State>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub me: Option<DeviceSummary>,
    pub connection: ConnectionState,
    pub connection_detail: Option<String>,
    pub peers: Vec<Peer>,
    pub server_url: String,
}

impl Engine {
    /// Returns the engine, the UI event stream, and the outgoing frame queue the relay drains.
    pub fn new(
        api: Arc<ApiClient>,
        identity: Arc<Identity>,
    ) -> (Arc<Self>, mpsc::UnboundedReceiver<CoreEvent>, mpsc::UnboundedReceiver<String>) {
        let (events, events_rx) = mpsc::unbounded_channel();
        let (outgoing, outgoing_rx) = mpsc::unbounded_channel();
        let engine = Arc::new(Self {
            api,
            identity,
            events,
            outgoing,
            state: Mutex::new(State {
                me: None,
                connection: ConnectionState::Connecting,
                connection_detail: None,
                peers: HashMap::new(),
                replay: ReplayGuard::new(10_000),
                sent: HashMap::new(),
                active: None,
                download_dir: std::env::temp_dir().join("Lumio"),
                last_file_effect: None,
                transfers: Vec::new(),
                offered: HashMap::new(),
                offer_ids: HashMap::new(),
                receiving: HashSet::new(),
            }),
        });
        (engine, events_rx, outgoing_rx)
    }

    pub fn api(&self) -> &ApiClient {
        &self.api
    }

    fn emit(&self, event: CoreEvent) {
        let _ = self.events.send(event);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn snapshot(&self) -> Snapshot {
        let s = self.lock();
        let mut peers: Vec<Peer> = s.peers.values().cloned().collect();
        peers.sort_by_key(|p| p.name.to_lowercase());
        Snapshot {
            me: s.me.clone(),
            connection: s.connection,
            connection_detail: s.connection_detail.clone(),
            peers,
            server_url: self.api.base_url().to_string(),
        }
    }

    pub fn me_id(&self) -> Option<String> {
        self.lock().me.as_ref().map(|m| m.device_id.clone())
    }

    pub fn is_online(&self) -> bool {
        self.lock().connection == ConnectionState::Online
    }

    pub(crate) fn set_me(&self, me: DeviceSummary) {
        let changed = {
            let mut s = self.lock();
            let changed = s.me.as_ref() != Some(&me);
            s.me = Some(me.clone());
            changed
        };
        if changed {
            self.emit(CoreEvent::Me { device: me });
        }
    }

    pub(crate) fn set_connection(&self, state: ConnectionState, detail: Option<String>) {
        {
            let mut s = self.lock();
            if s.connection == state && s.connection_detail == detail {
                return;
            }
            s.connection = state;
            s.connection_detail = detail.clone();
            if state != ConnectionState::Online {
                // Presence is unknown while we are not connected.
                for p in s.peers.values_mut() {
                    p.online = false;
                }
            }
        }
        self.emit(CoreEvent::Connection { state, detail });
    }

    /// Reloads paired devices from the server.
    pub async fn refresh_peers(&self) -> Result<Vec<Peer>, ApiError> {
        let records = self.api.devices().await?;
        let peers: Vec<Peer> = records.into_iter().map(Peer::from).collect();
        {
            let mut s = self.lock();
            s.peers = peers.iter().map(|p| (p.device_id.clone(), p.clone())).collect();
        }
        let snapshot = self.snapshot().peers;
        self.emit(CoreEvent::Peers { peers: snapshot.clone() });
        Ok(snapshot)
    }

    pub async fn rename(&self, name: &str) -> Result<DeviceSummary, ApiError> {
        let me = self.api.rename(name).await?;
        self.set_me(me.clone());
        Ok(me)
    }

    pub async fn unpair(&self, device_id: &str) -> Result<(), ApiError> {
        self.api.unpair(device_id).await?;
        self.lock().peers.remove(device_id);
        self.emit(CoreEvent::Peers { peers: self.snapshot().peers });
        Ok(())
    }

    // ---------- outgoing ----------

    fn envelope(&self, kind: &str, to: &str, payload: Value) -> Result<Value, String> {
        let from = self.me_id().ok_or("Not signed in yet.")?;
        let now = now_ms();
        Ok(json!({
            "v": protocol::PROTOCOL_VERSION,
            "id": uuid::Uuid::now_v7().to_string(),
            "type": kind,
            "from": from,
            "to": to,
            "createdAt": now,
            "expiresAt": now + MESSAGE_TTL_MS,
            "payload": payload,
        }))
    }

    fn sign(&self, mut message: Value) -> Value {
        let sig = self.identity.sign(&protocol::signing_input(&message));
        message["sig"] = Value::String(sig);
        message
    }

    fn push(&self, frame: Value) -> Result<(), String> {
        self.outgoing.send(frame.to_string()).map_err(|_| "The connection is shutting down.".to_string())
    }

    pub(crate) fn auth_frame(&self, token: &str, device_id: &str) -> String {
        let now = now_ms();
        json!({
            "v": 1, "id": uuid::Uuid::now_v7().to_string(), "type": "AUTH", "from": device_id, "to": "server",
            "createdAt": now, "expiresAt": now + MESSAGE_TTL_MS, "payload": { "token": token },
        })
        .to_string()
    }

    pub(crate) fn heartbeat_frame(&self) -> Option<String> {
        self.envelope("HEARTBEAT", "server", json!({})).ok().map(|v| v.to_string())
    }

    /// Signs and sends an effect to a paired device. Returns the event id.
    pub fn send_effect(&self, to: &str, effect_id: &str, duration: u32, intensity: f64, sound: bool) -> Result<String, String> {
        let (event_id, message) = self.prepare_effect(to, effect_id, duration, intensity, sound)?;
        self.push(message)?;
        Ok(event_id)
    }

    /// Sends a message built by `prepare_effect`, possibly a moment later (after the departure
    /// animation). A failure is reported as a `failed` delivery.
    pub fn dispatch_effect(&self, event_id: &str, message: Value) {
        if let Err(e) = self.push(message) {
            self.lock().sent.remove(event_id);
            self.emit(CoreEvent::Delivery { event_id: event_id.to_string(), status: "failed".into(), detail: Some(e) });
        }
    }

    /// Validates and signs an effect for a paired device without sending it yet. Returns the event id
    /// and the signed message; the UI is told it is `sending`.
    pub fn prepare_effect(&self, to: &str, effect_id: &str, duration: u32, intensity: f64, sound: bool) -> Result<(String, Value), String> {
        let spec = catalog::effect(effect_id).ok_or("Unknown effect.")?;
        if !self.lock().peers.contains_key(to) {
            return Err("That device is not paired.".into());
        }
        if !self.is_online() {
            return Err("You're offline. Effects can be sent once Lumio reconnects.".into());
        }
        let intensity = (intensity.clamp(0.0, 1.0) * 100.0).round() / 100.0;
        let duration = catalog::clamp_duration(spec, duration);
        let msg = self.sign(self.envelope(
            "EFFECT_TRIGGER",
            to,
            json!({ "effectId": effect_id, "duration": duration, "intensity": intensity, "sound": sound }),
        )?);
        let event_id = msg["id"].as_str().unwrap_or_default().to_string();
        self.lock().sent.insert(event_id.clone(), to.to_string());
        self.emit(CoreEvent::Delivery { event_id: event_id.clone(), status: "sending".into(), detail: None });
        Ok((event_id, msg))
    }

    fn send_ack(&self, kind: &str, to: &str, event_id: &str, reason: Option<EffectFailureReason>) {
        let mut payload = json!({ "eventId": event_id });
        if let Some(r) = reason {
            payload["reason"] = serde_json::to_value(r).unwrap_or(Value::Null);
        }
        match self.envelope(kind, to, payload) {
            Ok(m) => {
                if let Err(e) = self.push(self.sign(m)) {
                    log::warn!("could not send {kind}: {e}");
                }
            }
            Err(e) => log::warn!("could not build {kind}: {e}"),
        }
    }

    /// Called when the effect window closes. Acknowledges completion (or failure) to the sender.
    pub fn finish_incoming(&self, event_id: &str, completed: bool) {
        let active = {
            let mut s = self.lock();
            match &s.active {
                Some(a) if a.event_id == event_id => s.active.take(),
                _ => None,
            }
        };
        if let Some(effect) = active.filter(|a| a.acknowledge) {
            if completed {
                self.send_ack("EFFECT_COMPLETED", &effect.from_device_id, event_id, None);
            } else {
                self.send_ack("EFFECT_FAILED", &effect.from_device_id, event_id, Some(EffectFailureReason::RenderError));
            }
        }
    }

    // ---------- incoming ----------

    /// Handles one raw frame from the relay (or, later, a LAN peer).
    pub async fn handle_frame(self: &Arc<Self>, frame: &str) {
        let message = match protocol::parse_message(frame) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("dropped invalid frame: {e}");
                return;
            }
        };
        match &message.body {
            Body::Auth(_) | Body::AuthOk(_) | Body::Heartbeat => {}
            Body::DevicePairRequest(p) => self.emit(CoreEvent::PairRequest {
                pairing_id: p.pairing_id.clone(),
                claimant: summary(&p.claimant),
                sas: p.sas.clone(),
            }),
            Body::DevicePairApproved(p) => {
                self.emit(CoreEvent::PairApproved { peer: summary(&p.peer) });
                if let Err(e) = self.refresh_peers().await {
                    log::warn!("refresh after pairing failed: {e}");
                }
            }
            Body::DevicePairRejected(p) => self.emit(CoreEvent::PairRejected { pairing_id: p.pairing_id.clone() }),
            Body::DevicePairRevoked(p) => {
                self.lock().peers.remove(&p.peer_device_id);
                self.emit(CoreEvent::PairRevoked { peer_device_id: p.peer_device_id.clone() });
                self.emit(CoreEvent::Peers { peers: self.snapshot().peers });
            }
            Body::DeviceOnline(p) => self.update_presence(&p.device_id, true, None).await,
            Body::DeviceOffline(p) => self.update_presence(&p.device_id, false, Some(p.last_seen_at)).await,
            Body::EffectTrigger(_) => self.handle_trigger(&message, frame).await,
            Body::EffectReceived(r) => self.handle_ack(&message, frame, &r.event_id, "received"),
            Body::EffectCompleted(r) => self.handle_ack(&message, frame, &r.event_id, "completed"),
            Body::EffectFailed(f) => {
                let reason = serde_json::to_value(f.reason).ok().and_then(|v| v.as_str().map(String::from));
                self.handle_ack_with(&message, frame, &f.event_id, "failed", reason)
            }
            Body::EffectStatus(st) => {
                let status = serde_json::to_value(st.status).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
                if self.lock().sent.contains_key(&st.event_id) {
                    self.emit(CoreEvent::Delivery { event_id: st.event_id.clone(), status, detail: None });
                }
            }
            Body::FileOffer(_) => self.handle_file_offer(&message, frame).await,
            Body::FileReceived(r) => self.handle_file_result(&message, frame, &r.transfer_id, None),
            Body::FileFailed(f) => self.handle_file_result(&message, frame, &f.transfer_id, Some(f.reason)),
            Body::Error(e) => {
                let ref_id = e.ref_id.clone().unwrap_or_default();
                let pending = self.lock().sent.remove(&ref_id).map(|_| ref_id.clone());
                if let Some(event_id) = pending {
                    self.emit(CoreEvent::Delivery { event_id, status: "failed".into(), detail: Some(e.message.clone()) });
                    return;
                }
                let offer = {
                    let mut s = self.lock();
                    s.offer_ids.remove(&ref_id).and_then(|tid| s.offered.remove(&tid))
                };
                match offer {
                    Some((key, _)) => self.update_transfer(&key, |t| {
                        t.status = TransferStatus::Failed;
                        t.detail = Some(friendly_relay_error(&e.message));
                    }),
                    None => self.emit(CoreEvent::Error { message: e.message.clone() }),
                }
            }
        }
    }

    async fn update_presence(&self, device_id: &str, online: bool, last_seen_at: Option<u64>) {
        let known = {
            let mut s = self.lock();
            match s.peers.get_mut(device_id) {
                Some(p) => {
                    p.online = online;
                    if last_seen_at.is_some() {
                        p.last_seen_at = last_seen_at;
                    }
                    true
                }
                None => false,
            }
        };
        if known {
            self.emit(CoreEvent::Presence { device_id: device_id.into(), online, last_seen_at });
        } else if let Err(e) = self.refresh_peers().await {
            log::warn!("refresh after presence change failed: {e}");
        }
    }

    fn verified_peer(&self, message: &Message, frame: &str) -> Option<Peer> {
        let peer = self.lock().peers.get(&message.from).cloned()?;
        let value: Value = serde_json::from_str(frame).ok()?;
        let sig = message.sig.as_deref()?;
        verify(&peer.public_key, &protocol::signing_input(&value), sig).then_some(peer)
    }

    async fn handle_trigger(&self, message: &Message, frame: &str) {
        let Body::EffectTrigger(payload) = &message.body else { return };
        let Some(me) = self.me_id() else { return };
        if message.to != me {
            return;
        }
        let now = now_ms();
        let reject = |name: &str, reason: EffectFailureReason, ack: bool| {
            let label = serde_json::to_value(reason).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
            log::warn!("rejected effect {} from {}: {label}", message.id, message.from);
            self.emit(CoreEvent::EffectRejected { from_name: name.to_string(), reason: label });
            if ack {
                self.send_ack("EFFECT_FAILED", &message.from, &message.id, Some(reason));
            }
        };

        if !is_fresh(message.created_at, message.expires_at, now) {
            return reject("A device", EffectFailureReason::Expired, true);
        }
        if !self.lock().replay.accept(&message.id, message.expires_at, now) {
            return; // Duplicate delivery (e.g. LAN and relay both delivered it): already handled.
        }
        if !self.lock().peers.contains_key(&message.from) {
            // Maybe paired moments ago; refresh once before deciding.
            let _ = self.refresh_peers().await;
        }
        let Some(peer) = self.verified_peer(message, frame) else {
            let known = self.lock().peers.contains_key(&message.from);
            return reject(
                "Unknown device",
                if known { EffectFailureReason::InvalidSignature } else { EffectFailureReason::NotPaired },
                known,
            );
        };
        let Some(spec) = catalog::effect(&payload.effect_id) else {
            return reject(&peer.name, EffectFailureReason::UnknownEffect, true);
        };

        let effect = IncomingEffect {
            event_id: message.id.clone(),
            from_device_id: peer.device_id.clone(),
            from_name: peer.name.clone(),
            effect_id: spec.id.clone(),
            duration: catalog::clamp_duration(spec, payload.duration),
            intensity: payload.intensity,
            sound: payload.sound,
            acknowledge: true,
        };
        {
            let mut s = self.lock();
            if s.active.is_some() {
                drop(s);
                return reject(&peer.name, EffectFailureReason::Busy, true);
            }
            s.active = Some(effect.clone());
        }
        self.send_ack("EFFECT_RECEIVED", &peer.device_id, &message.id, None);
        self.emit(CoreEvent::EffectIncoming { effect });
    }

    fn handle_ack(&self, message: &Message, frame: &str, event_id: &str, status: &str) {
        self.handle_ack_with(message, frame, event_id, status, None)
    }

    fn handle_ack_with(&self, message: &Message, frame: &str, event_id: &str, status: &str, detail: Option<String>) {
        let expected_receiver = self.lock().sent.get(event_id).cloned();
        if expected_receiver.as_deref() != Some(message.from.as_str()) || self.verified_peer(message, frame).is_none() {
            log::warn!("ignored {status} ack for unknown or unverifiable event {event_id}");
            return;
        }
        if status != "received" {
            self.lock().sent.remove(event_id);
        }
        self.emit(CoreEvent::Delivery { event_id: event_id.into(), status: status.into(), detail });
    }
}

// ---------- files ----------

impl Engine {
    pub fn set_download_dir(&self, dir: PathBuf) {
        self.lock().download_dir = dir;
    }

    pub fn download_dir(&self) -> PathBuf {
        self.lock().download_dir.clone()
    }

    /// Recent transfers, newest first.
    pub fn transfers(&self) -> Vec<Transfer> {
        self.lock().transfers.iter().rev().cloned().collect()
    }

    fn add_transfer(&self, t: Transfer) {
        {
            let mut s = self.lock();
            s.transfers.push(t.clone());
            let excess = s.transfers.len().saturating_sub(TRANSFER_HISTORY);
            s.transfers.drain(..excess);
        }
        self.emit(CoreEvent::Transfer { transfer: t });
    }

    fn update_transfer(&self, key: &str, change: impl FnOnce(&mut Transfer)) {
        let updated = {
            let mut s = self.lock();
            s.transfers.iter_mut().find(|t| t.key == key).map(|t| {
                change(t);
                t.clone()
            })
        };
        if let Some(t) = updated {
            self.emit(CoreEvent::Transfer { transfer: t });
        }
    }

    fn fail_transfer(&self, key: &str, detail: impl Into<String>) {
        let detail = detail.into();
        self.update_transfer(key, |t| {
            t.status = TransferStatus::Failed;
            t.detail = Some(detail);
        });
    }

    /// Queues files for a paired, online device. They are hashed, uploaded and offered one at a time;
    /// progress arrives as `Transfer` events. Returns the local keys.
    pub fn send_files(self: &Arc<Self>, to: &str, paths: Vec<PathBuf>, effect_id: &str) -> Result<Vec<String>, String> {
        let effect_id = catalog::effect(effect_id).map(|e| e.id.clone()).ok_or("Unknown effect.")?;
        let peer = self.lock().peers.get(to).cloned().ok_or("That device is not paired.")?;
        if !self.is_online() {
            return Err("You're offline. Files can be sent once Lumio reconnects.".into());
        }
        if !peer.online {
            return Err(format!("{} is offline right now.", peer.name));
        }
        let mut files = Vec::new();
        for path in paths {
            let meta = std::fs::metadata(&path).map_err(|_| format!("Can't read {}.", path.display()))?;
            if meta.is_dir() {
                return Err(format!("{} is a folder. Choose files instead, or zip it first.", files::offer_name(&path)));
            }
            if !meta.is_file() {
                return Err(format!("{} is not a regular file.", files::offer_name(&path)));
            }
            files.push((path, meta.len()));
        }
        if files.is_empty() {
            return Err("No files to send.".into());
        }

        let mut queue = Vec::new();
        for (path, size) in files {
            let key = uuid::Uuid::now_v7().to_string();
            self.add_transfer(Transfer {
                key: key.clone(),
                transfer_id: None,
                direction: TransferDirection::Send,
                peer_device_id: peer.device_id.clone(),
                peer_name: peer.name.clone(),
                name: files::offer_name(&path),
                size,
                bytes: 0,
                status: TransferStatus::Queued,
                detail: None,
                path: None,
                started_at: now_ms(),
            });
            queue.push((key, path));
        }
        let keys = queue.iter().map(|(k, _)| k.clone()).collect();
        let engine = self.clone();
        let to = to.to_string();
        tokio::spawn(async move {
            for (key, path) in queue {
                if let Err(e) = engine.send_one(&key, &to, &path, &effect_id).await {
                    engine.fail_transfer(&key, e);
                }
            }
        });
        Ok(keys)
    }

    async fn send_one(self: &Arc<Self>, key: &str, to: &str, path: &Path, effect_id: &str) -> Result<(), String> {
        self.update_transfer(key, |t| t.status = TransferStatus::Preparing);
        let name = files::offer_name(path);
        let mime = files::guess_mime(path);
        let (sha256, size) = files::hash_file(path).await.map_err(|e| format!("Can't read the file ({e})."))?;
        self.update_transfer(key, |t| t.size = size);

        let created = self.api.create_transfer(to, &name, size, mime, &sha256).await.map_err(|e| {
            if e.status == 413 { "Too large to send through this relay.".to_string() } else { e.message }
        })?;
        self.update_transfer(key, |t| {
            t.transfer_id = Some(created.transfer_id.clone());
            t.status = TransferStatus::Uploading;
        });

        let body = self.upload_body(key, path).await.map_err(|e| format!("Can't read the file ({e})."))?;
        if let Err(e) = self.api.upload_transfer(&created.transfer_id, size, body).await {
            let _ = self.api.cancel_transfer(&created.transfer_id).await;
            return Err(if e.status == 400 { "The file changed while it was being sent.".into() } else { e.message });
        }

        let offer = self.sign(self.envelope(
            "FILE_OFFER",
            to,
            json!({ "transferId": created.transfer_id, "name": name, "size": size, "mime": mime, "sha256": sha256, "effectId": effect_id }),
        )?);
        let offer_id = offer["id"].as_str().unwrap_or_default().to_string();
        {
            let mut s = self.lock();
            s.offered.insert(created.transfer_id.clone(), (key.to_string(), to.to_string()));
            s.offer_ids.insert(offer_id, created.transfer_id.clone());
        }
        self.push(offer)?;
        self.update_transfer(key, |t| {
            t.bytes = size;
            t.status = TransferStatus::Offered;
        });
        Ok(())
    }

    /// A streaming request body that reports upload progress.
    async fn upload_body(self: &Arc<Self>, key: &str, path: &Path) -> std::io::Result<reqwest::Body> {
        let file = tokio::fs::File::open(path).await?;
        let engine = self.clone();
        let key = key.to_string();
        let state = (file, 0u64, Instant::now(), false);
        let stream = futures_util::stream::unfold(state, move |(mut file, sent, mut last, done)| {
            let engine = engine.clone();
            let key = key.clone();
            async move {
                if done {
                    return None;
                }
                let mut buf = vec![0u8; files::CHUNK];
                match file.read(&mut buf).await {
                    Ok(0) => None,
                    Ok(n) => {
                        buf.truncate(n);
                        let sent = sent + n as u64;
                        if last.elapsed() >= PROGRESS_INTERVAL {
                            last = Instant::now();
                            engine.update_transfer(&key, |t| t.bytes = sent);
                        }
                        Some((Ok::<_, std::io::Error>(bytes::Bytes::from(buf)), (file, sent, last, false)))
                    }
                    Err(e) => Some((Err(e), (file, sent, last, true))),
                }
            }
        });
        Ok(reqwest::Body::wrap_stream(stream))
    }

    /// FILE_RECEIVED / FILE_FAILED from the device we offered a file to.
    fn handle_file_result(&self, message: &Message, frame: &str, transfer_id: &str, failure: Option<FileFailureReason>) {
        let expected = self.lock().offered.get(transfer_id).cloned();
        let Some((key, receiver)) = expected else {
            log::warn!("ignored result for unknown transfer {transfer_id}");
            return;
        };
        if receiver != message.from || self.verified_peer(message, frame).is_none() {
            log::warn!("ignored unverifiable result for transfer {transfer_id}");
            return;
        }
        {
            let mut s = self.lock();
            s.offered.remove(transfer_id);
            s.offer_ids.retain(|_, tid| tid != transfer_id);
        }
        match failure {
            None => self.update_transfer(&key, |t| {
                t.status = TransferStatus::Delivered;
                t.detail = None;
            }),
            Some(reason) => self.fail_transfer(&key, failure_text(reason)),
        }
    }

    fn send_file_result(&self, to: &str, transfer_id: &str, reason: Option<FileFailureReason>) {
        let (kind, payload) = match reason {
            None => ("FILE_RECEIVED", json!({ "transferId": transfer_id })),
            Some(r) => ("FILE_FAILED", json!({ "transferId": transfer_id, "reason": r })),
        };
        match self.envelope(kind, to, payload) {
            Ok(m) => {
                if let Err(e) = self.push(self.sign(m)) {
                    log::warn!("could not send {kind}: {e}");
                }
            }
            Err(e) => log::warn!("could not build {kind}: {e}"),
        }
    }

    async fn handle_file_offer(self: &Arc<Self>, message: &Message, frame: &str) {
        let Body::FileOffer(offer) = &message.body else { return };
        let Some(me) = self.me_id() else { return };
        if message.to != me {
            return;
        }
        let now = now_ms();
        if !is_fresh(message.created_at, message.expires_at, now) {
            log::warn!("rejected stale file offer {}", message.id);
            return self.send_file_result(&message.from, &offer.transfer_id, Some(FileFailureReason::Expired));
        }
        if !self.lock().replay.accept(&message.id, message.expires_at, now) {
            return;
        }
        if !self.lock().peers.contains_key(&message.from) {
            let _ = self.refresh_peers().await;
        }
        let Some(peer) = self.verified_peer(message, frame) else {
            let known = self.lock().peers.contains_key(&message.from);
            log::warn!("rejected file offer {} from {}: {}", message.id, message.from, if known { "bad signature" } else { "not paired" });
            if known {
                self.send_file_result(&message.from, &offer.transfer_id, Some(FileFailureReason::InvalidSignature));
            }
            return;
        };
        if !self.lock().receiving.insert(offer.transfer_id.clone()) {
            return; // Already downloading this transfer.
        }

        self.maybe_play_file_effect(message, offer, &peer, now);

        let key = uuid::Uuid::now_v7().to_string();
        self.add_transfer(Transfer {
            key: key.clone(),
            transfer_id: Some(offer.transfer_id.clone()),
            direction: TransferDirection::Receive,
            peer_device_id: peer.device_id.clone(),
            peer_name: peer.name.clone(),
            name: offer.name.clone(),
            size: offer.size,
            bytes: 0,
            status: TransferStatus::Downloading,
            detail: None,
            path: None,
            started_at: now,
        });
        let engine = self.clone();
        let offer = offer.clone();
        let from = peer.device_id.clone();
        tokio::spawn(async move {
            let outcome = engine.receive(&key, &offer).await;
            engine.lock().receiving.remove(&offer.transfer_id);
            match outcome {
                Ok(path) => {
                    engine.send_file_result(&from, &offer.transfer_id, None);
                    engine.update_transfer(&key, |t| {
                        t.bytes = t.size;
                        t.status = TransferStatus::Saved;
                        t.path = Some(path.to_string_lossy().into_owned());
                    });
                }
                Err((reason, detail)) => {
                    log::warn!("could not receive {}: {detail}", offer.transfer_id);
                    engine.send_file_result(&from, &offer.transfer_id, Some(reason));
                    engine.fail_transfer(&key, detail);
                }
            }
        });
    }

    /// Plays the offer's effect unless one is on screen or a file effect started moments ago.
    fn maybe_play_file_effect(&self, message: &Message, offer: &FileOfferPayload, peer: &Peer, now: u64) {
        let Some(spec) = catalog::effect(&offer.effect_id) else { return };
        let effect = IncomingEffect {
            event_id: message.id.clone(),
            from_device_id: peer.device_id.clone(),
            from_name: peer.name.clone(),
            effect_id: spec.id.clone(),
            duration: catalog::clamp_duration(spec, FILE_EFFECT_DURATION_MS),
            intensity: FILE_EFFECT_INTENSITY,
            sound: true,
            acknowledge: false,
        };
        {
            let mut s = self.lock();
            let recent = s.last_file_effect.is_some_and(|at| now.saturating_sub(at) < FILE_EFFECT_COOLDOWN_MS);
            if s.active.is_some() || recent {
                return;
            }
            s.active = Some(effect.clone());
            s.last_file_effect = Some(now);
        }
        self.emit(CoreEvent::EffectIncoming { effect });
    }

    async fn receive(self: &Arc<Self>, key: &str, offer: &FileOfferPayload) -> Result<PathBuf, (FileFailureReason, String)> {
        let res = self.api.download_transfer(&offer.transfer_id).await.map_err(|e| {
            let reason = if matches!(e.status, 404 | 410) { FileFailureReason::Expired } else { FileFailureReason::DownloadFailed };
            (reason, e.message)
        })?;
        let dir = self.download_dir();
        let mut last = Instant::now();
        let engine = self.clone();
        let key_owned = key.to_string();
        files::save_verified(res.bytes_stream(), &dir, &offer.transfer_id, &offer.name, offer.size, &offer.sha256, move |n| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                engine.update_transfer(&key_owned, |t| t.bytes = n);
            }
        })
        .await
        .map_err(|e| match e {
            SaveError::Mismatch => (FileFailureReason::ChecksumMismatch, "The file arrived damaged, so it was not saved.".into()),
            SaveError::Network(m) => (FileFailureReason::DownloadFailed, format!("The download was interrupted ({m}).")),
            SaveError::Storage(m) => (FileFailureReason::StorageError, format!("Couldn't save to {} ({m}).", dir.display())),
        })
    }
}

fn failure_text(reason: FileFailureReason) -> &'static str {
    match reason {
        FileFailureReason::ChecksumMismatch => "The file arrived damaged on the other device.",
        FileFailureReason::DownloadFailed => "The other device couldn't download it.",
        FileFailureReason::StorageError => "The other device couldn't save it.",
        FileFailureReason::TooLarge => "Too large for the other device.",
        FileFailureReason::InvalidSignature | FileFailureReason::NotPaired => "The other device didn't trust this file.",
        FileFailureReason::Expired => "It took too long and expired.",
        FileFailureReason::Unsupported => "The other device can't receive files.",
    }
}

fn friendly_relay_error(message: &str) -> String {
    match message {
        "receiver is offline" => "The other device went offline.".into(),
        other => other.to_string(),
    }
}

fn summary(d: &protocol::DeviceSummary) -> DeviceSummary {
    DeviceSummary {
        device_id: d.device_id.clone(),
        name: d.name.clone(),
        platform: serde_json::to_value(d.platform).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
    }
}
