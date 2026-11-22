import { star } from "../types";

// Shared drawing helpers for the chibi character effects (Boing, Kaze, Pebble, Snooze).
// Same proportions as Tiny Ronin: the head is ~55% of the figure, drawn facing +x, feet at the origin.

export const OUTLINE = "#1f2937";
export const SKIN = "#ffd7b5";

export interface ChibiPose {
  /** Feet position (canvas pixels). */
  x: number;
  y: number;
  /** Figure height in pixels. */
  size: number;
  /** 1 faces +x, -1 faces -x. */
  facing: 1 | -1;
  /** Horizontal squash for spins: cos(angle) gives a 3D "turning" look. 1 = normal. */
  turn: number;
  /** Squash/stretch: >1 taller. */
  stretch: number;
  /** Lean back (positive) or forward (negative), radians. */
  lean: number;
  /** Seconds, for idle motion. */
  t: number;
}

export const basePose = (x: number, y: number, size: number, t: number): ChibiPose => ({
  x,
  y,
  size,
  facing: 1,
  turn: 1,
  stretch: 1,
  lean: 0,
  t,
});

/** Sets up the figure's transform (feet at the origin, facing +x) and its ground shadow. Restore when done. */
export function figure(g: CanvasRenderingContext2D, p: ChibiPose, shadow = true): { H: number; R: number; lw: number; hy: number } {
  const H = p.size;
  const R = H * 0.29;
  const lw = Math.max(1.5, H * 0.018);
  g.save();
  g.translate(p.x, p.y);
  if (shadow) {
    g.fillStyle = "rgba(15,23,42,0.22)";
    g.beginPath();
    g.ellipse(0, 0, H * 0.26 * Math.max(0.3, Math.abs(p.turn)), H * 0.045, 0, 0, Math.PI * 2);
    g.fill();
  }
  const sx = p.facing * (Math.abs(p.turn) < 0.05 ? 0.05 * Math.sign(p.turn || 1) : p.turn);
  g.scale(sx / Math.sqrt(p.stretch), p.stretch);
  g.rotate(-p.lean);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;
  return { H, R, lw, hy: -H + R };
}

export type EyeMode = "open" | "blink" | "happy" | "sleepy" | "closed";

/** Two big glossy eyes on a head of radius R centred at (0, hy), facing +x. */
export function eyes(g: CanvasRenderingContext2D, R: number, hy: number, lw: number, mode: EyeMode, opts: { iris?: string; glow?: string; wink?: boolean } = {}) {
  const ey = hy + R * 0.12;
  [R * 0.05, R * 0.58].forEach((ex, i) => {
    const m: EyeMode = opts.wink && i === 0 ? "happy" : mode;
    g.save();
    g.strokeStyle = OUTLINE;
    g.lineWidth = lw * 1.4;
    if (m === "happy") {
      g.beginPath();
      g.moveTo(ex - R * 0.12, ey + R * 0.04);
      g.quadraticCurveTo(ex, ey - R * 0.14, ex + R * 0.12, ey + R * 0.04);
      g.stroke();
    } else if (m === "blink" || m === "closed") {
      g.beginPath();
      g.moveTo(ex - R * 0.12, ey + R * 0.02);
      g.quadraticCurveTo(ex, ey + R * 0.1, ex + R * 0.12, ey + R * 0.02);
      g.stroke();
    } else if (m === "sleepy") {
      // Half-closed: the lower half of the eye under a heavy lid.
      g.beginPath();
      g.ellipse(ex, ey + R * 0.05, R * 0.12, R * 0.1, 0, 0, Math.PI);
      g.fillStyle = opts.iris ?? OUTLINE;
      g.fill();
      g.beginPath();
      g.moveTo(ex - R * 0.15, ey + R * 0.03);
      g.lineTo(ex + R * 0.15, ey + R * 0.03);
      g.stroke();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(ex + R * 0.04, ey + R * 0.09, R * 0.025, 0, Math.PI * 2);
      g.fill();
    } else {
      if (opts.glow) {
        g.shadowColor = opts.glow;
        g.shadowBlur = R * 0.5;
      }
      g.fillStyle = opts.iris ?? OUTLINE;
      g.beginPath();
      g.ellipse(ex, ey, R * 0.13, R * 0.19, 0, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      if (opts.iris) {
        // A darker pupil inside a coloured iris.
        g.fillStyle = OUTLINE;
        g.beginPath();
        g.ellipse(ex + R * 0.01, ey + R * 0.03, R * 0.07, R * 0.11, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(ex - R * 0.04, ey - R * 0.07, R * 0.055, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ex + R * 0.045, ey + R * 0.07, R * 0.028, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

export function blush(g: CanvasRenderingContext2D, R: number, hy: number, color = "rgba(253,164,175,0.75)") {
  const ey = hy + R * 0.12;
  g.fillStyle = color;
  for (const bx of [-R * 0.2, R * 0.8]) {
    g.beginPath();
    g.ellipse(bx, ey + R * 0.3, R * 0.13, R * 0.075, 0, 0, Math.PI * 2);
    g.fill();
  }
}

export type MouthMode = "smile" | "w" | "grin" | "o" | "flat";

export function mouth(g: CanvasRenderingContext2D, R: number, hy: number, lw: number, mode: MouthMode, open = 1) {
  const mx = R * 0.33;
  const my = hy + R * 0.48;
  g.save();
  g.strokeStyle = OUTLINE;
  g.lineWidth = lw * 1.1;
  if (mode === "w") {
    g.beginPath();
    g.moveTo(mx - R * 0.12, my);
    g.quadraticCurveTo(mx - R * 0.06, my + R * 0.1, mx, my);
    g.quadraticCurveTo(mx + R * 0.06, my + R * 0.1, mx + R * 0.12, my);
    g.stroke();
  } else if (mode === "grin") {
    // A wide open "D" grin with a row of teeth.
    g.fillStyle = "#7f1d1d";
    g.beginPath();
    g.moveTo(mx - R * 0.22, my - R * 0.04);
    g.lineTo(mx + R * 0.24, my - R * 0.04);
    g.quadraticCurveTo(mx + R * 0.2, my + R * 0.26, mx, my + R * 0.26);
    g.quadraticCurveTo(mx - R * 0.2, my + R * 0.26, mx - R * 0.22, my - R * 0.04);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = "#ffffff";
    g.fillRect(mx - R * 0.24, my - R * 0.05, R * 0.5, R * 0.09);
    g.fillStyle = "#fb7185";
    g.beginPath();
    g.ellipse(mx, my + R * 0.24, R * 0.12, R * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.stroke();
  } else if (mode === "o") {
    g.fillStyle = "#7f1d1d";
    g.beginPath();
    g.ellipse(mx, my + R * 0.06, R * 0.07 + R * 0.05 * open, R * 0.06 + R * 0.12 * open, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (mode === "flat") {
    g.beginPath();
    g.moveTo(mx - R * 0.08, my + R * 0.02);
    g.lineTo(mx + R * 0.08, my + R * 0.02);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(mx - R * 0.11, my);
    g.quadraticCurveTo(mx, my + R * 0.13, mx + R * 0.11, my);
    g.stroke();
  }
  g.restore();
}

/** Two short legs with shoes; `walk` is the step angle and `amount` 0..1 how much they move. */
export function legs(g: CanvasRenderingContext2D, H: number, leg: string, shoe: string, walk: number, amount: number, lace?: string) {
  const swing = Math.sin(walk) * H * 0.09 * amount;
  for (const side of [-1, 1] as const) {
    const dx = side * H * 0.07 + swing * side;
    const lift = Math.max(0, Math.cos(walk) * side) * H * 0.05 * amount;
    g.fillStyle = leg;
    g.beginPath();
    g.roundRect(dx - H * 0.035, -H * 0.13 - lift, H * 0.07, H * 0.11, H * 0.03);
    g.fill();
    g.stroke();
    g.fillStyle = shoe;
    g.beginPath();
    g.ellipse(dx + H * 0.02, -H * 0.022 - lift, H * 0.07, H * 0.032, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (lace) {
      g.save();
      g.strokeStyle = lace;
      g.beginPath();
      g.moveTo(dx + H * 0.0, -H * 0.04 - lift);
      g.lineTo(dx + H * 0.04, -H * 0.03 - lift);
      g.stroke();
      g.restore();
    }
  }
}

/** A little four-point sparkle pair. */
export function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, color = "#fde68a", dpr = 1) {
  if (r <= 0.5) return;
  g.save();
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 14 * dpr;
  star(g, x, y, r, 4, 0.35, t * 3);
  g.fill();
  star(g, x + r * 1.4, y + r * 2.2, r * 0.5, 4, 0.35, -t * 3);
  g.fill();
  g.restore();
}

/** Generic particle: confetti, leaves, pebbles, sparks. */
export interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  life: number;
  /** Seconds of life lost per second. */
  decay: number;
  /** Downward acceleration in px/s². */
  gravity: number;
  color: string;
  kind: "dot" | "leaf" | "rock" | "spark" | "square";
}

export function updateBits(bits: Bit[], dt: number, floor = Infinity) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]!;
    b.life -= b.decay * dt;
    if (b.life <= 0) {
      bits.splice(i, 1);
      continue;
    }
    b.vy += b.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;
    if (b.y > floor && b.vy > 0) {
      b.y = floor;
      b.vy *= -0.45;
      b.vx *= 0.7;
    }
  }
}

export function drawBits(g: CanvasRenderingContext2D, bits: Bit[], lw: number) {
  for (const b of bits) {
    g.save();
    g.globalAlpha = Math.min(1, b.life * 1.5);
    g.translate(b.x, b.y);
    g.rotate(b.rot);
    g.fillStyle = b.color;
    if (b.kind === "leaf") {
      g.beginPath();
      g.moveTo(-b.size, 0);
      g.quadraticCurveTo(0, -b.size * 0.75, b.size, 0);
      g.quadraticCurveTo(0, b.size * 0.75, -b.size, 0);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.45)";
      g.lineWidth = Math.max(1, lw * 0.5);
      g.beginPath();
      g.moveTo(-b.size * 0.8, 0);
      g.lineTo(b.size * 0.8, 0);
      g.stroke();
    } else if (b.kind === "rock") {
      g.beginPath();
      g.moveTo(-b.size, -b.size * 0.3);
      g.lineTo(-b.size * 0.3, -b.size);
      g.lineTo(b.size * 0.8, -b.size * 0.6);
      g.lineTo(b.size, b.size * 0.4);
      g.lineTo(-b.size * 0.2, b.size);
      g.closePath();
      g.fill();
      g.strokeStyle = OUTLINE;
      g.lineWidth = Math.max(1, lw * 0.6);
      g.stroke();
    } else if (b.kind === "spark") {
      g.globalCompositeOperation = "lighter";
      star(g, 0, 0, b.size, 4, 0.3, 0);
      g.fill();
    } else if (b.kind === "square") {
      g.fillRect(-b.size, -b.size * 0.6, b.size * 2, b.size * 1.2);
    } else {
      g.beginPath();
      g.arc(0, 0, b.size, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

/** Bold comic text with a dark outline. */
export function comicText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `900 ${Math.round(size)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.strokeStyle = OUTLINE;
  g.lineWidth = size * 0.16;
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

/** A fluffy cloud of overlapping circles centred at (x, y), `r` wide-ish. */
export function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 1) {
  const blobs: Array<[number, number, number]> = [
    [-0.55, 0.1, 0.42],
    [-0.15, -0.2, 0.55],
    [0.35, -0.08, 0.48],
    [0.65, 0.15, 0.35],
    [0.05, 0.22, 0.45],
  ];
  if (stroke) {
    g.save();
    g.strokeStyle = stroke;
    g.lineWidth = lw * 2;
    for (const [bx, by, br] of blobs) {
      g.beginPath();
      g.arc(x + bx * r, y + by * r, br * r, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }
  g.fillStyle = fill;
  for (const [bx, by, br] of blobs) {
    g.beginPath();
    g.arc(x + bx * r, y + by * r, br * r, 0, Math.PI * 2);
    g.fill();
  }
}

/** A jagged lightning polyline from a to b with `segments` kinks of amplitude `amp`, seeded for stable flicker. */
export function boltPoints(ax: number, ay: number, bx: number, by: number, segments: number, amp: number, seed: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[ax, ay]];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const u = i / segments;
    const r = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const off = ((r - Math.floor(r)) * 2 - 1) * amp * Math.sin(Math.PI * u) ** 0.5;
    pts.push([ax + dx * u + nx * off, ay + dy * u + ny * off]);
  }
  pts.push([bx, by]);
  return pts;
}

export function strokeBolt(g: CanvasRenderingContext2D, pts: Array<[number, number]>, width: number, outer: string, mid: string, dpr: number, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.lineJoin = "round";
  g.lineCap = "round";
  const path = () => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  };
  g.shadowColor = outer;
  g.shadowBlur = 30 * dpr;
  g.strokeStyle = outer;
  g.lineWidth = width * 2.2;
  path();
  g.stroke();
  g.shadowBlur = 14 * dpr;
  g.strokeStyle = mid;
  g.lineWidth = width;
  path();
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = "#ffffff";
  g.lineWidth = width * 0.4;
  path();
  g.stroke();
  g.restore();
}
