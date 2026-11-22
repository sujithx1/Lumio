/**
 * Draws every Lumio icon from one design: a four-point star of light with a comet trail,
 * the look of an effect flying from one device to another. Brand colours from protocol/design/tokens.json.
 *
 *   bun scripts/icons.ts        then   bunx tauri icon src-tauri/icons/app-icon.png
 *                                      (cd ../mobile && dart run flutter_launcher_icons && dart run flutter_native_splash:create)
 *
 * Writes:
 *   protocol/design/icon/lumio-icon.svg, lumio-mark.svg   master artwork
 *   desktop/src-tauri/icons/app-icon.png                  macOS-style rounded tile (source for `tauri icon`)
 *   desktop/src-tauri/icons/tray.png                      monochrome menu-bar template
 *   mobile/assets/icon/*.png                              iOS/Android launcher icons, splash marks, in-app logo
 */
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const ACCENT = "#7c5cff";
const ACCENT_ALT = "#22d3ee";

const f = (n: number) => n.toFixed(1);

/** A four-point star with pinched (concave) sides, centred on (cx, cy). */
function star(cx: number, cy: number, r: number, pinch = 0.11): string {
  const c = r * pinch;
  return [
    `M${f(cx)} ${f(cy - r)}`,
    `Q${f(cx + c)} ${f(cy - c)} ${f(cx + r)} ${f(cy)}`,
    `Q${f(cx + c)} ${f(cy + c)} ${f(cx)} ${f(cy + r)}`,
    `Q${f(cx - c)} ${f(cy + c)} ${f(cx - r)} ${f(cy)}`,
    `Q${f(cx - c)} ${f(cy - c)} ${f(cx)} ${f(cy - r)}Z`,
  ].join(" ");
}

/** A comet trail along a cubic Bézier that widens toward its head. */
function trail(p: number[][], tail: number, head: number): string {
  const at = (t: number) => {
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1].map((i) => k.reduce((s, w, j) => s + w * p[j]![i]!, 0)) as [number, number];
  };
  const steps = 64;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = at(t);
    const [x2, y2] = at(Math.min(1, t + 0.001));
    const [x1, y1] = at(Math.max(0, t - 0.001));
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const w = (tail + (head - tail) * Math.pow(t, 1.3)) / 2;
    left.push(`${f(x + nx * w)} ${f(y + ny * w)}`);
    right.unshift(`${f(x - nx * w)} ${f(y - ny * w)}`);
  }
  return `M${left.join(" L")} L${right.join(" L")}Z`;
}

// Everything is drawn on a 1024 canvas; the star sits upper right, the trail sweeps in from lower left.
const HEAD = [668, 356];
const CURVE = [
  [150, 872],
  [262, 600],
  [440, 420],
  HEAD,
];

const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1a1546"/>
    <stop offset="0.5" stop-color="#140f36"/>
    <stop offset="1" stop-color="#07080c"/>
  </linearGradient>
  <radialGradient id="glow" cx="${HEAD[0]}" cy="${HEAD[1]}" r="560" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.85"/>
    <stop offset="0.35" stop-color="${ACCENT}" stop-opacity="0.28"/>
    <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="${CURVE[0]![0]}" y1="${CURVE[0]![1]}" x2="${HEAD[0]}" y2="${HEAD[1]}">
    <stop offset="0" stop-color="${ACCENT}" stop-opacity="0"/>
    <stop offset="0.4" stop-color="${ACCENT}" stop-opacity="0.9"/>
    <stop offset="0.78" stop-color="${ACCENT_ALT}"/>
    <stop offset="1" stop-color="#ffffff"/>
  </linearGradient>
  <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/>
  </filter>`;

const trailPath = trail(CURVE, 6, 92);

/** The star and its trail, with no background. */
const mark = `
  <path d="${trailPath}" fill="url(#trail)" filter="url(#bloom)" opacity="0.85"/>
  <path d="${trailPath}" fill="url(#trail)"/>
  <path d="${star(HEAD[0]!, HEAD[1]!, 250, 0.12)}" fill="${ACCENT_ALT}" filter="url(#bloom)" opacity="0.95"/>
  <path d="${star(HEAD[0]!, HEAD[1]!, 214)}" fill="#ffffff"/>
  <circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="52" fill="#ffffff" filter="url(#soft)"/>
  <path d="${star(318, 292, 62)}" fill="#ffffff" opacity="0.9"/>
  <circle cx="842" cy="660" r="13" fill="#ffffff" opacity="0.75"/>
  <circle cx="262" cy="462" r="8" fill="#ffffff" opacity="0.55"/>`;

const background = `
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="${HEAD[0]}" cy="${HEAD[1]}" r="560" fill="url(#glow)"/>`;

const svg = (body: string, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024"><defs>${defs}</defs>${body}</svg>`;

/** Content scaled about the centre (for safe zones). */
const scaled = (body: string, s: number) => `<g transform="translate(${512 - 512 * s} ${512 - 512 * s}) scale(${s})">${body}</g>`;

// macOS: a rounded tile with margin and a soft shadow (Big Sur grid: 824 px tile on 1024).
const TILE = 824;
const tileOffset = (1024 - TILE) / 2;
const macTile = `
  <defs><clipPath id="tile"><rect x="${tileOffset}" y="${tileOffset}" width="${TILE}" height="${TILE}" rx="186"/></clipPath></defs>
  <rect x="${tileOffset}" y="${tileOffset}" width="${TILE}" height="${TILE}" rx="186" fill="#07080c" filter="url(#shadow)"/>
  <g clip-path="url(#tile)">${scaled(background + mark, TILE / 1024)}</g>
  <rect x="${tileOffset + 1}" y="${tileOffset + 1}" width="${TILE - 2}" height="${TILE - 2}" rx="185" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>`;

// Menu bar: a template image (black + alpha; macOS tints it for light and dark menu bars).
const trayStar = (cx: number, cy: number, r: number) => `<path d="${star(cx, cy, r, 0.14)}" fill="#000"/>`;
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  ${trayStar(38, 26, 22)}${trayStar(15, 46, 9)}<circle cx="50" cy="51" r="3" fill="#000"/></svg>`;

function render(svgText: string, path: string, width = 1024, background?: string) {
  const png = new Resvg(svgText, { fitTo: { mode: "width", value: width }, ...(background ? { background } : {}) }).render().asPng();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, png);
  console.log(`wrote ${path.replace(ROOT + "/", "")}`);
}

const design = join(ROOT, "protocol/design/icon");
mkdirSync(design, { recursive: true });
writeFileSync(join(design, "lumio-icon.svg"), svg(background + mark) + "\n");
writeFileSync(join(design, "lumio-mark.svg"), svg(mark) + "\n");

const icons = join(ROOT, "desktop/src-tauri/icons");
render(svg(macTile), join(icons, "app-icon.png"));
render(tray, join(icons, "tray.png"), 64);

const mobile = join(ROOT, "mobile/assets/icon");
// iOS rejects transparency in the app icon, so the full-bleed icon is flattened onto the darkest colour.
render(svg(background + mark), join(mobile, "icon.png"), 1024, "#07080c");
render(svg(background), join(mobile, "android-background.png"));
// Adaptive icons are cropped to a circle or squircle: keep the mark inside the central ~62%.
render(svg(scaled(mark, 0.62)), join(mobile, "android-foreground.png"));
// Splash marks: the classic splash centres the image; Android 12 shows it inside a circle (2/3 of the canvas).
render(svg(scaled(mark, 0.9)), join(mobile, "splash.png"), 768);
render(svg(scaled(mark, 0.6)), join(mobile, "splash-android12.png"), 960);
// In-app logo for the phone's home header: the icon as a rounded tile, small enough to bundle.
const roundTile = `<defs><clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath></defs><g clip-path="url(#r)">${background + mark}</g>`;
render(svg(roundTile), join(mobile, "logo.png"), 192);
