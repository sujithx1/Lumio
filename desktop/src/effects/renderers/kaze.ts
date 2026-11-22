import { beginFrame, clamp01, ctx2d, easeInOut, easeOutBack, easeOutCubic, phase, rand, sized, type EffectContext, type EffectFactory, type EffectInstance } from "../types";
import { basePose, blush, type Bit, drawBits, eyes, figure, mouth, OUTLINE, SKIN, sparkle, updateBits, type ChibiPose } from "./chibi";
import { drawHeart } from "./ronin";

// Kaze: an original fox-eared girl with a lavender ponytail and two little crescent-moon blades.
// She spins in like a top from the Send Zone edge, winks, then whirls up a spiral of crossing glowing
// crescents and swirling leaves, finishes with a big X across the screen, and whirls away.

const EAR = "#fb923c";
const EAR_TIP = "#fff7ed";
const EAR_INNER = "#fecdd3";
const HAIR = "#c4b5fd";
const HAIR_DARK = "#a78bfa";
const TOP = "#f8fafc";
const TRIM = "#a855f7";
const OBI = "#14b8a6";
const LEGGINGS = "#1e1b4b";
const SHOE = "#7c3aed";
const BLADE = "#e2e8f0";
const GLOW = "#22d3ee";
const VIOLET = "#a855f7";
const LEAVES = ["#4ade80", "#2dd4bf", "#86efac", "#5eead4"];

export interface KazePose extends ChibiPose {
  /** Arms out with blades (0) or blades put away (1). */
  sheathed: boolean;
  /** Arm spread angle (radians) for spins. */
  arms: number;
  eyes: "open" | "blink" | "happy";
  wink: boolean;
  /** Tail swish angle. */
  tail: number;
}

export const kazePose = (x: number, y: number, size: number, t: number): KazePose => ({
  ...basePose(x, y, size, t),
  sheathed: false,
  arms: -0.55,
  eyes: "open",
  wink: false,
  tail: 0,
});

function crescentBlade(g: CanvasRenderingContext2D, size: number, lw: number) {
  // A small crescent moon: outer arc minus an inner offset arc, with a cyan glowing edge.
  g.save();
  g.shadowColor = GLOW;
  g.shadowBlur = size * 0.6;
  g.fillStyle = BLADE;
  g.beginPath();
  g.arc(0, 0, size, -Math.PI * 0.85, Math.PI * 0.85);
  g.arc(-size * 0.45, 0, size * 0.82, Math.PI * 0.7, -Math.PI * 0.7, true);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = OUTLINE;
  g.lineWidth = lw * 0.8;
  g.stroke();
  g.strokeStyle = GLOW;
  g.lineWidth = lw * 0.9;
  g.beginPath();
  g.arc(0, 0, size * 0.92, -Math.PI * 0.6, Math.PI * 0.6);
  g.stroke();
  g.restore();
}

export function drawKaze(g: CanvasRenderingContext2D, p: KazePose) {
  if (p.size < 4) return;
  const { H, R, lw, hy } = figure(g, p);

  // Fluffy fox tail behind her.
  g.save();
  g.translate(-H * 0.12, -H * 0.2);
  g.rotate(-0.6 + p.tail);
  g.fillStyle = EAR;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-H * 0.12, -H * 0.05, -H * 0.3, -H * 0.02, -H * 0.36, -H * 0.16);
  g.bezierCurveTo(-H * 0.3, -H * 0.3, -H * 0.1, -H * 0.2, 0, -H * 0.06);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = EAR_TIP;
  g.beginPath();
  g.ellipse(-H * 0.31, -H * 0.17, H * 0.06, H * 0.075, -0.6, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // Leggings and little shoes.
  for (const side of [-1, 1] as const) {
    const dx = side * H * 0.06;
    g.fillStyle = LEGGINGS;
    g.beginPath();
    g.roundRect(dx - H * 0.03, -H * 0.16, H * 0.06, H * 0.14, H * 0.025);
    g.fill();
    g.stroke();
    g.fillStyle = SHOE;
    g.beginPath();
    g.ellipse(dx + H * 0.015, -H * 0.022, H * 0.055, H * 0.028, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // Back arm with its blade.
  const armA = p.sheathed ? 0.9 : -0.4 - p.arms;
  g.save();
  g.translate(-H * 0.1, -H * 0.36);
  g.rotate(Math.PI - armA);
  g.fillStyle = TOP;
  g.beginPath();
  g.ellipse(H * 0.06, 0, H * 0.075, H * 0.04, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (!p.sheathed) {
    g.save();
    g.translate(H * 0.16, 0);
    crescentBlade(g, H * 0.085, lw);
    g.restore();
  }
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(H * 0.13, 0, H * 0.03, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // Short kimono-style top with violet trim and a teal obi; a little flared skirt.
  g.fillStyle = TOP;
  g.beginPath();
  g.moveTo(-H * 0.14, -H * 0.43);
  g.lineTo(H * 0.14, -H * 0.43);
  g.lineTo(H * 0.2, -H * 0.15);
  g.quadraticCurveTo(0, -H * 0.11, -H * 0.2, -H * 0.15);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = TRIM;
  g.lineWidth = lw * 1.5;
  g.beginPath();
  g.moveTo(-H * 0.06, -H * 0.43);
  g.lineTo(H * 0.04, -H * 0.3);
  g.moveTo(H * 0.06, -H * 0.43);
  g.lineTo(-H * 0.0, -H * 0.34);
  g.moveTo(-H * 0.19, -H * 0.165);
  g.quadraticCurveTo(0, -H * 0.125, H * 0.19, -H * 0.165);
  g.stroke();
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;
  g.fillStyle = OBI;
  g.beginPath();
  g.roundRect(-H * 0.15, -H * 0.3, H * 0.3, H * 0.05, H * 0.015);
  g.fill();
  g.stroke();

  // Ponytail (high, swinging) behind the head.
  const swing = Math.sin(p.t * 5) * 0.15 + (1 - Math.abs(p.turn)) * 0.4;
  g.save();
  g.translate(-R * 0.45, hy - R * 0.85);
  g.rotate(-0.5 + swing);
  g.fillStyle = HAIR;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-R * 0.5, -R * 0.2, -R * 1.2, R * 0.2, -R * 1.25, R * 1.05);
  g.bezierCurveTo(-R * 0.95, R * 0.75, -R * 0.55, R * 0.4, R * 0.15, R * 0.2);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = TRIM;
  g.beginPath();
  g.arc(0, R * 0.05, R * 0.12, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // Fox ears.
  for (const [ex, tilt] of [
    [-R * 0.5, -0.35],
    [R * 0.45, 0.3],
  ] as const) {
    g.save();
    g.translate(ex, hy - R * 0.72);
    g.rotate(tilt + Math.sin(p.t * 3 + ex) * 0.05);
    g.fillStyle = EAR;
    g.beginPath();
    g.moveTo(-R * 0.28, R * 0.1);
    g.quadraticCurveTo(-R * 0.18, -R * 0.55, 0, -R * 0.72);
    g.quadraticCurveTo(R * 0.18, -R * 0.55, R * 0.28, R * 0.1);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = EAR_INNER;
    g.beginPath();
    g.moveTo(-R * 0.14, R * 0.02);
    g.quadraticCurveTo(0, -R * 0.42, R * 0.14, R * 0.02);
    g.closePath();
    g.fill();
    g.fillStyle = EAR_TIP;
    g.beginPath();
    g.moveTo(-R * 0.1, -R * 0.5);
    g.quadraticCurveTo(0, -R * 0.68, R * 0.1, -R * 0.5);
    g.lineTo(0, -R * 0.72);
    g.closePath();
    g.fill();
    g.restore();
  }

  // Head.
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(0, hy, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Hair cap with soft bangs and long side locks.
  g.fillStyle = HAIR;
  g.beginPath();
  g.moveTo(-R * 1.02, hy + R * 0.55);
  g.quadraticCurveTo(-R * 1.15, hy - R * 0.9, 0, hy - R * 1.08);
  g.quadraticCurveTo(R * 1.12, hy - R * 0.95, R * 1.02, hy + R * 0.1);
  g.quadraticCurveTo(R * 0.85, hy - R * 0.3, R * 0.62, hy - R * 0.32);
  g.quadraticCurveTo(R * 0.48, hy - R * 0.08, R * 0.3, hy - R * 0.36);
  g.quadraticCurveTo(R * 0.1, hy - R * 0.1, -R * 0.12, hy - R * 0.38);
  g.quadraticCurveTo(-R * 0.4, hy - R * 0.2, -R * 0.55, hy + R * 0.0);
  g.quadraticCurveTo(-R * 0.75, hy + R * 0.3, -R * 0.78, hy + R * 0.62);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = HAIR_DARK;
  g.beginPath();
  g.moveTo(-R * 0.4, hy - R * 0.85);
  g.quadraticCurveTo(-R * 0.1, hy - R * 0.6, R * 0.15, hy - R * 0.9);
  g.stroke();
  g.strokeStyle = OUTLINE;

  eyes(g, R, hy, lw, p.eyes, { iris: "#6d28d9", wink: p.wink });
  blush(g, R, hy);
  mouth(g, R, hy, lw, p.eyes === "happy" || p.wink ? "w" : "smile");

  // Front arm with its blade.
  g.save();
  g.translate(H * 0.1, -H * 0.36);
  g.rotate(p.sheathed ? 0.9 : -0.4 - p.arms);
  g.fillStyle = TOP;
  g.beginPath();
  g.ellipse(H * 0.06, 0, H * 0.075, H * 0.04, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (!p.sheathed) {
    g.save();
    g.translate(H * 0.16, 0);
    crescentBlade(g, H * 0.085, lw);
    g.restore();
  }
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(H * 0.13, 0, H * 0.03, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  g.restore();
}

/** A glowing crescent arc around (cx, cy): radius r, from angle a0 sweeping `sweep`, revealed 0..1. */
function arcSlash(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, sweep: number, thick: number, reveal: number, alpha: number, dpr: number) {
  if (reveal <= 0 || alpha <= 0) return;
  const N = 36;
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * reveal;
    const a = a0 + sweep * u;
    const wdt = thick * Math.pow(Math.sin(Math.PI * (i / N)), 0.7);
    outer.push([cx + Math.cos(a) * (r + wdt * 0.5), cy + Math.sin(a) * (r + wdt * 0.5)]);
    inner.push([cx + Math.cos(a) * (r - wdt * 0.5), cy + Math.sin(a) * (r - wdt * 0.5)]);
  }
  const shape = (scale: number) => {
    g.beginPath();
    outer.forEach(([x, y], i) => {
      const [ix, iy] = inner[i]!;
      const mx = (x + ix) / 2;
      const my = (y + iy) / 2;
      const px = mx + (x - mx) * scale;
      const py = my + (y - my) * scale;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    for (let i = inner.length - 1; i >= 0; i--) {
      const [x, y] = inner[i]!;
      const [ox, oy] = outer[i]!;
      const mx = (x + ox) / 2;
      const my = (y + oy) / 2;
      g.lineTo(mx + (x - mx) * scale, my + (y - my) * scale);
    }
    g.closePath();
  };
  g.save();
  g.globalAlpha = alpha;
  // Violet outer glow, cyan middle, white core.
  g.shadowColor = VIOLET;
  g.shadowBlur = 26 * dpr;
  g.fillStyle = "rgba(168,85,247,0.55)";
  shape(1);
  g.fill();
  g.shadowColor = GLOW;
  g.shadowBlur = 12 * dpr;
  g.fillStyle = "rgba(103,232,249,0.9)";
  shape(0.55);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#ffffff";
  shape(0.2);
  g.fill();
  g.restore();
}

/** A straight tapered slash from a to b (for the final X). */
function lineSlash(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, thick: number, reveal: number, alpha: number, dpr: number) {
  if (reveal <= 0 || alpha <= 0) return;
  const ex = ax + (bx - ax) * reveal;
  const ey = ay + (by - ay) * reveal;
  const len = Math.hypot(ex - ax, ey - ay) || 1;
  const nx = -(ey - ay) / len;
  const ny = (ex - ax) / len;
  const shape = (wdt: number) => {
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo((ax + ex) / 2 + nx * wdt, (ay + ey) / 2 + ny * wdt, ex, ey);
    g.quadraticCurveTo((ax + ex) / 2 - nx * wdt, (ay + ey) / 2 - ny * wdt, ax, ay);
    g.closePath();
  };
  g.save();
  g.globalAlpha = alpha;
  g.shadowColor = VIOLET;
  g.shadowBlur = 30 * dpr;
  g.fillStyle = "rgba(168,85,247,0.6)";
  shape(thick);
  g.fill();
  g.shadowColor = GLOW;
  g.shadowBlur = 14 * dpr;
  g.fillStyle = "rgba(103,232,249,0.95)";
  shape(thick * 0.5);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#ffffff";
  shape(thick * 0.18);
  g.fill();
  g.restore();
}

const leaf = (x: number, y: number, m: number, vx = 0, vy = 0): Bit => ({
  x,
  y,
  vx,
  vy,
  rot: rand(0, 6),
  spin: rand(-6, 6),
  size: m * rand(0.008, 0.015),
  life: 1,
  decay: rand(0.35, 0.6),
  gravity: m * 0.05,
  color: LEAVES[Math.floor(rand(0, LEAVES.length))]!,
  kind: "leaf",
});

/** Leaves orbiting a centre in a rising spiral (the whirlwind). */
interface Orbit {
  a: number;
  r: number;
  speed: number;
  y: number;
  bit: Bit;
}

const SLASH_COUNT = 7;
const SPIN_START = 0.3;
const X_AT = 0.62;

export const kaze: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bits: Bit[] = [];
  const orbits: Orbit[] = [];
  let leafTimer = 0;
  const slashed = Array.from({ length: SLASH_COUNT }, () => false);
  let xDone = false;
  let heartAt = -1;
  let whooshed = false;

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const H = h * 0.24;
      const ground = h * 0.88;
      const lw = Math.max(1.5, H * 0.018);
      const stopX = w * 0.36;
      const pose = kazePose(stopX, ground, H, t);
      const centre: [number, number] = [w * 0.56, h * 0.45];
      let spinning = 0;

      // 0–0.18: spins in like a top, leaves trailing.
      if (progress < 0.18) {
        const k = phase(progress, 0, 0.18);
        pose.x = -H * 0.6 + (stopX + H * 0.6) * easeOutCubic(k);
        spinning = 1 - phase(k, 0.75, 1);
        pose.y -= Math.sin(Math.PI * k) * H * 0.15;
        if (!whooshed) {
          whooshed = true;
          c.audio?.whoosh(0.8);
        }
        leafTimer -= dt;
        if (leafTimer <= 0) {
          leafTimer = 0.03;
          bits.push(leaf(pose.x - H * 0.1, ground - H * rand(0.2, 0.8), m, -rand(0.02, 0.08) * w, rand(-0.03, 0.03) * h));
        }
      }

      // 0.18–0.3: pose — tail swish, wink, sparkle.
      const posing = phase(progress, 0.18, 0.3);
      if (progress >= 0.18 && progress < 0.3) {
        pose.tail = Math.sin(posing * Math.PI * 3) * 0.35;
        pose.wink = posing > 0.25 && posing < 0.85;
        pose.y -= Math.sin(Math.PI * phase(posing, 0.4, 0.8)) * H * 0.08;
        pose.arms = -0.3;
      }

      // 0.3–0.7: whirlwind of crescents around the centre, leaves swirling, then the big X.
      if (progress >= SPIN_START && progress < 0.7) {
        const k = phase(progress, SPIN_START, 0.7);
        spinning = 1;
        pose.y -= H * 0.12 * Math.sin(Math.PI * Math.min(1, k * 1.3));
        // Arms held out level, so the blades sweep around her and never cross her face.
        pose.arms = -0.55;
        // Leaves spiral in around the centre.
        leafTimer -= dt;
        if (leafTimer <= 0 && k < 0.85) {
          leafTimer = 0.025 / (0.5 + c.intensity);
          orbits.push({ a: rand(0, Math.PI * 2), r: m * rand(0.08, 0.38), speed: rand(2.5, 4.5), y: rand(-0.1, 0.1) * h, bit: leaf(0, 0, m) });
        }
        for (let i = 0; i < SLASH_COUNT; i++) {
          const at = SPIN_START + (i / SLASH_COUNT) * (X_AT - SPIN_START - 0.02);
          if (!slashed[i] && progress >= at) {
            slashed[i] = true;
            c.audio?.whoosh(0.3);
          }
        }
        if (!xDone && progress >= X_AT) {
          xDone = true;
          c.audio?.shing();
          setTimeout(() => c.audio?.shing(), 90);
          for (let i = 0; i < 40; i++) {
            const a = rand(0, Math.PI * 2);
            const sp = m * rand(0.2, 0.6);
            bits.push({ ...leaf(centre[0], centre[1], m, Math.cos(a) * sp, Math.sin(a) * sp), decay: 0.6 });
          }
          for (const o of orbits) {
            o.bit.vx = Math.cos(o.a) * m * 0.6;
            o.bit.vy = Math.sin(o.a) * m * 0.6;
            o.bit.x = centre[0] + Math.cos(o.a) * o.r;
            o.bit.y = centre[1] + Math.sin(o.a) * o.r * 0.55 + o.y;
            bits.push(o.bit);
          }
          orbits.length = 0;
        }
      }

      // 0.7–0.82: blades away, tail wag, heart.
      if (progress >= 0.7 && progress < 0.82) {
        const k = phase(progress, 0.7, 0.82);
        pose.sheathed = true;
        pose.tail = Math.sin(k * Math.PI * 6) * 0.3;
        pose.eyes = k > 0.15 && k < 0.95 ? "happy" : "open";
        if (heartAt < 0 && k > 0.3) {
          heartAt = t;
          c.audio?.pop();
        }
      }

      // 0.82–1: whirls off as a little leaf tornado.
      const leave = phase(progress, 0.82, 1);
      if (progress >= 0.82) {
        pose.sheathed = true;
        spinning = 1;
        pose.x = stopX + (w * 1.2 - stopX) * Math.pow(leave, 1.5);
        pose.y -= H * 0.15 * Math.sin(Math.PI * leave);
        leafTimer -= dt;
        if (leafTimer <= 0) {
          leafTimer = 0.02;
          const a = rand(0, Math.PI * 2);
          bits.push(leaf(pose.x + Math.cos(a) * H * 0.4, ground - H * rand(0, 1.1), m, -w * rand(0.02, 0.08), -h * rand(0, 0.05)));
        }
      }

      if (spinning > 0) pose.turn = Math.cos(t * 22) * spinning + (1 - spinning);
      if (progress < 0.18 || progress >= 0.3) pose.wink = false;
      if (pose.eyes === "open" && Math.sin(t * 1.6) > 0.985) pose.eyes = "blink";

      // --- draw ---
      // Whirl lines around her while spinning.
      if (spinning > 0.1) {
        g.save();
        g.strokeStyle = `rgba(255,255,255,${0.5 * spinning})`;
        g.lineWidth = 2 * dpr;
        for (let i = 0; i < 3; i++) {
          const yy = ground - H * (0.3 + i * 0.25);
          const a0 = t * 12 + i * 2;
          g.beginPath();
          g.ellipse(pose.x, yy, H * (0.32 + i * 0.04), H * 0.07, 0, a0, a0 + 2.2);
          g.stroke();
        }
        g.restore();
      }

      // Crescent slashes spiralling out around the centre.
      for (let i = 0; i < SLASH_COUNT; i++) {
        const start = SPIN_START + (i / SLASH_COUNT) * (X_AT - SPIN_START - 0.02);
        const u = (progress - start) / 0.12;
        if (u <= 0 || u >= 1) continue;
        const r = m * (0.1 + 0.045 * i);
        const a0 = i * 2.4 + 0.3;
        arcSlash(g, centre[0], centre[1], r, a0, Math.PI * 1.2, m * (0.03 + 0.015 * c.intensity), easeOutCubic(phase(u, 0, 0.35)), 1 - phase(u, 0.4, 1), dpr);
      }

      // The big X.
      const xu = (progress - X_AT) / 0.1;
      if (xu > 0 && xu < 1) {
        const reveal = easeOutCubic(phase(xu, 0, 0.3));
        const fade = 1 - phase(xu, 0.45, 1);
        const thick = m * (0.035 + 0.02 * c.intensity);
        lineSlash(g, w * 0.3, h * 0.12, w * 0.86, h * 0.8, thick, reveal, fade, dpr);
        lineSlash(g, w * 0.86, h * 0.12, w * 0.3, h * 0.8, thick, phase(xu, 0.12, 0.42), fade, dpr);
        if (xu < 0.3) {
          g.save();
          g.globalAlpha = 0.25 * (1 - xu / 0.3);
          g.fillStyle = "#ffffff";
          g.fillRect(0, 0, w, h);
          g.restore();
        }
      }

      // Orbiting leaves (the whirlwind).
      for (const o of orbits) {
        o.a += o.speed * dt;
        o.r *= 1 - dt * 0.15;
        o.bit.x = centre[0] + Math.cos(o.a) * o.r;
        o.bit.y = centre[1] + Math.sin(o.a) * o.r * 0.55 + o.y;
        o.bit.rot += o.bit.spin * dt;
      }
      drawBits(g, orbits.map((o) => ({ ...o.bit, life: 1 })), lw);

      drawKaze(g, pose);

      if (posing > 0 && posing < 1) sparkle(g, pose.x + H * 0.45, ground - H * 1.12, H * 0.09 * Math.sin(Math.PI * posing), t, "#e9d5ff", dpr);

      if (heartAt >= 0) {
        const k = t - heartAt;
        if (k < 1.4) {
          g.save();
          g.globalAlpha = 1 - phase(k, 0.9, 1.4);
          g.fillStyle = "#f472b6";
          g.strokeStyle = OUTLINE;
          g.lineWidth = lw;
          drawHeart(g, pose.x + H * 0.28, ground - H * 1.2 - k * H * 0.25, H * 0.09 * easeOutBack(Math.min(1, k * 3)));
          g.fill();
          g.stroke();
          g.restore();
        }
      }

      updateBits(bits, dt);
      drawBits(g, bits, lw);
      void clamp01;
      void easeInOut;
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      bits.length = 0;
      orbits.length = 0;
    },
  };
};

/** Kaze's departure: she spins up at the centre and whirls off through the Send Zone edge as a leaf tornado. */
export const kazeDeparture = (c: EffectContext): EffectInstance => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bits: Bit[] = [];
  let timer = 0;
  let whooshed = false;
  c.audio?.pop();

  return {
    frame(t, dt) {
      beginFrame(g, c, s);
      const { w, h } = s;
      const m = Math.min(w, h);
      const H = h * 0.22;
      const ground = h * 0.62;
      const lw = Math.max(1.5, H * 0.018);
      const pop = easeOutBack(Math.min(1, t / 0.22));
      const go = phase(t, 0.3, 0.65);
      if (go > 0 && !whooshed) {
        whooshed = true;
        c.audio?.whoosh(0.5);
      }
      const pose = kazePose(w * 0.5 - (w * 0.5 + H * 1.2) * Math.pow(go, 1.6), ground, H, t);
      pose.facing = -1;
      const spin = Math.min(1, t / 0.3);
      pose.turn = Math.cos(t * (10 + 20 * spin)) * spin + (1 - spin);
      pose.arms = -0.55;
      pose.y -= H * 0.2 * Math.sin(Math.PI * Math.min(1, t / 0.65));
      timer -= dt;
      if (timer <= 0) {
        timer = 0.02;
        const a = rand(0, Math.PI * 2);
        bits.push(leaf(pose.x + Math.cos(a) * H * 0.4, ground - H * rand(0, 1.1), m, w * rand(0.02, 0.08), -h * rand(0, 0.05)));
      }
      updateBits(bits, dt);
      drawBits(g, bits, lw);
      if (pop < 0.03) return;
      g.save();
      g.translate(pose.x, ground);
      g.scale(pop, pop);
      g.translate(-pose.x, -ground);
      drawKaze(g, pose);
      g.restore();
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      bits.length = 0;
    },
  };
};
