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
}

export interface EffectInstance {
  /** Draws one frame. `t` is seconds since start, `dt` seconds since last frame, `progress` 0..1. */
  frame(t: number, dt: number, progress: number): void;
  resize?(width: number, height: number): void;
  dispose(): void;
}

export type EffectFactory = (ctx: EffectContext) => EffectInstance;

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
