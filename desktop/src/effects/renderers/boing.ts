import { beginFrame, clamp01, ctx2d, easeInOut, easeOutBack, easeOutCubic, phase, rand, sized, star, type EffectContext, type EffectFactory, type EffectInstance } from "../types";
import { basePose, blush, type Bit, comicText, drawBits, eyes, figure, legs, mouth, OUTLINE, SKIN, sparkle, updateBits, type ChibiPose } from "./chibi";
import { drawPuffs, speedLines, type Puff } from "./ronin";

// Boing: an original cartoon kid in an orange hoodie with aviator goggles pushed up on his forehead.
// His arm is a toy spring with a big boxing glove on the end: he bounces in from the Send Zone edge,
// winds the spring up, lets it fly across the screen into a giant comic "POW!", snaps it back,
// grabs the far edge and slingshots himself away.

const HOODIE = "#f97316";
const HOODIE_DARK = "#ea580c";
const SHORTS = "#14b8a6";
const SHOE = "#f8fafc";
const LACE = "#f97316";
const HAIR = "#8b4513";
const HAIR_DARK = "#6b3410";
const STRAP = "#334155";
const RIM = "#64748b";
const LENS = "#67e8f9";
const GLOVE = "#facc15";
const GLOVE_DARK = "#eab308";
const SPRING = "#cbd5e1";
const CONFETTI = ["#f97316", "#facc15", "#22d3ee", "#f472b6", "#a3e635", "#ffffff"];

export interface BoingPose extends ChibiPose {
  walk: number;
  walking: number;
  /** Front arm: "rest" hangs at his side; "none" when the spring arm is drawn separately in world space. */
  arm: "rest" | "none" | "up";
  eyes: "open" | "blink" | "happy";
  grin: boolean;
}

export const boingPose = (x: number, y: number, size: number, t: number): BoingPose => ({
  ...basePose(x, y, size, t),
  walk: 0,
  walking: 0,
  arm: "rest",
  eyes: "open",
  grin: true,
});

/** Where the front shoulder is in world space (for the spring arm). */
export const boingShoulder = (p: BoingPose): [number, number] => [p.x + p.facing * p.size * 0.11 * Math.abs(p.turn), p.y - p.size * 0.38 * p.stretch];

export function drawBoing(g: CanvasRenderingContext2D, p: BoingPose) {
  if (p.size < 4) return;
  const { H, R, lw, hy } = figure(g, p);
  legs(g, H, SKIN, SHOE, p.walk, p.walking, LACE);

  // Shorts.
  g.fillStyle = SHORTS;
  g.beginPath();
  g.roundRect(-H * 0.14, -H * 0.2, H * 0.28, H * 0.09, H * 0.03);
  g.fill();
  g.stroke();

  // Back arm (a short hoodie sleeve with a hand).
  g.fillStyle = HOODIE_DARK;
  g.beginPath();
  g.ellipse(-H * 0.14, -H * 0.31, H * 0.045, H * 0.075, 0.45, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Hoodie body with a kangaroo pocket and drawstrings.
  g.fillStyle = HOODIE;
  g.beginPath();
  g.roundRect(-H * 0.15, -H * 0.43, H * 0.3, H * 0.25, H * 0.08);
  g.fill();
  g.stroke();
  g.fillStyle = HOODIE_DARK;
  g.beginPath();
  g.roundRect(-H * 0.08, -H * 0.3, H * 0.17, H * 0.08, H * 0.03);
  g.fill();
  g.stroke();
  g.strokeStyle = "#ffffff";
  g.lineWidth = lw * 0.9;
  for (const dx of [-H * 0.02, H * 0.05]) {
    g.beginPath();
    g.moveTo(dx, -H * 0.42);
    g.lineTo(dx + H * 0.005, -H * 0.35);
    g.stroke();
  }
  g.strokeStyle = OUTLINE;
  g.lineWidth = lw;

  // The hood bunched up behind the neck.
  g.fillStyle = HOODIE_DARK;
  g.beginPath();
  g.ellipse(-H * 0.1, -H * 0.45, H * 0.13, H * 0.06, -0.2, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Head.
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(0, hy, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Messy hair: tufts sticking out every which way, wobbling a little.
  g.fillStyle = HAIR;
  g.beginPath();
  g.moveTo(-R * 1.02, hy + R * 0.2);
  const tufts: Array<[number, number]> = [
    [-1.2, -0.1],
    [-1.05, -0.75],
    [-0.65, -1.25],
    [-0.1, -1.38],
    [0.4, -1.3],
    [0.95, -0.95],
    [1.2, -0.35],
  ];
  let prev: [number, number] = [-1.02, 0.2];
  tufts.forEach(([tx, ty], i) => {
    const wob = Math.sin(p.t * 7 + i) * 0.05;
    const mx = (prev[0] + tx) / 2 + (tx - prev[0]) * 0.1;
    const my = (prev[1] + ty) / 2 + 0.22;
    g.quadraticCurveTo(mx * R, hy + my * R, (tx + wob) * R, hy + (ty + wob) * R);
    prev = [tx, ty];
  });
  g.quadraticCurveTo(R * 0.95, hy - R * 0.3, R * 0.88, hy - R * 0.25);
  // Bangs under the goggles.
  g.quadraticCurveTo(R * 0.55, hy - R * 0.35, R * 0.35, hy - R * 0.2);
  g.quadraticCurveTo(R * 0.15, hy - R * 0.42, -R * 0.15, hy - R * 0.25);
  g.quadraticCurveTo(-R * 0.45, hy - R * 0.35, -R * 0.62, hy + R * 0.25);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = HAIR_DARK;
  g.beginPath();
  g.moveTo(-R * 0.3, hy - R * 1.05);
  g.quadraticCurveTo(-R * 0.1, hy - R * 0.8, R * 0.05, hy - R * 1.0);
  g.stroke();
  g.strokeStyle = OUTLINE;

  // Goggles pushed up on the forehead: a strap across the hair and two round lenses.
  g.save();
  g.beginPath();
  g.arc(0, hy, R * 1.25, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = STRAP;
  g.beginPath();
  g.moveTo(-R * 1.1, hy - R * 0.42);
  g.quadraticCurveTo(0, hy - R * 0.82, R * 1.08, hy - R * 0.5);
  g.lineTo(R * 1.08, hy - R * 0.36);
  g.quadraticCurveTo(0, hy - R * 0.66, -R * 1.1, hy - R * 0.28);
  g.closePath();
  g.fill();
  g.restore();
  for (const lx of [R * 0.1, R * 0.62]) {
    const ly = hy - R * 0.6 + (lx > R * 0.3 ? R * 0.06 : 0);
    g.fillStyle = RIM;
    g.beginPath();
    g.arc(lx, ly, R * 0.23, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = LENS;
    g.beginPath();
    g.arc(lx, ly, R * 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath();
    g.ellipse(lx - R * 0.05, ly - R * 0.05, R * 0.05, R * 0.03, -0.6, 0, Math.PI * 2);
    g.fill();
  }

  eyes(g, R, hy, lw, p.eyes, { iris: "#7c2d12" });
  blush(g, R, hy);
  mouth(g, R, hy, lw, p.grin ? "grin" : "smile");

  // Front arm.
  if (p.arm !== "none") {
    g.save();
    g.translate(H * 0.11, -H * 0.38);
    g.rotate(p.arm === "up" ? -2.1 + Math.sin(p.t * 14) * 0.25 : 0.9);
    g.fillStyle = HOODIE;
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
  }
  g.restore();
}

/** A boxing glove at (x, y) pointing along `angle`. */
export function drawGlove(g: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, lw: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;
  // Cuff.
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.roundRect(-size * 0.75, -size * 0.42, size * 0.4, size * 0.84, size * 0.12);
  g.fill();
  g.stroke();
  // Mitt.
  g.fillStyle = GLOVE;
  g.beginPath();
  g.ellipse(size * 0.05, 0, size * 0.62, size * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Thumb.
  g.fillStyle = GLOVE_DARK;
  g.beginPath();
  g.ellipse(-size * 0.05, -size * 0.42, size * 0.28, size * 0.16, -0.3, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.beginPath();
  g.ellipse(size * 0.2, -size * 0.2, size * 0.18, size * 0.1, -0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * A coiled spring from (ax, ay) to (bx, by), drawn as a flat helix: `coils` loops whose width wobbles
 * with `wobble` (0..1). Ends with the glove.
 */
export function drawSpringArm(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, H: number, wobble: number, t: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const lw = Math.max(1.5, H * 0.018);
  const angle = Math.atan2(dy, dx);
  const coils = Math.max(3, Math.round(len / (H * 0.07)));
  const amp = H * 0.055;
  g.save();
  g.translate(ax, ay);
  g.rotate(angle);
  // Sleeve cuff at the shoulder.
  g.fillStyle = HOODIE;
  g.strokeStyle = OUTLINE;
  g.lineWidth = lw;
  g.beginPath();
  g.ellipse(H * 0.03, 0, H * 0.06, H * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // The spring: back half darker, front half bright, like a real coil.
  const N = coils * 16;
  for (const pass of [0, 1]) {
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = u * coils * Math.PI * 2;
      const front = Math.cos(a) > 0;
      const wob = 1 + wobble * 0.5 * Math.sin(u * 18 - t * 30);
      const x = H * 0.06 + (len - H * 0.12) * u + Math.cos(a) * H * 0.012;
      const y = Math.sin(a) * amp * wob;
      if (front === (pass === 1)) {
        if (!pen) g.moveTo(x, y);
        else g.lineTo(x, y);
        pen = true;
      } else {
        pen = false;
      }
    }
    g.strokeStyle = OUTLINE;
    g.lineWidth = lw * 2.6;
    g.stroke();
    g.strokeStyle = pass === 1 ? SPRING : "#94a3b8";
    g.lineWidth = lw * 1.4;
    g.stroke();
  }
  g.restore();
  drawGlove(g, bx, by, H * 0.12, angle, lw);
}

/** The giant comic "POW!" at (x, y). `k` 0..1 is its scale-in, `fade` its alpha. */
function drawPow(g: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, fade: number, t: number, dpr: number) {
  if (k <= 0.01 || fade <= 0.01) return;
  g.save();
  g.globalAlpha = fade;
  // Action lines radiating out.
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineCap = "round";
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.1;
    const r0 = r * (1.15 + 0.1 * Math.sin(i * 3.1));
    const r1 = r0 + r * (0.35 + 0.25 * ((i * 7) % 3)) * k;
    g.lineWidth = (2 + (i % 3)) * dpr;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    g.stroke();
  }
  const rr = r * easeOutBack(k);
  const wob = 1 + 0.03 * Math.sin(t * 25);
  // Outer orange burst, inner yellow burst.
  g.lineJoin = "round";
  g.strokeStyle = OUTLINE;
  g.lineWidth = Math.max(2, r * 0.05);
  g.fillStyle = "#f97316";
  star(g, x, y, rr * 1.05 * wob, 12, 0.66, 0.12);
  g.fill();
  g.stroke();
  g.fillStyle = "#facc15";
  star(g, x, y, rr * 0.82 * wob, 12, 0.7, 0.38);
  g.fill();
  g.stroke();
  comicText(g, "POW!", x, y + rr * 0.04, rr * 0.5, "#ffffff", -0.12);
  g.restore();
}

/** Elastic overshoot: 0 → 1 with a couple of decaying wobbles past 1. */
const elastic = (x: number) => {
  const v = clamp01(x);
  if (v === 0 || v === 1) return v;
  return Math.pow(2, -9 * v) * Math.sin((v * 9 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

export const boing: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bits: Bit[] = [];
  const puffs: Puff[] = [];
  let lastHop = -1;
  let powed = false;
  let snapped = false;
  let grabbed = false;
  let flung = false;
  let wound = false;

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const H = h * 0.24;
      const ground = h * 0.88;
      const lw = Math.max(1.5, H * 0.018);
      const stopX = w * 0.22;
      const pose = boingPose(stopX, ground, H, t);
      const target: [number, number] = [w * 0.74, h * 0.42];
      let armTo: [number, number] | null = null;
      let armBehind = false;
      let wobble = 0;

      // 0–0.15: bounce in on springy hops.
      if (progress < 0.15) {
        const k = phase(progress, 0, 0.15);
        pose.x = -H * 0.6 + (stopX + H * 0.6) * easeOutCubic(k);
        const hops = 3;
        const hp = (k * hops) % 1;
        const hopIndex = Math.floor(k * hops);
        pose.y -= Math.sin(Math.PI * hp) * H * (0.5 - hopIndex * 0.12);
        pose.stretch = hp < 0.12 || hp > 0.9 ? 0.86 : 1.08;
        if (hopIndex !== lastHop && hopIndex < hops) {
          lastHop = hopIndex;
          c.audio?.boing(0.2);
          for (let i = 0; i < 3; i++) puffs.push({ x: pose.x + rand(-H * 0.1, H * 0.1), y: ground - H * 0.02, r: H * rand(0.04, 0.07), life: 1 });
        }
      }

      // 0.15–0.3: wind up. The arm becomes a short coiled spring pulled back behind him.
      const windup = phase(progress, 0.15, 0.3);
      if (progress >= 0.15 && progress < 0.3) {
        if (!wound) {
          wound = true;
          c.audio?.boing(0.05);
        }
        pose.arm = "none";
        pose.lean = 0.18 * easeInOut(windup);
        pose.stretch = 1 - 0.06 * easeInOut(windup);
        const [sx, sy] = boingShoulder(pose);
        const back = H * (0.2 + 0.05 * Math.sin(t * 40) * windup);
        // Pulled back and down behind him, so it never crosses his face.
        armTo = [sx - back * 1.1, sy + back * 0.55];
        armBehind = true;
        wobble = windup;
      }

      // 0.3–0.5: the spring shoots across the screen into the POW; 0.5–0.62 it snaps back.
      const punch = phase(progress, 0.3, 0.42);
      const hold = progress >= 0.42 && progress < 0.5;
      const back = phase(progress, 0.5, 0.62);
      if (progress >= 0.3 && progress < 0.62) {
        pose.arm = "none";
        pose.lean = -0.12 * (1 - back);
        const [sx, sy] = boingShoulder(pose);
        const ext = progress < 0.5 ? (hold ? 1 : elastic(punch)) : 1 - easeInOut(back);
        const wob = progress < 0.5 ? (1 - punch) * 0.8 : Math.sin(back * Math.PI) * 1;
        armTo = [sx + (target[0] - sx) * ext, sy + (target[1] - sy) * ext + Math.sin(t * 22) * H * 0.04 * wob];
        wobble = Math.min(1, wob);
        if (!powed && punch > 0.42) {
          powed = true;
          c.audio?.pow();
          const n = Math.round(30 + 40 * c.intensity);
          for (let i = 0; i < n; i++) {
            const a = rand(0, Math.PI * 2);
            const sp = rand(0.2, 0.55) * Math.min(w, h);
            bits.push({ x: target[0], y: target[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - h * 0.1, rot: rand(0, 6), spin: rand(-8, 8), size: Math.min(w, h) * rand(0.006, 0.012), life: 1, decay: rand(0.5, 0.8), gravity: h * 0.6, color: CONFETTI[i % CONFETTI.length]!, kind: i % 3 ? "square" : "dot" });
          }
        }
        if (!snapped && back > 0.85) {
          snapped = true;
          c.audio?.boing(0.4);
        }
      }

      // 0.62–0.8: stretch the spring to the far edge and hold on; 0.8–1 slingshot across and away.
      const reach = phase(progress, 0.62, 0.72);
      const fling = phase(progress, 0.8, 1);
      if (progress >= 0.62) {
        pose.arm = "none";
        const edge: [number, number] = [w - H * 0.06, ground - H * 0.62];
        if (progress < 0.8) {
          const tension = phase(progress, 0.72, 0.8);
          pose.x = stopX - H * 0.25 * easeInOut(tension);
          pose.lean = -0.25 * tension;
          pose.stretch = 1 + 0.1 * tension;
          const [sx, sy] = boingShoulder(pose);
          const ext = easeOutCubic(reach);
          armTo = [sx + (edge[0] - sx) * ext, sy + (edge[1] - sy) * ext];
          wobble = tension * 0.4;
          if (!grabbed && reach >= 1) {
            grabbed = true;
            c.audio?.step();
          }
        } else {
          if (!flung) {
            flung = true;
            c.audio?.boing(1);
          }
          const startX = stopX - H * 0.25;
          pose.x = startX + (w * 1.25 - startX) * Math.pow(fling, 1.8);
          pose.y -= Math.sin(Math.PI * Math.min(1, fling * 1.2)) * H * 0.5;
          pose.lean = -0.35;
          pose.stretch = 1.1;
          const [sx] = boingShoulder(pose);
          if (sx < edge[0] - H * 0.15) armTo = edge;
          wobble = 0.3;
        }
      }

      // Expressions.
      const posing = progress >= 0.15 && progress < 0.3;
      pose.eyes = posing && windup > 0.6 ? "happy" : Math.sin(t * 1.9) > 0.985 ? "blink" : "open";
      pose.grin = true;
      if (progress >= 0.42 && progress < 0.56) pose.eyes = "happy";

      const moving = progress < 0.15 ? 1 - phase(progress, 0.1, 0.15) : progress >= 0.8 ? 1 : 0;
      speedLines(g, pose.x, ground, H, 1, moving * (progress >= 0.8 ? 1 : 0.6), t, dpr);
      drawPuffs(g, puffs, dt);

      // POW behind the glove.
      if (powed) {
        const k = phase(progress, 0.335, 0.4);
        const fade = 1 - phase(progress, 0.55, 0.64);
        drawPow(g, target[0] + H * 0.25, target[1], Math.min(w, h) * 0.17, k, fade, t, dpr);
      }

      const springArm = () => {
        if (!armTo) return;
        const [sx, sy] = boingShoulder(pose);
        drawSpringArm(g, sx, sy, armTo[0], armTo[1], H, wobble, t);
      };
      if (armBehind) springArm();
      drawBoing(g, pose);
      if (!armBehind) springArm();

      // Sparkle while winding up.
      if (posing) sparkle(g, pose.x + H * 0.45, ground - H * 1.1, H * 0.08 * Math.sin(Math.PI * windup), t, "#fde68a", dpr);

      updateBits(bits, dt);
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

/**
 * Boing's departure on the sender: he pops in at the centre, stretches his spring arm to the Send Zone
 * edge (x = 0 after the mirror), grabs it and slingshots himself off through it.
 */
export const boingDeparture = (c: EffectContext): EffectInstance => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  let reached = false;
  let flung = false;
  c.audio?.pop();

  return {
    frame(t) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const H = h * 0.22;
      const ground = h * 0.62;
      const pop = easeOutBack(Math.min(1, t / 0.22));
      if (pop < 0.03) return;
      const pose = boingPose(w * 0.5, ground, H, t);
      pose.facing = -1;
      pose.arm = "none";
      const edge: [number, number] = [H * 0.06, ground - H * 0.55];
      const reach = easeOutCubic(phase(t, 0.2, 0.36));
      const fling = phase(t, 0.38, 0.65);
      if (reach >= 1 && !reached) {
        reached = true;
        c.audio?.boing(0.3);
      }
      if (fling > 0 && !flung) {
        flung = true;
        c.audio?.boing(0.9);
      }
      pose.lean = -0.2 * reach;
      pose.x = w * 0.5 - (w * 0.5 + H * 1.2) * Math.pow(fling, 1.7);
      pose.y -= Math.sin(Math.PI * fling) * H * 0.3;
      pose.eyes = t < 0.2 ? "happy" : "open";
      speedLines(g, pose.x, ground, H, -1, fling > 0 ? 1 : 0, t, dpr);

      g.save();
      g.translate(pose.x, ground);
      g.scale(pop, pop);
      g.translate(-pose.x, -ground);
      drawBoing(g, pose);
      const [sx, sy] = boingShoulder(pose);
      if (reach > 0.02 && sx > edge[0] + H * 0.12) {
        drawSpringArm(g, sx, sy, sx + (edge[0] - sx) * reach, sy + (edge[1] - sy) * reach, H, fling > 0 ? 0.4 : 0.15, t);
      }
      g.restore();
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {},
  };
};
