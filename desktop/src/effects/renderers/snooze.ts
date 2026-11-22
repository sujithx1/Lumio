import { beginFrame, ctx2d, easeInOut, easeOutBack, easeOutCubic, phase, rand, sized, type EffectContext, type EffectFactory, type EffectInstance } from "../types";
import { basePose, blush, boltPoints, cloud, comicText, drawBits, eyes, figure, legs, mouth, OUTLINE, SKIN, strokeBolt, updateBits, type Bit, type ChibiPose } from "./chibi";

// Snooze: an original sleepy cat-eared kid in a navy cloak covered in little clouds, with a floppy
// nightcap hood and a wooden practice stick. He sleepwalks in, yawns, rubs his fluffy hair until it
// crackles with static, then zaps across the screen as a blue-purple spark, yawns again, and floats
// away curled up on a cloud.

const HAIR = "#f1f5f9";
const HAIR_SHADE = "#cbd5e1";
const EAR = "#1f2937";
const EAR_INNER = "#f9a8d4";
const CLOAK = "#1e3a8a";
const CLOAK_DARK = "#172554";
const CLOUD = "#f8fafc";
const POMPOM = "#e0e7ff";
const STICK = "#d6a76c";
const STICK_DARK = "#a16207";
const INDIGO = "#6366f1";
const SKY = "#38bdf8";

export interface SnoozePose extends ChibiPose {
  walk: number;
  walking: number;
  eyes: "sleepy" | "closed" | "open" | "happy";
  glow: boolean;
  /** 0 normal hair, 1 fully puffed with static. */
  floof: number;
  /** Mouth: yawn amount 0..1 (0 = small smile). */
  yawn: number;
  /** Arms: "front" sleepwalking forward, "up" stretching, "rub" rubbing his hair, "rest". */
  arms: "front" | "up" | "rub" | "rest";
  /** Nose bubble radius as a fraction of the head (0 = none). */
  bubble: number;
}

export const snoozePose = (x: number, y: number, size: number, t: number): SnoozePose => ({
  ...basePose(x, y, size, t),
  walk: 0,
  walking: 0,
  eyes: "sleepy",
  glow: false,
  floof: 0,
  yawn: 0,
  arms: "rest",
  bubble: 0,
});

function armAngle(p: SnoozePose, front: boolean): number {
  switch (p.arms) {
    case "front":
      return front ? -0.15 + Math.sin(p.t * 3) * 0.06 : -0.3;
    case "up":
      return -2.2;
    case "rub":
      return -2.5 + Math.sin(p.t * 30) * 0.35 * (front ? 1 : -1);
    default:
      return front ? 0.95 : 0.9;
  }
}

export function drawSnooze(g: CanvasRenderingContext2D, p: SnoozePose) {
  if (p.size < 4) return;
  const { H, R, lw, hy } = figure(g, p);

  // Slim cat tail curling behind.
  g.save();
  g.strokeStyle = OUTLINE;
  g.lineWidth = H * 0.05;
  g.beginPath();
  g.moveTo(-H * 0.12, -H * 0.18);
  g.bezierCurveTo(-H * 0.35, -H * 0.15, -H * 0.32, -H * 0.45, -H * 0.22 + Math.sin(p.t * 2.5) * H * 0.04, -H * 0.5);
  g.stroke();
  g.strokeStyle = EAR;
  g.lineWidth = H * 0.032;
  g.stroke();
  g.restore();

  legs(g, H, "#e2e8f0", "#312e81", p.walk, p.walking);

  // Back arm.
  g.save();
  g.translate(-H * 0.1, -H * 0.38);
  // Sleepwalking holds both arms out front; otherwise the back arm mirrors the front one.
  g.rotate(p.arms === "front" ? armAngle(p, false) : Math.PI - armAngle(p, false));
  g.fillStyle = CLOAK_DARK;
  g.beginPath();
  g.ellipse(H * 0.06, 0, H * 0.075, H * 0.045, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(H * 0.14, 0, H * 0.032, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // Cloak: a bell shape covered in little white clouds.
  g.fillStyle = CLOAK;
  g.beginPath();
  g.moveTo(-H * 0.12, -H * 0.45);
  g.lineTo(H * 0.12, -H * 0.45);
  g.quadraticCurveTo(H * 0.22, -H * 0.25, H * 0.21, -H * 0.13);
  g.quadraticCurveTo(0, -H * 0.09, -H * 0.21, -H * 0.13);
  g.quadraticCurveTo(-H * 0.22, -H * 0.25, -H * 0.12, -H * 0.45);
  g.closePath();
  g.fill();
  g.stroke();
  g.save();
  g.clip();
  for (const [cx, cy] of [
    [-H * 0.1, -H * 0.36],
    [H * 0.08, -H * 0.3],
    [-H * 0.05, -H * 0.2],
    [H * 0.15, -H * 0.17],
  ] as const) {
    cloud(g, cx, cy, H * 0.045, CLOUD);
  }
  g.restore();

  // Floppy nightcap hood drooping behind the head, with a pompom.
  const droop = Math.sin(p.t * 2) * 0.08;
  g.save();
  g.translate(-R * 0.6, hy - R * 0.55);
  g.rotate(-0.4 + droop - p.floof * 0.3);
  g.fillStyle = CLOAK;
  g.beginPath();
  g.moveTo(R * 0.4, -R * 0.2);
  g.quadraticCurveTo(-R * 0.4, -R * 0.6, -R * 1.1, R * 0.55);
  g.quadraticCurveTo(-R * 0.5, R * 0.1, R * 0.5, R * 0.55);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = POMPOM;
  g.beginPath();
  g.arc(-R * 1.1, R * 0.6, R * 0.2, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // Head.
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(0, hy, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Fluffy silver hair: a cloud of round puffs that grows when it's full of static.
  const puff = 1 + p.floof * 0.35;
  const puffs: Array<[number, number, number]> = [
    [-0.75, -0.45, 0.38],
    [-0.4, -0.82, 0.4],
    [0.05, -0.95, 0.42],
    [0.5, -0.8, 0.38],
    [0.85, -0.45, 0.3],
    [-0.9, 0.0, 0.3],
  ];
  const hairPath = () => {
    g.beginPath();
    for (const [px, py, pr] of puffs) {
      const wob = Math.sin(p.t * (6 + p.floof * 30) + px * 5) * 0.03 * (1 + p.floof * 3);
      g.moveTo(px * R * puff + pr * R * puff, hy + py * R * puff + wob * R);
      g.arc(px * R * puff, hy + py * R * puff + wob * R, pr * R * puff, 0, Math.PI * 2);
    }
  };
  g.save();
  g.lineWidth = lw * 2;
  hairPath();
  g.stroke();
  g.fillStyle = HAIR;
  hairPath();
  g.fill();
  g.restore();
  // Soft bangs over the forehead.
  g.fillStyle = HAIR;
  g.beginPath();
  g.moveTo(-R * 0.75, hy - R * 0.3);
  g.quadraticCurveTo(-R * 0.4, hy - R * 0.05, -R * 0.15, hy - R * 0.35);
  g.quadraticCurveTo(R * 0.1, hy - R * 0.1, R * 0.35, hy - R * 0.38);
  g.quadraticCurveTo(R * 0.6, hy - R * 0.12, R * 0.85, hy - R * 0.35);
  g.lineTo(R * 0.7, hy - R * 0.8);
  g.lineTo(-R * 0.6, hy - R * 0.8);
  g.closePath();
  g.fill();
  g.strokeStyle = HAIR_SHADE;
  g.beginPath();
  g.moveTo(-R * 0.2, hy - R * 0.9);
  g.quadraticCurveTo(0, hy - R * 0.7, R * 0.25, hy - R * 0.92);
  g.stroke();
  g.strokeStyle = OUTLINE;

  // Black cat ears, poking up out of the fluffy hair.
  for (const [ex, tilt] of [
    [-R * 0.45, -0.3],
    [R * 0.45, 0.28],
  ] as const) {
    g.save();
    g.translate(ex * (1 + p.floof * 0.25), hy - R * (0.98 + p.floof * 0.35));
    g.rotate(tilt - (p.eyes === "sleepy" || p.eyes === "closed" ? tilt * 0.6 + 0.15 * Math.sign(tilt) : 0));
    g.fillStyle = EAR;
    g.beginPath();
    g.moveTo(-R * 0.3, R * 0.12);
    g.lineTo(0, -R * 0.55);
    g.lineTo(R * 0.3, R * 0.12);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = EAR_INNER;
    g.beginPath();
    g.moveTo(-R * 0.14, R * 0.04);
    g.lineTo(0, -R * 0.3);
    g.lineTo(R * 0.14, R * 0.04);
    g.closePath();
    g.fill();
    g.restore();
  }

  eyes(g, R, hy, lw, p.eyes === "sleepy" ? "sleepy" : p.eyes === "closed" ? "closed" : p.eyes === "happy" ? "happy" : "open", {
    iris: p.glow ? SKY : "#4c1d95",
    ...(p.glow ? { glow: SKY } : {}),
  });
  blush(g, R, hy, "rgba(196,181,253,0.7)");
  if (p.yawn > 0.05) mouth(g, R, hy, lw, "o", p.yawn);
  else mouth(g, R, hy, lw, p.glow ? "smile" : "flat");

  // Nose bubble.
  if (p.bubble > 0.01) {
    const br = R * p.bubble;
    const bx = R * 0.75 + br * 0.8;
    const by = hy + R * 0.32;
    g.save();
    g.fillStyle = "rgba(186,230,253,0.45)";
    g.strokeStyle = "rgba(125,211,252,0.9)";
    g.lineWidth = lw * 0.8;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath();
    g.ellipse(bx - br * 0.35, by - br * 0.35, br * 0.22, br * 0.13, -0.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Front arm, holding a short wooden practice stick when it's at his side or out front.
  g.save();
  g.translate(H * 0.1, -H * 0.38);
  g.rotate(armAngle(p, true));
  if (p.arms === "rest" || p.arms === "front") {
    g.save();
    g.translate(H * 0.14, 0);
    g.rotate(p.arms === "front" ? 1.3 : 1.1);
    g.fillStyle = STICK;
    g.beginPath();
    g.roundRect(-H * 0.02, -H * 0.04, H * 0.04, H * 0.34, H * 0.02);
    g.fill();
    g.stroke();
    g.strokeStyle = STICK_DARK;
    g.beginPath();
    g.moveTo(0, H * 0.0);
    g.lineTo(0, H * 0.08);
    g.stroke();
    g.restore();
  }
  g.fillStyle = CLOAK;
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

interface Zee {
  x: number;
  y: number;
  size: number;
  born: number;
  big: boolean;
}

const spark = (x: number, y: number, m: number, vx: number, vy: number): Bit => ({
  x,
  y,
  vx,
  vy,
  rot: rand(0, 6),
  spin: rand(-10, 10),
  size: m * rand(0.004, 0.01),
  life: 1,
  decay: rand(1.2, 2.2),
  gravity: 0,
  color: Math.random() < 0.5 ? SKY : Math.random() < 0.5 ? INDIGO : "#ffffff",
  kind: "spark",
});

function drawZees(g: CanvasRenderingContext2D, zees: Zee[], t: number) {
  for (let i = zees.length - 1; i >= 0; i--) {
    const z = zees[i]!;
    const k = t - z.born;
    if (k > 2) {
      zees.splice(i, 1);
      continue;
    }
    g.save();
    g.globalAlpha = Math.min(1, k * 4) * (1 - Math.max(0, (k - 1.3) / 0.7));
    comicText(g, z.big ? "Z" : "z", z.x + Math.sin(k * 3 + i) * z.size * 0.4, z.y - k * z.size * 1.6, z.size * (0.8 + k * 0.3), "#e0e7ff", -0.2);
    g.restore();
  }
}

export const snooze: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bits: Bit[] = [];
  const zees: Zee[] = [];
  let zTimer = 0.2;
  let snoreTimer = 0;
  let lastStep = 0;
  let popped = false;
  let crackled = false;
  let zapped = false;
  let seed = 1;
  let seedTimer = 0;

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const H = h * 0.24;
      const ground = h * 0.88;
      const lw = Math.max(1.5, H * 0.018);
      const stopX = w * 0.28;
      const farX = w * 0.74;
      const pose = snoozePose(stopX, ground, H, t);
      let visible = true;
      let onCloud = 0;

      // 0–0.2: sleepwalks in, wobbling, z's floating up, a nose bubble breathing in and out.
      if (progress < 0.2) {
        const k = phase(progress, 0, 0.2);
        pose.x = -H * 0.6 + (stopX + H * 0.6) * easeInOut(k);
        pose.walking = 1 - phase(k, 0.85, 1);
        pose.walk = t * 6;
        pose.lean = Math.sin(t * 3) * 0.08;
        pose.arms = "front";
        pose.bubble = 0.18 + 0.12 * Math.sin(t * 3);
        const step = Math.floor(pose.walk / Math.PI);
        if (step !== lastStep && pose.walking > 0.3) {
          lastStep = step;
          c.audio?.step();
        }
      }
      // 0.2–0.32: stops, stretches and yawns; the bubble pops.
      const yawn1 = phase(progress, 0.2, 0.32);
      if (progress >= 0.2 && progress < 0.32) {
        pose.arms = yawn1 < 0.75 ? "up" : "rest";
        pose.yawn = Math.sin(Math.PI * Math.min(1, yawn1 * 1.3));
        pose.stretch = 1 + 0.06 * pose.yawn;
        pose.eyes = "closed";
        pose.bubble = yawn1 < 0.4 ? 0.3 + yawn1 * 0.4 : 0;
        if (!popped && yawn1 >= 0.4) {
          popped = true;
          c.audio?.pop();
          for (let i = 0; i < 8; i++) bits.push({ ...spark(pose.x + H * 0.35, ground - H * 0.7, m, rand(-0.1, 0.1) * w, rand(-0.1, 0.05) * h), color: "#bae6fd", kind: "dot", decay: 2.5 });
        }
      }
      // 0.32–0.42: rubs his hair until it crackles; eyes snap open, glowing.
      const charge = phase(progress, 0.32, 0.42);
      if (progress >= 0.32 && progress < 0.44) {
        pose.arms = charge < 0.7 ? "rub" : "rest";
        pose.floof = easeOutCubic(charge);
        pose.eyes = charge > 0.55 ? "open" : "closed";
        pose.glow = charge > 0.55;
        pose.y -= Math.sin(Math.PI * phase(charge, 0.55, 1)) * H * 0.08;
        if (!crackled && charge > 0.3) {
          crackled = true;
          c.audio?.crackle();
        }
        if (Math.random() < 0.5 + charge) {
          const a = rand(0, Math.PI * 2);
          bits.push(spark(pose.x + Math.cos(a) * H * 0.35, ground - H * 0.8 + Math.sin(a) * H * 0.35, m, Math.cos(a) * m * 0.15, Math.sin(a) * m * 0.15));
        }
      }
      // 0.44–0.6: ZAP — a jagged blue-purple bolt across the screen; he reappears on the far side.
      const zap = phase(progress, 0.44, 0.6);
      if (progress >= 0.44 && progress < 0.6) {
        if (!zapped) {
          zapped = true;
          c.audio?.thunder();
          c.audio?.crackle();
        }
        visible = zap > 0.45;
        pose.x = farX;
        pose.glow = true;
        pose.floof = 1;
        pose.eyes = "open";
        pose.lean = -0.15 * (1 - phase(zap, 0.45, 0.8));
        pose.stretch = zap < 0.55 ? 0.8 + zap * 0.3 : 1;
      }
      // 0.6–0.78: the crackle fades; he yawns again and droops.
      const yawn2 = phase(progress, 0.6, 0.78);
      if (progress >= 0.6 && progress < 0.78) {
        pose.x = farX;
        pose.floof = 1 - easeOutCubic(yawn2);
        pose.yawn = Math.sin(Math.PI * phase(yawn2, 0.2, 0.75));
        pose.eyes = yawn2 < 0.2 ? "open" : yawn2 < 0.8 ? "closed" : "sleepy";
        pose.glow = yawn2 < 0.2;
        pose.arms = yawn2 > 0.2 && yawn2 < 0.7 ? "up" : "rest";
      }
      // 0.78–1: curls up on a little cloud and drifts away.
      const drift = phase(progress, 0.78, 1);
      if (progress >= 0.78) {
        onCloud = easeOutBack(phase(drift, 0, 0.25));
        pose.x = farX + (w * 1.25 - farX) * Math.pow(phase(drift, 0.2, 1), 1.4);
        pose.y = ground - H * 0.35 * onCloud - Math.sin(t * 2.5) * H * 0.03;
        pose.eyes = "closed";
        pose.arms = "rest";
        pose.stretch = 1 - 0.25 * onCloud;
      }

      // Z's float up whenever he's asleep.
      const asleep = progress < 0.2 || (progress >= 0.66 && progress < 0.75) || progress >= 0.78;
      if (asleep) {
        zTimer -= dt;
        if (zTimer <= 0) {
          zTimer = 0.55;
          zees.push({ x: pose.x + H * 0.4, y: pose.y - H * 1.05, size: H * 0.13, born: t, big: zees.length % 3 === 2 });
        }
        snoreTimer -= dt;
        if (snoreTimer <= 0) {
          snoreTimer = 1.4;
          c.audio?.snore();
        }
      }

      // --- draw ---
      // The bolt and the flash.
      if (zap > 0 && zap < 1) {
        seedTimer -= dt;
        if (seedTimer <= 0) {
          seedTimer = 0.045;
          seed += 1;
        }
        const reveal = easeOutCubic(phase(zap, 0, 0.3));
        const fade = 1 - phase(zap, 0.5, 1);
        const pts = boltPoints(stopX - w * 0.2, h * 0.3, farX + w * 0.22, ground - H * 0.6 - h * 0.1, 14, h * 0.16, seed);
        const n = Math.max(2, Math.ceil(pts.length * reveal));
        strokeBolt(g, pts.slice(0, n), m * (0.012 + 0.008 * c.intensity), INDIGO, SKY, dpr, fade);
        // A thinner branch.
        const branch = boltPoints(pts[5]![0], pts[5]![1], pts[5]![0] + w * 0.1, pts[5]![1] + h * 0.25, 6, h * 0.05, seed + 7);
        strokeBolt(g, branch, m * 0.006, INDIGO, SKY, dpr, fade * reveal);
        if (zap < 0.25) {
          g.save();
          g.globalAlpha = 0.3 * (1 - zap / 0.25);
          g.fillStyle = "#e0e7ff";
          g.fillRect(0, 0, w, h);
          g.restore();
        }
        // A puff of thundercloud where he lands.
        const cl = easeOutBack(phase(zap, 0.3, 0.6)) * (1 - phase(zap, 0.8, 1));
        if (cl > 0.01) {
          g.save();
          g.globalAlpha = 0.9 * Math.min(1, cl);
          cloud(g, farX + H * 0.15, ground - H * 1.75, H * 0.4 * cl, "#c7d2fe", OUTLINE, lw);
          cloud(g, farX + H * 0.15, ground - H * 1.78, H * 0.3 * cl, "#e0e7ff");
          g.restore();
        }
        if (Math.random() < 0.8) bits.push(spark(rand(stopX, farX), ground - H * rand(0.3, 1.2), m, rand(-0.1, 0.1) * w, rand(-0.1, 0.1) * h));
      }

      // The cloud he rides away on, under him.
      if (onCloud > 0.01) {
        cloud(g, pose.x, ground - H * 0.2 - (ground - pose.y) * 0.5, H * 0.45 * onCloud, CLOUD, OUTLINE, lw);
      }
      if (visible) drawSnooze(g, pose);
      if (onCloud > 0.01) {
        // Front puffs of the cloud tuck him in.
        g.save();
        g.globalAlpha = 0.95;
        cloud(g, pose.x + H * 0.05, ground - H * 0.12 - (ground - pose.y) * 0.5, H * 0.32 * onCloud, CLOUD);
        g.restore();
      }

      // Static sparks fizzing in his hair after the zap.
      if (pose.floof > 0.3 && visible) {
        g.save();
        g.globalAlpha = pose.floof;
        for (let i = 0; i < 3; i++) {
          const a = t * 9 + i * 2.1;
          const r = H * 0.42;
          const cx = pose.x + Math.cos(a) * r * 0.9;
          const cy = pose.y - H * 0.85 + Math.sin(a) * r * 0.6;
          strokeBolt(g, boltPoints(cx, cy, cx + H * 0.08, cy + H * 0.05, 3, H * 0.03, seed + i), H * 0.012, INDIGO, SKY, dpr);
        }
        g.restore();
      }

      drawZees(g, zees, t);
      updateBits(bits, dt);
      drawBits(g, bits, lw);
    },
    resize(width, height) {
      s.w = width;
      s.h = height;
    },
    dispose() {
      bits.length = 0;
      zees.length = 0;
    },
  };
};

/** Snooze's departure: his eyes snap open and he zaps out through the Send Zone edge as a quick bolt. */
export const snoozeDeparture = (c: EffectContext): EffectInstance => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bits: Bit[] = [];
  let zapped = false;
  let seed = 3;
  let seedTimer = 0;
  c.audio?.crackle();

  return {
    frame(t, dt) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const H = h * 0.22;
      const ground = h * 0.62;
      const lw = Math.max(1.5, H * 0.018);
      const pop = easeOutBack(Math.min(1, t / 0.22));
      const zap = phase(t, 0.32, 0.65);
      if (zap > 0 && !zapped) {
        zapped = true;
        c.audio?.thunder();
      }
      seedTimer -= dt;
      if (seedTimer <= 0) {
        seedTimer = 0.045;
        seed += 1;
      }
      const x = w * 0.5;
      if (zap <= 0.15 && pop > 0.03) {
        const pose = snoozePose(x, ground, H, t);
        pose.facing = -1;
        pose.floof = Math.min(1, t / 0.3);
        pose.eyes = t < 0.18 ? "sleepy" : "open";
        pose.glow = t >= 0.18;
        pose.arms = t < 0.25 ? "rub" : "rest";
        g.save();
        g.translate(x, ground);
        g.scale(pop, pop);
        g.translate(-x, -ground);
        drawSnooze(g, pose);
        g.restore();
        if (Math.random() < 0.7) {
          const a = rand(0, Math.PI * 2);
          bits.push(spark(x + Math.cos(a) * H * 0.35, ground - H * 0.8 + Math.sin(a) * H * 0.35, m, Math.cos(a) * m * 0.15, Math.sin(a) * m * 0.15));
        }
      }
      if (zap > 0) {
        const reveal = easeOutCubic(phase(zap, 0, 0.6));
        const fade = 1 - phase(zap, 0.7, 1);
        const pts = boltPoints(x, ground - H * 0.6, -m * 0.05, h * 0.4, 10, h * 0.1, seed);
        const n = Math.max(2, Math.ceil(pts.length * reveal));
        strokeBolt(g, pts.slice(0, n), m * 0.014, INDIGO, SKY, dpr, fade);
        if (zap > 0.6) {
          const k = phase(zap, 0.6, 1);
          const grad = g.createRadialGradient(0, h * 0.4, 0, 0, h * 0.4, h * 0.35);
          grad.addColorStop(0, `rgba(255,255,255,${0.8 * (1 - k)})`);
          grad.addColorStop(0.3, `rgba(99,102,241,${0.45 * (1 - k)})`);
          grad.addColorStop(1, "rgba(99,102,241,0)");
          g.fillStyle = grad;
          g.fillRect(0, h * 0.05, w * 0.2, h * 0.7);
        }
      }
      updateBits(bits, dt);
      drawBits(g, bits, lw);
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
