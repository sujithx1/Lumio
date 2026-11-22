/**
 * A scripted Lumio device that speaks the real protocol (HTTP auth + WebSocket + Ed25519 signatures).
 * Used by the end-to-end tests and by scripts/devsim.ts for manual testing against the desktop and mobile apps.
 */
import { randomBytes } from "node:crypto";
import { keyPairFromSeed, verifyEd25519 } from "../../src/lib/crypto";
import { signingInput } from "../../src/protocol/canonical";
import type { MessageType, Platform, LumioMessage } from "../../src/protocol/types";

type Msg<T extends MessageType> = Extract<LumioMessage, { type: T }>;

export interface ApiResult<T = any> {
  status: number;
  json: T;
}

export class SimDevice {
  readonly inbox: LumioMessage[] = [];
  private ws?: WebSocket;
  private waiters: Array<{ match: (m: LumioMessage) => boolean; resolve: (m: LumioMessage) => void }> = [];
  closed?: Promise<{ code: number; reason: string }>;

  private constructor(
    readonly baseUrl: string,
    readonly keys: ReturnType<typeof keyPairFromSeed>,
    readonly deviceId: string,
    readonly name: string,
    private token: string,
  ) {}

  static async register(
    baseUrl: string,
    opts: { name: string; platform?: Platform; seed?: Uint8Array },
  ): Promise<SimDevice> {
    const keys = keyPairFromSeed(opts.seed ?? randomBytes(32));
    const { token, device } = await SimDevice.login(baseUrl, keys, {
      name: opts.name,
      platform: opts.platform ?? "linux",
      appVersion: "0.0.0-sim",
    });
    return new SimDevice(baseUrl, keys, device.deviceId, device.name, token);
  }

  static async login(
    baseUrl: string,
    keys: ReturnType<typeof keyPairFromSeed>,
    device?: { name: string; platform: Platform; appVersion: string },
  ) {
    const post = (path: string, body: unknown) =>
      fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ch = (await (await post("/v1/auth/challenge", { publicKey: keys.publicKey })).json()) as { nonce: string };
    const signature = keys.sign(new TextEncoder().encode(`lumio-auth-v1|${ch.nonce}|${keys.publicKey}`));
    const res = await post("/v1/auth/token", { publicKey: keys.publicKey, nonce: ch.nonce, signature, ...(device ? { device } : {}) });
    if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as { token: string; expiresAt: number; device: { deviceId: string; name: string } };
  }

  async api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  /** Opens the relay socket and completes AUTH. */
  async connect(): Promise<void> {
    const ws = new WebSocket(`${this.baseUrl.replace(/^http/, "ws")}/v1/ws`);
    this.ws = ws;
    this.closed = new Promise((resolve) => ws.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason })));
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as LumioMessage;
      const i = this.waiters.findIndex((w) => w.match(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(msg);
      else this.inbox.push(msg);
    });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("websocket error")), { once: true });
    });
    this.send(this.envelope("AUTH", "server", { token: this.token }));
    await this.next("AUTH_OK");
  }

  /** Waits for the next message of a type (optionally matching a predicate). */
  next<T extends MessageType>(type: T, timeoutMs = 3000, where: (m: Msg<T>) => boolean = () => true): Promise<Msg<T>> {
    const match = (m: LumioMessage) => m.type === type && where(m as Msg<T>);
    const i = this.inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Msg<T>);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve: (m: LumioMessage) => (clearTimeout(timer), resolve(m as Msg<T>)) };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`${this.name}: timed out waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /** Resolves true if no message of the type arrives within the window. */
  async nothing(type: MessageType, windowMs = 300): Promise<boolean> {
    try {
      await this.next(type, windowMs);
      return false;
    } catch {
      return true;
    }
  }

  envelope<T extends MessageType>(type: T, to: string, payload: Msg<T>["payload"], ttlMs = 30_000): Msg<T> {
    const now = Date.now();
    return { v: 1, id: Bun.randomUUIDv7(), type, from: this.deviceId, to, createdAt: now, expiresAt: now + ttlMs, payload } as Msg<T>;
  }

  signed<T extends MessageType>(msg: Msg<T>): Msg<T> {
    return { ...msg, sig: this.keys.sign(signingInput(msg)) };
  }

  send(msg: object): void {
    if (!this.ws) throw new Error("not connected");
    this.ws.send(JSON.stringify(msg));
  }

  trigger(to: string, effectId = "cosmic-portal", opts: Partial<{ duration: number; intensity: number; sound: boolean }> = {}) {
    const msg = this.signed(
      this.envelope("EFFECT_TRIGGER", to, { effectId, duration: 4000, intensity: 0.8, sound: false, ...opts }),
    );
    this.send(msg);
    return msg;
  }

  ack(type: "EFFECT_RECEIVED" | "EFFECT_COMPLETED", to: string, eventId: string) {
    const msg = this.signed(this.envelope(type, to, { eventId }));
    this.send(msg);
    return msg;
  }

  /** The session token, for tests that speak raw HTTP. */
  get bearer(): string {
    return this.token;
  }

  /** Raw HTTP with this device's token (for binary bodies). */
  fetch(method: string, path: string, init: { body?: Uint8Array | string; headers?: Record<string, string> } = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      body: init.body,
      headers: { authorization: `Bearer ${this.token}`, ...init.headers },
    });
  }

  /** Uploads bytes to the relay and sends a signed FILE_OFFER. Returns the offer. */
  async sendFile(to: string, bytes: Uint8Array, opts: Partial<{ name: string; mime: string; effectId: string }> = {}) {
    const name = opts.name ?? "hello.txt";
    const mime = opts.mime ?? "text/plain";
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const created = await this.api("POST", "/v1/transfers", { to, name, size: bytes.byteLength, mime, sha256 });
    if (created.status !== 201) throw new Error(`create transfer: ${created.status} ${JSON.stringify(created.json)}`);
    const transferId = created.json.transferId as string;
    const put = await this.fetch("PUT", `/v1/transfers/${transferId}/content`, { body: bytes });
    if (put.status !== 204) throw new Error(`upload: ${put.status} ${await put.text()}`);
    const offer = this.signed(
      this.envelope("FILE_OFFER", to, {
        transferId,
        name,
        size: bytes.byteLength,
        mime,
        sha256,
        effectId: opts.effectId ?? "cosmic-portal",
      }),
    );
    this.send(offer);
    return offer;
  }

  static verify(msg: LumioMessage & { sig?: string }, publicKey: string): boolean {
    return Boolean(msg.sig) && verifyEd25519(publicKey, signingInput(msg), msg.sig!);
  }

  close(): void {
    this.ws?.close();
  }
}

/** Runs the full pairing handshake between two connected devices. */
export async function pair(initiator: SimDevice, claimant: SimDevice) {
  const created = await initiator.api("POST", "/v1/pairing");
  if (created.status !== 201) throw new Error(`create pairing: ${created.status} ${JSON.stringify(created.json)}`);
  const claim = await claimant.api("POST", "/v1/pairing/claim", { code: created.json.code });
  if (claim.status !== 200) throw new Error(`claim: ${claim.status} ${JSON.stringify(claim.json)}`);
  const request = await initiator.next("DEVICE_PAIR_REQUEST");
  const approve = await initiator.api("POST", `/v1/pairing/${request.payload.pairingId}/approve`);
  if (approve.status !== 200) throw new Error(`approve: ${approve.status}`);
  await initiator.next("DEVICE_PAIR_APPROVED");
  await claimant.next("DEVICE_PAIR_APPROVED");
  return { code: created.json.code as string, sas: claim.json.sas as string, request };
}
