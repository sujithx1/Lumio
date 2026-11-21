import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import catalog from "../../protocol/effects/catalog.json" with { type: "json" };
import catalogSchema from "../../protocol/effects/catalog.schema.json" with { type: "json" };
import messageSchema from "../../protocol/schemas/message.schema.json" with { type: "json" };

describe("effect catalog", () => {
  test("matches its schema", () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validate = ajv.compile(catalogSchema);
    const ok = validate(catalog);
    if (!ok) throw new Error(JSON.stringify(validate.errors, null, 2));
  });

  test("ids are unique and valid protocol effect ids", () => {
    const ids = catalog.effects.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pattern = new RegExp(messageSchema.$defs.EffectId.pattern);
    for (const id of ids) expect(id).toMatch(pattern);
  });

  test("durations are ordered min <= default <= max", () => {
    for (const e of catalog.effects) {
      expect(e.minDuration).toBeLessThanOrEqual(e.defaultDuration);
      expect(e.defaultDuration).toBeLessThanOrEqual(e.maxDuration);
    }
  });

  test("contains the launch effects", () => {
    expect(catalog.effects.map((e) => e.id).sort()).toEqual([
      "aurora",
      "cartoon-parade",
      "celebration",
      "cosmic-portal",
      "event-horizon",
      "fireworks",
      "giants-wall",
      "lightning",
      "matrix",
      "pirate-voyage",
      "power-aura",
      "rainbow",
      "spiral-orb",
      "volcano",
    ]);
  });
});
