import { beginFrame, ctx2d, phase, rand, sized, star, type EffectFactory } from "../types";

// Cartoon Parade: original bouncy critters hop in from the Send Zone edge along the bottom.

type Feature = "ears" | "antenna" | "bunny" | "horn" | "plain" | "tuft";

interface Critter {
  color: string;
  belly: string;
  feature: Feature;
  x: number;
  hop: number;
  speed: number;
  size: number;
  blinkAt: number;
  landed: boolean;
}

const CAST: Array<[string, string, Feature]> = [
  ["#f472b6", "#fbcfe8", "ears"],
  ["#a3e635", "#ecfccb", "antenna"],
  ["#38bdf8", "#e0f2fe", "bunny"],
  ["#facc15", "#fef9c3", "horn"],
  ["#fb923c", "#ffedd5", "tuft"],
  ["#c084fc", "#f3e8ff", "plain"],
];

const OUTLINE = "#1f2937";

export const cartoonParade: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const critters: Critter[] = [];
  const pops: Array<{ x: number; y: number; kind: "heart" | "star"; life: number; hue: number }> = [];
  const puffs: Array<{ x: number; y: number; r: number; life: number }> = [];
  let spawned = 0;
  let nextSpawn = 0.2;
  c.audio?.chime();

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const ground = h * 0.93;
      const exit = phase(progress, 0.85, 1);

      if (t >= nextSpawn && spawned < CAST.length + Math.round(c.intensity * 4) && progress < 0.6) {
        const [color, belly, feature] = CAST[spawned % CAST.length]!;
        const size = m * rand(0.065, 0.09);
        critters.push({ color, belly, feature, x: -size * 1.5, hop: rand(0, Math.PI), speed: w * rand(0.16, 0.22), size, blinkAt: rand(0, 3), landed: false });
        spawned++;
        nextSpawn = t + rand(0.35, 0.6);
      }

      for (const cr of critters) {
        cr.x += cr.speed * dt * (1 + exit * 2);
        cr.hop += dt * 6.5;
        const air = Math.abs(Math.sin(cr.hop));
        const z = cr.size;
        const y = ground - air * z * 1.1;
        // Squash on landing, stretch in the air.
        const contact = air < 0.18;
        const sx = contact ? 1.18 : 1 - air * 0.08;
        const sy = contact ? 0.82 : 1 + air * 0.1;
        if (contact && !cr.landed) {
          cr.landed = true;
          puffs.push({ x: cr.x - z * 0.4, y: ground, r: z * 0.15, life: 1 });
          if (Math.random() < 0.35) {
            pops.push({ x: cr.x, y: y - z * 1.6, kind: Math.random() < 0.5 ? "heart" : "star", life: 1, hue: rand(0, 360) });
            c.audio?.pop();
          }
        }
        if (!contact) cr.landed = false;

        // Shadow.
        g.fillStyle = `rgba(0,0,0,${0.18 * (1 - air * 0.6)})`;
        g.beginPath();
        g.ellipse(cr.x, ground + z * 0.05, z * 0.7 * (1 - air * 0.3), z * 0.12, 0, 0, Math.PI * 2);
        g.fill();

        g.save();
        g.translate(cr.x, y);
        g.scale(sx, sy);
        g.lineWidth = 2.5 * dpr;
        g.strokeStyle = OUTLINE;
        g.lineJoin = "round";
        drawFeature(g, cr.feature, cr.color, z, t);
        // Feet.
        const step = Math.sin(cr.hop * 2) * z * 0.12;
        g.fillStyle = cr.color;
        for (const sgn of [-1, 1]) {
          g.beginPath();
          g.ellipse(sgn * z * 0.3 + (sgn > 0 ? step : -step), -z * 0.04, z * 0.18, z * 0.1, 0, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
        // Body.
        g.fillStyle = cr.color;
        g.beginPath();
        g.ellipse(0, -z * 0.6, z * 0.62, z * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = cr.belly;
        g.beginPath();
        g.ellipse(z * 0.05, -z * 0.42, z * 0.36, z * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        // Eyes looking ahead, with blinks.
        const blink = (t + cr.blinkAt) % 3 < 0.12 ? 0.12 : 1;
        for (const ex of [-z * 0.05, z * 0.27]) {
          g.fillStyle = "#fff";
          g.beginPath();
          g.ellipse(ex, -z * 0.78, z * 0.14, z * 0.17 * blink, 0, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          if (blink > 0.5) {
            g.fillStyle = OUTLINE;
            g.beginPath();
            g.arc(ex + z * 0.05, -z * 0.76, z * 0.065, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#fff";
            g.beginPath();
            g.arc(ex + z * 0.07, -z * 0.79, z * 0.022, 0, Math.PI * 2);
            g.fill();
          }
        }
        // Cheeks and smile.
        g.fillStyle = "rgba(244,63,94,0.45)";
        g.beginPath();
        g.ellipse(-z * 0.22, -z * 0.55, z * 0.09, z * 0.05, 0, 0, Math.PI * 2);
        g.ellipse(z * 0.45, -z * 0.55, z * 0.08, z * 0.05, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(z * 0.12, -z * 0.6, z * 0.12, 0.2 * Math.PI, 0.8 * Math.PI);
        g.stroke();
        g.restore();
      }

      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]!;
        p.r += m * 0.05 * dt;
        p.life -= dt * 2;
        if (p.life <= 0) {
          puffs.splice(i, 1);
          continue;
        }
        g.fillStyle = `rgba(255,255,255,${0.6 * p.life})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }

      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]!;
        p.y -= m * 0.12 * dt;
        p.life -= dt * 0.9;
        if (p.life <= 0) {
          pops.splice(i, 1);
          continue;
        }
        const r = m * 0.03 * (1.2 - p.life * 0.4);
        g.globalAlpha = Math.min(1, p.life * 1.5);
        g.lineWidth = 2 * dpr;
        g.strokeStyle = OUTLINE;
        if (p.kind === "heart") {
          g.fillStyle = "#f43f5e";
          heart(g, p.x, p.y, r);
        } else {
          g.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
          star(g, p.x, p.y, r, 5, 0.5, t * 2);
        }
        g.fill();
        g.stroke();
        g.globalAlpha = 1;
      }
    },
    resize(w, h) {
      s.w = w;
      s.h = h;
    },
    dispose() {},
  };
};

function drawFeature(g: CanvasRenderingContext2D, feature: Feature, color: string, z: number, t: number) {
  g.fillStyle = color;
  switch (feature) {
    case "ears":
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.moveTo(sgn * z * 0.45, -z * 0.95);
        g.lineTo(sgn * z * 0.3, -z * 1.35);
        g.lineTo(sgn * z * 0.1, -z * 1.1);
        g.closePath();
        g.fill();
        g.stroke();
      }
      break;
    case "bunny":
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.ellipse(sgn * z * 0.2, -z * 1.35, z * 0.1, z * 0.38, sgn * 0.15 + Math.sin(t * 4) * 0.05, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case "antenna":
      g.beginPath();
      g.moveTo(z * 0.05, -z * 1.15);
      g.quadraticCurveTo(z * 0.25 + Math.sin(t * 5) * z * 0.1, -z * 1.45, z * 0.15, -z * 1.6);
      g.stroke();
      g.fillStyle = "#fde047";
      g.beginPath();
      g.arc(z * 0.15, -z * 1.62, z * 0.09, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    case "horn":
      g.fillStyle = "#fef3c7";
      g.beginPath();
      g.moveTo(-z * 0.08, -z * 1.12);
      g.lineTo(z * 0.08, -z * 1.55);
      g.lineTo(z * 0.22, -z * 1.12);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "tuft":
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.ellipse(i * z * 0.12, -z * 1.22, z * 0.07, z * 0.16, i * 0.4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case "plain":
      break;
  }
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y + r * 0.7);
  g.bezierCurveTo(x - r * 1.2, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.4);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.2, y - r * 0.1, x, y + r * 0.7);
  g.closePath();
}
