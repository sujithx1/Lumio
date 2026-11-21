# Synq architecture

Synq lets paired computers and phones trigger visual effects on each other, over the local network or through an internet relay. This document records the system shape and the decisions behind it.

## Components

```
┌────────────────────────┐        WSS (relay)        ┌────────────────────────┐
│ Desktop (Tauri 2)      │ ◀───────────────────────▶ │ Server (Bun + Hono)     │
│  React UI  ──invoke──▶ │                           │  REST + WebSocket       │
│  Rust core             │                           │  PostgreSQL (Drizzle)   │
│   · relay client       │        WSS (relay)        │                         │
│   · LAN server + mDNS  │ ◀───────────────────────▶ └────────────────────────┘
│   · keys (keychain)    │                                      ▲
└──────────▲─────────────┘                                      │ WSS (relay)
           │  LAN WSS (pinned certs, signed messages)           │
           ▼                                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Mobile (Flutter): UI, Dart protocol + connection manager, secure storage │
└──────────────────────────────────────────────────────────────────────────┘
```

| Folder | Role |
|---|---|
| `protocol/` | Source of truth shared by all apps: message JSON Schema, test fixtures, effect catalog, design tokens. Plain files, no tooling. |
| `server/` | Bun + Hono. REST API, WebSocket gateway, device registry, pairing, presence, event routing. PostgreSQL via Drizzle. |
| `desktop/` | Tauri 2. React + Tailwind for UI; Rust for all networking, crypto, keychain, mDNS, windows and tray. |
| `mobile/` | Flutter (Android, iOS). Dart for logic, CustomPainter / fragment shaders for effects. |
| `infrastructure/` | Docker Compose for local Postgres; deployment config later. |

The repository is **not** a monorepo in the tooling sense: there are no workspaces and no Turborepo. Each app installs and builds on its own. One git repository keeps protocol changes atomic across apps.

## Key decisions

### 1. Device identity instead of user accounts (v1)
Each device creates an Ed25519 key pair on first launch and keeps the private key in the OS keychain (macOS Keychain, Windows Credential Manager, libsecret, Android Keystore, iOS Keychain). The server stores only public keys. A `users` table can be added later for cross-device sync without changing the trust model.

### 2. Short-lived sessions from signed challenges
A device proves possession of its key by signing a server nonce and receives a JWT valid for 15 minutes. The WebSocket carries the token in its first frame (`AUTH`), never in the URL, so it does not end up in proxy logs.

### 3. End-to-end signed effects
Device-to-device messages (`EFFECT_*`) are signed by the sender. The receiver verifies them with the public key it learned at pairing. The relay therefore cannot forge effects, and the same message is valid over the relay or the LAN, so security does not depend on the route taken.

### 4. Rust owns desktop networking
The webview cannot do mDNS or listen on sockets, and the Rust core keeps running when the window is closed to the tray. React only renders and calls Tauri commands. The cost is a third protocol implementation (TypeScript, Rust, Dart), which decision 5 keeps honest.

### 5. One schema, three hand-written models, shared fixtures
`protocol/schemas/message.schema.json` is normative. The server validates with Ajv against the schema directly; Rust and Dart have hand-written strict parsers. All three run the same `protocol/fixtures/{valid,invalid}` files in their test suites, so drift fails CI.

### 6. In-memory presence behind an interface
Presence and socket routing live in server memory. Redis is added only when there is more than one server instance.

### 7. QR code plus typed code for pairing
Phones scan a QR code. Desktops usually cannot, so every pairing also shows a short code to type. A 6-digit comparison number (SAS) shown on both screens defeats someone who photographs the QR code.

### 8. Trusted effect catalog
`protocol/effects/catalog.json` ships inside every build. A receiver renders an effect only if its id is in the catalog **and** the client has a renderer for it. Messages carry an effect id and clamped parameters, never code.

## Delivery model

`sending → relayed → received → completed | failed(reason) | expired | receiver_offline | notified`

- **Desktop:** full-screen (or transparent overlay) effect window; works while the app runs in the tray.
- **Android / iOS:** render only while Synq is in the foreground. The OS suspends the socket in the background; the relay then reports `receiver_offline` to the sender, and the app reconnects the moment it returns to the foreground. Push notifications (planned: APNs/FCM, `notified` status) need Apple/Firebase accounts and are not implemented yet. iOS cannot be woken to show an animation in any case.
- **Sound:** desktop synthesises sound with Web Audio (no audio files). Mobile maps the sound option to haptic feedback.
- **Offline receivers:** messages expire after at most 60 seconds. Synq never promises delivery to an offline device.

## Route selection (milestone 7, not implemented yet)

1. If the peer was seen on the LAN via mDNS in the last 30 s, send over LAN.
2. If no `EFFECT_RECEIVED` arrives within ~1.5 s, also send via the relay.
3. The receiver's replay guard drops whichever copy arrives second.

## Milestones

| # | Scope | Status |
|---|---|---|
| M0 | Toolchain | ✅ |
| M1 | Foundation: protocol, server + DB, app shells | ✅ |
| M2 | Device identity, registration, QR/typed-code pairing with SAS | ✅ |
| M3 | WebSocket gateway, presence, signed routing, rate limits, reconnection | ✅ |
| M4 | Effect pipeline end-to-end, full-screen receiver | ✅ |
| M5 | All 8 desktop effects, full desktop UI, tray | ✅ (transparent overlay mode and OS notifications not yet) |
| M6 | Flutter app: pairing (scan/type/show), send, receive, 8 effects | ✅ iOS · ⚠️ Android untested |
| M7 | LAN: mDNS discovery, pinned-cert local WSS, route selection | ❌ not started |
| M8 | Push notifications, packaging, signing, hosted relay | ⚠️ server Docker image only |

## What is verified, and how

| Check | Command / evidence |
|---|---|
| Protocol: 19 valid + 40 invalid fixtures, 6 signing vectors, identical results in TS, Rust and Dart | `make test` |
| Server: auth, pairing (SAS, single-use, expiry, rejection), routing, replay, spoofing, rate limits, presence, revocation | `server/test/e2e.integration.test.ts` against real Postgres |
| Two Rust clients pair and exchange signed effects both ways through a real relay | `desktop/src-tauri/tests/relay_e2e.rs` (`make test-e2e`) |
| Two Dart clients do the same | `mobile/test/relay_e2e_test.dart` (`make test-e2e`) |
| Real desktop app receives an effect from a TypeScript peer, renders it full screen, acks completion | manual, with `make sim` |
| Real iOS app pairs by typed code, receives (shader + canvas effects) and sends effects | manual, iOS Simulator + `make sim` |
| All 8 desktop renderers draw correctly; canvas renderers run a full timeline at 3 intensities | visual check + `desktop/src/effects/effects.test.ts` |

## Running several devices on one machine

`SYNQ_PROFILE=<name>` gives a desktop instance its own identity and `SYNQ_KEYSTORE=file` keeps that key in a 0600 file instead of the Keychain (avoids repeated Keychain prompts for unsigned dev builds). `make desktop-b` starts a second desktop device next to `make desktop`. `make sim ARGS=...` adds a scripted device (see the root README).
