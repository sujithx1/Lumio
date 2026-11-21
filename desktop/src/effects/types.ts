import type { EffectAudio } from "./audio";

export interface EffectContext {
  canvas: HTMLCanvasElement;
  /** Device pixels. */
  width: number;
  height: number;
  dpr: number;
  /** 0..1 */
  intensity: number;
  /** Milliseconds. */
  duration: number;
  /** Null when sound is off or unavailable. */
  audio: EffectAudio | null;
  /**
   * Effects are written to enter from the LEFT edge. When the phone sits at the right edge
   * (the Send Zone), `mirror` is true and drawing is flipped horizontally.
   */
  mirror: boolean;
  /** Drawing over the desktop (transparent) rather than a black full-screen window. */
  overlay: boolean;
}

export interface EffectInstance {
  /** Draws one frame. `t` is seconds since start, `dt` seconds since last frame, `progress` 0..1. */
  frame(t: number, dt: number, progress: number): void;
  resize?(width: number, height: number): void;
  dispose(): void;
}

export type EffectFactory = (ctx: EffectContext) => EffectInstance;

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
export const easeOutBack = (x: number) => {
  const v = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};
/** 0 → 1 over [a, b]. */
export const phase = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}

/** Mutable size shared by a canvas effect and its resize handler. */
export function sized(c: EffectContext) {
  return { w: c.width, h: c.height, dpr: c.dpr };
}

/**
 * Starts a frame: resets the transform, clears to transparent, and applies the Send Zone mirror
 * so that "x = 0" is the edge the effect enters from.
 */
export function beginFrame(g: CanvasRenderingContext2D, c: EffectContext, s: { w: number; h: number }, opts: { clear?: boolean; mirror?: boolean } = {}) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.shadowBlur = 0;
  if (opts.clear ?? true) g.clearRect(0, 0, s.w, s.h);
  if ((opts.mirror ?? true) && c.mirror) g.setTransform(-1, 0, 0, 1, s.w, 0);
}

/** Fades what is already drawn toward transparent, for motion trails on a see-through canvas. */
export function fadeCanvas(g: CanvasRenderingContext2D, s: { w: number; h: number }, amount: number) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = `rgba(0,0,0,${amount})`;
  g.fillRect(0, 0, s.w, s.h);
  g.restore();
}

export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = 0.45, rot = 0) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}
