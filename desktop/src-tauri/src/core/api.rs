//! HTTP client for the Lumio server: challenge/response login and the REST API.

use super::identity::Identity;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub platform: String,
    pub app_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSummary {
    pub device_id: String,
    pub name: String,
    pub platform: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub token: String,
    pub expires_at: u64,
    pub device: DeviceSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerRecord {
    pub device_id: String,
    pub name: String,
    pub platform: String,
    pub public_key: String,
    pub online: bool,
    pub last_seen_at: Option<u64>,
    pub paired_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCreated {
    pub pairing_id: String,
    pub code: String,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingClaimed {
    pub pairing_id: String,
    pub sas: String,
    pub initiator: DeviceSummary,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEffect {
    pub event_id: String,
    pub direction: String,
    pub peer_device_id: String,
    pub peer_name: String,
    pub effect_id: String,
    pub status: String,
    pub route: String,
    pub at: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub status: u16,
    pub code: String,
    pub message: String,
}

impl ApiError {
    fn network(e: reqwest::Error) -> Self {
        let message = if e.is_timeout() { "The Lumio server did not respond in time." } else { "Can't reach the Lumio server." };
        Self { status: 0, code: "network".into(), message: message.into() }
    }

    pub fn is_revoked(&self) -> bool {
        self.status == 403 && self.code == "forbidden"
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ApiError {}

/// Refresh the session this long before it expires.
const SESSION_REFRESH_MARGIN_MS: u64 = 60_000;

pub struct ApiClient {
    base: String,
    http: reqwest::Client,
    identity: Arc<Identity>,
    device: DeviceInfo,
    session: Mutex<Option<Session>>,
}

impl ApiClient {
    pub fn new(base_url: &str, identity: Arc<Identity>, device: DeviceInfo) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("failed to build HTTP client");
        Self { base: base_url.trim_end_matches('/').to_string(), http, identity, device, session: Mutex::new(None) }
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }

    pub fn device_info(&self) -> &DeviceInfo {
        &self.device
    }

    async fn decode<T: DeserializeOwned>(res: reqwest::Response) -> Result<T, ApiError> {
        let status = res.status().as_u16();
        let text = res.text().await.map_err(ApiError::network)?;
        if (200..300).contains(&status) {
            let value: Value = if text.is_empty() { Value::Null } else { serde_json::from_str(&text).unwrap_or(Value::Null) };
            return serde_json::from_value(value).map_err(|e| ApiError {
                status,
                code: "bad_response".into(),
                message: format!("Unexpected response from the server: {e}"),
            });
        }
        let err: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        Err(ApiError {
            status,
            code: err["error"]["code"].as_str().unwrap_or("error").to_string(),
            message: err["error"]["message"].as_str().unwrap_or("The server returned an error.").to_string(),
        })
    }

    async fn post_json<T: DeserializeOwned>(&self, path: &str, body: &Value) -> Result<T, ApiError> {
        let res = self.http.post(format!("{}{path}", self.base)).json(body).send().await.map_err(ApiError::network)?;
        Self::decode(res).await
    }

    /// Proves possession of the device key and obtains a session (registering on first use).
    async fn login(&self) -> Result<Session, ApiError> {
        #[derive(Deserialize)]
        struct Challenge {
            nonce: String,
        }
        let pk = self.identity.public_key();
        let challenge: Challenge = self.post_json("/v1/auth/challenge", &json!({ "publicKey": pk })).await?;
        let signature = self.identity.sign(format!("lumio-auth-v1|{}|{pk}", challenge.nonce).as_bytes());
        self.post_json(
            "/v1/auth/token",
            &json!({ "publicKey": pk, "nonce": challenge.nonce, "signature": signature, "device": self.device }),
        )
        .await
    }

    /// A valid session, logging in again when the cached one is missing or about to expire.
    pub async fn session(&self) -> Result<Session, ApiError> {
        let mut guard = self.session.lock().await;
        if let Some(s) = guard.as_ref() {
            if s.expires_at > super::now_ms() + SESSION_REFRESH_MARGIN_MS {
                return Ok(s.clone());
            }
        }
        let fresh = self.login().await?;
        *guard = Some(fresh.clone());
        Ok(fresh)
    }

    async fn invalidate(&self) {
        *self.session.lock().await = None;
    }

    async fn request<T: DeserializeOwned>(&self, method: reqwest::Method, path: &str, body: Option<Value>) -> Result<T, ApiError> {
        for attempt in 0..2 {
            let session = self.session().await?;
            let mut req = self.http.request(method.clone(), format!("{}{path}", self.base)).bearer_auth(&session.token);
            if let Some(b) = &body {
                req = req.json(b);
            }
            let res = req.send().await.map_err(ApiError::network)?;
            if res.status().as_u16() == 401 && attempt == 0 {
                self.invalidate().await;
                continue;
            }
            return Self::decode(res).await;
        }
        unreachable!("request loop always returns")
    }

    pub async fn devices(&self) -> Result<Vec<PeerRecord>, ApiError> {
        #[derive(Deserialize)]
        struct List {
            devices: Vec<PeerRecord>,
        }
        Ok(self.request::<List>(reqwest::Method::GET, "/v1/devices", None).await?.devices)
    }

    pub async fn rename(&self, name: &str) -> Result<DeviceSummary, ApiError> {
        self.request(reqwest::Method::PATCH, "/v1/me", Some(json!({ "name": name }))).await
    }

    pub async fn unpair(&self, device_id: &str) -> Result<(), ApiError> {
        self.request(reqwest::Method::DELETE, &format!("/v1/devices/{device_id}"), None).await
    }

    pub async fn create_pairing(&self) -> Result<PairingCreated, ApiError> {
        self.request(reqwest::Method::POST, "/v1/pairing", None).await
    }

    pub async fn claim_pairing(&self, code: &str) -> Result<PairingClaimed, ApiError> {
        self.request(reqwest::Method::POST, "/v1/pairing/claim", Some(json!({ "code": code }))).await
    }

    pub async fn approve_pairing(&self, pairing_id: &str) -> Result<Value, ApiError> {
        self.request(reqwest::Method::POST, &format!("/v1/pairing/{pairing_id}/approve"), None).await
    }

    pub async fn reject_pairing(&self, pairing_id: &str) -> Result<(), ApiError> {
        self.request(reqwest::Method::POST, &format!("/v1/pairing/{pairing_id}/reject"), None).await
    }

    pub async fn recent_effects(&self) -> Result<Vec<RecentEffect>, ApiError> {
        #[derive(Deserialize)]
        struct List {
            effects: Vec<RecentEffect>,
        }
        Ok(self.request::<List>(reqwest::Method::GET, "/v1/effects/recent", None).await?.effects)
    }
}
