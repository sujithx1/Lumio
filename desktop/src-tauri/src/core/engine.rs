//! The client state machine: peers, presence, pairing events and effects in both directions.
//!
//! Incoming effects pass, in order: schema validation -> addressed to us -> freshness -> replay ->
//! known paired sender -> Ed25519 signature -> trusted catalog -> not busy. Only then does the UI render.

use super::api::{ApiClient, ApiError, DeviceSummary, PeerRecord};
use super::identity::{verify, Identity};
use super::{catalog, is_fresh, now_ms, ReplayGuard, MESSAGE_TTL_MS};
use crate::protocol::{self, Body, EffectFailureReason, Message};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

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
        peers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
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
        let spec = catalog::effect(effect_id).ok_or("Unknown effect.")?;
        if !self.lock().peers.contains_key(to) {
            return Err("That device is not paired.".into());
        }
        if !self.is_online() {
            return Err("You're offline. Effects can be sent once Synq reconnects.".into());
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
        self.push(msg)?;
        self.emit(CoreEvent::Delivery { event_id: event_id.clone(), status: "sending".into(), detail: None });
        Ok(event_id)
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
        if let Some(effect) = active {
            if completed {
                self.send_ack("EFFECT_COMPLETED", &effect.from_device_id, event_id, None);
            } else {
                self.send_ack("EFFECT_FAILED", &effect.from_device_id, event_id, Some(EffectFailureReason::RenderError));
            }
        }
    }

    // ---------- incoming ----------

    /// Handles one raw frame from the relay (or, later, a LAN peer).
    pub async fn handle_frame(&self, frame: &str) {
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
            Body::Error(e) => {
                let pending = e.ref_id.as_ref().and_then(|id| self.lock().sent.remove(id).map(|_| id.clone()));
                match pending {
                    Some(event_id) => {
                        self.emit(CoreEvent::Delivery { event_id, status: "failed".into(), detail: Some(e.message.clone()) })
                    }
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

fn summary(d: &protocol::DeviceSummary) -> DeviceSummary {
    DeviceSummary {
        device_id: d.device_id.clone(),
        name: d.name.clone(),
        platform: serde_json::to_value(d.platform).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
    }
}
