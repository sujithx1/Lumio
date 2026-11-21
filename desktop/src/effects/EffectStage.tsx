import { useCallback, useEffect, useRef, useState } from "react";
import { catalog } from "../lib/catalog";
import { native, type EffectLaunch } from "../lib/native";
import { createAudio } from "./audio";
import { RENDERERS } from "./registry";
import type { EffectInstance } from "./types";

const FADE_IN_MS = 450;
const FADE_OUT_MS = 700;
const EDGE_GLOW_MS = 1400;

/**
 * Effect experience. In overlay mode the window is transparent and click-through, so the effect plays
 * over the desktop and enters from the Send Zone edge. In an effect window it asks Rust what to render;
 * `preview` (dev builds in a plain browser) supplies the launch directly.
 */
export function EffectStage({ preview }: { preview?: EffectLaunch }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [launch, setLaunch] = useState<EffectLaunch | null>(preview ?? null);
  const [showLabel, setShowLabel] = useState(true);
  const [glow, setGlow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  const finish = useCallback(
    (completed: boolean) => {
      if (finished.current) return;
      finished.current = true;
      if (preview) return;
      void native.effectFinished(completed).catch(() => window.close());
    },
    [preview],
  );

  useEffect(() => {
    if (preview) return;
    native
      .effectLaunch()
      .then(setLaunch)
      .catch(() => finish(false));
  }, [preview, finish]);

  // Overlay windows must not paint the app background.
  useEffect(() => {
    if (!launch?.overlay) return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, [launch?.overlay]);

  useEffect(() => {
    const t1 = setTimeout(() => setShowLabel(false), 2600);
    const t2 = setTimeout(() => setGlow(false), EDGE_GLOW_MS);
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", " ", "Enter"].includes(e.key)) finish(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!launch || !canvas) return;
    const factory = RENDERERS[launch.effectId];
    if (!factory) {
      setError("This effect isn't available on this device.");
      setTimeout(() => finish(false), 1500);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => [Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr)] as const;
    const [w, h] = size();
    canvas.width = w;
    canvas.height = h;

    const audio = createAudio(launch.sound, launch.intensity);
    let instance: EffectInstance;
    try {
      instance = factory({
        canvas,
        width: w,
        height: h,
        dpr,
        intensity: launch.intensity,
        duration: launch.duration,
        audio,
        mirror: launch.edge === "right",
        overlay: launch.overlay,
      });
    } catch (err) {
      console.error(err);
      audio?.dispose();
      setError("This effect couldn't start on this device.");
      setTimeout(() => finish(false), 1500);
      return;
    }

    const onResize = () => {
      const [nw, nh] = size();
      canvas.width = nw;
      canvas.height = nh;
      instance.resize?.(nw, nh);
    };
    window.addEventListener("resize", onResize);

    const start = performance.now();
    let last = start;
    let raf = 0;
    const loop = (now: number) => {
      const elapsed = now - start;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      canvas.style.opacity = String(Math.min(1, elapsed / FADE_IN_MS, Math.max(0, (launch.duration - elapsed) / FADE_OUT_MS)));
      try {
        instance.frame(elapsed / 1000, dt, Math.min(1, elapsed / launch.duration));
      } catch (err) {
        console.error(err);
        finish(false);
        return;
      }
      if (elapsed >= launch.duration) {
        finish(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      instance.dispose();
      audio?.dispose();
    };
  }, [launch, finish]);

  const effect = catalog.effects.find((e) => e.id === launch?.effectId);
  const overlay = launch?.overlay ?? false;
  const right = launch?.edge === "right";

  return (
    <div className={`fixed inset-0 overflow-hidden ${overlay ? "bg-transparent" : "cursor-pointer bg-black"}`} onClick={() => finish(true)}>
      {/* Light spilling in from the edge where the phone is, as the effect arrives. */}
      {launch && effect && (
        <div
          className="pointer-events-none absolute inset-y-0 w-[28vw] transition-opacity duration-1000"
          style={{
            [right ? "right" : "left"]: 0,
            opacity: glow ? 1 : 0,
            background: `linear-gradient(${right ? "270deg" : "90deg"}, ${effect.accent[0]}aa, ${effect.accent[1]}44 45%, transparent)`,
            filter: "blur(18px)",
          }}
        />
      )}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ opacity: 0 }} />
      {launch && (
        <div
          className={`pointer-events-none absolute top-10 rounded-pill px-5 py-2 text-[13px] text-fg glass transition-opacity duration-slow ${
            showLabel ? "opacity-100" : "opacity-0"
          } ${right ? "right-10" : "left-10"}`}
        >
          <span className="font-medium">{effect?.name}</span>
          {launch.fromName && <span className="text-fg-muted"> · from {launch.fromName}</span>}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="rounded-lg px-5 py-3 text-[14px] text-fg glass">{error}</p>
        </div>
      )}
      {!overlay && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-white/30">Click or press Esc to close</p>
      )}
    </div>
  );
}
