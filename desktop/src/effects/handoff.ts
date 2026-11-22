import { roninDeparture } from "./renderers/ronin";
import { beginFrame, clamp01, ctx2d, easeOutCubic, phase, rand, sized, star, type EffectContext, type EffectInstance } from "./types";

// The handoff: an effect starts on the sender's screen and ends on the receiver's.
// Both are drawn in canonical space where x = 0 is the Send Zone edge (the side the phone is on);
// `beginFrame` mirrors them when the Send Zone is on the right.

/** Seconds into the departure when the comet leaves through the edge (matches DEPARTURE_HANDOFF in Rust). */
export const DEPARTURE_EXIT_S = 0.65;
/** How long the arrival comet layer runs on the receiver. */
export const ARRIVAL_S = 1.0;

type Accent = readonly [string, string];
export type HandoffFactory = (c: EffectContext, accent: Accent) => EffectInstance;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

const bez = (a: number, b: number, c: number, u: number) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;
const easeIn = (x: number) => clamp01(x) ** 2.4;

function glowOrb(g: CanvasRenderingContext2D, x: number, y: number, r: number, core: string, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  const grad = g.createRadialGradient(x, y, 0, x, y, r * 3);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, core);
  grad.addColorStop(0.45, withAlpha(core, 0.35));
  grad.addColorStop(1, withAlpha(core, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r * 3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** "#rrggbb" + alpha -> "rgba(...)". */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)},${alpha})`;
}

/** A smooth tapered trail through `points` (oldest first), widest and brightest at the head. */
function trail(g: CanvasRenderingContext2D, points: Array<[number, number]>, width: number, color: string) {
  if (points.length < 3) return;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]!;
    const [ax, ay] = points[Math.max(0, i - 1)]!;
    const [bx, by] = points[Math.min(points.length - 1, i + 1)]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const half = (width / 2) * Math.pow(i / (points.length - 1), 1.3);
    left.push([x + nx * half, y + ny * half]);
    right.push([x - nx * half, y - ny * half]);
  }
  const [tx, ty] = points[0]!;
  const [hx, hy] = points[points.length - 1]!;
  const grad = g.createLinearGradient(tx, ty, hx, hy);
  grad.addColorStop(0, withAlpha(color, 0));
  grad.addColorStop(0.6, withAlpha(color, 0.45));
  grad.addColorStop(1, withAlpha("#ffffff", 0.85));
  g.save();
  g.globalCompositeOperation = "lighter";
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(left[0]![0], left[0]![1]);
  for (const [x, y] of left) g.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i]![0], right[i]![1]);
  g.closePath();
  g.fill();
  g.restore();
}

function updateSparks(g: CanvasRenderingContext2D, sparks: Spark[], dt: number, t: number) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i]!;
    p.life -= dt * 1.6;
    if (p.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 2;
    p.vy *= 1 - dt * 2;
    g.globalAlpha = p.life;
    g.fillStyle = p.color;
    star(g, p.x, p.y, p.size * (0.7 + 0.3 * Math.sin(t * 25 + i)), 4, 0.35, t * 3 + i);
    g.fill();
  }
  g.restore();
}

/**
 * Generic departure: a glowing spark comet gathers at the centre, then whooshes along a slight curve
 * out through the Send Zone edge and leaves with a flash.
 */
export const sparkCometDeparture: HandoffFactory = (c, accent) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const sparks: Spark[] = [];
  const path: Array<[number, number]> = [];
  let whooshed = false;
  let flashed = -1;

  return {
    frame(t, dt) {
      beginFrame(g, c, s);
      const { w, h } = s;
      const m = Math.min(w, h);
      const r = m * 0.045;
      const [x0, y0] = [w * 0.5, h * 0.5];
      const [cx, cy] = [w * 0.28, h * 0.3];
      const [x1, y1] = [-r * 4, h * 0.42];
      const gather = clamp01(t / 0.25);
      const fly = easeIn(phase(t, 0.25, DEPARTURE_EXIT_S));
      const x = bez(x0, cx, x1, fly);
      const y = bez(y0, cy, y1, fly);

      if (t < 0.25) {
        // Sparks converge on the orb.
        if (Math.random() < 0.9) {
          const a = rand(0, Math.PI * 2);
          const d = m * rand(0.12, 0.22);
          sparks.push({ x: x0 + Math.cos(a) * d, y: y0 + Math.sin(a) * d, vx: -Math.cos(a) * d * 4, vy: -Math.sin(a) * d * 4, life: 0.6, size: m * rand(0.005, 0.01), color: Math.random() < 0.5 ? accent[1] : "#ffffff" });
        }
      } else if (fly < 1) {
        if (!whooshed) {
          whooshed = true;
          c.audio?.whoosh(0.5);
        }
        path.push([x, y]);
        if (path.length > 22) path.shift();
        for (let i = 0; i < 3; i++) {
          sparks.push({ x, y, vx: rand(-0.06, 0.06) * w, vy: rand(-0.06, 0.06) * h, life: 0.8, size: m * rand(0.004, 0.009), color: Math.random() < 0.5 ? accent[1] : accent[0] });
        }
      } else if (flashed < 0) {
        flashed = t;
      }

      trail(g, path, r * 2.6, accent[1]);
      if (fly < 1) {
        const pulse = 1 + 0.18 * Math.sin(t * 30) * (1 - fly);
        glowOrb(g, x, y, r * (0.4 + 0.6 * easeOutCubic(gather)) * pulse, accent[0]);
      } else if (path.length) {
        path.shift();
      }
      updateSparks(g, sparks, dt, t);

      // Flash at the edge as it leaves.
      if (flashed >= 0) {
        const k = clamp01((t - flashed) / 0.35);
        const grad = g.createRadialGradient(0, y1, 0, 0, y1, h * 0.35);
        grad.addColorStop(0, withAlpha("#ffffff", 0.8 * (1 - k)));
        grad.addColorStop(0.3, withAlpha(accent[0], 0.45 * (1 - k)));
        grad.addColorStop(1, withAlpha(accent[0], 0));
        g.fillStyle = grad;
        g.fillRect(0, y1 - h * 0.35, w * 0.2, h * 0.7);
      }
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      sparks.length = 0;
    },
  };
};

/**
 * Generic arrival on the receiver: a smaller comet enters from the Send Zone edge and bursts at about
 * 0.5 s, as the effect itself blooms. Drawn on its own layer above the effect.
 */
export const arrivalComet: HandoffFactory = (c, accent) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const sparks: Spark[] = [];
  const path: Array<[number, number]> = [];
  let burst = false;

  return {
    frame(t, dt) {
      beginFrame(g, c, s);
      const { w, h } = s;
      const m = Math.min(w, h);
      const r = m * 0.03;
      const fly = easeOutCubic(phase(t, 0, 0.5));
      const x = bez(-r * 4, w * 0.12, w * 0.3, fly);
      const y = bez(h * 0.42, h * 0.36, h * 0.46, fly);

      if (t < 0.5) {
        path.push([x, y]);
        if (path.length > 16) path.shift();
        sparks.push({ x, y, vx: rand(-0.04, 0.02) * w, vy: rand(-0.04, 0.04) * h, life: 0.6, size: m * rand(0.003, 0.007), color: accent[1] });
      } else {
        if (path.length) path.shift();
        if (!burst) {
          burst = true;
          const n = Math.round(24 + 20 * c.intensity);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
            const sp = m * rand(0.25, 0.55);
            sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, size: m * rand(0.005, 0.011), color: i % 2 ? accent[0] : "#ffffff" });
          }
        }
      }

      trail(g, path, r * 2.4, accent[1]);
      if (t < 0.5) glowOrb(g, x, y, r, accent[0], 0.9);
      if (burst) {
        const k = clamp01((t - 0.5) / 0.45);
        g.save();
        g.strokeStyle = withAlpha(accent[1], 0.7 * (1 - k));
        g.lineWidth = m * 0.008 * (1 - k) + 1;
        g.beginPath();
        g.arc(w * 0.3, h * 0.46, m * 0.04 + m * 0.22 * easeOutCubic(k), 0, Math.PI * 2);
        g.stroke();
        g.restore();
        glowOrb(g, w * 0.3, h * 0.46, r * 1.6 * (1 - k), "#ffffff", 1 - k);
      }
      updateSparks(g, sparks, dt, t);
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      sparks.length = 0;
    },
  };
};

/** Effect-specific departures; everything else uses the spark comet. */
const DEPARTURES: Readonly<Record<string, HandoffFactory>> = {
  "tiny-ronin": (c) => roninDeparture(c),
};

/** Effects that already make their own entrance, so the receiver skips the arrival comet. */
const OWN_ARRIVAL = new Set(["tiny-ronin"]);

export const departureFor = (effectId: string): HandoffFactory => DEPARTURES[effectId] ?? sparkCometDeparture;
export const hasArrivalComet = (effectId: string) => !OWN_ARRIVAL.has(effectId);
