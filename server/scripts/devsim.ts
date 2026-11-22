/**
 * Simulated Lumio device for manual testing of the desktop and mobile apps.
 *
 *   bun scripts/devsim.ts host                 show a pairing code, auto-approve whoever claims it
 *   bun scripts/devsim.ts join <CODE>          claim a code shown by an app (approve it there)
 *   bun scripts/devsim.ts send <effect-id>     send an effect to every paired device
 *   bun scripts/devsim.ts send-file <path> [effect-id]
 *                                              send a file to every online paired device
 *   bun scripts/devsim.ts listen               stay online, ack and log incoming effects and files
 *
 * Received files are verified (signature, size, SHA-256) and saved to .devsim/received/.
 *
 * Options: --server http://localhost:8787  --name "Sim Device"  --profile default
 * The identity is kept in .devsim/<profile>.key so the device stays paired between runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { SimDevice } from "../test/support/sim-device";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = args[i + 1] ?? fallback;
  args.splice(i, 2);
  return value;
};
const server = opt("server", process.env.LUMIO_SERVER_URL ?? "http://localhost:8787");
const name = opt("name", "Sim Device");
const profile = opt("profile", "default");
const [command = "listen", arg] = args;

const dir = join(import.meta.dir, "../.devsim");
mkdirSync(dir, { recursive: true });
const keyFile = join(dir, `${profile}.key`);
if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString("hex"), { mode: 0o600 });
const seed = Buffer.from(readFileSync(keyFile, "utf8").trim(), "hex");

const device = await SimDevice.register(server, { name, platform: "linux", seed });
await device.connect();
console.log(`● ${device.name} online as ${device.deviceId}`);

const peers = async () => (await device.api("GET", "/v1/devices")).json.devices as Array<{ deviceId: string; name: string; publicKey: string; online: boolean }>;

/** Downloads offered files like a real receiver would: verify the signature, then size and hash. */
async function serveFiles() {
  const received = join(dir, "received");
  mkdirSync(received, { recursive: true });
  for (;;) {
    const msg = await device.next("FILE_OFFER", 24 * 3600_000);
    const peer = (await peers()).find((p) => p.deviceId === msg.from);
    const { transferId, name: fileName, size, sha256, effectId } = msg.payload;
    if (!peer || !SimDevice.verify(msg, peer.publicKey)) {
      console.log(`✗ rejected file ${fileName}: bad signature or unknown peer`);
      device.send(device.signed(device.envelope("FILE_FAILED", msg.from, { transferId, reason: "invalid_signature" })));
      continue;
    }
    console.log(`⇣ ${peer.name} is sending ${fileName} (${size} bytes) with ${effectId}`);
    const res = await device.fetch("GET", `/v1/transfers/${transferId}/content`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ok = res.ok && bytes.byteLength === size && new Bun.CryptoHasher("sha256").update(bytes).digest("hex") === sha256;
    if (!ok) {
      console.log(`✗ ${fileName}: download or checksum failed`);
      device.send(device.signed(device.envelope("FILE_FAILED", msg.from, { transferId, reason: res.ok ? "checksum_mismatch" : "download_failed" })));
      continue;
    }
    const safe = basename(fileName).replace(/^\.+/, "") || "file";
    writeFileSync(join(received, `${transferId.slice(-8)}-${safe}`), bytes);
    device.send(device.signed(device.envelope("FILE_RECEIVED", msg.from, { transferId })));
    console.log(`✓ saved ${safe} to .devsim/received/`);
  }
}

async function serveIncoming() {
  await Promise.all([serveEffects(), serveFiles()]);
}

/** Acknowledges incoming effects like a real receiver would (after verifying the signature). */
async function serveEffects() {
  for (;;) {
    const msg = await device.next("EFFECT_TRIGGER", 24 * 3600_000);
    const peer = (await peers()).find((p) => p.deviceId === msg.from);
    if (!peer || !SimDevice.verify(msg, peer.publicKey)) {
      console.log(`✗ rejected ${msg.payload.effectId} from ${msg.from}: bad signature or unknown peer`);
      continue;
    }
    console.log(`✦ ${peer.name} sent ${msg.payload.effectId} (${msg.payload.duration} ms, intensity ${msg.payload.intensity})`);
    device.ack("EFFECT_RECEIVED", msg.from, msg.id);
    setTimeout(() => device.ack("EFFECT_COMPLETED", msg.from, msg.id), msg.payload.duration);
  }
}

const heartbeat = setInterval(() => device.send(device.envelope("HEARTBEAT", "server", {})), 20_000);

switch (command) {
  case "host": {
    const created = await device.api("POST", "/v1/pairing");
    console.log(`Pairing code: ${created.json.code}   (valid for 2 minutes)`);
    const request = await device.next("DEVICE_PAIR_REQUEST", 120_000);
    console.log(`${request.payload.claimant.name} wants to pair. SAS ${request.payload.sas} — auto-approving.`);
    await device.api("POST", `/v1/pairing/${request.payload.pairingId}/approve`);
    await device.next("DEVICE_PAIR_APPROVED");
    console.log("✓ paired");
    await serveIncoming();
    break;
  }
  case "join": {
    if (!arg) throw new Error("usage: devsim join <CODE>");
    const claim = await device.api("POST", "/v1/pairing/claim", { code: arg });
    if (claim.status !== 200) throw new Error(`claim failed: ${JSON.stringify(claim.json)}`);
    console.log(`Confirm ${claim.json.sas} on ${claim.json.initiator.name}…`);
    await device.next("DEVICE_PAIR_APPROVED", 120_000);
    console.log("✓ paired");
    await serveIncoming();
    break;
  }
  case "send": {
    const effectId = arg ?? "cosmic-portal";
    for (const peer of await peers()) {
      const msg = device.trigger(peer.deviceId, effectId, { duration: 5000, intensity: 0.8, sound: true });
      const status = await device.next("EFFECT_STATUS", 5000, (m) => m.payload.eventId === msg.id);
      console.log(`→ ${peer.name}: ${status.payload.status}`);
      if (status.payload.status === "relayed") {
        const done = await device.next("EFFECT_COMPLETED", msg.payload.duration + 30_000, (m) => m.payload.eventId === msg.id).catch(() => null);
        console.log(done ? `✓ ${peer.name} played it` : `… no completion from ${peer.name}`);
      }
    }
    clearInterval(heartbeat);
    device.close();
    break;
  }
  case "send-file": {
    if (!arg) throw new Error("usage: devsim send-file <path> [effect-id]");
    const bytes = new Uint8Array(readFileSync(arg));
    const effectId = args[2] ?? "cosmic-portal";
    for (const peer of (await peers()).filter((p) => p.online)) {
      const offer = await device.sendFile(peer.deviceId, bytes, { name: basename(arg), mime: "application/octet-stream", effectId });
      const isMine = (m: { payload: { transferId?: string; refId?: string } }) =>
        m.payload.transferId === offer.payload.transferId || m.payload.refId === offer.id;
      const result = await Promise.race([
        device.next("FILE_RECEIVED", 120_000, isMine).then(() => "received"),
        device.next("FILE_FAILED", 120_000, isMine).then((m) => `failed: ${m.payload.reason}`),
        device.next("ERROR", 120_000, isMine).then((m) => `error: ${m.payload.message}`),
      ]).catch(() => "no answer");
      console.log(`→ ${peer.name}: ${result}`);
    }
    clearInterval(heartbeat);
    device.close();
    process.exit(0);
  }
  default:
    await serveIncoming();
}
