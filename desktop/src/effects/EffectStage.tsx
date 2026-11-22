import { useCallback, useEffect, useRef, useState } from "react";
import { catalog } from "../lib/catalog";
import { native, type EffectLaunch } from "../lib/native";
import { createAudio } from "./audio";
import { ARRIVAL_S, arrivalComet, departureFor, hasArrivalComet } from "./handoff";
import { RENDERERS } from "./registry";
import type { EffectContext, EffectFactory, EffectInstance } from "./types";

/** The parts of an effect context that come from the window and the launch. */
function ctxBase(canvas: HTMLCanvasElement, width: number, height: number, dpr: number, launch: EffectLaunch): Omit<EffectContext, "audio"> {
  return { canvas, width, height, dpr, intensity: launch.intensity, duration: launch.duration, mirror: launch.edge === "right", overlay: launch.overlay };
}

const FADE_IN_MS = 450;
const FADE_OUT_MS = 700;
const DEPART_FADE_OUT_MS = 150;
const EDGE_GLOW_MS = 1400;

/**
 * Effect experience. In overlay mode the window is transparent and click-through, so the effect plays
 * over the desktop and enters from the Send Zone edge. In an effect window it asks Rust what to render;
 * `preview` (dev builds in a plain browser) supplies the launch directly; `seek` (dev only) renders the
 * timeline up to that many seconds and freezes there, for screenshots.
 *
 * With `phase: "depart"` the window shows the short send-off that plays on the SENDER: the effect leaves
 * through the Send Zone edge. Arriving effects (except those with their own entrance) get a comet that
 * flies in from the same edge and bursts as the effect blooms, so the animation reads as one journey.
 */
export function EffectStage({ preview, seek }: { preview?: EffectLaunch; seek?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrivalRef = useRef<HTMLCanvasElement>(null);
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
    // (The dev preview keeps its stand-in wallpaper.)
    if (!launch?.overlay || preview) return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, [launch?.overlay, preview]);

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
    const arrivalCanvas = arrivalRef.current;
    if (!launch || !canvas) return;
    const spec = catalog.effects.find((e) => e.id === launch.effectId);
    const depart = launch.phase === "depart";
    const renderer = RENDERERS[launch.effectId];
    // Only effects this build can render (trusted catalog + a renderer) get a departure too.
    const factory: EffectFactory | undefined =
      spec && renderer ? (depart ? (c) => departureFor(spec.id)(c, spec.accent) : renderer) : undefined;
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
    if (arrivalCanvas) {
      arrivalCanvas.width = w;
      arrivalCanvas.height = h;
    }

    const audio = createAudio(launch.sound, launch.intensity);
    let instance: EffectInstance;
    try {
      instance = factory({ ...ctxBase(canvas, w, h, dpr, launch), audio });
    } catch (err) {
      console.error(err);
      audio?.dispose();
      setError("This effect couldn't start on this device.");
      setTimeout(() => finish(false), 1500);
      return;
    }

    // The arrival comet is decoration: if it can't start, the effect still plays.
    let arrival: EffectInstance | null = null;
    if (!depart && spec && arrivalCanvas && hasArrivalComet(spec.id)) {
      try {
        arrival = arrivalComet({ ...ctxBase(arrivalCanvas, w, h, dpr, launch), audio: null }, spec.accent);
      } catch (err) {
        console.error(err);
      }
    }
    const stopArrival = () => {
      arrival?.dispose();
      arrival = null;
      arrivalCanvas?.getContext("2d")?.clearRect(0, 0, arrivalCanvas.width, arrivalCanvas.height);
    };

    const onResize = () => {
      const [nw, nh] = size();
      canvas.width = nw;
      canvas.height = nh;
      instance.resize?.(nw, nh);
      if (arrivalCanvas) {
        arrivalCanvas.width = nw;
        arrivalCanvas.height = nh;
        arrival?.resize?.(nw, nh);
      }
    };
    window.addEventListener("resize", onResize);

    const opacity = (elapsed: number) =>
      depart
        ? Math.min(1, elapsed / 60, Math.max(0, (launch.duration - elapsed) / DEPART_FADE_OUT_MS))
        : Math.min(1, elapsed / FADE_IN_MS, Math.max(0, (launch.duration - elapsed) / FADE_OUT_MS));
    const draw = (elapsed: number, dt: number) => {
      canvas.style.opacity = String(opacity(elapsed));
      instance.frame(elapsed / 1000, dt, Math.min(1, elapsed / launch.duration));
      if (arrival) {
        if (elapsed / 1000 < ARRIVAL_S) {
          try {
            arrival.frame(elapsed / 1000, dt, 0);
          } catch (err) {
            console.error(err);
            stopArrival();
          }
        } else {
          stopArrival();
        }
      }
    };

    let raf = 0;
    if (seek !== undefined) {
      // Dev screenshots: step the timeline at 60 fps up to `seek` seconds, then hold that frame.
      const end = Math.min(seek * 1000, launch.duration);
      for (let ms = 0; ms <= end; ms += 1000 / 60) draw(ms, 1 / 60);
      canvas.style.opacity = "1";
    } else {
      const start = performance.now();
      let last = start;
      const loop = (now: number) => {
        const elapsed = now - start;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        try {
          draw(elapsed, dt);
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
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      instance.dispose();
      stopArrival();
      audio?.dispose();
    };
  }, [launch, finish, seek]);

  const effect = catalog.effects.find((e) => e.id === launch?.effectId);
  const overlay = launch?.overlay ?? false;
  const right = launch?.edge === "right";
  const depart = launch?.phase === "depart";

  return (
    <div className={`fixed inset-0 overflow-hidden ${overlay ? "bg-transparent" : "cursor-pointer bg-black"}`} onClick={() => finish(true)}>
      {/* Light spilling in from the edge where the phone is, as the effect arrives. */}
      {launch && effect && !depart && (
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
      <canvas ref={arrivalRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {launch && !depart && (
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
      {!overlay && !depart && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-white/30">Click or press Esc to close</p>
      )}
    </div>
  );
}
