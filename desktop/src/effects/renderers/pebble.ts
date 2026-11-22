import { beginFrame, ctx2d, easeInOut, easeOutBack, easeOutCubic, phase, rand, sized, type EffectContext, type EffectFactory, type EffectInstance } from "../types";
import { basePose, blush, type Bit, drawBits, eyes, figure, legs, mouth, OUTLINE, SKIN, updateBits, type ChibiPose } from "./chibi";
import { drawHeart, drawPuffs, type Puff } from "./ronin";

// Pebble: an original little explorer cadet with a lamp helmet and a grappling hook. She swings in on
// her rope, slams the ground, and a friendly mossy stone giant rises from the bottom of the screen,
// stomps (a soft shockwave), waves hello, and sinks back down while she zips away on her rope.

const JACKET = "#eab308";
const JACKET_DARK = "#ca8a04";
const POCKET = "#facc15";
const TROUSERS = "#57534e";
const BOOT = "#78350f";
const HELMET = "#fef3c7";
const HELMET_DARK = "#fcd34d";
const LAMP = "#fde047";
const HAIR = "#7c4a1e";
const ROPE = "#d6b98c";
const HOOK = "#64748b";
const STONE = "#a8a29e";
const STONE_DARK = "#78716c";
const STONE_LIGHT = "#d6d3d1";
const MOSS = "#65a30d";
const MOSS_LIGHT = "#84cc16";
const GLOW = "#bef264";
const FLOWERS = ["#ffffff", "#f9a8d4", "#fde68a"];

export interface PebblePose extends ChibiPose {
  walk: number;
  walking: number;
  /** Front arm angle (radians; 0 forward, negative up). */
  arm: number;
  /** Holding the rope overhead (hands up). */
  hanging: boolean;
  eyes: "open" | "blink" | "happy";
}

export const pebblePose = (x: number, y: number, size: number, t: number): PebblePose => ({
  ...basePose(x, y, size, t),
  walk: 0,
  walking: 0,
  arm: 0.9,
  hanging: false,
  eyes: "open",
});

/** World position of her front hand (where the rope starts). */
export const pebbleHand = (p: PebblePose): [number, number] => {
  const H = p.size;
  const ax = H * 0.11;
  const ay = -H * 0.38;
  const a = p.hanging ? -1.75 : p.arm;
  const hx = ax + Math.cos(a) * H * 0.14;
  const hy = ay + Math.sin(a) * H * 0.14;
  return [p.x + p.facing * hx * Math.abs(p.turn) / Math.sqrt(p.stretch), p.y + hy * p.stretch];
};

export function drawPebble(g: CanvasRenderingContext2D, p: PebblePose) {
  if (p.size < 4) return;
  const { H, R, lw, hy } = figure(g, p);
  legs(g, H, TROUSERS, BOOT, p.walk, p.walking);

  // Back arm.
  g.save();
  g.translate(-H * 0.11, -H * 0.38);
  g.rotate(p.hanging ? -1.45 : Math.PI - 0.9);
  g.fillStyle = JACKET_DARK;
  g.beginPath();
  g.ellipse(H * 0.06, 0, H * 0.075, H * 0.045, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(H * 0.14, 0, H * 0.033, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // Explorer jacket with two big pockets and a belt.
  g.fillStyle = JACKET;
  g.beginPath();
  g.roundRect(-H * 0.16, -H * 0.44, H * 0.32, H * 0.3, H * 0.08);
  g.fill();
  g.stroke();
  g.fillStyle = POCKET;
  for (const px of [-H * 0.12, H * 0.02]) {
    g.beginPath();
    g.roundRect(px, -H * 0.27, H * 0.1, H * 0.08, H * 0.02);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(px, -H * 0.245);
    g.lineTo(px + H * 0.1, -H * 0.245);
    g.stroke();
  }
  g.fillStyle = BOOT;
  g.fillRect(-H * 0.16, -H * 0.18, H * 0.32, H * 0.03);
  g.strokeRect(-H * 0.16, -H * 0.18, H * 0.32, H * 0.03);
  // Collar.
  g.fillStyle = JACKET_DARK;
  g.beginPath();
  g.moveTo(-H * 0.09, -H * 0.44);
  g.lineTo(0, -H * 0.37);
  g.lineTo(H * 0.09, -H * 0.44);
  g.closePath();
  g.fill();
  g.stroke();

  // Head.
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(0, hy, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Short hair peeking out under the helmet.
  g.fillStyle = HAIR;
  g.beginPath();
  g.moveTo(-R * 1.0, hy + R * 0.15);
  g.quadraticCurveTo(-R * 0.95, hy - R * 0.35, -R * 0.4, hy - R * 0.45);
  g.lineTo(R * 0.7, hy - R * 0.45);
  g.quadraticCurveTo(R * 0.55, hy - R * 0.2, R * 0.35, hy - R * 0.3);
  g.quadraticCurveTo(R * 0.1, hy - R * 0.1, -R * 0.15, hy - R * 0.3);
  g.quadraticCurveTo(-R * 0.45, hy - R * 0.05, -R * 0.62, hy + R * 0.35);
  g.closePath();
  g.fill();
  g.stroke();
  // Round helmet with a brim and a lamp.
  g.fillStyle = HELMET;
  g.beginPath();
  g.arc(0, hy - R * 0.38, R * 0.98, Math.PI, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = HELMET_DARK;
  g.beginPath();
  g.roundRect(-R * 1.12, hy - R * 0.45, R * 2.3, R * 0.16, R * 0.08);
  g.fill();
  g.stroke();
  g.strokeStyle = HELMET_DARK;
  g.beginPath();
  g.moveTo(-R * 0.1, hy - R * 1.35);
  g.quadraticCurveTo(0, hy - R * 0.9, -R * 0.1, hy - R * 0.48);
  g.stroke();
  g.strokeStyle = OUTLINE;
  g.save();
  g.shadowColor = LAMP;
  g.shadowBlur = R * 0.8;
  g.fillStyle = LAMP;
  g.beginPath();
  g.arc(R * 0.45, hy - R * 0.85, R * 0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(R * 0.45, hy - R * 0.85, R * 0.2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(R * 0.4, hy - R * 0.9, R * 0.06, 0, Math.PI * 2);
  g.fill();

  eyes(g, R, hy, lw, p.eyes, { iris: "#78350f" });
  blush(g, R, hy, "rgba(251,113,133,0.85)");
  mouth(g, R, hy, lw, p.eyes === "happy" ? "w" : "smile");

  // Front arm.
  g.save();
  g.translate(H * 0.11, -H * 0.38);
  g.rotate(p.hanging ? -1.75 : p.arm);
  g.fillStyle = JACKET;
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

/** Rope from (ax, ay) to (bx, by), sagging by `sag` px, with a hook at a. */
export function drawRope(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, sag: number, H: number, hook = true) {
  const lw = Math.max(1.5, H * 0.018);
  g.save();
  g.lineCap = "round";
  g.strokeStyle = OUTLINE;
  g.lineWidth = lw * 2.4;
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
  g.stroke();
  g.strokeStyle = ROPE;
  g.lineWidth = lw * 1.2;
  g.stroke();
  if (hook) {
    const ang = Math.atan2(ay - by, ax - bx);
    g.translate(ax, ay);
    g.rotate(ang);
    g.strokeStyle = OUTLINE;
    g.lineWidth = lw * 2.4;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(-H * 0.02, 0);
      g.quadraticCurveTo(H * 0.05, side * H * 0.02, H * 0.03, side * H * 0.06);
      g.stroke();
    }
    g.strokeStyle = HOOK;
    g.lineWidth = lw * 1.3;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(-H * 0.02, 0);
      g.quadraticCurveTo(H * 0.05, side * H * 0.02, H * 0.03, side * H * 0.06);
      g.stroke();
    }
  }
  g.restore();
}

interface GiantPose {
  /** Centre bottom of the giant's body (body extends up from here). */
  x: number;
  y: number;
  /** Body height. */
  size: number;
  /** Right hand: 0 resting, 1 raised for a stomp, waving uses `wave`. */
  lift: number;
  wave: number;
  blink: boolean;
  t: number;
}

/** A friendly round stone giant: boulder body, moss and flowers, glowing green eyes and a smile. */
function drawGiant(g: CanvasRenderingContext2D, p: GiantPose) {
  const S = p.size;
  if (S < 8) return;
  const lw = Math.max(2, S * 0.008);
  g.save();
  g.translate(p.x, p.y);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;

  const hand = (side: -1 | 1, lift: number, wave: number) => {
    const sx = side * S * 0.5;
    const sy = -S * 0.42;
    const up = side === 1 ? lift : 0;
    const hx = sx + side * S * 0.18 + (side === 1 ? Math.sin(wave) * S * 0.06 : 0);
    const hy = sy + S * 0.3 - up * S * 0.55 - (side === 1 && wave !== 0 ? S * 0.4 : 0);
    // Arm: a chain of two rounded stones.
    g.fillStyle = STONE_DARK;
    g.beginPath();
    g.ellipse((sx + hx) / 2, (sy + hy) / 2, S * 0.1, S * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = STONE;
    g.beginPath();
    g.ellipse(hx, hy, S * 0.14, S * 0.12, side * 0.2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // Chunky stone fingers.
    g.fillStyle = STONE_LIGHT;
    for (let f = 0; f < 3; f++) {
      g.beginPath();
      g.arc(hx - S * 0.07 + f * S * 0.07, hy - S * 0.1, S * 0.035, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  };

  hand(-1, 0, 0);

  // Body: a big rounded boulder.
  g.fillStyle = STONE;
  g.beginPath();
  g.moveTo(-S * 0.55, 0);
  g.bezierCurveTo(-S * 0.62, -S * 0.5, -S * 0.5, -S * 0.95, 0, -S * 1.0);
  g.bezierCurveTo(S * 0.5, -S * 0.95, S * 0.62, -S * 0.5, S * 0.55, 0);
  g.closePath();
  g.fill();
  g.stroke();
  // Soft shading and a few cracks.
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.beginPath();
  g.ellipse(-S * 0.2, -S * 0.75, S * 0.18, S * 0.1, -0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = STONE_DARK;
  g.beginPath();
  g.moveTo(-S * 0.38, -S * 0.25);
  g.lineTo(-S * 0.3, -S * 0.15);
  g.lineTo(-S * 0.34, -S * 0.05);
  g.moveTo(S * 0.36, -S * 0.55);
  g.lineTo(S * 0.42, -S * 0.45);
  g.stroke();
  g.strokeStyle = OUTLINE;

  // Moss on the head and shoulders, with tiny flowers.
  g.fillStyle = MOSS;
  g.beginPath();
  g.moveTo(-S * 0.5, -S * 0.62);
  g.bezierCurveTo(-S * 0.45, -S * 0.95, S * 0.45, -S * 1.05, S * 0.52, -S * 0.66);
  g.bezierCurveTo(S * 0.4, -S * 0.72, S * 0.3, -S * 0.66, S * 0.2, -S * 0.75);
  g.bezierCurveTo(S * 0.1, -S * 0.68, -S * 0.05, -S * 0.78, -S * 0.15, -S * 0.7);
  g.bezierCurveTo(-S * 0.28, -S * 0.76, -S * 0.36, -S * 0.62, -S * 0.5, -S * 0.62);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = MOSS_LIGHT;
  for (const [mx, my, mr] of [
    [-S * 0.25, -S * 0.88, S * 0.06],
    [S * 0.1, -S * 0.93, S * 0.07],
    [S * 0.35, -S * 0.8, S * 0.05],
  ] as const) {
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
  }
  const flowerSpots: Array<[number, number]> = [
    [-S * 0.32, -S * 0.86],
    [-S * 0.05, -S * 0.97],
    [S * 0.22, -S * 0.92],
    [S * 0.42, -S * 0.72],
  ];
  flowerSpots.forEach(([fx, fy], i) => {
    const r = S * 0.028 * (1 + 0.1 * Math.sin(p.t * 3 + i));
    g.fillStyle = FLOWERS[i % FLOWERS.length]!;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      g.beginPath();
      g.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#facc15";
    g.beginPath();
    g.arc(fx, fy, r * 0.6, 0, Math.PI * 2);
    g.fill();
  });

  // Big gentle glowing eyes and a happy smile.
  for (const ex of [-S * 0.18, S * 0.18]) {
    const ey = -S * 0.5;
    g.save();
    g.fillStyle = STONE_DARK;
    g.beginPath();
    g.ellipse(ex, ey, S * 0.1, S * 0.11, 0, 0, Math.PI * 2);
    g.fill();
    if (p.blink) {
      g.strokeStyle = GLOW;
      g.lineWidth = lw * 2;
      g.beginPath();
      g.moveTo(ex - S * 0.07, ey);
      g.quadraticCurveTo(ex, ey + S * 0.04, ex + S * 0.07, ey);
      g.stroke();
    } else {
      g.shadowColor = GLOW;
      g.shadowBlur = S * 0.12;
      g.fillStyle = GLOW;
      g.beginPath();
      g.arc(ex, ey, S * 0.075, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(ex - S * 0.025, ey - S * 0.03, S * 0.025, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  g.fillStyle = "rgba(251,113,133,0.45)";
  for (const bx of [-S * 0.32, S * 0.32]) {
    g.beginPath();
    g.ellipse(bx, -S * 0.36, S * 0.07, S * 0.035, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = OUTLINE;
  g.lineWidth = lw * 1.4;
  g.beginPath();
  g.moveTo(-S * 0.12, -S * 0.32);
  g.quadraticCurveTo(0, -S * 0.22, S * 0.12, -S * 0.32);
  g.stroke();
  g.lineWidth = lw;

  hand(1, p.lift, p.wave);
  g.restore();
}

const pebbleBit = (x: number, y: number, m: number, vx: number, vy: number): Bit => ({
  x,
  y,
  vx,
  vy,
  rot: rand(0, 6),
  spin: rand(-6, 6),
  size: m * rand(0.006, 0.013),
  life: 1,
  decay: rand(0.4, 0.7),
  gravity: m * 1.6,
  color: Math.random() < 0.5 ? STONE : STONE_DARK,
  kind: "rock",
});

export const pebble: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bits: Bit[] = [];
  const puffs: Puff[] = [];
  let zipped = false;
  let landed = false;
  let slammed = false;
  let rumbled = false;
  let stomped = false;
  let zippedOut = false;
  const hearts: Array<{ x: number; y: number; at: number }> = [];

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h } = s;
      const m = Math.min(w, h);
      const H = h * 0.24;
      const ground = h * 0.88;
      const lw = Math.max(1.5, H * 0.018);
      const landX = w * 0.24;
      const pose = pebblePose(landX, ground, H, t);
      let rope: { ax: number; ay: number; sag: number } | null = null;

      // Screen shake for the stomp.
      const shake = (1 - phase(progress, 0.56, 0.64)) * (progress > 0.555 ? 1 : 0) * m * 0.006;
      if (shake > 0) g.translate(rand(-shake, shake), rand(-shake, shake));

      // 0–0.15: swing in on the rope from the top-left, then drop and land.
      const anchor: [number, number] = [w * 0.18, -h * 0.12];
      if (progress < 0.15) {
        if (!zipped) {
          zipped = true;
          c.audio?.zip();
        }
        const k = phase(progress, 0, 0.11);
        const L = ground - H * 0.45 - anchor[1];
        const a = -0.85 + 1.0 * easeInOut(k); // pendulum angle from vertical
        if (progress < 0.11) {
          pose.hanging = true;
          pose.x = anchor[0] + Math.sin(a) * L * 0.95;
          pose.y = anchor[1] + Math.cos(a) * L * 0.95 + H * 0.62;
          pose.lean = -a * 0.4;
          rope = { ax: anchor[0], ay: anchor[1], sag: 0 };
        } else {
          const d = phase(progress, 0.11, 0.15);
          const fromX = anchor[0] + Math.sin(0.15) * L * 0.95;
          const fromY = anchor[1] + Math.cos(0.15) * L * 0.95 + H * 0.62;
          pose.x = fromX + (landX - fromX) * d;
          pose.y = fromY + (ground - fromY) * d * d;
          pose.stretch = d > 0.85 ? 0.85 : 1.05;
          if (d > 0.95 && !landed) {
            landed = true;
            c.audio?.step();
            for (let i = 0; i < 5; i++) puffs.push({ x: landX + rand(-H * 0.2, H * 0.2), y: ground - H * 0.02, r: H * rand(0.05, 0.09), life: 1 });
          }
        }
      }

      // 0.15–0.28: crouch and slam the ground; cracks glow green.
      const slam = phase(progress, 0.15, 0.28);
      if (progress >= 0.15 && progress < 0.28) {
        pose.stretch = 1 - 0.12 * Math.sin(Math.PI * phase(slam, 0.2, 0.7));
        pose.arm = slam < 0.4 ? -1.6 : 1.3;
        if (!slammed && slam > 0.45) {
          slammed = true;
          c.audio?.thunder();
          for (let i = 0; i < 12; i++) bits.push(pebbleBit(landX + H * 0.2, ground, m, rand(-0.2, 0.3) * w, -rand(0.3, 0.7) * h));
        }
      }

      // Ground cracks from the slam point.
      const crackK = phase(progress, 0.21, 0.3) * (1 - phase(progress, 0.62, 0.75));
      if (crackK > 0) {
        g.save();
        g.strokeStyle = MOSS_LIGHT;
        g.shadowColor = GLOW;
        g.shadowBlur = 16;
        g.lineWidth = lw * 1.6;
        g.globalAlpha = crackK;
        const ox = landX + H * 0.2;
        for (let i = 0; i < 5; i++) {
          const dir = i < 2 ? -1 : 1;
          const len = (w * 0.12 + i * w * 0.06) * easeOutCubic(phase(progress, 0.21, 0.3));
          g.beginPath();
          g.moveTo(ox, ground);
          let cx = ox;
          let cy = ground;
          for (let k = 1; k <= 5; k++) {
            cx += (dir * len) / 5;
            cy = ground + Math.sin(i * 3 + k * 2.1) * h * 0.012;
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
        g.restore();
      }

      // 0.28–0.5 rise, 0.5–0.65 stomp, 0.65–0.8 wave, 0.8–1 sink.
      const rise = easeOutCubic(phase(progress, 0.28, 0.5));
      const sink = easeInOut(phase(progress, 0.8, 0.98));
      const giantSize = h * 0.62;
      const giantX = w * 0.64;
      const giantY = h + giantSize * 0.05 + giantSize * 1.05 * (1 - rise) + giantSize * 1.1 * sink;
      if (progress >= 0.28 && !rumbled) {
        rumbled = true;
        c.audio?.rumble(1.6);
      }
      if (progress >= 0.28 && progress < 0.5) {
        if (Math.random() < 0.7) {
          bits.push(pebbleBit(giantX + rand(-0.4, 0.4) * giantSize, h, m, rand(-0.15, 0.15) * w, -rand(0.4, 0.9) * h));
          puffs.push({ x: giantX + rand(-0.6, 0.6) * giantSize, y: h - h * 0.01, r: m * rand(0.03, 0.07), life: 1 });
        }
      }
      const stompK = phase(progress, 0.5, 0.65);
      const lift = progress >= 0.5 && progress < 0.65 ? (stompK < 0.45 ? easeOutCubic(stompK / 0.45) : 1 - easeOutBack(Math.min(1, (stompK - 0.45) / 0.2))) : 0;
      if (!stomped && stompK > 0.55) {
        stomped = true;
        c.audio?.thunder();
        for (let i = 0; i < 20; i++) bits.push(pebbleBit(rand(0.1, 0.95) * w, ground, m, rand(-0.05, 0.05) * w, -rand(0.2, 0.5) * h));
      }
      const waving = progress >= 0.65 && progress < 0.8;
      const wave = waving ? Math.sin((progress - 0.65) * 120) * 0.9 + 0.01 : 0;
      if (waving && hearts.length === 0) {
        hearts.push({ x: giantX, y: giantY - giantSize * 1.05, at: t });
        hearts.push({ x: landX + H * 0.2, y: ground - H * 1.1, at: t + 0.3 });
        c.audio?.chime();
      }
      if (waving) {
        // Waves out to the side, clear of her face.
        pose.arm = -0.55 + Math.sin(t * 14) * 0.3;
        pose.eyes = "happy";
      }

      // Shockwave ring from the stomp.
      const ring = phase(progress, 0.555, 0.68);
      if (ring > 0 && ring < 1) {
        g.save();
        g.strokeStyle = `rgba(190,242,100,${0.6 * (1 - ring)})`;
        g.lineWidth = m * 0.012 * (1 - ring) + 1;
        g.beginPath();
        g.ellipse(giantX + giantSize * 0.4, ground, w * 0.7 * easeOutCubic(ring), h * 0.08 * easeOutCubic(ring), 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }

      // 0.8–1: Pebble fires her hook to the far top corner and zips off.
      if (progress >= 0.8) {
        const target: [number, number] = [w * 1.02, h * 0.04];
        const fire = phase(progress, 0.8, 0.86);
        const zip = phase(progress, 0.87, 1);
        if (!zippedOut && zip > 0) {
          zippedOut = true;
          c.audio?.zip();
        }
        if (zip > 0) {
          const e = Math.pow(zip, 1.6);
          pose.hanging = true;
          pose.x = landX + (target[0] - landX) * e;
          pose.y = ground + (target[1] + H * 0.7 - ground) * e;
          pose.lean = -0.3;
          rope = { ax: target[0], ay: target[1], sag: 0 };
        } else {
          pose.arm = -1.0;
          const [hx, hy2] = pebbleHand(pose);
          rope = { ax: hx + (target[0] - hx) * easeOutCubic(fire), ay: hy2 + (target[1] - hy2) * easeOutCubic(fire), sag: h * 0.05 * (1 - fire) };
        }
      }

      if (pose.eyes === "open" && Math.sin(t * 1.8) > 0.985) pose.eyes = "blink";

      // --- draw: giant behind, then dust, Pebble, rope, bits ---
      if (rise > 0 && sink < 1) {
        drawGiant(g, { x: giantX, y: giantY, size: giantSize, lift, wave, blink: Math.sin(t * 1.3) > 0.97, t });
      }
      drawPuffs(g, puffs, dt);
      drawPebble(g, pose);
      if (rope) {
        const [hx, hy2] = pebbleHand(pose);
        drawRope(g, rope.ax, rope.ay, hx, hy2, rope.sag, H);
      }
      for (const hh of hearts) {
        const k = t - hh.at;
        if (k < 0 || k > 1.6) continue;
        g.save();
        g.globalAlpha = 1 - phase(k, 1.1, 1.6);
        g.fillStyle = "#fb7185";
        g.strokeStyle = OUTLINE;
        g.lineWidth = lw;
        drawHeart(g, hh.x, hh.y - k * H * 0.35, H * 0.1 * easeOutBack(Math.min(1, k * 3)));
        g.fill();
        g.stroke();
        g.restore();
      }
      updateBits(bits, dt, ground);
      drawBits(g, bits, lw);
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      bits.length = 0;
      puffs.length = 0;
    },
  };
};

/** Pebble's departure: she pops in, fires her hook at the Send Zone edge, and zips off along the rope. */
export const pebbleDeparture = (c: EffectContext): EffectInstance => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  let zipped = false;
  c.audio?.pop();

  return {
    frame(t) {
      beginFrame(g, c, s);
      const { w, h } = s;
      const H = h * 0.22;
      const ground = h * 0.62;
      const pop = easeOutBack(Math.min(1, t / 0.22));
      if (pop < 0.03) return;
      const target: [number, number] = [-H * 0.1, h * 0.28];
      const fire = phase(t, 0.2, 0.34);
      const zip = phase(t, 0.36, 0.65);
      if (zip > 0 && !zipped) {
        zipped = true;
        c.audio?.zip();
      }
      const pose = pebblePose(w * 0.5, ground, H, t);
      pose.facing = -1;
      pose.eyes = t < 0.2 ? "happy" : "open";
      let rope: [number, number] | null = null;
      if (zip > 0) {
        const e = Math.pow(zip, 1.5);
        pose.hanging = true;
        pose.x = w * 0.5 + (target[0] - H * 0.6 - w * 0.5) * e;
        pose.y = ground + (target[1] + H * 0.7 - ground) * e;
        rope = target;
      } else if (fire > 0) {
        pose.arm = -0.9;
        const [hx, hy] = pebbleHand(pose);
        rope = [hx + (target[0] - hx) * easeOutCubic(fire), hy + (target[1] - hy) * easeOutCubic(fire)];
      }
      g.save();
      g.translate(pose.x, ground);
      g.scale(pop, pop);
      g.translate(-pose.x, -ground);
      drawPebble(g, pose);
      g.restore();
      if (rope) {
        const [hx, hy] = pebbleHand(pose);
        drawRope(g, rope[0], rope[1], hx, hy, 0, H);
      }
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {},
  };
};
