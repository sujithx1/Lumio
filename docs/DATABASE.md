# Database

PostgreSQL 17, accessed through Drizzle ORM. Schema: [`server/src/db/schema.ts`](../server/src/db/schema.ts). Migrations: `server/drizzle/`.

## Workflow

```bash
make db-up                     # start Postgres on 127.0.0.1:5442 (creates synq and synq_test)
cd server && bun run db:migrate
# after editing schema.ts:
cd server && bun run db:generate   # writes a new SQL migration; review it before committing
```

Migrations so far: `0000_initial_schema`, `0001_drop_claim_attempts`. Migrations are append-only. Never edit one that has been applied anywhere outside your machine.

## Tables

### `devices`
One row per device identity. The server stores the **public** key only.

| Column | Notes |
|---|---|
| `id` uuid PK | Assigned by the server (UUIDv7). |
| `public_key` text, unique | Ed25519, base64url. |
| `name` varchar(64), `platform` enum, `app_version` | Shown to paired devices. |
| `lan_cert_fingerprint` | SHA-256 of the device's self-signed LAN certificate (M7). |
| `push_token` | APNs/FCM token (M6). |
| `last_seen_at`, `revoked_at` | Presence and revocation. Revoked devices cannot authenticate. |

### `pairing_sessions`
Short-lived (120 s) pairing attempts created by the device that shows the QR code.

| Column | Notes |
|---|---|
| `code_hash` unique | SHA-256 of the one-time code. The code itself is never stored. |
| `status` | `pending → claimed → approved` or `rejected` / `expired`. |

Brute force is limited by rate limits on claims (per device and per IP) rather than per-session counters, because a wrong code never identifies a session.

### `device_pairings`
The trust graph. One row per pair, always stored with `device_a_id < device_b_id` (CHECK constraint), so a pair cannot be recorded twice in different orders.

- Partial unique index on `(device_a_id, device_b_id) WHERE revoked_at IS NULL`: only one active pairing per pair; re-pairing after removal is allowed and history is kept.

### `effect_events`
Delivery records for effects routed through the relay.

- `id` is the protocol event id. The primary key doubles as the server-side replay guard.
- `route` (`relay` | `lan`), `status`, `failure_reason`, and timestamps for created, expires, delivered and completed.
- Rows older than 30 days are pruned hourly by the server.

### `device_settings`
Per-device preferences: accept effects, sound, overlay vs full-screen, do-not-disturb. Replaces the `user_settings` table from the original spec until user accounts exist.

## Tests

`server/test/db.integration.test.ts` runs the real migrations against `synq_test` and checks key ordering, the active-pairing uniqueness rule, re-pairing after revocation, event id uniqueness and cascade deletes. It is skipped when `TEST_DATABASE_URL` is unset.
