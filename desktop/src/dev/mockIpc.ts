/**
 * DEV ONLY: lets the UI run in a plain browser (http://localhost:1420/?mock) with sample data,
 * for design review without the Rust side. Never bundled into production builds (guarded by
 * import.meta.env.DEV in main.tsx). Drive events from the console with window.__lumioEmit({...}).
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { CoreEvent, Peer, Settings, Snapshot, Transfer } from "../lib/native";

const now = Date.now();
const peers: Peer[] = [
  { deviceId: "0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7b", name: "Satyam's iPhone", platform: "ios", online: true, lastSeenAt: now, pairedAt: now - 86400e3 * 3 },
  { deviceId: "0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7c", name: "Studio PC", platform: "windows", online: true, lastSeenAt: now, pairedAt: now - 86400e3 * 9 },
  { deviceId: "0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7d", name: "Pixel 9", platform: "android", online: false, lastSeenAt: now - 3600e3 * 2, pairedAt: now - 86400e3 * 20 },
];

const snapshot: Snapshot = {
  me: { deviceId: "0193a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b", name: "MacBook Pro", platform: "macos" },
  connection: "online",
  connectionDetail: null,
  peers,
  serverUrl: "http://localhost:8787",
  platform: "macos",
  appVersion: "0.1.0",
  deviceName: "MacBook Pro",
};

let settings: Settings = { sendZone: "right", displayMode: "overlay", sound: true, downloadDir: null, fileEffect: "pirate-voyage" };

const transfers: Transfer[] = [
  { key: "t1", transferId: "x1", direction: "receive", peerDeviceId: peers[0]!.deviceId, peerName: peers[0]!.name, name: "IMG_2041.HEIC", size: 3_481_903, bytes: 3_481_903, status: "saved", detail: null, path: "/Users/me/Downloads/Lumio/IMG_2041.HEIC", startedAt: now - 300e3 },
  { key: "t2", transferId: "x2", direction: "send", peerDeviceId: peers[0]!.deviceId, peerName: peers[0]!.name, name: "Quarterly report.pdf", size: 912_004, bytes: 912_004, status: "delivered", detail: null, path: null, startedAt: now - 900e3 },
  { key: "t3", transferId: "x3", direction: "send", peerDeviceId: peers[1]!.deviceId, peerName: peers[1]!.name, name: "holiday-clip.mov", size: 48_220_113, bytes: 2_000_000, status: "failed", detail: "The other device went offline.", path: null, startedAt: now - 3600e3 },
];

/** Pretends to send a file so progress, delivery and toasts can be reviewed. */
function simulateSend(deviceId: string, name: string, size: number) {
  const peer = peers.find((p) => p.deviceId === deviceId) ?? peers[0]!;
  const t: Transfer = { key: `mock-${Math.random()}`, transferId: null, direction: "send", peerDeviceId: peer.deviceId, peerName: peer.name, name, size, bytes: 0, status: "uploading", detail: null, path: null, startedAt: Date.now() };
  const push = (patch: Partial<Transfer>) => {
    Object.assign(t, patch);
    void emit("lumio://event", { kind: "transfer", transfer: { ...t } } satisfies CoreEvent);
  };
  push({});
  let step = 0;
  const timer = setInterval(() => {
    step++;
    if (step <= 10) push({ bytes: Math.round((size * step) / 10) });
    else if (step === 11) push({ status: "offered" });
    else {
      clearInterval(timer);
      push({ status: "delivered" });
    }
  }, 250);
  return t.key;
}

export function installMockIpc() {
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      switch (cmd) {
        case "get_snapshot":
          return snapshot;
        case "recent_effects":
          return [
            { eventId: "e1", direction: "sent", peerDeviceId: peers[0]!.deviceId, peerName: peers[0]!.name, effectId: "aurora", status: "completed", route: "relay", at: now - 120e3 },
            { eventId: "e2", direction: "received", peerDeviceId: peers[1]!.deviceId, peerName: peers[1]!.name, effectId: "fireworks", status: "completed", route: "relay", at: now - 3600e3 },
            { eventId: "e3", direction: "sent", peerDeviceId: peers[2]!.deviceId, peerName: peers[2]!.name, effectId: "lightning", status: "receiver_offline", route: "relay", at: now - 7200e3 },
          ];
        case "create_pairing": {
          const size = 29;
          let modules = "";
          for (let i = 0; i < size * size; i++) modules += (i * 2654435761) % 7 < 3 ? "1" : "0";
          return { pairingId: "p1", code: "7KQ2M-X9FHT", expiresAt: Date.now() + 120e3, uri: "lumio://pair", qr: { size, modules } };
        }
        case "send_effect":
          return "evt-mock";
        case "get_settings":
          return settings;
        case "update_settings":
          settings = (args as { value: Settings }).value;
          return settings;
        case "files_info":
          return { downloadDir: settings.downloadDir ?? "/Users/me/Downloads/Lumio", defaultDownloadDir: "/Users/me/Downloads/Lumio" };
        case "choose_download_dir":
          settings = { ...settings, downloadDir: "/Users/me/Pictures/From phone" };
          return settings;
        case "list_transfers":
          return transfers;
        case "send_files":
          return (args as { paths: string[] }).paths.map((p) => simulateSend((args as { deviceId: string }).deviceId, p.split("/").pop() ?? p, 4_200_000));
        case "choose_and_send_files":
          return [simulateSend((args as { deviceId: string }).deviceId, "Beach day.jpg", 2_481_903)];
        case "reveal_file":
          return null;
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as unknown as { __lumioEmit: (e: CoreEvent) => Promise<void> }).__lumioEmit = (e) => emit("lumio://event", e);
}
