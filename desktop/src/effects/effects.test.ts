import { describe, expect, test } from "bun:test";
import catalogJson from "../../../protocol/effects/catalog.json";
import { giantsWall, pirateVoyage, powerAura, spiralOrb } from "./renderers/anime";
import { celebration, fireworks, lightning, matrix, rainbow } from "./renderers/canvas";
import { cartoonParade } from "./renderers/cartoon";
import { arrivalComet, departureFor, hasArrivalComet, sparkCometDeparture } from "./handoff";
import { cosmicPortal } from "./renderers/portal";
import { roninDeparture, tinyRonin } from "./renderers/ronin";
import { RENDERERS } from "./registry";
import type { EffectFactory } from "./types";

/** A 2D context that accepts every call and records how many were made. */
function stubCanvas() {
  let calls = 0;
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return (...args: unknown[]) => {
        calls++;
        // Real canvases throw on negative radii; so does the stub.
        const radii = prop === "arc" ? [args[2]] : prop === "ellipse" ? [args[2], args[3]] : prop === "roundRect" ? [] : [];
        for (const r of radii) if (typeof r === "number" && r < 0) throw new RangeError(`${String(prop)}: negative radius ${r}`);
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
  const cases: Record<string, EffectFactory> = {
    rainbow,
    lightning,
    celebration,
    matrix,
    fireworks,
    cosmicPortal,
    spiralOrb,
    powerAura,
    giantsWall,
    pirateVoyage,
    cartoonParade,
    tinyRonin,
  };
  for (const [name, factory] of Object.entries(cases)) {
    for (const [intensity, mirror] of [
      [0, false],
      [0.5, true],
      [1, false],
    ] as const) {
      test(`${name} @ intensity ${intensity}${mirror ? " (right edge)" : ""}`, () => {
        const { canvas, calls } = stubCanvas();
        const fx = factory({ canvas, width: 1280, height: 800, dpr: 2, intensity, duration: 6000, audio: null, mirror, overlay: true });
        for (let i = 0; i <= 360; i++) fx.frame(i / 60, 1 / 60, i / 360);
        fx.resize?.(640, 400);
        fx.frame(6.1, 1 / 60, 1);
        fx.dispose();
        expect(calls()).toBeGreaterThan(100);
      });
    }
  }
});

describe("handoff: departures on the sender, arrival comet on the receiver", () => {
  const accent = ["#ef4444", "#38bdf8"] as const;
  const cases: Record<string, EffectFactory> = {
    sparkCometDeparture: (c) => sparkCometDeparture(c, accent),
    roninDeparture: (c) => roninDeparture(c),
    arrivalComet: (c) => arrivalComet(c, accent),
  };
  for (const [name, factory] of Object.entries(cases)) {
    for (const mirror of [false, true]) {
      test(`${name}${mirror ? " (right edge)" : ""} runs its 1.1 s timeline`, () => {
        const { canvas, calls } = stubCanvas();
        const fx = factory({ canvas, width: 1280, height: 800, dpr: 2, intensity: 0.8, duration: 1100, audio: null, mirror, overlay: true });
        for (let i = 0; i <= 66; i++) fx.frame(i / 60, 1 / 60, i / 66);
        fx.resize?.(640, 400);
        fx.frame(1.2, 1 / 60, 1);
        fx.dispose();
        expect(calls()).toBeGreaterThan(50);
      });
    }
  }

  test("Tiny Ronin has his own departure and makes his own entrance", () => {
    expect(departureFor("tiny-ronin")).not.toBe(departureFor("aurora"));
    expect(departureFor("aurora")).toBe(sparkCometDeparture);
    expect(departureFor("unknown")).toBe(sparkCometDeparture);
    expect(hasArrivalComet("tiny-ronin")).toBe(false);
    expect(hasArrivalComet("cosmic-portal")).toBe(true);
  });
});
