import type { Tone } from "../components/ui";
import type { ConnectionState, Platform } from "./native";

export const PLATFORM_LABEL: Record<Platform, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

export function connectionTone(state: ConnectionState | undefined): { tone: Tone; label: string } {
  switch (state) {
    case "online":
      return { tone: "online", label: "Connected" };
    case "offline":
      return { tone: "offline", label: "Offline · retrying" };
    case "revoked":
      return { tone: "danger", label: "Device removed" };
    default:
      return { tone: "pending", label: "Connecting…" };
  }
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Sending",
  relayed: "Delivered",
  received: "Playing",
  completed: "Played",
  failed: "Not shown",
  receiver_offline: "Device offline",
  expired: "Expired",
  rejected: "Rejected",
  notified: "Notified",
};
