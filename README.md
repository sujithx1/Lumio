<p align="center">
  <img src="docs/media/handoff.svg" alt="An effect flies from a phone to a laptop and bursts on its screen" width="100%">
</p>

<h1 align="center">
  <img src="mobile/assets/icon/logo.png" alt="" width="72"><br>
  Lumio
</h1>

<p align="center"><b>Send light between your devices.</b><br>
Pair your phone and computer, then fling animated effects, characters and files from one screen to the other.</p>

<p align="center">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-working-22c55e">
  <img alt="iOS" src="https://img.shields.io/badge/iOS-working-22c55e">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-coming-f59e0b">
  <img alt="Linux" src="https://img.shields.io/badge/Linux-coming-f59e0b">
  <img alt="Android" src="https://img.shields.io/badge/Android-coming-f59e0b">
</p>

## What it does

- **Pair in seconds.** One device shows a QR code, the other scans it, and both show the same 6-digit number to approve.
- **Send effects that travel.** Every effect is a handoff: it leaves the sender's screen and arrives on the receiver from the edge where that device sits. On a phone, flick a card up toward your computer.
- **Over your desktop.** On a computer, effects float over everything you have open: see-through, and clicks pass straight through.
- **Share files the fun way.** Photos, videos and any file, with your chosen effect playing as it lands in your save folder.
- **Works anywhere.** Devices meet through an online relay, so it works across Wi-Fi networks and on mobile data.
- **Private by design.** No accounts or passwords. Every message is signed with the sending device's key, and a device only plays effects from its own built-in catalog.

## Effects

19 effects, including five original characters.

<table>
  <tr>
    <td align="center"><img src="docs/media/tiny-ronin.gif" alt="Tiny Ronin" width="100%"><br><b>Tiny Ronin</b> · a little swordsman</td>
    <td align="center"><img src="docs/media/kaze.gif" alt="Kaze" width="100%"><br><b>Kaze</b> · a fox-eared wind dancer</td>
    <td align="center"><img src="docs/media/snooze.gif" alt="Snooze" width="100%"><br><b>Snooze</b> · a sleepy kid with lightning</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/media/fireworks.gif" alt="Fireworks" width="100%"><br><b>Fireworks</b></td>
    <td align="center"><img src="docs/media/cosmic-portal.gif" alt="Cosmic Portal" width="100%"><br><b>Cosmic Portal</b></td>
    <td align="center"><img src="docs/media/event-horizon.gif" alt="Event Horizon" width="100%"><br><b>Event Horizon</b> · a black hole</td>
  </tr>
</table>

Also: Rainbow, Volcano, Lightning, Celebration, Matrix, Aurora, Spiral Orb, Pirate Voyage, Giant's Wall, Power Aura, Cartoon Parade, and the characters Boing (a stretchy-armed kid) and Pebble (a cadet and her friendly stone giant).

## How it works

```
 Phone ──┐                                   ┌── Computer
         │   signed message (Ed25519)        │
         └──►  Lumio relay (Bun + Postgres)  ◄──┘
               checks pairing, forwards it,
               holds files until delivered
```

Each device has its own key, kept in the system keychain. The relay only forwards messages between paired devices and deletes shared files as soon as they are delivered (or after 30 minutes). The receiver checks the sender's signature before playing anything.

| Part | Built with |
|---|---|
| Desktop app | Tauri 2 (Rust) + React + TypeScript, WebGL and Canvas effects |
| Mobile app | Flutter, fragment shaders and CustomPainter effects, haptics |
| Relay server | Bun + Hono + WebSockets, PostgreSQL with Drizzle |
| Protocol | JSON Schema, shared test fixtures and signing vectors checked in TypeScript, Rust and Dart |

## Status

| Area | State |
|---|---|
| Relay server (auth, pairing, presence, signed effect routing) | ✅ Built and tested against real Postgres |
| Desktop app (Tauri) | ✅ macOS built and run. Windows/Linux: same code, not yet built or tested |
| Online relay | ✅ Deployed on Render with a Neon database (see below) |
| Mobile app (Flutter) | ✅ iOS built and run on an iPhone and in the Simulator. Android: code complete, not yet built (no SDK on the dev machine) |
| Effects | ✅ 19 on desktop (see-through overlay, WebGL + Canvas, synthesised sound) and 19 on mobile (fragment shaders + CustomPainter over the app, haptics), with a sender-to-receiver handoff |
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

To keep the relay running without a terminal on macOS, `make autostart` installs a launch agent that opens Docker if needed, starts Postgres, applies migrations and runs the relay at every login, restarting it if it exits (logs in `~/Library/Logs/Lumio/server.log`). `make autostart-status` shows it; `make autostart-off` removes it. Stop it before running `make server`, which uses the same port.

Then pair something with it:

- **iPhone (Simulator):** `make mobile-ios`, tap the pair button, choose **Enter**, and type the code shown by the desktop's **Pair device → Show code**.
- **A second desktop device on the same Mac:** `make desktop-b` (separate identity, same dev server).
- **A scripted device** (no second screen needed): `make sim ARGS=host` prints a code to type into an app; `make sim ARGS="send aurora"` sends an effect to everything it's paired with; `make sim ARGS=listen` receives and acknowledges effects and saves files to `server/.devsim/received/`; `make sim ARGS="send-file ./photo.jpg aurora"` sends a file.

Android emulator: `cd mobile && flutter run --dart-define=LUMIO_SERVER_URL=http://10.0.2.2:8787`. A real phone needs the relay at an address it can reach; set it under **Devices → Relay server**.

## Put the relay online (Render + Neon, free)

So devices can reach each other anywhere, not only on your Wi-Fi.

1. **Database — [Neon](https://neon.tech):** create a free project in the region closest to you, then copy its connection string (**Connect** → the *direct* connection, not the pooled one). It looks like `postgresql://user:password@ep-….neon.tech/neondb?sslmode=require`.
2. **Server — [Render](https://render.com):** **New → Blueprint**, pick this GitHub repository. Render reads [`render.yaml`](render.yaml), builds the Docker image and asks for `DATABASE_URL`: paste the Neon string. `JWT_SECRET` is generated for you. Change `region` in `render.yaml` first if Singapore is not closest to your Neon database.
3. **Check it:** `https://<service>.onrender.com/health` should answer `{"status":"ok","db":"ok",…}`. Migrations run on every start.
4. **Point the apps at it:**
   - macOS: `cd desktop && LUMIO_SERVER_URL=https://<service>.onrender.com bun run tauri build --bundles app` (the address is built into the app; `LUMIO_SERVER_URL` at run time still overrides it).
   - iOS/Android: `flutter build ios --release --dart-define=LUMIO_SERVER_URL=https://<service>.onrender.com`, or change it in the app under **Devices → Relay server**.
5. Pair your devices again: the new database starts empty.

On Render's free plan the server sleeps after 15 minutes with no device connected (the apps send a heartbeat every 20 s while open) and takes about a minute to wake; files waiting for delivery are lost if it restarts, and are capped at 100 MB (`MAX_FILE_BYTES`). Render's paid plan removes the sleep with no other change.

Elsewhere: `docker build -f infrastructure/docker/server.Dockerfile -t lumio-server .`, then run it with `DATABASE_URL` and `JWT_SECRET` behind a TLS-terminating proxy, and set `TRUSTED_PROXIES` to the number of proxies in front of it so per-IP rate limits see real client addresses.

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

To record README animations of effects (uses the Chrome installed on your machine): keep `bun run dev` running, then `cd desktop && bun scripts/readme-gifs.ts tiny-ronin kaze` writes `docs/media/<effect>.gif`.
