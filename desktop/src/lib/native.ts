import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Platform = "macos" | "windows" | "linux" | "android" | "ios";
export type ConnectionState = "connecting" | "online" | "offline" | "revoked";

export interface DeviceSummary {
  deviceId: string;
  name: string;
  platform: Platform;
}

export interface Peer extends DeviceSummary {
  online: boolean;
  lastSeenAt: number | null;
  pairedAt: number;
}

export interface Snapshot {
  me: DeviceSummary | null;
  connection: ConnectionState;
  connectionDetail: string | null;
  peers: Peer[];
  serverUrl: string;
  platform: Platform;
  appVersion: string;
  deviceName: string;
}

export interface PairingSession {
  pairingId: string;
  code: string;
  expiresAt: number;
  uri: string;
  qr: { size: number; modules: string };
}

export interface PairingClaimed {
  pairingId: string;
  sas: string;
  initiator: DeviceSummary;
  expiresAt: number;
}

export interface RecentEffect {
  eventId: string;
  direction: "sent" | "received";
  peerDeviceId: string;
  peerName: string;
  effectId: string;
  status: string;
  route: "relay" | "lan";
  at: number;
}

export interface IncomingEffect {
  eventId: string;
  fromDeviceId: string;
  fromName: string;
  effectId: string;
  duration: number;
  intensity: number;
  sound: boolean;
}

export interface EffectLaunch {
  eventId: string | null;
  effectId: string;
  duration: number;
  intensity: number;
  sound: boolean;
  fromName: string | null;
}

export interface ServerStatus {
  url: string;
  reachable: boolean;
  healthy: boolean;
  serverVersion: string | null;
  protocolCompatible: boolean | null;
  error: string | null;
}

/** Events emitted by the Rust core (src-tauri/src/core/engine.rs `CoreEvent`). */
export type CoreEvent =
  | { kind: "connection"; state: ConnectionState; detail: string | null }
  | { kind: "me"; device: DeviceSummary }
  | { kind: "peers"; peers: Peer[] }
  | { kind: "presence"; deviceId: string; online: boolean; lastSeenAt: number | null }
  | { kind: "pairRequest"; pairingId: string; claimant: DeviceSummary; sas: string }
  | { kind: "pairApproved"; peer: DeviceSummary }
  | { kind: "pairRejected"; pairingId: string }
  | { kind: "pairRevoked"; peerDeviceId: string }
  | { kind: "effectIncoming"; effect: IncomingEffect }
  | { kind: "effectRejected"; fromName: string; reason: string }
  | { kind: "delivery"; eventId: string; status: string; detail: string | null }
  | { kind: "error"; message: string };

export interface SendRequest {
  deviceId: string;
  effectId: string;
  duration: number;
  intensity: number;
  sound: boolean;
}

/** Typed wrappers around the Rust commands in src-tauri/src/commands.rs. */
export const native = {
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  refreshPeers: () => invoke<Peer[]>("refresh_peers"),
  renameDevice: (name: string) => invoke<DeviceSummary>("rename_device", { name }),
  removeDevice: (deviceId: string) => invoke<void>("remove_device", { deviceId }),
  createPairing: () => invoke<PairingSession>("create_pairing"),
  claimPairing: (code: string) => invoke<PairingClaimed>("claim_pairing", { code }),
  approvePairing: (pairingId: string) => invoke<void>("approve_pairing", { pairingId }),
  rejectPairing: (pairingId: string) => invoke<void>("reject_pairing", { pairingId }),
  recentEffects: () => invoke<RecentEffect[]>("recent_effects"),
  sendEffect: (request: SendRequest) => invoke<string>("send_effect", { request }),
  previewEffect: (request: Omit<SendRequest, "deviceId">) => invoke<void>("preview_effect", { request }),
  effectLaunch: () => invoke<EffectLaunch>("effect_launch"),
  effectFinished: (completed: boolean) => invoke<void>("effect_finished", { completed }),
  serverStatus: () => invoke<ServerStatus>("server_status"),
  onEvent: (handler: (event: CoreEvent) => void): Promise<UnlistenFn> =>
    listen<CoreEvent>("lumio://event", (e) => handler(e.payload)),
};

/** Commands reject with a plain string; normalise for display. */
export const errorMessage = (err: unknown) => (typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong.");
