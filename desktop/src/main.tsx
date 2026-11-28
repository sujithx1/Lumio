import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { EffectStage } from "./effects/EffectStage";
import type { EffectLaunch } from "./lib/native";
import "./index.css";

function windowLabel(): string | null {
  try {
    return getCurrentWindow().label;
  } catch {
    return null; // Not running inside Tauri.
  }
}

// Dev builds opened in a plain browser can preview an effect with
// ?effect=<id>&intensity=0.8&duration=6000&edge=right&overlay=1&from=iPhone (overlay shows a stand-in wallpaper).
// &phase=depart previews the sender's departure instead; &at=<seconds> freezes the frame at that moment.
function devPreview(): EffectLaunch | undefined {
  if (!import.meta.env.DEV || windowLabel() !== null) return undefined;
  const q = new URLSearchParams(location.search);
  const effectId = q.get("effect");
  if (!effectId) return undefined;
  const overlay = q.get("overlay") !== "0";
  if (overlay) {
    document.documentElement.style.background =
      "radial-gradient(120% 90% at 30% 20%, #3b82f6 0%, #1e3a8a 45%, #0b1437 100%)";
    document.body.style.background = "transparent";
  }
  const depart = q.get("phase") === "depart";
  return {
    eventId: null,
    effectId,
    duration: Number(q.get("duration") ?? (depart ? 1100 : 600000)),
    intensity: Number(q.get("intensity") ?? 0.8),
    sound: false,
    fromName: q.get("from") ?? "Preview",
    edge: q.get("edge") === "left" ? "left" : "right",
    overlay,
    phase: depart ? "depart" : "arrive",
  };
}

function devSeek(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const at = new URLSearchParams(location.search).get("at");
  return at === null ? undefined : Number(at);
}

// Dev builds opened in a plain browser can run the UI on sample data with ?mock.
if (import.meta.env.DEV && windowLabel() === null && new URLSearchParams(location.search).has("mock")) {
  const { installMockIpc } = await import("./dev/mockIpc");
  installMockIpc();
}

// The same bundle serves the main window and the full-screen effect windows ("effect-<n>").
const preview = devPreview();
const seek = devSeek();
const isEffectWindow = windowLabel()?.startsWith("effect-") ?? false;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isEffectWindow || preview ? <EffectStage {...(preview ? { preview } : {})} {...(seek !== undefined ? { seek } : {})} /> : <App />}</React.StrictMode>,
);
