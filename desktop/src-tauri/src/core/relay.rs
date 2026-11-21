//! Relay connection: authenticated WebSocket with heartbeats and automatic reconnection.

use super::engine::{ConnectionState, Engine};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as WsMessage;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(45);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

const CLOSE_REPLACED: u16 = 4002;
const CLOSE_REVOKED: u16 = 4003;

enum Outcome {
    /// Connection ended normally or dropped; reconnect soon.
    Dropped(String),
    /// Another client with the same identity connected; back off for longer.
    Replaced,
    /// The device was revoked; stop for good.
    Revoked,
}

fn ws_url(base: &str) -> Result<String, String> {
    let mut url = url::Url::parse(base).map_err(|e| format!("invalid server URL: {e}"))?;
    let scheme = match url.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => return Err(format!("unsupported server URL scheme {other}")),
    };
    url.set_scheme(scheme).map_err(|_| "invalid server URL")?;
    url.set_path("/v1/ws");
    Ok(url.to_string())
}

/// Runs forever (until the device is revoked), keeping one relay connection alive.
pub async fn run(engine: Arc<Engine>, mut outgoing: mpsc::UnboundedReceiver<String>) {
    let mut backoff = Duration::from_secs(1);
    loop {
        engine.set_connection(ConnectionState::Connecting, None);
        let started = Instant::now();
        let outcome = connect_once(&engine, &mut outgoing).await;
        // A connection that stayed up for a while resets the backoff.
        if started.elapsed() > Duration::from_secs(60) {
            backoff = Duration::from_secs(1);
        }
        let wait = match outcome {
            Outcome::Revoked => {
                engine.set_connection(ConnectionState::Revoked, Some("This device was removed from Synq.".into()));
                log::warn!("device revoked; relay stopped");
                return;
            }
            Outcome::Replaced => {
                engine.set_connection(ConnectionState::Offline, Some("Synq is open elsewhere with this identity.".into()));
                MAX_BACKOFF
            }
            Outcome::Dropped(reason) => {
                log::info!("relay disconnected: {reason}");
                engine.set_connection(ConnectionState::Offline, Some(reason));
                backoff
            }
        };
        // Jitter spreads reconnects when a server restarts.
        let jitter = Duration::from_millis(rand::random::<u64>() % 750);
        tokio::time::sleep(wait + jitter).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn connect_once(engine: &Arc<Engine>, outgoing: &mut mpsc::UnboundedReceiver<String>) -> Outcome {
    let session = match engine.api().session().await {
        Ok(s) => s,
        Err(e) if e.is_revoked() => return Outcome::Revoked,
        Err(e) => return Outcome::Dropped(e.message),
    };
    engine.set_me(session.device.clone());

    let url = match ws_url(engine.api().base_url()) {
        Ok(u) => u,
        Err(e) => return Outcome::Dropped(e),
    };
    let ws = match tokio::time::timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async(url.as_str())).await {
        Ok(Ok((ws, _))) => ws,
        Ok(Err(e)) => return Outcome::Dropped(format!("Can't reach the relay ({e}).")),
        Err(_) => return Outcome::Dropped("Connecting to the relay timed out.".into()),
    };
    let (mut sink, mut stream) = ws.split();

    if sink.send(WsMessage::Text(engine.auth_frame(&session.token, &session.device.device_id))).await.is_err() {
        return Outcome::Dropped("Connection lost during sign-in.".into());
    }
    match tokio::time::timeout(AUTH_TIMEOUT, stream.next()).await {
        Ok(Some(Ok(WsMessage::Text(t)))) if t.contains("\"AUTH_OK\"") => {}
        Ok(Some(Ok(WsMessage::Close(frame)))) => {
            let code = frame.map(|f| u16::from(f.code)).unwrap_or(1000);
            return if code == CLOSE_REVOKED { Outcome::Revoked } else { Outcome::Dropped("The relay refused the session.".into()) };
        }
        _ => return Outcome::Dropped("The relay did not accept the session.".into()),
    }

    engine.set_connection(ConnectionState::Online, None);
    // Anything queued while offline is stale (and would likely expire); drop it.
    while outgoing.try_recv().is_ok() {}
    if let Err(e) = engine.refresh_peers().await {
        log::warn!("could not load paired devices: {e}");
    }

    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.tick().await;
    let mut last_frame = Instant::now();

    loop {
        tokio::select! {
            frame = stream.next() => match frame {
                Some(Ok(WsMessage::Text(text))) => {
                    last_frame = Instant::now();
                    engine.handle_frame(&text).await;
                }
                Some(Ok(WsMessage::Close(frame))) => {
                    let code = frame.map(|f| u16::from(f.code)).unwrap_or(1000);
                    return match code {
                        CLOSE_REVOKED => Outcome::Revoked,
                        CLOSE_REPLACED => Outcome::Replaced,
                        _ => Outcome::Dropped("The relay closed the connection.".into()),
                    };
                }
                Some(Ok(_)) => last_frame = Instant::now(),
                Some(Err(e)) => return Outcome::Dropped(format!("Connection lost ({e}).")),
                None => return Outcome::Dropped("Connection lost.".into()),
            },
            out = outgoing.recv() => match out {
                Some(frame) => {
                    if sink.send(WsMessage::Text(frame)).await.is_err() {
                        return Outcome::Dropped("Connection lost while sending.".into());
                    }
                }
                None => return Outcome::Dropped("Shutting down.".into()),
            },
            _ = heartbeat.tick() => {
                if last_frame.elapsed() > HEARTBEAT_TIMEOUT {
                    return Outcome::Dropped("The relay stopped responding.".into());
                }
                if let Some(frame) = engine.heartbeat_frame() {
                    if sink.send(WsMessage::Text(frame)).await.is_err() {
                        return Outcome::Dropped("Connection lost.".into());
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ws_url;

    #[test]
    fn derives_websocket_urls() {
        assert_eq!(ws_url("http://localhost:8787").unwrap(), "ws://localhost:8787/v1/ws");
        assert_eq!(ws_url("https://relay.synq.app/").unwrap(), "wss://relay.synq.app/v1/ws");
        assert!(ws_url("ftp://x").is_err());
    }
}
