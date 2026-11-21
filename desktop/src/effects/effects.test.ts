import { describe, expect, test } from "bun:test";
import catalogJson from "../../../protocol/effects/catalog.json";
import { celebration, fireworks, lightning, matrix, rainbow } from "./renderers/canvas";
import { RENDERERS } from "./registry";
import type { EffectFactory } from "./types";

/** A 2D context that accepts every call and records how many were made. */
function stubCanvas() {
  let calls = 0;
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return (..._args: unknown[]) => {
        calls++;
        return gradient;
      };
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
  const canvas = { getContext: (kind: string) => (kind === "2d" ? ctx : null) } as unknown as HTMLCanvasElement;
  return { canvas, calls: () => calls };
}

describe("effect registry", () => {
  test("every catalog effect has a desktop renderer, and nothing else does", () => {
    expect(Object.keys(RENDERERS).sort()).toEqual(catalogJson.effects.map((e) => e.id).sort());
  });
});

describe("canvas effects run a full timeline without throwing", () => {
  const cases: Record<string, EffectFactory> = { rainbow, lightning, celebration, matrix, fireworks };
  for (const [name, factory] of Object.entries(cases)) {
    for (const intensity of [0, 0.5, 1]) {
      test(`${name} @ intensity ${intensity}`, () => {
        const { canvas, calls } = stubCanvas();
        const fx = factory({ canvas, width: 1280, height: 800, dpr: 2, intensity, duration: 6000, audio: null });
        for (let i = 0; i <= 360; i++) fx.frame(i / 60, 1 / 60, i / 360);
        fx.resize?.(640, 400);
        fx.frame(6.1, 1 / 60, 1);
        fx.dispose();
        expect(calls()).toBeGreaterThan(100);
      });
    }
  }
});
