import { giantsWall, pirateVoyage, powerAura, spiralOrb } from "./renderers/anime";
import { celebration, fireworks, lightning, matrix, rainbow } from "./renderers/canvas";
import { cartoonParade } from "./renderers/cartoon";
import { cosmicPortal } from "./renderers/portal";
import { aurora, eventHorizon, volcano } from "./renderers/shaders";
import type { EffectFactory } from "./types";

/**
 * Renderers available on desktop, keyed by catalog id.
 * A received effect is rendered only if its id is both in the trusted catalog and in this map.
 * To add an effect: add it to protocol/effects/catalog.json, then here and in mobile/lib/effects/renderers.dart.
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
  "spiral-orb": spiralOrb,
  "pirate-voyage": pirateVoyage,
  "giants-wall": giantsWall,
  "power-aura": powerAura,
  "cartoon-parade": cartoonParade,
  "event-horizon": eventHorizon,
};
