# Security

Lumio lets one device make another device's screen do something. The core rule: **a received message can only select an effect from a fixed, built-in catalog and set bounded parameters. It can never carry code, commands, URLs or file paths.**

## Threat model

| Threat | Mitigation | Status |
|---|---|---|
| Remote code execution via effect messages | Effects referenced by id from the bundled catalog; payloads have closed schemas (no extra fields, bounded numbers, kebab-case ids) | ✅ Schema + fixtures in all 3 apps |
| Malformed or oversized input | 16 KiB frame cap before parsing; strict validation; `null` rejected everywhere | ✅ All 3 apps |
| Replayed messages | Unique event ids, ≤60 s lifetime, ±30 s skew window, seen-id cache, DB primary key | ✅ Relay and both clients |
| Forged effects (including by a compromised relay) | Ed25519 signatures by the sender, verified against the public key learned at pairing | ✅ Rust + Dart; tested with tampered messages |
| Stolen QR code / shoulder-surfing during pairing | One-time 50-bit code, 120 s expiry, stored only as a hash, claim rate limits (10/min per device, 30/min per IP), initiator must be online and approve after comparing a 6-digit SAS bound to both public keys | ✅ |
| Credential theft | No passwords. Private keys stay in the OS keychain (desktop) / Keychain-Keystore (mobile); 15-minute JWTs from single-use signed challenges; tokens never in URLs | ✅ |
| Spam / harassment from a paired device | Per-pair and per-sender rate limits; one effect on screen at a time; unpair revokes immediately | ✅ (do-not-disturb setting not yet in the UI) |
| LAN eavesdropping or spoofing | WSS with self-signed certs pinned at pairing + mutual challenge; mDNS records hold only a version and a rotating opaque id | ❌ LAN mode not built yet; all traffic goes through the relay |
| Lost or stolen device | Unpair from any paired device; `DELETE /v1/me` revokes a device entirely (sockets closed with 4003, logins refused) | ✅ API (no "revoke" button in the UIs yet) |
| Webview compromise (desktop) | Strict CSP (`default-src 'self'`, no remote scripts); minimal Tauri capabilities (`core:default` + window dragging) | ✅ |

## Transport

- Production relay: HTTPS/WSS only. Local development uses plain HTTP on localhost.
- Postgres binds to `127.0.0.1` in development.
- iOS: `NSAppTransportSecurity` allows only local networking (for dev builds against a LAN server). Android allows cleartext only in the debug manifest.
- The desktop webview has a strict CSP and makes no network requests itself; all networking is in Rust.
- Pairing QR codes carry the relay URL; the phone refuses a code for a different relay than the one it is configured for.

## Secrets

- No secrets in the repository. `server/.env` is git-ignored; `.env.example` documents variables.
- The compose file's Postgres password is a development default and can be overridden with `POSTGRES_PASSWORD`.
- Production secrets (JWT signing key, database URL, later APNs/FCM keys) come from the hosting platform's secret store. `make setup` generates a random local `JWT_SECRET`.
- Desktop dev builds can use `LUMIO_KEYSTORE=file` (0600 file under the app data directory) instead of the Keychain; release builds should not set it.

## Reporting

Until there is a public release, report issues directly to the maintainers.
