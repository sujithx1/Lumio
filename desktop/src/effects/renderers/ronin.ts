import { beginFrame, clamp01, ctx2d, easeInOut, easeOutBack, easeOutCubic, phase, rand, sized, star, type EffectContext, type EffectFactory } from "../types";

// Tiny Ronin: an original chibi swordsman. He dashes in from the Send Zone edge, strikes a cute pose,
// slices the screen with three sparkling sword arcs and a shower of cherry petals, bows, and dashes off.

const OUTLINE = "#1f2937";
const SKIN = "#ffd7b5";
const HAIR = "#1e293b";
const BAND = "#ef4444";
const GI = "#f8fafc";
const COLLAR = "#6366f1";
const HAKAMA = "#4338ca";
const SANDAL = "#92400e";
const SCABBARD = "#7c2d12";
const GUARD = "#facc15";
const BLADE = "#e2e8f0";
const SLASH = "#38bdf8";
const PETALS = ["#fbcfe8", "#f9a8d4", "#fce7f3"];

export interface RoninPose {
  /** Feet position (canvas pixels). */
  x: number;
  y: number;
  /** Figure height in pixels. */
  size: number;
  /** 1 faces +x (into the screen from the left edge), -1 faces -x. */
  facing: 1 | -1;
  /** Run cycle angle; 0 = standing. */
  run: number;
  /** 0..1 how much he is running (legs and bob). */
  running: number;
  /** Sword arm angle in radians (0 = pointing forward, negative = raised). */
  arm: number;
  drawn: boolean;
  blink: boolean;
  /** Happy closed "^ ^" eyes. */
  happy: boolean;
  /** Forward tilt of the upper body (bow), radians. */
  bow: number;
  /** Backward lean (skid) in radians. */
  lean: number;
  /** Squash/stretch: >1 taller. */
  stretch: number;
  /** Seconds, for fluttering headband tails. */
  t: number;
}

export const restPose = (x: number, y: number, size: number, t: number): RoninPose => ({
  x,
  y,
  size,
  facing: 1,
  run: 0,
  running: 0,
  arm: 0.9,
  drawn: false,
  blink: false,
  happy: false,
  bow: 0,
  lean: 0,
  stretch: 1,
  t,
});

/** Draws the ronin. Line widths scale with his size so he reads at any resolution. */
export function drawRonin(g: CanvasRenderingContext2D, p: RoninPose) {
  const H = p.size;
  if (H < 4) return;
  const R = H * 0.29; // head radius: the head is ~55% of his height
  const lw = Math.max(1.5, H * 0.018);
  const bob = Math.abs(Math.sin(p.run)) * H * 0.035 * p.running;

  g.save();
  g.translate(p.x, p.y);
  g.scale(p.facing, 1);
  // Soft shadow under the feet.
  g.fillStyle = "rgba(15,23,42,0.22)";
  g.beginPath();
  g.ellipse(0, 0, H * 0.26, H * 0.045, 0, 0, Math.PI * 2);
  g.fill();

  g.scale(1 / Math.sqrt(p.stretch), p.stretch);
  g.rotate(-p.lean);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;

  // Legs and sandals.
  const swing = Math.sin(p.run) * H * 0.09 * p.running;
  for (const side of [-1, 1] as const) {
    const dx = side * H * 0.07 + swing * side;
    const lift = Math.max(0, Math.cos(p.run) * side) * H * 0.05 * p.running;
    g.fillStyle = SKIN;
    g.beginPath();
    g.roundRect(dx - H * 0.035, -H * 0.12 - lift, H * 0.07, H * 0.1, H * 0.03);
    g.fill();
    g.stroke();
    g.fillStyle = SANDAL;
    g.beginPath();
    g.ellipse(dx + H * 0.02, -H * 0.018 - lift, H * 0.065, H * 0.028, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  g.translate(0, -bob);
  // Upper body pivots at the waist for the bow.
  const waistY = -H * 0.18;
  g.translate(0, waistY);
  g.rotate(p.bow);
  g.translate(0, -waistY);

  // Hakama (wide trousers).
  g.fillStyle = HAKAMA;
  g.beginPath();
  g.moveTo(-H * 0.15, -H * 0.27);
  g.lineTo(H * 0.15, -H * 0.27);
  g.lineTo(H * 0.21, -H * 0.1);
  g.quadraticCurveTo(0, -H * 0.07, -H * 0.21, -H * 0.1);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.beginPath();
  g.moveTo(0, -H * 0.25);
  g.lineTo(0, -H * 0.1);
  g.stroke();
  g.strokeStyle = OUTLINE;

  // Back arm (behind the body).
  g.fillStyle = GI;
  g.beginPath();
  g.ellipse(-H * 0.15, -H * 0.33, H * 0.045, H * 0.075, 0.5, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Gi top.
  g.fillStyle = GI;
  g.beginPath();
  g.roundRect(-H * 0.15, -H * 0.44, H * 0.3, H * 0.2, H * 0.07);
  g.fill();
  g.stroke();
  // Crossed collar and sash.
  g.strokeStyle = COLLAR;
  g.lineWidth = lw * 1.6;
  g.beginPath();
  g.moveTo(-H * 0.07, -H * 0.43);
  g.lineTo(H * 0.04, -H * 0.3);
  g.moveTo(H * 0.07, -H * 0.43);
  g.lineTo(-H * 0.01, -H * 0.34);
  g.stroke();
  g.fillStyle = COLLAR;
  g.fillRect(-H * 0.15, -H * 0.285, H * 0.3, H * 0.035);
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;

  // Sheathed sword at the hip (the scabbard stays; the blade is drawn from it).
  g.save();
  g.translate(-H * 0.02, -H * 0.255);
  g.rotate(-0.28);
  g.fillStyle = SCABBARD;
  g.beginPath();
  g.roundRect(-H * 0.3, -H * 0.02, H * 0.38, H * 0.04, H * 0.02);
  g.fill();
  g.stroke();
  if (!p.drawn) {
    g.fillStyle = GUARD;
    g.beginPath();
    g.ellipse(H * 0.09, 0, H * 0.014, H * 0.04, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = HAIR;
    g.beginPath();
    g.roundRect(H * 0.1, -H * 0.017, H * 0.11, H * 0.034, H * 0.015);
    g.fill();
    g.stroke();
  }
  g.restore();

  // Head.
  const hy = -H + R;
  drawHead(g, p, R, hy, lw);

  // Sword arm (in front of everything).
  g.save();
  g.translate(H * 0.12, -H * 0.38);
  g.rotate(p.arm);
  if (p.drawn) drawBlade(g, H, lw);
  g.fillStyle = GI;
  g.beginPath();
  g.ellipse(H * 0.06, 0, H * 0.08, H * 0.045, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(H * 0.14, 0, H * 0.035, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  g.restore();
}

function drawBlade(g: CanvasRenderingContext2D, H: number, lw: number) {
  const L = H * 0.48;
  g.save();
  g.translate(H * 0.14, 0);
  // Handle behind the hand, blade ahead of it with a slight katana curve.
  g.fillStyle = HAIR;
  g.beginPath();
  g.roundRect(-H * 0.1, -H * 0.016, H * 0.1, H * 0.032, H * 0.014);
  g.fill();
  g.stroke();
  g.fillStyle = GUARD;
  g.beginPath();
  g.ellipse(H * 0.02, 0, H * 0.012, H * 0.038, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = BLADE;
  g.beginPath();
  g.moveTo(H * 0.03, -H * 0.018);
  g.quadraticCurveTo(L * 0.6, -H * 0.03, L, -H * 0.05);
  g.quadraticCurveTo(L * 0.6, H * 0.01, H * 0.03, H * 0.016);
  g.closePath();
  g.fill();
  g.lineWidth = lw * 0.8;
  g.stroke();
  g.strokeStyle = "#ffffff";
  g.lineWidth = lw * 0.7;
  g.beginPath();
  g.moveTo(H * 0.06, -H * 0.009);
  g.quadraticCurveTo(L * 0.6, -H * 0.02, L * 0.94, -H * 0.042);
  g.stroke();
  g.restore();
}

function drawHead(g: CanvasRenderingContext2D, p: RoninPose, R: number, hy: number, lw: number) {
  // Headband tails flutter behind (drawn first, behind the head).
  const speed = 0.4 + p.running;
  for (const k of [0, 1]) {
    const wave = Math.sin(p.t * (9 + k * 2) + k) * R * 0.22 * speed;
    const len = R * (1.05 + k * 0.25) * (0.8 + speed * 0.35);
    g.fillStyle = BAND;
    g.beginPath();
    g.moveTo(-R * 0.85, hy - R * 0.32);
    g.quadraticCurveTo(-R * 0.85 - len * 0.5, hy - R * 0.5 + wave + k * R * 0.2, -R * 0.85 - len, hy - R * 0.25 + wave * 1.6 + k * R * 0.35);
    g.lineTo(-R * 0.85 - len * 0.92, hy - R * 0.05 + wave * 1.4 + k * R * 0.35);
    g.quadraticCurveTo(-R * 0.85 - len * 0.45, hy - R * 0.2 + wave + k * R * 0.2, -R * 0.8, hy - R * 0.15);
    g.closePath();
    g.fill();
    g.stroke();
  }

  // Face.
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(0, hy, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Hair: a cap over the top and back with rounded spiky tufts, plus soft bangs.
  g.fillStyle = HAIR;
  g.beginPath();
  g.moveTo(-R * 1.0, hy + R * 0.15);
  g.quadraticCurveTo(-R * 1.08, hy - R * 0.75, -R * 0.45, hy - R * 1.05);
  // Tufts.
  const tufts: Array<[number, number]> = [
    [-R * 0.62, hy - R * 1.32],
    [-R * 0.1, hy - R * 1.42],
    [R * 0.38, hy - R * 1.3],
    [R * 0.78, hy - R * 1.0],
  ];
  let px = -R * 0.45;
  let py = hy - R * 1.05;
  for (const [tx, ty] of tufts) {
    const nx = tx + R * 0.32;
    const ny = ty + R * 0.32;
    g.quadraticCurveTo(px + (tx - px) * 0.2, ty - R * 0.05, tx, ty);
    g.quadraticCurveTo(tx + R * 0.12, ty + R * 0.05, nx, ny);
    px = nx;
    py = ny;
  }
  g.quadraticCurveTo(R * 1.08, hy - R * 0.55, R * 0.95, hy - R * 0.2);
  // Bangs: three scallops across the forehead.
  g.quadraticCurveTo(R * 0.75, hy - R * 0.5, R * 0.5, hy - R * 0.28);
  g.quadraticCurveTo(R * 0.32, hy - R * 0.55, R * 0.05, hy - R * 0.32);
  g.quadraticCurveTo(-R * 0.2, hy - R * 0.62, -R * 0.45, hy - R * 0.35);
  g.quadraticCurveTo(-R * 0.62, hy - R * 0.1, -R * 0.7, hy + R * 0.2);
  g.closePath();
  g.fill();
  g.stroke();
  void py;

  // Headband across the forehead, under the bangs' tips.
  g.save();
  g.beginPath();
  g.arc(0, hy, R - lw * 0.5, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = BAND;
  g.beginPath();
  g.moveTo(-R * 1.1, hy - R * 0.5);
  g.quadraticCurveTo(0, hy - R * 0.72, R * 1.1, hy - R * 0.5);
  g.lineTo(R * 1.1, hy - R * 0.3);
  g.quadraticCurveTo(0, hy - R * 0.52, -R * 1.1, hy - R * 0.3);
  g.closePath();
  g.fill();
  g.stroke();
  // A little white sun mark on the band.
  g.fillStyle = "#fff7ed";
  g.beginPath();
  g.arc(R * 0.32, hy - R * 0.47, R * 0.07, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Knot at the back.
  g.fillStyle = BAND;
  g.beginPath();
  g.arc(-R * 0.9, hy - R * 0.3, R * 0.13, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Eyes: facing +x, so both sit right of centre.
  const ey = hy + R * 0.12;
  for (const ex of [R * 0.05, R * 0.58]) {
    if (p.happy) {
      g.lineWidth = lw * 1.4;
      g.beginPath();
      g.moveTo(ex - R * 0.12, ey + R * 0.04);
      g.quadraticCurveTo(ex, ey - R * 0.14, ex + R * 0.12, ey + R * 0.04);
      g.stroke();
      g.lineWidth = lw;
    } else if (p.blink) {
      g.lineWidth = lw * 1.4;
      g.beginPath();
      g.moveTo(ex - R * 0.12, ey);
      g.quadraticCurveTo(ex, ey + R * 0.08, ex + R * 0.12, ey);
      g.stroke();
      g.lineWidth = lw;
    } else {
      g.fillStyle = "#1f2937";
      g.beginPath();
      g.ellipse(ex, ey, R * 0.13, R * 0.19, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(ex - R * 0.04, ey - R * 0.07, R * 0.055, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ex + R * 0.045, ey + R * 0.07, R * 0.028, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Blush.
  g.fillStyle = "rgba(253,164,175,0.75)";
  for (const bx of [-R * 0.2, R * 0.8]) {
    g.beginPath();
    g.ellipse(bx, ey + R * 0.3, R * 0.13, R * 0.075, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Mouth: a small "w" smile.
  const mx = R * 0.33;
  const my = ey + R * 0.36;
  g.lineWidth = lw * 1.1;
  g.beginPath();
  g.moveTo(mx - R * 0.12, my);
  g.quadraticCurveTo(mx - R * 0.06, my + R * 0.1, mx, my);
  g.quadraticCurveTo(mx + R * 0.06, my + R * 0.1, mx + R * 0.12, my);
  g.stroke();
  g.lineWidth = lw;
}

// ---------- effect ----------

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  color: string;
  sway: number;
}

interface Glitter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

export interface Puff {
  x: number;
  y: number;
  r: number;
  life: number;
}

type Pt = [number, number];

/** The three slash arcs, as fractions of the screen: start, bulge, end (canonical: phone at the left). */
const SLASHES: Array<[Pt, Pt, Pt]> = [
  [[0.3, 0.1], [0.82, 0.18], [0.94, 0.8]], // down-right diagonal
  [[0.2, 0.55], [0.6, 0.34], [0.99, 0.5]], // horizontal
  [[0.32, 0.9], [0.82, 0.84], [0.95, 0.12]], // up-right diagonal
];
const SLASH_START = 0.28;
const SLASH_END = 0.62;
const SLASH_LEN = (SLASH_END - SLASH_START) / SLASHES.length;

const bez = (a: Pt, b: Pt, c: Pt, u: number): Pt => {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1]];
};

/** A thick crescent along a quadratic curve, tapered at both ends, revealed up to `reveal`. */
function crescent(g: CanvasRenderingContext2D, a: Pt, b: Pt, c: Pt, thickness: number, from: number, to: number) {
  const N = 40;
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = from + ((to - from) * i) / N;
    const [x, y] = bez(a, b, c, u);
    const [x2, y2] = bez(a, b, c, Math.min(1, u + 0.001));
    const [x0, y0] = bez(a, b, c, Math.max(0, u - 0.001));
    const dx = x2 - x0;
    const dy = y2 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = thickness * Math.pow(Math.sin(Math.PI * u), 0.7);
    top.push([x + nx * w * 0.5, y + ny * w * 0.5]);
    bottom.push([x - nx * w * 0.5, y - ny * w * 0.5]);
  }
  g.beginPath();
  g.moveTo(top[0]![0], top[0]![1]);
  for (const [x, y] of top) g.lineTo(x, y);
  for (let i = bottom.length - 1; i >= 0; i--) g.lineTo(bottom[i]![0], bottom[i]![1]);
  g.closePath();
}

function drawPetal(g: CanvasRenderingContext2D, p: Petal, alpha: number) {
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  g.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.rot * 1.3)));
  g.globalAlpha = alpha;
  g.fillStyle = p.color;
  g.beginPath();
  // A cherry petal: round body with a notch at the tip.
  g.moveTo(0, -p.size);
  g.quadraticCurveTo(p.size, -p.size * 0.6, p.size * 0.55, p.size * 0.7);
  g.quadraticCurveTo(0, p.size * 0.95, -p.size * 0.55, p.size * 0.7);
  g.quadraticCurveTo(-p.size, -p.size * 0.6, 0, -p.size);
  g.fill();
  g.globalAlpha = alpha * 0.5;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(-p.size * 0.15, -p.size * 0.2, p.size * 0.18, p.size * 0.35, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawHeart(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  g.closePath();
}

export function speedLines(g: CanvasRenderingContext2D, x: number, y: number, H: number, dir: 1 | -1, amount: number, t: number, dpr: number) {
  if (amount <= 0.02) return;
  g.save();
  g.strokeStyle = `rgba(255,255,255,${0.65 * amount})`;
  g.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const yy = y - H * (0.15 + i * 0.17);
    const len = H * (0.35 + ((i * 37 + Math.floor(t * 20)) % 5) * 0.08) * amount;
    const x0 = x - dir * H * (0.35 + (i % 2) * 0.1);
    g.lineWidth = (1.5 + (i % 3)) * dpr;
    g.beginPath();
    g.moveTo(x0, yy);
    g.lineTo(x0 - dir * len, yy);
    g.stroke();
  }
  g.restore();
}

export function drawPuffs(g: CanvasRenderingContext2D, puffs: Puff[], dt: number) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const f = puffs[i]!;
    f.life -= dt * 1.8;
    f.r *= 1 + dt * 1.6;
    f.y -= f.r * dt * 0.8;
    if (f.life <= 0) {
      puffs.splice(i, 1);
      continue;
    }
    g.fillStyle = `rgba(241,245,249,${0.6 * f.life})`;
    g.beginPath();
    g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    g.fill();
  }
}

export const tinyRonin: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const petals: Petal[] = [];
  const glitter: Glitter[] = [];
  const puffs: Puff[] = [];
  let lastStep = 0;
  let puffTimer = 0;
  let petalTimer = 0;
  const slashed = SLASHES.map(() => false);
  let heartAt = -1;
  let skidded = false;

  const petal = (x: number, y: number, vx: number, vy: number): Petal => ({
    x,
    y,
    vx,
    vy,
    rot: rand(0, Math.PI * 2),
    spin: rand(-3, 3),
    size: Math.min(s.w, s.h) * rand(0.009, 0.016),
    color: PETALS[Math.floor(rand(0, PETALS.length))]!,
    sway: rand(0, Math.PI * 2),
  });

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const H = h * 0.24;
      const ground = h * 0.88;

      // Where he is and what he's doing.
      const enter = phase(progress, 0, 0.18);
      const leave = phase(progress, 0.78, 1);
      const stopX = w * 0.38;
      let x: number;
      let running = 0;
      let lean = 0;
      if (progress < 0.18) {
        x = -H * 0.6 + (stopX + H * 0.6) * easeOutCubic(enter);
        running = 1 - phase(enter, 0.82, 1);
        lean = Math.sin(Math.PI * phase(enter, 0.8, 1)) * 0.22; // skid
        if (enter > 0.85 && !skidded) {
          skidded = true;
          for (let i = 0; i < 4; i++) puffs.push({ x: x - H * 0.15 + rand(-H * 0.1, H * 0.1), y: ground - H * 0.03, r: H * rand(0.05, 0.09), life: 1 });
        }
      } else if (progress < 0.78) {
        x = stopX;
      } else {
        x = stopX + (w * 1.15 - stopX) * Math.pow(leave, 1.6);
        running = Math.min(1, leave * 6);
      }

      const pose: RoninPose = { ...restPose(x, ground, H, t), running, lean, run: t * 15 };
      // Small hop during the pose, a blink, and a sparkle by the head.
      const posing = phase(progress, 0.18, 0.28);
      const hop = Math.sin(Math.PI * phase(posing, 0.45, 0.85));
      pose.y -= hop * H * 0.12;
      pose.stretch = 1 + hop * 0.06 - (posing > 0 && posing < 0.12 ? 0.05 : 0);
      pose.blink = (posing > 0.2 && posing < 0.32) || Math.sin(t * 1.7) > 0.985;

      // Slashes.
      let slashIndex = -1;
      if (progress >= SLASH_START && progress < SLASH_END + 0.04) {
        slashIndex = Math.min(SLASHES.length - 1, Math.floor((progress - SLASH_START) / SLASH_LEN));
        const u = clamp01((progress - SLASH_START - slashIndex * SLASH_LEN) / SLASH_LEN);
        pose.drawn = true;
        // Wind up (arm raised back), then a fast swing through.
        const [from, to] = slashIndex === 0 ? [-2.0, 0.9] : slashIndex === 1 ? [-1.2, 0.5] : [1.4, -1.5];
        const swing = easeInOut(phase(u, 0.22, 0.48));
        pose.arm = from + (to - from) * swing - (1 - phase(u, 0, 0.22)) * 0.2;
        pose.lean = -0.08 * Math.sin(Math.PI * phase(u, 0.2, 0.6));
        pose.x += Math.sin(Math.PI * phase(u, 0.2, 0.7)) * H * 0.08;
        pose.stretch = 1 + 0.05 * Math.sin(Math.PI * phase(u, 0.2, 0.5));
      } else if (progress >= SLASH_END + 0.04 && progress < 0.78) {
        // Sheathe and bow.
        const b = phase(progress, 0.66, 0.76);
        pose.bow = Math.sin(Math.PI * b) * 0.32;
        pose.happy = b > 0.15 && b < 0.95;
        pose.arm = 0.9;
        if (heartAt < 0 && b > 0.35) {
          heartAt = t;
          c.audio?.pop();
        }
      }

      // Footsteps and dust while running.
      if (running > 0.3) {
        const step = Math.floor(pose.run / Math.PI);
        if (step !== lastStep) {
          lastStep = step;
          if (Math.random() < 0.6) c.audio?.step();
        }
        puffTimer -= dt;
        if (puffTimer <= 0) {
          puffTimer = 0.08;
          puffs.push({ x: x - H * 0.18, y: ground - H * 0.02, r: H * rand(0.03, 0.06), life: 1 });
        }
      }

      // Trigger each slash once: sound, glitter along the arc, a burst of petals.
      SLASHES.forEach((arc, i) => {
        const at = SLASH_START + i * SLASH_LEN + SLASH_LEN * 0.24;
        if (!slashed[i] && progress >= at) {
          slashed[i] = true;
          c.audio?.shing();
          const [a, b, d] = arc.map(([px, py]) => [px * w, py * h] as Pt) as [Pt, Pt, Pt];
          const n = Math.round(22 + 30 * c.intensity);
          for (let k = 0; k < n; k++) {
            const [gx, gy] = bez(a, b, d, rand(0.05, 0.95));
            glitter.push({ x: gx, y: gy, vx: rand(-1, 1) * w * 0.05, vy: rand(-1, 0.5) * h * 0.06, life: 1, size: Math.min(w, h) * rand(0.004, 0.011) });
          }
          const [cx, cy] = bez(a, b, d, 0.5);
          const np = Math.round(14 + 22 * c.intensity);
          for (let k = 0; k < np; k++) {
            const ang = rand(0, Math.PI * 2);
            const sp = rand(0.08, 0.32) * Math.min(w, h);
            petals.push(petal(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp - h * 0.05));
          }
        }
      });

      // Gentle petal fall after the first slash.
      if (slashed[0] && progress < 0.95) {
        petalTimer -= dt;
        if (petalTimer <= 0) {
          petalTimer = rand(0.05, 0.14) / (0.5 + c.intensity);
          petals.push(petal(rand(0, w), -h * 0.03, rand(-0.02, 0.04) * w, rand(0.04, 0.09) * h));
        }
      }

      // --- draw: speed lines and dust behind him ---
      speedLines(g, x, ground, H, 1, running * (progress < 0.18 ? 1 - phase(enter, 0.6, 1) : 1), t, dpr);
      drawPuffs(g, puffs, dt);

      // Slash arcs behind the petals but over the screen.
      SLASHES.forEach((arc, i) => {
        const start = SLASH_START + i * SLASH_LEN + SLASH_LEN * 0.2;
        const u = (progress - start) / (SLASH_LEN * 1.6);
        if (u <= 0 || u >= 1) return;
        const reveal = easeOutCubic(phase(u, 0, 0.25));
        const fade = 1 - phase(u, 0.35, 1);
        const [a, b, d] = arc.map(([px, py]) => [px * w, py * h] as Pt) as [Pt, Pt, Pt];
        const thick = Math.min(w, h) * (0.045 + 0.03 * c.intensity);
        g.save();
        g.globalAlpha = fade;
        g.shadowColor = SLASH;
        g.shadowBlur = 30 * dpr;
        g.fillStyle = "rgba(56,189,248,0.55)";
        crescent(g, a, b, d, thick, 0, reveal);
        g.fill();
        g.shadowBlur = 12 * dpr;
        g.fillStyle = "rgba(186,230,253,0.95)";
        crescent(g, a, b, d, thick * 0.5, 0, reveal);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#ffffff";
        crescent(g, a, b, d, thick * 0.18, 0, reveal);
        g.fill();
        // The bright cut line flashes along the whole arc at the start.
        const flash = 1 - phase(u, 0.05, 0.3);
        if (flash > 0) {
          g.globalAlpha = flash;
          g.strokeStyle = "#ffffff";
          g.lineWidth = 2 * dpr;
          g.beginPath();
          g.moveTo(a[0], a[1]);
          g.quadraticCurveTo(b[0], b[1], d[0], d[1]);
          g.stroke();
        }
        g.restore();
      });

      // The ronin.
      drawRonin(g, pose);

      // Sparkle by his head while posing.
      if (posing > 0 && posing < 1) {
        const k = Math.sin(Math.PI * posing);
        g.save();
        g.fillStyle = "#fde68a";
        g.shadowColor = "#fde68a";
        g.shadowBlur = 14 * dpr;
        star(g, x + H * 0.42, ground - H * 1.05, H * 0.09 * k, 4, 0.35, t * 3);
        g.fill();
        star(g, x + H * 0.55, ground - H * 0.85, H * 0.045 * k, 4, 0.35, -t * 3);
        g.fill();
        g.restore();
      }

      // Heart after the bow.
      if (heartAt >= 0) {
        const k = t - heartAt;
        if (k < 1.4) {
          const r = H * 0.09 * easeOutBack(Math.min(1, k * 3));
          g.save();
          g.globalAlpha = 1 - phase(k, 0.9, 1.4);
          g.fillStyle = "#fb7185";
          g.strokeStyle = OUTLINE;
          g.lineWidth = Math.max(1.5, H * 0.015);
          drawHeart(g, x + H * 0.25, ground - H * 1.15 - k * H * 0.25, r);
          g.fill();
          g.stroke();
          g.restore();
        }
      }

      // Glitter.
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = glitter.length - 1; i >= 0; i--) {
        const p = glitter[i]!;
        p.life -= dt * 1.1;
        if (p.life <= 0) {
          glitter.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        g.globalAlpha = p.life;
        g.fillStyle = i % 3 === 0 ? "#ffffff" : "#7dd3fc";
        star(g, p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(t * 20 + i)), 4, 0.3, t * 2 + i);
        g.fill();
      }
      g.restore();

      // Petals on top.
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i]!;
        p.vx *= 1 - dt * 1.2;
        p.vy += (h * 0.12 - p.vy) * dt * 1.2; // settle into a slow fall
        p.sway += dt * 2.4;
        p.x += (p.vx + Math.sin(p.sway) * w * 0.02) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.y > h * 1.05) {
          petals.splice(i, 1);
          continue;
        }
        drawPetal(g, p, 0.95);
      }
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      petals.length = 0;
      glitter.length = 0;
    },
  };
};

// ---------- departure ----------

/**
 * The ronin's departure on the sender: he pops in at the centre, turns to the Send Zone edge
 * (x = 0 after the mirror) and dashes off it with speed lines and dust.
 */
export const roninDeparture = (c: EffectContext): ReturnType<EffectFactory> => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const puffs: Puff[] = [];
  let puffTimer = 0;
  let whooshed = false;
  c.audio?.pop();

  return {
    frame(t, dt) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const H = h * 0.22;
      const ground = h * 0.62;
      const pop = easeOutBack(Math.min(1, t / 0.25));
      const dash = phase(t, 0.38, 0.95);
      const x = w * 0.5 - (w * 0.5 + H) * Math.pow(dash, 1.7);
      const running = dash > 0 ? 1 : 0;
      if (dash > 0 && !whooshed) {
        whooshed = true;
        c.audio?.whoosh(0.6);
      }
      if (running) {
        puffTimer -= dt;
        if (puffTimer <= 0) {
          puffTimer = 0.06;
          puffs.push({ x: x + H * 0.2, y: ground - H * 0.02, r: H * rand(0.04, 0.07), life: 1 });
        }
      }
      speedLines(g, x, ground, H, -1, running ? Math.min(1, dash * 4) : 0, t, dpr);
      drawPuffs(g, puffs, dt);

      if (pop < 0.03) return;
      const pose = restPose(x, ground, H, t);
      // Faces the centre while popping in, then turns toward the edge.
      pose.facing = t < 0.32 ? 1 : -1;
      pose.running = running;
      pose.run = t * 18;
      pose.happy = t > 0.12 && t < 0.32;
      pose.stretch = t < 0.25 ? 0.85 + 0.15 * pop : 1;
      pose.y -= Math.sin(Math.PI * phase(t, 0.22, 0.38)) * H * 0.12;
      // Pop in by scaling the whole figure about his feet (so outlines scale with him).
      g.save();
      g.translate(pose.x, ground);
      g.scale(pop, pop);
      g.translate(-pose.x, -ground);
      drawRonin(g, pose);
      g.restore();
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      puffs.length = 0;
    },
  };
};
