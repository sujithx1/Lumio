//! Two real desktop cores talking through a real relay server.
//! Runs only when SYNQ_TEST_SERVER_URL is set (see `make test-e2e`).

use std::sync::Arc;
use std::time::Duration;
use synq_desktop_lib::core::api::{ApiClient, DeviceInfo};
use synq_desktop_lib::core::engine::{ConnectionState, CoreEvent, Engine};
use synq_desktop_lib::core::identity::{Identity, KeyStore, MemoryStore};
use synq_desktop_lib::core::relay;
use tokio::sync::mpsc::UnboundedReceiver;

struct Client {
    engine: Arc<Engine>,
    events: UnboundedReceiver<CoreEvent>,
}

impl Client {
    fn start(base: &str, name: &str) -> Self {
        let identity = Arc::new(Identity::load_or_create(&MemoryStore::default() as &dyn KeyStore).unwrap());
        let api = Arc::new(ApiClient::new(
            base,
            identity.clone(),
            DeviceInfo { name: name.into(), platform: "macos".into(), app_version: "0.1.0-test".into() },
        ));
        let (engine, events, outgoing) = Engine::new(api, identity);
        tokio::spawn(relay::run(engine.clone(), outgoing));
        Self { engine, events }
    }

    /// Waits for the first event matching `pick`, discarding others.
    async fn expect<T>(&mut self, what: &str, mut pick: impl FnMut(&CoreEvent) -> Option<T>) -> T {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        loop {
            let event = tokio::time::timeout_at(deadline, self.events.recv())
                .await
                .unwrap_or_else(|_| panic!("timed out waiting for {what}"))
                .expect("event stream closed");
            if let Some(v) = pick(&event) {
                return v;
            }
        }
    }

    async fn online(&mut self) {
        self.expect("online", |e| matches!(e, CoreEvent::Connection { state: ConnectionState::Online, .. }).then_some(()))
            .await;
    }

    fn id(&self) -> String {
        self.engine.me_id().expect("signed in")
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn pair_send_receive_complete_and_unpair() {
    let Ok(base) = std::env::var("SYNQ_TEST_SERVER_URL") else {
        eprintln!("SYNQ_TEST_SERVER_URL not set; skipping");
        return;
    };

    let mut mac = Client::start(&base, "Test Mac");
    let mut pc = Client::start(&base, "Test PC");
    mac.online().await;
    pc.online().await;

    // Pairing: Mac shows a code, PC claims it, Mac sees the same SAS and approves.
    let session = mac.engine.api().create_pairing().await.unwrap();
    let claimed = pc.engine.api().claim_pairing(&session.code).await.unwrap();
    let (pairing_id, sas) = mac
        .expect("pair request", |e| match e {
            CoreEvent::PairRequest { pairing_id, sas, .. } => Some((pairing_id.clone(), sas.clone())),
            _ => None,
        })
        .await;
    assert_eq!(sas, claimed.sas, "both screens must show the same confirmation number");
    mac.engine.api().approve_pairing(&pairing_id).await.unwrap();
    let pc_id = pc.id();
    let mac_id = mac.id();
    mac.expect("peer list with PC", |e| match e {
        CoreEvent::Peers { peers } if peers.iter().any(|p| p.device_id == pc_id && p.online) => Some(()),
        _ => None,
    })
    .await;
    pc.expect("peer list with Mac", |e| match e {
        CoreEvent::Peers { peers } if peers.iter().any(|p| p.device_id == mac_id) => Some(()),
        _ => None,
    })
    .await;

    // Mac -> PC: signed effect, verified and rendered by PC.
    let event_id = mac.engine.send_effect(&pc_id, "aurora", 5000, 0.654, true).unwrap();
    let incoming = pc
        .expect("incoming effect", |e| match e {
            CoreEvent::EffectIncoming { effect } => Some(effect.clone()),
            _ => None,
        })
        .await;
    assert_eq!(incoming.event_id, event_id);
    assert_eq!(incoming.effect_id, "aurora");
    assert_eq!(incoming.from_name, "Test Mac");
    assert_eq!(incoming.intensity, 0.65, "intensity is rounded to two decimals before signing");
    assert!(incoming.sound);

    let wait_delivery = |status: &'static str, id: String| {
        move |e: &CoreEvent| match e {
            CoreEvent::Delivery { event_id, status: s, detail } if *event_id == id && s == status => Some(detail.clone()),
            _ => None,
        }
    };
    mac.expect("relayed", wait_delivery("relayed", event_id.clone())).await;
    mac.expect("received ack", wait_delivery("received", event_id.clone())).await;

    // While PC is showing an effect, a second one is declined as busy.
    let second = mac.engine.send_effect(&pc_id, "rainbow", 3000, 1.0, false).unwrap();
    mac.expect("busy failure", wait_delivery("failed", second.clone())).await;

    // PC finishes; Mac learns the effect completed.
    pc.engine.finish_incoming(&event_id, true);
    mac.expect("completed ack", wait_delivery("completed", event_id.clone())).await;

    // PC -> Mac works the other way too.
    let back = pc.engine.send_effect(&mac_id, "fireworks", 2000, 0.5, false).unwrap();
    let incoming = mac
        .expect("incoming on Mac", |e| match e {
            CoreEvent::EffectIncoming { effect } => Some(effect.clone()),
            _ => None,
        })
        .await;
    assert_eq!(incoming.event_id, back);
    mac.engine.finish_incoming(&back, true);
    pc.expect("completed on PC", wait_delivery("completed", back.clone())).await;

    // Recent effects are recorded on the server.
    let recent = mac.engine.api().recent_effects().await.unwrap();
    assert!(recent.iter().any(|r| r.event_id == event_id && r.status == "completed"));

    // Unpairing reaches the other side and blocks further effects.
    mac.engine.unpair(&pc_id).await.unwrap();
    pc.expect("revoked", |e| match e {
        CoreEvent::PairRevoked { peer_device_id } if *peer_device_id == mac_id => Some(()),
        _ => None,
    })
    .await;
    assert!(mac.engine.send_effect(&pc_id, "aurora", 3000, 0.5, false).is_err());
}
