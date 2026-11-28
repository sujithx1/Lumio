/**
 * Records README animations of effects from the dev preview, using the Chrome installed on this machine.
 *
 *   bun run dev                                 (in another terminal: Vite on http://localhost:1420)
 *   bun scripts/readme-gifs.ts [effect-id ...]  writes docs/media/<effect>.gif
 *
 * Each frame is a fresh load of ?effect=…&at=<seconds>, which steps the timeline to that moment. Math.random is
 * seeded before the page runs, so particles and characters land in the same place on every load.
 */
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import puppeteer from "puppeteer-core";

const ROOT = join(import.meta.dir, "../..");
const OUT = join(ROOT, "docs/media");
const BASE = process.env.PREVIEW_URL ?? "http://localhost:1420";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 560;
const HEIGHT = 350;
const FPS = 8;

const DEFAULT = ["tiny-ronin", "kaze", "snooze", "fireworks", "cosmic-portal", "event-horizon"];
const catalog = (await Bun.file(join(ROOT, "protocol/effects/catalog.json")).json()) as {
  effects: { id: string; defaultDuration: number }[];
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  let s = 0x2f6e2b1;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
});

mkdirSync(OUT, { recursive: true });
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT) {
  const effect = catalog.effects.find((e) => e.id === id);
  if (!effect) throw new Error(`unknown effect ${id}`);
  const duration = effect.defaultDuration;
  const frames: Uint8Array[] = [];
  for (let t = 0.1; t < duration / 1000 - 0.15; t += 1 / FPS) {
    const url = `${BASE}/?effect=${id}&duration=${duration}&edge=right&overlay=1&from=iPhone&at=${t.toFixed(3)}`;
    await page.goto(url, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 350));
    const png = PNG.sync.read(Buffer.from(await page.screenshot({ type: "png" })));
    frames.push(new Uint8Array(png.data));
  }
  // One palette for the whole clip: smaller files and no colour flicker between frames.
  const sample = frames.filter((_, i) => i % 3 === 0);
  const joined = new Uint8Array(sample.reduce((n, f) => n + f.length, 0));
  sample.reduce((offset, f) => (joined.set(f, offset), offset + f.length), 0);
  const palette = quantize(joined, 256);
  const gif = GIFEncoder();
  for (const f of frames) gif.writeFrame(applyPalette(f, palette), WIDTH, HEIGHT, { palette, delay: 1000 / FPS });
  gif.finish();
  writeFileSync(join(OUT, `${id}.gif`), gif.bytes());
  console.log(`wrote docs/media/${id}.gif (${frames.length} frames, ${(gif.bytes().length / 1024).toFixed(0)} KB)`);
}
await browser.close();
