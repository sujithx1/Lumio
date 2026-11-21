import raw from "../../../protocol/effects/catalog.json";
import type { Platform } from "./native";

export type EffectCategory = "space" | "light" | "nature" | "energy" | "party" | "digital";

export interface EffectDefinition {
  id: string;
  name: string;
  description: string;
  category: EffectCategory;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  defaultIntensity: number;
  renderer: { web: "canvas" | "webgl" | "lottie"; flutter: "painter" | "shader" | "lottie" };
  supportedPlatforms: Platform[];
  hasSound: boolean;
  accent: [string, string];
}

/** The trusted effect catalog bundled into this build (validated against its schema in server tests). */
export const catalog = raw as { version: number; effects: EffectDefinition[] };

export const CATEGORY_LABEL: Record<EffectCategory, string> = {
  space: "Space",
  light: "Light",
  nature: "Nature",
  energy: "Energy",
  party: "Party",
  digital: "Digital",
};

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
