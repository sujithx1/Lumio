//! Rust model of `protocol/schemas/message.schema.json`.
//!
//! Hand-maintained; kept in lock-step with the TypeScript and Dart implementations by the shared
//! fixtures in `protocol/fixtures` (see the tests at the bottom of this file).
//! Every message arriving from the network is untrusted: `parse_message` is the only way in.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

pub const PROTOCOL_VERSION: u64 = 1;
pub const MAX_MESSAGE_LIFETIME_MS: u64 = 60_000;
pub const MAX_FRAME_BYTES: usize = 16 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    FrameTooLarge,
    MalformedJson(String),
    InvalidEnvelope(String),
    UnknownType(String),
    InvalidMessage(String),
    InvalidLifetime(i128),
    SelfAddressed,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FrameTooLarge => write!(f, "frame exceeds {MAX_FRAME_BYTES} bytes"),
            Self::MalformedJson(e) => write!(f, "malformed JSON: {e}"),
            Self::InvalidEnvelope(e) => write!(f, "invalid envelope: {e}"),
            Self::UnknownType(t) => write!(f, "unknown message type {t:?}"),
            Self::InvalidMessage(e) => write!(f, "invalid message: {e}"),
            Self::InvalidLifetime(ms) => write!(f, "lifetime must be in (0, {MAX_MESSAGE_LIFETIME_MS}] ms, got {ms}"),
            Self::SelfAddressed => write!(f, "from and to must differ"),
        }
    }
}

impl std::error::Error for ParseError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Macos,
    Windows,
    Linux,
    Android,
    Ios,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceSummary {
    pub device_id: String,
    pub name: String,
    pub platform: Platform,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthPayload {
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthOkPayload {
    pub device_id: String,
    pub server_time: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmptyPayload {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairRequestPayload {
    pub pairing_id: String,
    pub claimant: DeviceSummary,
    pub sas: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairApprovedPayload {
    pub pairing_id: String,
    pub peer: DeviceSummary,
    pub peer_public_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairRejectedPayload {
    pub pairing_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairRevokedPayload {
    pub peer_device_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceOnlinePayload {
    pub device_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceOfflinePayload {
    pub device_id: String,
    pub last_seen_at: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffectPayload {
    pub effect_id: String,
    pub duration: u32,
    pub intensity: f64,
    pub sound: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventRef {
    pub event_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectFailureReason {
    UnknownEffect,
    Expired,
    Duplicate,
    InvalidSignature,
    NotPaired,
    Unsupported,
    Busy,
    RenderError,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffectFailedPayload {
    pub event_id: String,
    pub reason: EffectFailureReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectRelayStatus {
    Relayed,
    ReceiverOffline,
    Notified,
    Expired,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffectStatusPayload {
    pub event_id: String,
    pub status: EffectRelayStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    BadRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    RateLimited,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ErrorPayload {
    pub code: ErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Body {
    Auth(AuthPayload),
    AuthOk(AuthOkPayload),
    Heartbeat,
    DevicePairRequest(PairRequestPayload),
    DevicePairApproved(PairApprovedPayload),
    DevicePairRejected(PairRejectedPayload),
    DevicePairRevoked(PairRevokedPayload),
    DeviceOnline(DeviceOnlinePayload),
    DeviceOffline(DeviceOfflinePayload),
    EffectTrigger(EffectPayload),
    EffectReceived(EventRef),
    EffectCompleted(EventRef),
    EffectFailed(EffectFailedPayload),
    EffectStatus(EffectStatusPayload),
    Error(ErrorPayload),
}

/// A validated protocol message.
#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub id: String,
    pub from: String,
    pub to: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub sig: Option<String>,
    pub body: Body,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawEnvelope {
    v: u64,
    id: String,
    #[serde(rename = "type")]
    kind: String,
    from: String,
    to: String,
    created_at: u64,
    expires_at: u64,
    payload: Value,
    #[serde(default)]
    sig: Option<String>,
}

/// Parses and validates an untrusted raw frame.
pub fn parse_message(frame: &str) -> Result<Message, ParseError> {
    if frame.len() > MAX_FRAME_BYTES {
        return Err(ParseError::FrameTooLarge);
    }
    let value: Value = serde_json::from_str(frame).map_err(|e| ParseError::MalformedJson(e.to_string()))?;
    parse_value(value)
}

/// Validates an already-decoded JSON value. Same rules as `parse_message` minus the size check.
pub fn parse_value(value: Value) -> Result<Message, ParseError> {
    if !value.is_object() {
        return Err(ParseError::InvalidEnvelope("message must be an object".into()));
    }
    if contains_null(&value) {
        return Err(ParseError::InvalidEnvelope("null is not a valid value anywhere in a message".into()));
    }
    let raw: RawEnvelope = serde_json::from_value(value).map_err(|e| ParseError::InvalidEnvelope(e.to_string()))?;

    let env_err = |m: &str| Err(ParseError::InvalidEnvelope(m.to_string()));
    if raw.v != PROTOCOL_VERSION {
        return env_err("unsupported protocol version");
    }
    if !is_uuid(&raw.id) {
        return env_err("id must be a lowercase UUID");
    }
    if !is_address(&raw.from) || !is_address(&raw.to) {
        return env_err("from/to must be a device id or \"server\"");
    }
    if raw.created_at > MAX_SAFE_INTEGER || raw.expires_at > MAX_SAFE_INTEGER {
        return env_err("timestamp out of range");
    }
    if raw.kind.chars().count() > 32 {
        return env_err("type is too long");
    }
    if !raw.payload.is_object() {
        return env_err("payload must be an object");
    }
    if let Some(sig) = &raw.sig {
        if !is_base64url(sig, 86) {
            return env_err("sig must be 86 base64url characters");
        }
    }

    let body = parse_body(&raw)?;

    let lifetime = raw.expires_at as i128 - raw.created_at as i128;
    if lifetime <= 0 || lifetime > MAX_MESSAGE_LIFETIME_MS as i128 {
        return Err(ParseError::InvalidLifetime(lifetime));
    }
    if raw.from == raw.to {
        return Err(ParseError::SelfAddressed);
    }

    Ok(Message {
        id: raw.id,
        from: raw.from,
        to: raw.to,
        created_at: raw.created_at,
        expires_at: raw.expires_at,
        sig: raw.sig,
        body,
    })
}

fn parse_body(raw: &RawEnvelope) -> Result<Body, ParseError> {
    let from_server = raw.from == "server";
    let to_server = raw.to == "server";
    let signed = || -> Result<(), ParseError> {
        if from_server || to_server {
            return invalid("device-to-device messages cannot involve the server");
        }
        if raw.sig.is_none() {
            return invalid("device-to-device messages must be signed");
        }
        Ok(())
    };
    let server_only = || -> Result<(), ParseError> {
        if from_server { Ok(()) } else { invalid("only the server may send this message") }
    };

    let body = match raw.kind.as_str() {
        "AUTH" => {
            if !to_server {
                return invalid("AUTH must be addressed to the server");
            }
            let p: AuthPayload = payload(raw)?;
            check(len_between(&p.token, 16, 4096), "token length")?;
            Body::Auth(p)
        }
        "AUTH_OK" => {
            server_only()?;
            let p: AuthOkPayload = payload(raw)?;
            check(is_uuid(&p.device_id) && p.server_time <= MAX_SAFE_INTEGER, "AUTH_OK payload")?;
            Body::AuthOk(p)
        }
        "HEARTBEAT" => {
            let _: EmptyPayload = payload(raw)?;
            Body::Heartbeat
        }
        "DEVICE_PAIR_REQUEST" => {
            server_only()?;
            let p: PairRequestPayload = payload(raw)?;
            check(is_uuid(&p.pairing_id) && valid_summary(&p.claimant), "pairing ids")?;
            check(p.sas.len() == 6 && p.sas.bytes().all(|b| b.is_ascii_digit()), "sas must be 6 digits")?;
            Body::DevicePairRequest(p)
        }
        "DEVICE_PAIR_APPROVED" => {
            server_only()?;
            let p: PairApprovedPayload = payload(raw)?;
            check(is_uuid(&p.pairing_id) && valid_summary(&p.peer), "pairing ids")?;
            check(is_base64url(&p.peer_public_key, 43), "peerPublicKey")?;
            Body::DevicePairApproved(p)
        }
        "DEVICE_PAIR_REJECTED" => {
            server_only()?;
            let p: PairRejectedPayload = payload(raw)?;
            check(is_uuid(&p.pairing_id), "pairingId")?;
            Body::DevicePairRejected(p)
        }
        "DEVICE_PAIR_REVOKED" => {
            server_only()?;
            let p: PairRevokedPayload = payload(raw)?;
            check(is_uuid(&p.peer_device_id), "peerDeviceId")?;
            Body::DevicePairRevoked(p)
        }
        "DEVICE_ONLINE" => {
            server_only()?;
            let p: DeviceOnlinePayload = payload(raw)?;
            check(is_uuid(&p.device_id), "deviceId")?;
            Body::DeviceOnline(p)
        }
        "DEVICE_OFFLINE" => {
            server_only()?;
            let p: DeviceOfflinePayload = payload(raw)?;
            check(is_uuid(&p.device_id) && p.last_seen_at <= MAX_SAFE_INTEGER, "DEVICE_OFFLINE payload")?;
            Body::DeviceOffline(p)
        }
        "EFFECT_TRIGGER" => {
            signed()?;
            let p: EffectPayload = payload(raw)?;
            check(is_effect_id(&p.effect_id), "effectId")?;
            check((1000..=15000).contains(&p.duration), "duration must be 1000..=15000")?;
            check((0.0..=1.0).contains(&p.intensity), "intensity must be 0..=1")?;
            Body::EffectTrigger(p)
        }
        "EFFECT_RECEIVED" | "EFFECT_COMPLETED" => {
            signed()?;
            let p: EventRef = payload(raw)?;
            check(is_uuid(&p.event_id), "eventId")?;
            if raw.kind == "EFFECT_RECEIVED" { Body::EffectReceived(p) } else { Body::EffectCompleted(p) }
        }
        "EFFECT_FAILED" => {
            signed()?;
            let p: EffectFailedPayload = payload(raw)?;
            check(is_uuid(&p.event_id), "eventId")?;
            Body::EffectFailed(p)
        }
        "EFFECT_STATUS" => {
            server_only()?;
            let p: EffectStatusPayload = payload(raw)?;
            check(is_uuid(&p.event_id), "eventId")?;
            Body::EffectStatus(p)
        }
        "ERROR" => {
            server_only()?;
            let p: ErrorPayload = payload(raw)?;
            check(p.message.chars().count() <= 256, "message too long")?;
            check(p.ref_id.as_deref().is_none_or(is_uuid), "refId")?;
            Body::Error(p)
        }
        other => return Err(ParseError::UnknownType(other.to_string())),
    };
    Ok(body)
}

fn payload<T: DeserializeOwned>(raw: &RawEnvelope) -> Result<T, ParseError> {
    serde_json::from_value(raw.payload.clone()).map_err(|e| ParseError::InvalidMessage(e.to_string()))
}

fn invalid<T>(msg: &str) -> Result<T, ParseError> {
    Err(ParseError::InvalidMessage(msg.to_string()))
}

fn check(ok: bool, what: &str) -> Result<(), ParseError> {
    if ok { Ok(()) } else { invalid(&format!("{what} is invalid")) }
}

fn contains_null(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Array(items) => items.iter().any(contains_null),
        Value::Object(map) => map.values().any(contains_null),
        _ => false,
    }
}

fn valid_summary(d: &DeviceSummary) -> bool {
    is_uuid(&d.device_id) && len_between(&d.name, 1, 64)
}

fn len_between(s: &str, min: usize, max: usize) -> bool {
    let n = s.chars().count();
    n >= min && n <= max
}

pub fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
        })
}

fn is_address(s: &str) -> bool {
    s == "server" || is_uuid(s)
}

fn is_base64url(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn is_effect_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 48
        && s.split('-').all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

/// RFC 8785 (JCS) canonical JSON for the value shapes Lumio uses.
/// Must match `server/src/protocol/canonical.ts` and the Dart implementation byte for byte;
/// `protocol/fixtures/signing/vectors.json` enforces that.
pub fn canonicalize(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&canonical_number(n)),
        Value::String(s) => out.push_str(&serde_json::to_string(s).expect("string serialization cannot fail")),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            // Byte order equals UTF-16 order for every key Lumio uses (ASCII).
            keys.sort();
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).expect("string serialization cannot fail"));
                out.push(':');
                write_canonical(&map[*key], out);
            }
            out.push('}');
        }
    }
}

/// ECMAScript Number#toString semantics for the finite numbers JSON can carry.
fn canonical_number(n: &serde_json::Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    let f = n.as_f64().unwrap_or(0.0);
    if f.fract() == 0.0 && f.abs() < 1e21 {
        return format!("{}", f as i128);
    }
    let abs = f.abs();
    if abs != 0.0 && (abs < 1e-6 || abs >= 1e21) {
        // Rust's shortest exponent form ("1.5e-7") matches JS for these magnitudes.
        format!("{f:e}")
    } else {
        format!("{f}")
    }
}

/// The bytes a sender signs: canonical JSON of the message without `sig`.
pub fn signing_input(message: &Value) -> Vec<u8> {
    let mut copy = message.clone();
    if let Some(obj) = copy.as_object_mut() {
        obj.remove("sig");
    }
    canonicalize(&copy).into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    fn fixtures(kind: &str) -> Vec<(String, Value)> {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../protocol/fixtures").join(kind);
        let mut out: Vec<_> = fs::read_dir(&dir)
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
            .map(|entry| entry.unwrap().path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .map(|p| {
                let doc: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
                (p.file_name().unwrap().to_string_lossy().into_owned(), doc["message"].clone())
            })
            .collect();
        out.sort_by(|a, b| a.0.cmp(&b.0));
        assert!(!out.is_empty(), "no fixtures in {}", dir.display());
        out
    }

    #[test]
    fn accepts_every_valid_fixture() {
        for (name, message) in fixtures("valid") {
            if let Err(e) = parse_message(&message.to_string()) {
                panic!("valid/{name} was rejected: {e}");
            }
        }
    }

    #[test]
    fn rejects_every_invalid_fixture() {
        for (name, message) in fixtures("invalid") {
            assert!(parse_message(&message.to_string()).is_err(), "invalid/{name} was accepted");
        }
    }

    #[test]
    fn rejects_oversized_frames() {
        assert_eq!(parse_message(&" ".repeat(MAX_FRAME_BYTES + 1)), Err(ParseError::FrameTooLarge));
    }

    #[test]
    fn matches_cross_language_signing_vectors() {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
        use ed25519_dalek::{Signer, SigningKey};

        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../protocol/fixtures/signing/vectors.json");
        let doc: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        let seed_hex = doc["seedHex"].as_str().unwrap();
        let seed: Vec<u8> = (0..seed_hex.len()).step_by(2).map(|i| u8::from_str_radix(&seed_hex[i..i + 2], 16).unwrap()).collect();
        let key = SigningKey::from_bytes(&seed.try_into().unwrap());
        assert_eq!(URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes()), doc["publicKey"].as_str().unwrap());

        for case in doc["cases"].as_array().unwrap() {
            let message = &case["message"];
            let input = signing_input(message);
            assert_eq!(String::from_utf8(input.clone()).unwrap(), case["canonical"].as_str().unwrap());
            let sig = URL_SAFE_NO_PAD.encode(key.sign(&input).to_bytes());
            assert_eq!(sig, message["sig"].as_str().unwrap());
            assert!(parse_message(&message.to_string()).is_ok());
        }
    }

    #[test]
    fn canonical_numbers_follow_ecmascript() {
        let v: Value = serde_json::from_str(r#"{"b":1.0,"a":0.35,"c":1e-7,"d":-0.5,"e":12}"#).unwrap();
        assert_eq!(canonicalize(&v), r#"{"a":0.35,"b":1,"c":1e-7,"d":-0.5,"e":12}"#);
    }

    #[test]
    fn parses_effect_trigger_payload() {
        let (_, msg) = fixtures("valid").into_iter().find(|(n, _)| n == "effect-trigger.json").unwrap();
        let parsed = parse_message(&msg.to_string()).unwrap();
        match parsed.body {
            Body::EffectTrigger(p) => {
                assert_eq!(p.effect_id, "cosmic-portal");
                assert_eq!(p.duration, 6000);
                assert!(p.sound);
            }
            other => panic!("unexpected body {other:?}"),
        }
    }
}
