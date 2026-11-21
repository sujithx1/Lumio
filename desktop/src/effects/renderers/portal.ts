import { beginFrame, ctx2d, easeOutBack, phase, rand, sized, star, type EffectFactory } from "../types";

// Cosmic Portal: a flat, cartoon portal opens at the Send Zone edge and things fly out of it.

const RINGS = ["#5b21b6", "#9333ea", "#db2777", "#f97316", "#facc15"];
const OUTLINE = "#1e1b4b";

type Kind = "rocket" | "planet" | "star" | "ufo" | "comet";

interface Flyer {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobble: number;
  rot: number;
  vr: number;
  size: number;
  hue: number;
  trail: Array<[number, number]>;
  born: number;
}

export const cosmicPortal: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const flyers: Flyer[] = [];
  const inner = Array.from({ length: 40 }, () => ({ a: rand(0, Math.PI * 2), r: Math.random(), tw: rand(0, 6) }));
  let nextSpawn = 0.5;
  let order = 0;
  const kinds: Kind[] = ["rocket", "planet", "star", "ufo", "planet", "comet", "star", "rocket"];
  c.audio?.whoosh(Math.min(3, c.duration / 1000));
  c.audio?.chime();

  const spawn = (t: number, cy: number, R: number) => {
    const m = Math.min(s.w, s.h);
    const kind = kinds[order++ % kinds.length]!;
    flyers.push({
      kind,
      x: R * 0.2,
      y: cy + rand(-R * 0.25, R * 0.25),
      vx: s.w * rand(0.16, 0.28) * (0.8 + 0.4 * c.intensity),
      vy: s.h * rand(-0.1, 0.1),
      wobble: rand(0.5, 1.5),
      rot: 0,
      vr: kind === "star" ? rand(-3, 3) : kind === "planet" ? rand(-0.6, 0.6) : 0,
      size: m * (kind === "star" ? 0.025 : kind === "comet" ? 0.02 : 0.045) * rand(0.85, 1.2),
      hue: rand(0, 360),
      trail: [],
      born: t,
    });
    c.audio?.pop();
  };

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const cy = h * 0.5;
      const maxR = m * 0.34 * (0.85 + 0.3 * c.intensity);
      const opening = easeOutBack(phase(progress, 0, 0.18));
      const closing = 1 - phase(progress, 0.86, 1);
      const R = maxR * opening * closing;
      const lw = 3 * dpr;

      // Faint orbit arcs, like the reference.
      g.lineWidth = 1.5 * dpr;
      g.setLineDash([4 * dpr, 7 * dpr]);
      g.strokeStyle = `rgba(255,255,255,${0.35 * closing})`;
      for (const k of [1.35, 1.8]) {
        g.beginPath();
        g.arc(0, cy, R * k, -Math.PI / 2.4, Math.PI / 2.4);
        g.stroke();
      }
      g.setLineDash([]);

      // Concentric rings, outlined, with rotating highlight dashes.
      if (R > 1) {
        const step = R / (RINGS.length + 2.2);
        RINGS.forEach((color, i) => {
          const r = R - i * step;
          g.beginPath();
          g.arc(0, cy, r, 0, Math.PI * 2);
          g.fillStyle = color;
          g.fill();
          g.lineWidth = lw;
          g.strokeStyle = OUTLINE;
          g.stroke();
          g.save();
          g.setLineDash([step * 0.6, step * 1.4]);
          g.lineDashOffset = -t * 60 * dpr * (i % 2 ? 1 : -1);
          g.strokeStyle = "rgba(255,255,255,0.35)";
          g.lineWidth = step * 0.18;
          g.beginPath();
          g.arc(0, cy, r - step * 0.5, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        });
        // The way through: a deep-space disc with twinkling stars.
        const ir = R - RINGS.length * step;
        g.beginPath();
        g.arc(0, cy, ir, 0, Math.PI * 2);
        g.fillStyle = "#1e1b4b";
        g.fill();
        g.lineWidth = lw;
        g.strokeStyle = OUTLINE;
        g.stroke();
        for (const st of inner) {
          const a = st.a + t * 0.8;
          const rr = st.r * ir * 0.9;
          g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 5 + st.tw)})`;
          g.beginPath();
          g.arc(Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.4 * dpr, 0, Math.PI * 2);
          g.fill();
        }
      }

      if (t >= nextSpawn && progress > 0.12 && progress < 0.78 && R > maxR * 0.6) {
        spawn(t, cy, R);
        nextSpawn = t + rand(0.3, 0.6) / (0.7 + 0.6 * c.intensity);
      }

      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i]!;
        const age = t - f.born;
        f.x += f.vx * dt;
        f.y += (f.vy + Math.sin(age * 2 * f.wobble) * h * 0.04) * dt;
        f.rot += f.vr * dt;
        f.trail.push([f.x, f.y]);
        if (f.trail.length > 26) f.trail.shift();
        if (f.x > w + f.size * 4) {
          flyers.splice(i, 1);
          continue;
        }
        const grow = Math.min(1, 0.25 + f.x / (maxR * 1.1));
        // Dotted trail.
        g.fillStyle = f.kind === "comet" ? "rgba(253,224,71,0.8)" : "rgba(255,255,255,0.7)";
        f.trail.forEach(([x, y], k) => {
          if (k % 3) return;
          g.beginPath();
          g.arc(x, y, (k / f.trail.length) * 2.2 * dpr * grow, 0, Math.PI * 2);
          g.fill();
        });
        g.save();
        g.translate(f.x, f.y);
        const angle = Math.atan2(f.vy + Math.cos(age * 2 * f.wobble) * h * 0.04, f.vx);
        g.scale(grow, grow);
        drawFlyer(g, f, angle, t, dpr);
        g.restore();
      }
    },
    resize(w, h) {
      s.w = w;
      s.h = h;
    },
    dispose() {},
  };
};

function drawFlyer(g: CanvasRenderingContext2D, f: Flyer, angle: number, t: number, dpr: number) {
  const z = f.size;
  g.lineWidth = 2.2 * dpr;
  g.strokeStyle = OUTLINE;
  g.lineJoin = "round";
  switch (f.kind) {
    case "rocket": {
      g.rotate(angle);
      // Flame.
      const fl = z * (0.9 + 0.3 * Math.sin(t * 40));
      g.fillStyle = "#fb923c";
      g.beginPath();
      g.moveTo(-z * 0.9, -z * 0.28);
      g.quadraticCurveTo(-z * 0.9 - fl, 0, -z * 0.9, z * 0.28);
      g.fill();
      g.fillStyle = "#fde047";
      g.beginPath();
      g.moveTo(-z * 0.9, -z * 0.15);
      g.quadraticCurveTo(-z * 0.9 - fl * 0.6, 0, -z * 0.9, z * 0.15);
      g.fill();
      // Fins.
      g.fillStyle = "#ef4444";
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.moveTo(-z * 0.4, sgn * z * 0.32);
        g.lineTo(-z * 0.95, sgn * z * 0.65);
        g.lineTo(-z * 0.85, sgn * z * 0.2);
        g.closePath();
        g.fill();
        g.stroke();
      }
      // Body.
      g.fillStyle = "#f8fafc";
      g.beginPath();
      g.moveTo(-z * 0.9, -z * 0.32);
      g.lineTo(z * 0.35, -z * 0.32);
      g.quadraticCurveTo(z * 1.05, 0, z * 0.35, z * 0.32);
      g.lineTo(-z * 0.9, z * 0.32);
      g.closePath();
      g.fill();
      g.stroke();
      // Nose cone.
      g.fillStyle = "#ef4444";
      g.beginPath();
      g.moveTo(z * 0.45, -z * 0.29);
      g.quadraticCurveTo(z * 1.05, 0, z * 0.45, z * 0.29);
      g.closePath();
      g.fill();
      g.stroke();
      // Window.
      g.fillStyle = "#38bdf8";
      g.beginPath();
      g.arc(-z * 0.05, 0, z * 0.16, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case "planet": {
      g.rotate(f.rot);
      g.fillStyle = `hsl(${f.hue}, 75%, 62%)`;
      g.beginPath();
      g.arc(0, 0, z * 0.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = `hsla(${f.hue}, 70%, 40%, 0.6)`;
      g.beginPath();
      g.arc(-z * 0.18, -z * 0.12, z * 0.12, 0, Math.PI * 2);
      g.arc(z * 0.2, z * 0.18, z * 0.08, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `hsl(${(f.hue + 40) % 360}, 90%, 75%)`;
      g.lineWidth = z * 0.12;
      g.beginPath();
      g.ellipse(0, 0, z * 1.0, z * 0.28, -0.35, Math.PI * 0.05, Math.PI * 0.95);
      g.stroke();
      break;
    }
    case "star": {
      g.fillStyle = "#fde047";
      star(g, 0, 0, z, 5, 0.48, f.rot);
      g.fill();
      g.stroke();
      break;
    }
    case "ufo": {
      g.rotate(Math.sin(t * 3) * 0.15);
      g.fillStyle = "#67e8f9";
      g.beginPath();
      g.ellipse(0, -z * 0.18, z * 0.38, z * 0.32, 0, Math.PI, 0);
      g.fill();
      g.stroke();
      g.fillStyle = "#94a3b8";
      g.beginPath();
      g.ellipse(0, 0, z * 0.95, z * 0.28, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      for (let i = -2; i <= 2; i++) {
        g.fillStyle = (Math.floor(t * 6) + i) % 2 ? "#fde047" : "#f472b6";
        g.beginPath();
        g.arc(i * z * 0.35, z * 0.05, z * 0.07, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "comet": {
      g.rotate(angle);
      const grad = g.createLinearGradient(-z * 5, 0, 0, 0);
      grad.addColorStop(0, "rgba(253,224,71,0)");
      grad.addColorStop(1, "rgba(253,224,71,0.9)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-z * 5, 0);
      g.lineTo(0, -z * 0.5);
      g.lineTo(0, z * 0.5);
      g.closePath();
      g.fill();
      g.fillStyle = "#fef9c3";
      g.beginPath();
      g.arc(0, 0, z * 0.55, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
}
