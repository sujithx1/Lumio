import { celebration, fireworks, lightning, matrix, rainbow } from "./renderers/canvas";
import { aurora, cosmicPortal, volcano } from "./renderers/shaders";
import type { EffectFactory } from "./types";

/**
 * Renderers available on desktop, keyed by catalog id.
 * A received effect is rendered only if its id is both in the trusted catalog and in this map.
 */
export const RENDERERS: Readonly<Record<string, EffectFactory>> = {
  "cosmic-portal": cosmicPortal,
  rainbow,
  volcano,
  lightning,
  celebration,
  matrix,
  aurora,
  fireworks,
};
