# Synq protocol (v1)

Normative source: [`protocol/schemas/message.schema.json`](../protocol/schemas/message.schema.json).
Implementations: `server/src/protocol/` (TypeScript + Ajv), `desktop/src-tauri/src/protocol.rs` (Rust), `mobile/lib/protocol/message.dart` (Dart).
Conformance: every implementation must accept all of `protocol/fixtures/valid/*.json` and reject all of `protocol/fixtures/invalid/*.json`.

## Envelope

```json
{
  "v": 1,
  "id": "0193a2b6-0000-7000-8000-000000000010",
  "type": "EFFECT_TRIGGER",
  "from": "0193a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b",
  "to": "0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "createdAt": 1763712000000,
  "expiresAt": 1763712030000,
  "payload": { "effectId": "cosmic-portal", "duration": 6000, "intensity": 0.8, "sound": true },
  "sig": "<86 chars base64url>"
}
```

| Field | Rule |
|---|---|
| `v` | Always `1`. |
| `id` | Lowercase UUID (senders use UUIDv7). Unique per message; the replay key. |
| `type` | One of the message types below. |
| `from`, `to` | Device id (lowercase UUID) or `"server"`. Must differ. |
| `createdAt`, `expiresAt` | Integer Unix ms. `0 < expiresAt − createdAt ≤ 60000`. |
| `payload` | Object; shape depends on `type`. Unknown keys are rejected. |
| `sig` | Ed25519 signature, base64url (86 chars). **Required** on device-to-device messages. |

Global rules: unknown fields are rejected everywhere; `null` is never a valid value; frames larger than 16 KiB are rejected before parsing.

## Message types

| Type | Direction | Payload |
|---|---|---|
| `AUTH` | device → server | `{ token }` (16–4096 chars) |
| `AUTH_OK` | server → device | `{ deviceId, serverTime }` |
| `HEARTBEAT` | either | `{}` |
| `DEVICE_PAIR_REQUEST` | server → initiator | `{ pairingId, claimant: DeviceSummary, sas }` (`sas` = 6 digits) |
| `DEVICE_PAIR_APPROVED` | server → both | `{ pairingId, peer: DeviceSummary, peerPublicKey }` |
| `DEVICE_PAIR_REJECTED` | server → claimant | `{ pairingId }` |
| `DEVICE_PAIR_REVOKED` | server → device | `{ peerDeviceId }` |
| `DEVICE_ONLINE` | server → paired | `{ deviceId }` |
| `DEVICE_OFFLINE` | server → paired | `{ deviceId, lastSeenAt }` |
| `EFFECT_TRIGGER` | device → device, signed | `{ effectId, duration (1000–15000 int), intensity (0–1), sound }` |
| `EFFECT_RECEIVED` | device → device, signed | `{ eventId }` |
| `EFFECT_COMPLETED` | device → device, signed | `{ eventId }` |
| `EFFECT_FAILED` | device → device, signed | `{ eventId, reason }`, reason ∈ `unknown_effect, expired, duplicate, invalid_signature, not_paired, unsupported, busy, render_error` |
| `EFFECT_STATUS` | server → sender | `{ eventId, status }`, status ∈ `relayed, receiver_offline, notified, expired, rejected` |
| `ERROR` | server → device | `{ code, message (≤256), refId? }` |

`DeviceSummary` = `{ deviceId, name (1–64 chars), platform ∈ macos|windows|linux|android|ios }`.

### Why `DEVICE_REGISTER` is HTTP, not a socket message
A device cannot open an authenticated WebSocket before it has an identity, so registration happens during HTTP login (below): the first `POST /v1/auth/token` for an unknown key that includes `device` registers it.

## HTTP API

All bodies are JSON objects; unknown fields are rejected. Errors are `{ "error": { "code", "message" } }`.

| Method & path | Auth | Body → Response |
|---|---|---|
| `POST /v1/auth/challenge` | – | `{ publicKey }` → `{ nonce, expiresAt }` (single use, 60 s) |
| `POST /v1/auth/token` | – | `{ publicKey, nonce, signature, device?: { name, platform, appVersion } }` → `{ token, expiresAt, device }`. `signature` signs the UTF-8 bytes of `synq-auth-v1\|<nonce>\|<publicKey>`. 201 when it registered a new device. |
| `GET /v1/me` | Bearer | → this device |
| `PATCH /v1/me` | Bearer | `{ name }` → device summary |
| `DELETE /v1/me` | Bearer | revoke this device: pairings end, sockets close with 4003, future logins get 403 |
| `GET /v1/devices` | Bearer | → `{ devices: [{ deviceId, name, platform, publicKey, online, lastSeenAt, pairedAt }] }` |
| `DELETE /v1/devices/:id` | Bearer | unpair; the peer receives `DEVICE_PAIR_REVOKED` |
| `POST /v1/pairing` | Bearer | → `{ pairingId, code, expiresAt }` (code `XXXXX-XXXXX`, Crockford base32, 120 s) |
| `POST /v1/pairing/claim` | Bearer | `{ code }` → `{ pairingId, sas, initiator, expiresAt }`; initiator gets `DEVICE_PAIR_REQUEST` |
| `POST /v1/pairing/:id/approve` | Bearer (initiator) | → `{ pairingId, peer }`; both get `DEVICE_PAIR_APPROVED` |
| `POST /v1/pairing/:id/reject` | Bearer (initiator) | 204; claimant gets `DEVICE_PAIR_REJECTED` |
| `GET /v1/effects/recent` | Bearer | → `{ effects: [...] }` (last 20 relayed effects, sent or received) |
| `GET /v1/ws` | `AUTH` frame | WebSocket, see below |
| `GET /health` | – | `{ status, db, version, protocol }` |

The SAS is the first 4 bytes of `SHA-256("synq-sas-v1|<normalised code>|<initiator key>|<claimant key>")` mod 10⁶, zero-padded to 6 digits.

## WebSocket session

1. Client sends `AUTH { token }` within 5 s; `from` must be its own device id. Server replies `AUTH_OK`.
2. Either side sends `HEARTBEAT` every 20 s; the server closes sockets silent for 45 s.
3. Close codes: 4000 idle, 4001 unauthorised, 4002 replaced by a newer connection of the same device, 4003 device revoked (do not reconnect), 4004 protocol, 4008 flooding. Clients reconnect with exponential backoff (1 s → 30 s) plus jitter.
4. Relay limits: 30 effects/min per sender, 12 effects/min per sender→receiver pair, 40 frames/10 s per socket.

## Receiver checks (in order)

1. Parse and validate (size, JSON, envelope, per-type schema, lifetime, from ≠ to).
2. Freshness: reject if `createdAt > now + 30 s` or `expiresAt + 30 s < now`.
3. Replay: drop an `id` already seen before its expiry (also the relay, via memory + the `effect_events` primary key).
4. Sender is a paired device (the relay checks the active pairing too).
5. Signature verifies against the sender's public key learned at pairing.
6. `effectId` is in the local catalog and has a renderer; `duration` is clamped to the effect's min/max.
7. Not already showing an effect (otherwise `EFFECT_FAILED busy`).

All seven are implemented in the desktop (Rust) and mobile (Dart) clients and covered by tests.

## Signing

`sig = base64url(Ed25519.sign(privateKey, JCS(message without "sig")))`, where JCS is RFC 8785 canonical JSON. Verification recomputes JCS over the received message with `sig` removed. Senders round `intensity` to two decimals so every implementation formats the number identically. `protocol/fixtures/signing/vectors.json` (RFC 8032 test key) pins the canonical bytes and signatures for TS, Rust and Dart.

## Versioning

Breaking changes bump `v` and the schema `$id`. Fixtures are updated in the same commit as the schema and all three implementations.
