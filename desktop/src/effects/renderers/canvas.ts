import { beginFrame, ctx2d, easeOutCubic, fadeCanvas, phase, rand, sized, type EffectFactory } from "../types";

// All effects draw on a transparent canvas and treat x = 0 as the Send Zone edge (see beginFrame).

// ---------------------------------------------------------------------------------------------
// Rainbow: a soft wash of prismatic light pours in from the edge and drifts across.

export const rainbow: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const hues = [0, 30, 55, 130, 195, 235, 285];
  const motes = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), r: rand(1, 2.6), ph: rand(0, 6) }));

  return {
    frame(t, _dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const fadeOut = 1 - phase(progress, 0.75, 1);
      const front = easeOutCubic(t / 2.4) * w * 1.25; // the wash's leading edge
      const band = w * 0.55;
      const alpha = (0.22 + 0.3 * c.intensity) * fadeOut;

      // Main wash: a horizontal spectrum behind the leading edge.
      const grad = g.createLinearGradient(front - band, 0, front, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      hues.forEach((hue, i) => grad.addColorStop(0.1 + (i / (hues.length - 1)) * 0.8, `hsla(${hue}, 95%, 65%, ${alpha})`));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(Math.max(0, front - band), 0, band, h);

      // A lingering tint where the wash has already passed.
      const trail = g.createLinearGradient(0, 0, Math.max(1, front - band), 0);
      trail.addColorStop(0, `hsla(285, 90%, 70%, ${alpha * 0.55})`);
      trail.addColorStop(0.5, `hsla(195, 90%, 70%, ${alpha * 0.3})`);
      trail.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = trail;
      g.fillRect(0, 0, Math.max(0, front - band), h);

      // Edge glow, strongest at the start.
      const edge = g.createLinearGradient(0, 0, w * 0.2, 0);
      const ea = alpha * (0.8 + 0.6 * (1 - phase(progress, 0, 0.4)));
      edge.addColorStop(0, `hsla(${(t * 60) % 360}, 95%, 70%, ${ea})`);
      edge.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = edge;
      g.fillRect(0, 0, w * 0.2, h);

      // Soft vertical falloff so the wash feels like light, not a block.
      g.globalCompositeOperation = "destination-in";
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, "rgba(0,0,0,0.55)");
      v.addColorStop(0.5, "rgba(0,0,0,1)");
      v.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = v;
      g.fillRect(0, 0, w, h);

      // Floating motes of light inside the wash.
      g.globalCompositeOperation = "lighter";
      for (const m of motes) {
        const x = m.x * w;
        if (x > front) continue;
        const y = (m.y * h - t * 18 * dpr * (0.5 + m.r / 3)) % h;
        g.fillStyle = `rgba(255,255,255,${(0.35 + 0.35 * Math.sin(t * 4 + m.ph)) * fadeOut})`;
        g.beginPath();
        g.arc(x, y < 0 ? y + h : y, m.r * dpr, 0, Math.PI * 2);
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
// Lightning: branching bolts crack across the screen from the edge, with brief flashes.

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
      const nx = -(by - ay);
      const ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      const off = rand(-spread, spread);
      next.push([ax, ay], [(ax + bx) / 2 + (nx / len) * off, (ay + by) / 2 + (ny / len) * off]);
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
    spread /= 2;
  }
  return pts;
}

export const lightning: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const bolts: Bolt[] = [];
  let flash = 0;
  let nextStrike = 0.2;
  const rate = 0.8 + 1.8 * c.intensity;

  const strike = (t: number) => {
    const { w, h } = s;
    // Most bolts leap from the Send Zone edge across the screen; some fall from the top.
    const fromEdge = Math.random() < 0.65;
    const [x0, y0] = fromEdge ? [-10, rand(h * 0.15, h * 0.85)] : [rand(w * 0.1, w * 0.9), -10];
    const [x1, y1] = fromEdge ? [rand(w * 0.45, w * 0.95), rand(h * 0.1, h * 0.9)] : [x0 + rand(-w * 0.15, w * 0.15), h * rand(0.6, 1)];
    const main = boltPath(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.12, 7);
    const paths = [main];
    for (let i = 0; i < 2 + Math.floor(c.intensity * 4); i++) {
      const start = main[Math.floor(rand(main.length * 0.2, main.length * 0.7))]!;
      paths.push(boltPath(start[0], start[1], start[0] + rand(-w * 0.2, w * 0.25), start[1] + rand(-h * 0.25, h * 0.25), w * 0.04, 5));
    }
    bolts.push({ paths, born: t });
    flash = Math.min(1, flash + 0.5 + 0.4 * c.intensity);
    if (c.audio) setTimeout(() => c.audio?.thunder(), rand(150, 600));
  };

  return {
    frame(t, dt, progress) {
      const { w, h, dpr } = s;
      if (t >= nextStrike && progress < 0.88) {
        strike(t);
        nextStrike = t + rand(0.35, 1.4) / rate;
      }
      beginFrame(g, c, s);
      if (flash > 0.01) {
        const f = g.createLinearGradient(0, 0, w, 0);
        f.addColorStop(0, `rgba(200,215,255,${flash * 0.35})`);
        f.addColorStop(1, `rgba(200,215,255,${flash * 0.08})`);
        g.fillStyle = f;
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
        const flicker = age < 0.08 ? 1 : age < 0.14 ? 0.3 : age < 0.22 ? 0.9 : Math.max(0, 1 - (age - 0.22) / 0.38);
        bolt.paths.forEach((path, pi) => {
          for (const [width, alpha, blur] of [
            [12, 0.25, 40],
            [3.4, 0.95, 14],
            [1.3, 1, 0],
          ] as const) {
            g.strokeStyle = `rgba(${pi === 0 ? "225,232,255" : "175,195,255"},${alpha * flicker * (pi === 0 ? 1 : 0.7)})`;
            g.lineWidth = width * dpr * (pi === 0 ? 1 : 0.55);
            g.shadowColor = "rgba(130,150,255,0.95)";
            g.shadowBlur = blur * dpr;
            g.beginPath();
            path.forEach(([x, y], k) => (k === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
            g.stroke();
          }
        });
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
// Celebration: confetti bursts out of the Send Zone edge and flutters down over the desktop.

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
  const s = sized(c);
  const pieces: Confetto[] = [];
  let nextBurst = 0;

  const burst = () => {
    const { h, dpr } = s;
    const count = Math.round(110 + 150 * c.intensity);
    const y0 = rand(h * 0.35, h * 0.75);
    for (let i = 0; i < count; i++) {
      const angle = rand(-1.15, 0.25); // a cone aimed into the screen, mostly upward
      const speed = rand(0.7, 1.6) * h * 1.1;
      pieces.push({
        x: -10,
        y: y0 + rand(-20, 20) * dpr,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: rand(0, Math.PI * 2),
        vr: rand(-8, 8),
        w: rand(7, 13) * dpr,
        h: rand(3, 6) * dpr,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
        phase: rand(0, Math.PI * 2),
      });
    }
    c.audio?.chime();
  };

  return {
    frame(t, dt, progress) {
      const { h, dpr } = s;
      if (t >= nextBurst && progress < 0.6) {
        burst();
        nextBurst = t + 1.1 - 0.4 * c.intensity;
      }
      beginFrame(g, c, s);
      const gravity = h * 0.9;
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i]!;
        p.vy += gravity * dt;
        p.vx *= Math.pow(0.4, dt);
        p.vy *= Math.pow(0.55, dt);
        p.x += (p.vx + Math.sin(t * 3 + p.phase) * 40 * dpr) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > h + 40) {
          pieces.splice(i, 1);
          continue;
        }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(t * 6 + p.phase));
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
// Matrix: cascading columns of glyphs with bright heads and fading trails, over the desktop.

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";

export const matrix: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  let size = 0;
  let drops: number[] = [];
  let speeds: number[] = [];
  let acc = 0;

  const layout = () => {
    size = Math.round(18 * s.dpr);
    const cols = Math.ceil(s.w / size);
    drops = Array.from({ length: cols }, () => rand(-s.h / size, 0));
    speeds = Array.from({ length: cols }, () => rand(0.6, 1.4));
    g.clearRect(0, 0, s.w, s.h);
  };
  layout();

  return {
    frame(_t, dt, progress) {
      acc += dt;
      const step = 0.045 / (0.6 + 0.8 * c.intensity);
      if (acc < step) return;
      acc = 0;
      fadeCanvas(g, s, progress > 0.85 ? 0.25 : 0.1);
      // Text is never mirrored; the rain has no direction.
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.font = `${size}px "JetBrains Mono", ui-monospace, monospace`;
      g.textBaseline = "top";
      if (progress > 0.85) return;
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i]! * size;
        g.fillStyle = "rgba(34, 197, 94, 0.9)";
        g.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!, i * size, y - size);
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
// Fireworks: rockets climb from the Send Zone side and bloom into colourful bursts with trails.

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

export const fireworks: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const rockets: Rocket[] = [];
  const sparks: Spark[] = [];
  let nextLaunch = 0;

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
        rockets.push({ x: rand(w * 0.08, w * 0.75), y: h + 5, vy: -h * rand(0.9, 1.25), targetY: h * rand(0.15, 0.45), hue: rand(0, 360) });
        nextLaunch = t + rand(0.25, 0.75) / (0.6 + c.intensity);
      }
      fadeCanvas(g, s, Math.min(0.5, 12 * dt));
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (c.mirror) g.setTransform(-1, 0, 0, 1, w, 0);
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
        g.arc(p.x, p.y, (1.3 + 1.4 * a) * dpr, 0, Math.PI * 2);
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
