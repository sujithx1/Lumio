# Lumio

Pair your computers and phones and send beautiful visual effects between them.

A device shows a QR code (or a short code), another device scans or types it, both screens show the same 6-digit number, and once approved either device can trigger effects on the other. On a computer, effects float **over the desktop** (see-through, clicks pass through) and arrive **from the screen edge where you keep your phone** (the Send Zone). On a phone you **flick an effect card up toward the computer** to send it.

You can also **share photos, videos and any file** between paired devices. While a file arrives, the receiving screen plays your chosen effect, and the file lands in the folder set in Settings.

14 effects: Cosmic Portal, Rainbow, Volcano, Lightning, Celebration, Matrix, Aurora, Fireworks, plus original anime- and cartoon-style effects (Spiral Orb, Pirate Voyage, Giant's Wall, Power Aura, Cartoon Parade) and Event Horizon (a black hole). Effects are signed by the sender's device key and verified by the receiver; a receiver only ever renders effects from its built-in catalog.

## Status

| Area | State |
|---|---|
| Relay server (auth, pairing, presence, signed effect routing) | ✅ Built and tested against real Postgres |
| Desktop app (Tauri) | ✅ macOS built and run. Windows/Linux: same code, not yet built or tested |
| Mobile app (Flutter) | ✅ iOS built and run in the Simulator. Android: code complete, not yet built (no SDK on the dev machine) |
| Effects | ✅ 14 on desktop (see-through overlay, WebGL + Canvas, synthesised sound) and 14 on mobile (fragment shaders + CustomPainter over the app, haptics) |
| Send Zone, overlay mode, flick to send | ✅ Desktop setting under **Devices → Effects on this computer**; flick card in the phone's send sheet |
| File sharing | ✅ Relay upload/download with signed offers, size + SHA-256 checks, an effect while files arrive, save folder in settings. Not end-to-end encrypted yet |
| Local-network mode (mDNS, direct LAN) | ❌ Not built; everything goes through the relay |
| Push notifications (APNs/FCM) | ❌ Not built; phones receive effects only while Lumio is open |
| Packaging | ⚠️ Server Docker image only; app signing/notarisation not done |

Details and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [PROTOCOL](docs/PROTOCOL.md) · [DATABASE](docs/DATABASE.md) · [SECURITY](docs/SECURITY.md)

## Layout

| Folder | What it is |
|---|---|
| [`protocol/`](protocol) | Shared contract: message schema, test fixtures, signing vectors, effect catalog, design tokens |
| [`server/`](server) | Relay and API: Bun, Hono, PostgreSQL (Drizzle) |
| [`desktop/`](desktop) | macOS / Windows / Linux app: Tauri 2, Rust core, React, Tailwind |
| [`mobile/`](mobile) | Android / iOS app: Flutter |
| [`infrastructure/`](infrastructure) | Docker Compose for local Postgres, server Dockerfile |

## Prerequisites

Bun ≥ 1.3, Rust (stable, via [rustup](https://rustup.rs)), Flutter ≥ 3.38, Docker. Xcode for iOS; Android Studio + SDK for Android.

```bash
make doctor
```

## Run it

```bash
make setup      # dependencies, Postgres on 127.0.0.1:5442, migrations, a random JWT_SECRET
make server     # terminal 1: relay on http://localhost:8787
make desktop    # terminal 2: desktop app
```

Then pair something with it:

- **iPhone (Simulator):** `make mobile-ios`, tap the pair button, choose **Enter**, and type the code shown by the desktop's **Pair device → Show code**.
- **A second desktop device on the same Mac:** `make desktop-b` (separate identity, same dev server).
- **A scripted device** (no second screen needed): `make sim ARGS=host` prints a code to type into an app; `make sim ARGS="send aurora"` sends an effect to everything it's paired with; `make sim ARGS=listen` receives and acknowledges effects and saves files to `server/.devsim/received/`; `make sim ARGS="send-file ./photo.jpg aurora"` sends a file.

Android emulator: `cd mobile && flutter run --dart-define=LUMIO_SERVER_URL=http://10.0.2.2:8787`. A real phone needs the relay at an address it can reach; set it under **Devices → Relay server**.

Deploying the relay: `docker build -f infrastructure/docker/server.Dockerfile -t lumio-server .`, then run it with `DATABASE_URL` and `JWT_SECRET` behind a TLS-terminating proxy.

## Test

```bash
make test
```

Runs: server unit + Postgres integration tests (including a full relay end-to-end suite), desktop TypeScript and Rust tests, Flutter analyze + tests, and live end-to-end tests where two Rust clients and two Dart clients pair and exchange signed effects through a real relay. All three protocol implementations check the same fixtures and signing vectors.

## Changing the protocol

1. Edit `protocol/schemas/message.schema.json`.
2. Add or update fixtures in `protocol/fixtures/valid` and `protocol/fixtures/invalid` (and `cd server && bun run gen:vectors` if signing inputs change).
3. Update the three models: `server/src/protocol/types.ts`, `desktop/src-tauri/src/protocol.rs`, `mobile/lib/protocol/message.dart`.
4. `make test`. All suites must pass before committing.

Editing the effect catalog or design tokens? Run `make sync`.

### Adding an effect
1. Add an entry to `protocol/effects/catalog.json` (id, name, category, durations, accent colours) and run `make sync`.
2. Desktop: write a renderer (Canvas 2D or a shader) that draws on a transparent canvas and treats x = 0 as the Send Zone edge (`beginFrame` handles mirroring), then register it in `desktop/src/effects/registry.ts`.
3. Mobile: add a matching `EffectSim` in `mobile/lib/effects/renderers.dart` (and a `.frag` file in `mobile/shaders/` if it uses a shader).
4. `make test`: the registry tests fail until every catalog effect has a renderer on both platforms.

Desktop effects can be previewed in a browser during development: `cd desktop && bun run dev`, then open `http://localhost:1420/?effect=pirate-voyage&duration=7000&edge=right`.
