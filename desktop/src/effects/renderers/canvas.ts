import { rand, type EffectContext, type EffectFactory, type EffectInstance } from "../types";

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

/** Shared size bookkeeping for canvas effects. */
function sized<T extends object>(c: EffectContext, extra: T) {
  return Object.assign({ w: c.width, h: c.height, dpr: c.dpr }, extra);
}

// ---------------------------------------------------------------------------------------------
// Rainbow: spectral bands sweep across the screen in an arc, with drifting sparkles.

export const rainbow: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c, {});
  const hues = [0, 28, 52, 120, 200, 240, 280];
  const sparkles = Array.from({ length: 70 }, () => ({ a: Math.random(), r: Math.random(), phase: Math.random() * 6 }));

  return {
    frame(t, _dt, progress) {
      const { w, h } = s;
      g.globalCompositeOperation = "source-over";
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0a0c1c");
      bg.addColorStop(1, "#05060c");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const sweep = easeOutCubic(t / 1.8);
      const fade = 1 - Math.max(0, (progress - 0.8) / 0.2);
      const cx = w / 2;
      const cy = h * 1.08;
      const base = Math.min(w, h) * 0.62;
      const band = Math.min(w, h) * (0.035 + 0.02 * c.intensity);
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      hues.forEach((hue, i) => {
        // Red on the outside, violet inside, as in a real rainbow.
        const r = base + (hues.length - 1 - i) * band;
        const shimmer = 0.75 + 0.25 * Math.sin(t * 2 + i * 0.7);
        g.strokeStyle = `hsla(${hue}, 95%, 60%, ${(0.28 + 0.3 * c.intensity) * shimmer * fade})`;
        g.lineWidth = band * 1.05;
        g.shadowColor = `hsla(${hue}, 100%, 60%, 0.8)`;
        g.shadowBlur = 30 * s.dpr;
        g.beginPath();
        g.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * sweep);
        g.stroke();
      });
      g.shadowBlur = 0;
      for (const sp of sparkles) {
        const angle = Math.PI + Math.PI * Math.min(sp.a, sweep);
        const r = base + sp.r * band * hues.length;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r - ((t * 30 * s.dpr + sp.phase * 50) % (80 * s.dpr));
        const alpha = (0.5 + 0.5 * Math.sin(t * 6 + sp.phase * 10)) * fade * c.intensity;
        g.fillStyle = `rgba(255,255,255,${alpha})`;
        g.beginPath();
        g.arc(x, y, 1.6 * s.dpr, 0, Math.PI * 2);
        g.fill();
      }
    },
    resize(w, h) {
      s.w = w;
      s.h = h;
    },
    dispose() {},
  };
};

// ---------------------------------------------------------------------------------------------
// Lightning: branching bolts with screen flashes and thunder.

interface Bolt {
  paths: Array<Array<[number, number]>>;
  born: number;
}

function boltPath(x0: number, y0: number, x1: number, y1: number, spread: number, depth: number): Array<[number, number]> {
  let pts: Array<[number, number]> = [
    [x0, y0],
    [x1, y1],
  ];
  for (let d = 0; d < depth; d++) {
    const next: Array<[number, number]> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      next.push([ax, ay], [(ax + bx) / 2 + rand(-spread, spread), (ay + by) / 2 + rand(-spread, spread) * 0.3]);
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
    spread /= 2;
  }
  return pts;
}

export const lightning: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c, {});
  const bolts: Bolt[] = [];
  let flash = 0;
  let nextStrike = 0.25;
  const rate = 0.7 + 1.8 * c.intensity;

  const strike = (t: number) => {
    const { w, h } = s;
    const x0 = rand(w * 0.15, w * 0.85);
    const main = boltPath(x0, -10, x0 + rand(-w * 0.15, w * 0.15), h * rand(0.75, 1.02), w * 0.12, 7);
    const paths = [main];
    const branches = 2 + Math.floor(c.intensity * 4);
    for (let i = 0; i < branches; i++) {
      const start = main[Math.floor(rand(main.length * 0.2, main.length * 0.7))]!;
      paths.push(boltPath(start[0], start[1], start[0] + rand(-w * 0.2, w * 0.2), start[1] + rand(h * 0.1, h * 0.35), w * 0.05, 5));
    }
    bolts.push({ paths, born: t });
    flash = Math.min(1, flash + 0.6 + 0.4 * c.intensity);
    if (c.audio) setTimeout(() => c.audio?.thunder(), rand(150, 600));
  };

  return {
    frame(t, dt, progress) {
      const { w, h } = s;
      if (t >= nextStrike && progress < 0.88) {
        strike(t);
        nextStrike = t + rand(0.4, 1.6) / rate;
      }
      g.globalCompositeOperation = "source-over";
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#0b0f22");
      sky.addColorStop(1, "#03040a");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      if (flash > 0.01) {
        g.fillStyle = `rgba(190,205,255,${flash * 0.35})`;
        g.fillRect(0, 0, w, h);
      }
      flash *= Math.pow(0.02, dt);

      g.globalCompositeOperation = "lighter";
      g.lineJoin = "round";
      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i]!;
        const age = t - bolt.born;
        if (age > 0.6) {
          bolts.splice(i, 1);
          continue;
        }
        // Flicker: bright, dim, bright, fade.
        const flicker = age < 0.08 ? 1 : age < 0.14 ? 0.3 : age < 0.22 ? 0.9 : Math.max(0, 1 - (age - 0.22) / 0.38);
        bolt.paths.forEach((path, pi) => {
          for (const [width, alpha, blur] of [
            [10, 0.18, 40],
            [3.2, 0.9, 12],
            [1.2, 1, 0],
          ] as const) {
            g.strokeStyle = `rgba(${pi === 0 ? "220,230,255" : "170,190,255"},${alpha * flicker * (pi === 0 ? 1 : 0.7)})`;
            g.lineWidth = width * s.dpr * (pi === 0 ? 1 : 0.55);
            g.shadowColor = "rgba(140,160,255,0.9)";
            g.shadowBlur = blur * s.dpr;
            g.beginPath();
            path.forEach(([x, y], k) => (k === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
            g.stroke();
          }
        });
      }
      g.shadowBlur = 0;
    },
    resize(w, h) {
      s.w = w;
      s.h = h;
    },
    dispose() {},
  };
};

// ---------------------------------------------------------------------------------------------
// Celebration: confetti bursts from both lower corners with flutter and sparkles.

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  phase: number;
}

const CONFETTI_COLORS = ["#7c5cff", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#f87171", "#ffffff"];

export const celebration: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c, {});
  const pieces: Confetto[] = [];
  let nextBurst = 0;

  const burst = () => {
    const { w, h, dpr } = s;
    const count = Math.round(70 + 110 * c.intensity);
    for (const side of [0, 1]) {
      for (let i = 0; i < count; i++) {
        const angle = side === 0 ? rand(-1.35, -0.75) : rand(-2.4, -1.8);
        const speed = rand(0.9, 1.6) * h * 1.05;
        pieces.push({
          x: side === 0 ? -10 : w + 10,
          y: h + 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: rand(0, Math.PI * 2),
          vr: rand(-8, 8),
          w: rand(6, 12) * dpr,
          h: rand(3, 6) * dpr,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
          phase: rand(0, Math.PI * 2),
        });
      }
    }
    c.audio?.chime();
  };

  return {
    frame(t, dt, progress) {
      const { w, h } = s;
      if (t >= nextBurst && progress < 0.6) {
        burst();
        nextBurst = t + 1.1 - 0.4 * c.intensity;
      }
      g.globalCompositeOperation = "source-over";
      const bg = g.createRadialGradient(w / 2, h, 0, w / 2, h, Math.max(w, h));
      bg.addColorStop(0, "#151030");
      bg.addColorStop(1, "#06060c");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const gravity = h * 0.9;
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i]!;
        p.vy += gravity * dt;
        p.vx *= Math.pow(0.35, dt);
        p.vy *= Math.pow(0.55, dt);
        p.x += (p.vx + Math.sin(t * 3 + p.phase) * 40 * s.dpr) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > h + 40) {
          pieces.splice(i, 1);
          continue;
        }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(t * 6 + p.phase)); // flutter
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
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

// ---------------------------------------------------------------------------------------------
// Matrix: cascading columns of glyphs with bright heads and fading trails.

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";

export const matrix: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c, {});
  let size = 0;
  let drops: number[] = [];
  let speeds: number[] = [];
  let acc = 0;

  const layout = () => {
    size = Math.round(18 * s.dpr);
    const cols = Math.ceil(s.w / size);
    drops = Array.from({ length: cols }, () => rand(-s.h / size, 0));
    speeds = Array.from({ length: cols }, () => rand(0.6, 1.4));
    g.fillStyle = "#000";
    g.fillRect(0, 0, s.w, s.h);
  };
  layout();

  return {
    frame(_t, dt) {
      acc += dt;
      const step = 0.045 / (0.6 + 0.8 * c.intensity);
      if (acc < step) return;
      acc = 0;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(0, 0, 0, 0.09)";
      g.fillRect(0, 0, s.w, s.h);
      g.font = `${size}px "JetBrains Mono", ui-monospace, monospace`;
      g.textBaseline = "top";
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i]! * size;
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
        g.fillStyle = "rgba(34, 197, 94, 0.85)";
        g.fillText(ch, i * size, y - size);
        g.fillStyle = "#e7ffe9";
        g.shadowColor = "#4ade80";
        g.shadowBlur = 12 * s.dpr;
        g.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!, i * size, y);
        g.shadowBlur = 0;
        drops[i]! += speeds[i]!;
        if (y > s.h && Math.random() > 0.975 - 0.02 * c.intensity) drops[i] = rand(-10, 0);
      }
    },
    resize(w, h) {
      s.w = w;
      s.h = h;
      layout();
    },
    dispose() {},
  };
};

// ---------------------------------------------------------------------------------------------
// Fireworks: rockets climb, burst into coloured sparks, and fade with gravity and trails.

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  hue: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
}

export const fireworks: EffectFactory = (c): EffectInstance => {
  const g = ctx2d(c.canvas);
  const s = sized(c, {});
  const rockets: Rocket[] = [];
  const sparks: Spark[] = [];
  let nextLaunch = 0;
  g.fillStyle = "#04050a";
  g.fillRect(0, 0, s.w, s.h);

  const explode = (r: Rocket) => {
    const count = Math.round(70 + 90 * c.intensity);
    const speed = Math.min(s.w, s.h) * rand(0.28, 0.45);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
      const v = speed * rand(0.55, 1);
      sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.9, 1.6), hue: r.hue + rand(-18, 18) });
    }
    c.audio?.pop();
  };

  return {
    frame(t, dt, progress) {
      const { w, h, dpr } = s;
      if (t >= nextLaunch && progress < 0.8) {
        rockets.push({ x: rand(w * 0.15, w * 0.85), y: h + 5, vy: -h * rand(0.9, 1.25), targetY: h * rand(0.15, 0.45), hue: rand(0, 360) });
        nextLaunch = t + rand(0.25, 0.75) / (0.6 + c.intensity);
      }
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(4, 5, 10, 0.22)";
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]!;
        r.y += r.vy * dt;
        g.fillStyle = `hsla(${r.hue}, 100%, 80%, 0.9)`;
        g.beginPath();
        g.arc(r.x, r.y, 2.2 * dpr, 0, Math.PI * 2);
        g.fill();
        if (r.y <= r.targetY) {
          explode(r);
          rockets.splice(i, 1);
        }
      }

      const gravity = h * 0.35;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.vx *= Math.pow(0.25, dt);
        p.vy = p.vy * Math.pow(0.25, dt) + gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const a = Math.min(1, p.life);
        g.fillStyle = `hsla(${p.hue}, 100%, ${55 + 25 * a}%, ${a})`;
        g.beginPath();
        g.arc(p.x, p.y, (1.2 + 1.3 * a) * dpr, 0, Math.PI * 2);
        g.fill();
      }
    },
    resize(w, h) {
      s.w = w;
      s.h = h;
    },
    dispose() {},
  };
};
