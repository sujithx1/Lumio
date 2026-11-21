/**
 * DEV ONLY: lets the UI run in a plain browser (http://localhost:1420/?mock) with sample data,
 * for design review without the Rust side. Never bundled into production builds (guarded by
 * import.meta.env.DEV in main.tsx). Drive events from the console with window.__lumioEmit({...}).
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { CoreEvent, Peer, Snapshot } from "../lib/native";

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

export function installMockIpc() {
  mockWindows("main");
  mockIPC(
    (cmd) => {
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
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as unknown as { __lumioEmit: (e: CoreEvent) => Promise<void> }).__lumioEmit = (e) => emit("lumio://event", e);
}
