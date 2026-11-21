import { beginFrame, ctx2d, easeInOut, easeOutCubic, phase, rand, sized, star, type EffectFactory } from "../types";

// Original anime-style effects. Everything enters from x = 0, the Send Zone edge.

// ---------------------------------------------------------------------------------------------
// Spiral Orb: a spinning orb of wind energy charges at the edge, streaks across, bursts.

export const spiralOrb: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const motes: Array<{ a: number; d: number; v: number }> = [];
  let burstPlayed = false;
  c.audio?.whoosh(Math.min(3, (c.duration / 1000) * 0.6));

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const r0 = m * 0.1 * (0.8 + 0.4 * c.intensity);
      const charge = easeOutCubic(phase(progress, 0, 0.35));
      const fly = easeInOut(phase(progress, 0.35, 0.6));
      const burst = phase(progress, 0.6, 1);
      const x = w * (0.13 + 0.5 * fly);
      const y = h * 0.5;
      const r = r0 * (0.25 + 0.75 * charge) * (1 - easeOutCubic(burst));

      g.globalCompositeOperation = "lighter";

      // Particles pulled into the orb while it charges.
      if (progress < 0.6) {
        for (let i = 0; i < 4; i++) motes.push({ a: rand(0, Math.PI * 2), d: r0 * rand(2.5, 4), v: rand(2, 4) });
      }
      for (let i = motes.length - 1; i >= 0; i--) {
        const p = motes[i]!;
        p.d -= p.v * r0 * dt;
        p.a += dt * 5;
        if (p.d < r * 0.4) {
          motes.splice(i, 1);
          continue;
        }
        g.fillStyle = `rgba(186,230,253,${Math.min(1, p.d / r0 - 0.3) * 0.8})`;
        g.beginPath();
        g.arc(x + Math.cos(p.a) * p.d, y + Math.sin(p.a) * p.d, 1.8 * dpr, 0, Math.PI * 2);
        g.fill();
      }

      // Speed lines and ghost trail while flying.
      if (fly > 0 && fly < 1) {
        for (let i = 0; i < 26; i++) {
          const ly = y + rand(-r0 * 2.2, r0 * 2.2);
          const len = rand(0.1, 0.35) * w;
          g.strokeStyle = `rgba(224,242,254,${rand(0.15, 0.5)})`;
          g.lineWidth = rand(1, 3) * dpr;
          g.beginPath();
          g.moveTo(x - r0, ly);
          g.lineTo(x - r0 - len, ly);
          g.stroke();
        }
        for (let k = 1; k <= 5; k++) {
          g.fillStyle = `rgba(56,189,248,${0.18 / k})`;
          g.beginPath();
          g.arc(x - k * r0 * 0.6, y, r * (1 - k * 0.08), 0, Math.PI * 2);
          g.fill();
        }
      }

      if (r > 1) {
        // Spinning wind rings.
        for (let k = 0; k < 3; k++) {
          g.save();
          g.translate(x, y);
          g.rotate(t * 5 + (k * Math.PI) / 3);
          g.strokeStyle = "rgba(186,230,253,0.75)";
          g.lineWidth = 2.2 * dpr;
          g.beginPath();
          g.ellipse(0, 0, r * 1.7, r * 0.42, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
        // Swirl arcs.
        for (let k = 0; k < 9; k++) {
          const rr = r * (0.35 + (k / 9) * 0.65);
          const a = t * (14 - k) + k * 1.3;
          g.strokeStyle = `rgba(${k % 2 ? "125,211,252" : "255,255,255"},0.85)`;
          g.lineWidth = (2.6 - k * 0.15) * dpr;
          g.beginPath();
          g.arc(x, y, rr, a, a + 1.3);
          g.stroke();
        }
        // Core.
        const core = g.createRadialGradient(x, y, 0, x, y, r * 1.1);
        core.addColorStop(0, "rgba(255,255,255,1)");
        core.addColorStop(0.35, "rgba(186,230,253,0.95)");
        core.addColorStop(0.7, "rgba(56,189,248,0.55)");
        core.addColorStop(1, "rgba(14,165,233,0)");
        g.fillStyle = core;
        g.beginPath();
        g.arc(x, y, r * 1.1, 0, Math.PI * 2);
        g.fill();
      }

      // The burst: impact flash, spiral shockwave, radial focus lines.
      if (burst > 0) {
        if (!burstPlayed) {
          burstPlayed = true;
          c.audio?.thunder();
        }
        const R = Math.max(w, h) * easeOutCubic(burst) * 0.9;
        const fade = 1 - burst;
        if (burst < 0.15) {
          g.fillStyle = `rgba(224,242,254,${(1 - burst / 0.15) * 0.35})`;
          g.fillRect(0, 0, w, h);
        }
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = `rgba(${k ? "125,211,252" : "255,255,255"},${fade * (0.9 - k * 0.25)})`;
          g.lineWidth = (10 - k * 3) * dpr * fade;
          g.beginPath();
          g.arc(x, y, Math.max(1, R * (1 - k * 0.12)), 0, Math.PI * 2);
          g.stroke();
        }
        for (let k = 0; k < 6; k++) {
          const a0 = k * (Math.PI / 3) + burst * 6;
          g.strokeStyle = `rgba(186,230,253,${fade * 0.7})`;
          g.lineWidth = 4 * dpr * fade;
          g.beginPath();
          for (let j = 0; j <= 24; j++) {
            const rr = (j / 24) * R;
            const a = a0 + (j / 24) * 2.2;
            const px = x + Math.cos(a) * rr;
            const py = y + Math.sin(a) * rr;
            if (j === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.stroke();
        }
        if (burst < 0.35) {
          for (let i = 0; i < 40; i++) {
            const a = rand(0, Math.PI * 2);
            const r1 = Math.max(w, h) * rand(0.25, 0.4);
            g.strokeStyle = `rgba(255,255,255,${rand(0.1, 0.35) * (1 - burst / 0.35)})`;
            g.lineWidth = rand(1, 3) * dpr;
            g.beginPath();
            g.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
            g.lineTo(x + Math.cos(a) * r1 * 2.5, y + Math.sin(a) * r1 * 2.5);
            g.stroke();
          }
        }
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
// Power Aura: a golden aura powers up from the edge with lightning and focus lines, then erupts.

export const powerAura: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const tongues = Array.from({ length: 18 }, (_, i) => ({ a: -1.35 + (i / 17) * 2.7, seed: rand(0, 100), len: rand(0.7, 1.2) }));
  const sparks: Array<{ x: number; y: number; vy: number; life: number }> = [];
  let arcs: Array<Array<[number, number]>> = [];
  let arcTimer = 0;
  let erupted = false;
  c.audio?.rumble(c.duration / 1000);

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const ex = 0;
      const ey = h * 0.5;
      const build = easeOutCubic(phase(progress, 0, 0.7));
      const erupt = phase(progress, 0.7, 1);
      const power = build * (1 - erupt * erupt) * (0.75 + 0.5 * c.intensity);
      const L = m * (0.25 + 0.4 * build + 0.6 * easeOutCubic(erupt) * (1 - erupt));

      // Anime focus lines converging on the aura.
      if (build > 0.45 && erupt < 0.6) {
        for (let i = 0; i < 46; i++) {
          const a = rand(-1.5, 1.5);
          const r1 = rand(0.45, 0.6) * w;
          const r2 = r1 + rand(0.2, 0.6) * w;
          g.strokeStyle = `rgba(255,251,235,${rand(0.08, 0.3) * power})`;
          g.lineWidth = rand(1, 4) * dpr;
          g.beginPath();
          g.moveTo(ex + Math.cos(a) * r1, ey + Math.sin(a) * r1);
          g.lineTo(ex + Math.cos(a) * r2, ey + Math.sin(a) * r2);
          g.stroke();
        }
      }

      g.globalCompositeOperation = "lighter";
      // Flame tongues fanning out from the edge.
      for (const tg of tongues) {
        const flick = 0.7 + 0.3 * Math.sin(t * 9 + tg.seed) + 0.15 * Math.sin(t * 23 + tg.seed * 2);
        const len = L * tg.len * flick;
        const a = tg.a + Math.sin(t * 3 + tg.seed) * 0.06;
        const tipX = ex + Math.cos(a) * len;
        const tipY = ey + Math.sin(a) * len - len * 0.15;
        const baseW = m * 0.07;
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const grad = g.createLinearGradient(ex, ey, tipX, tipY);
        grad.addColorStop(0, `rgba(255,255,255,${0.75 * power})`);
        grad.addColorStop(0.3, `rgba(253,224,71,${0.55 * power})`);
        grad.addColorStop(0.75, `rgba(245,158,11,${0.25 * power})`);
        grad.addColorStop(1, "rgba(245,158,11,0)");
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(ex + nx * baseW, ey + ny * baseW);
        g.quadraticCurveTo(ex + Math.cos(a) * len * 0.55 + nx * baseW * 1.4, ey + Math.sin(a) * len * 0.55 + ny * baseW * 1.4, tipX, tipY);
        g.quadraticCurveTo(ex + Math.cos(a) * len * 0.55 - nx * baseW * 1.4, ey + Math.sin(a) * len * 0.55 - ny * baseW * 1.4, ex - nx * baseW, ey - ny * baseW);
        g.closePath();
        g.fill();
      }
      // Core glow at the edge.
      const core = g.createRadialGradient(ex, ey, 0, ex, ey, L * 0.6);
      core.addColorStop(0, `rgba(255,255,255,${0.8 * power})`);
      core.addColorStop(0.4, `rgba(253,224,71,${0.35 * power})`);
      core.addColorStop(1, "rgba(245,158,11,0)");
      g.fillStyle = core;
      g.beginPath();
      g.arc(ex, ey, L * 0.6, 0, Math.PI * 2);
      g.fill();

      // Crackling lightning around the aura.
      arcTimer -= dt;
      if (arcTimer <= 0 && power > 0.2) {
        arcTimer = rand(0.05, 0.12);
        arcs = Array.from({ length: 2 + Math.floor(power * 4) }, () => {
          const a = rand(-1.4, 1.4);
          const r1 = L * rand(0.2, 0.6);
          const pts: Array<[number, number]> = [];
          let px = ex + Math.cos(a) * r1;
          let py = ey + Math.sin(a) * r1;
          for (let k = 0; k < 7; k++) {
            pts.push([px, py]);
            px += rand(-0.5, 1) * m * 0.04;
            py += rand(-1, 1) * m * 0.04;
          }
          return pts;
        });
      }
      g.strokeStyle = `rgba(224,242,254,${0.9 * Math.min(1, power)})`;
      g.shadowColor = "rgba(125,211,252,1)";
      g.shadowBlur = 12 * dpr;
      g.lineWidth = 2 * dpr;
      for (const pts of arcs) {
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
      g.shadowBlur = 0;

      // Sparks floating up.
      if (power > 0.1) for (let i = 0; i < 3; i++) sparks.push({ x: rand(0, L * 0.9), y: ey + rand(-L * 0.6, L * 0.6), vy: -rand(0.1, 0.3) * h, life: 1 });
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.y += p.vy * dt;
        p.life -= dt * 1.2;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        g.fillStyle = `rgba(254,240,138,${p.life})`;
        g.beginPath();
        g.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
        g.fill();
      }

      // Eruption: flash + shock ring.
      if (erupt > 0) {
        if (!erupted) {
          erupted = true;
          c.audio?.thunder();
        }
        if (erupt < 0.12) {
          g.globalCompositeOperation = "source-over";
          g.fillStyle = `rgba(255,251,235,${(1 - erupt / 0.12) * 0.45})`;
          g.fillRect(0, 0, w, h);
          g.globalCompositeOperation = "lighter";
        }
        const R = Math.max(w, h) * 1.1 * easeOutCubic(erupt);
        g.strokeStyle = `rgba(253,224,71,${(1 - erupt) * 0.8})`;
        g.lineWidth = 14 * dpr * (1 - erupt);
        g.beginPath();
        g.arc(ex, ey, Math.max(1, R), -Math.PI / 2, Math.PI / 2);
        g.stroke();
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
// Giant's Wall: the ground shakes, a stone wall rises, a giant with glowing eyes peers over it.

export const giantsWall: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const stomps = [0.06, 0.16, 0.3];
  const played = new Set<number>();
  let shake = 0;
  const steam: Array<{ x: number; y: number; r: number; vr: number; vy: number; life: number }> = [];
  const dust: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

  return {
    frame(t, dt, progress) {
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      for (const sp of stomps) {
        if (progress >= sp && !played.has(sp)) {
          played.add(sp);
          shake = 1;
          c.audio?.thunder();
          for (let i = 0; i < 40; i++) dust.push({ x: rand(0, w), y: h, vx: rand(-60, 60) * dpr, vy: -rand(40, 160) * dpr, life: 1 });
        }
      }
      shake *= Math.pow(0.02, dt);
      beginFrame(g, c, s);
      g.translate(rand(-1, 1) * shake * 14 * dpr * c.intensity, rand(-1, 1) * shake * 10 * dpr * c.intensity);

      const rise = easeOutCubic(phase(progress, 0.04, 0.25)) * (1 - phase(progress, 0.88, 1));
      const wallH = h * 0.22;
      const wallTop = h - wallH * rise;
      const peek = easeInOut(phase(progress, 0.3, 0.55)) * (1 - easeInOut(phase(progress, 0.82, 0.97)));
      const headH = m * 0.62;
      const headW = headH * 0.78;
      const hx = w * 0.3;
      const hy = wallTop + headH * 0.62 - peek * headH * 0.62;

      // Giant (behind the wall).
      if (peek > 0) {
        // Shoulders.
        g.fillStyle = "#2a1a12";
        g.beginPath();
        g.ellipse(hx, hy + headH * 0.75, headW * 1.4, headH * 0.4, 0, Math.PI, 0);
        g.fill();
        // Head.
        const skin = g.createRadialGradient(hx - headW * 0.15, hy - headH * 0.2, headH * 0.1, hx, hy, headH * 0.6);
        skin.addColorStop(0, "#5b3a29");
        skin.addColorStop(1, "#24150e");
        g.fillStyle = skin;
        g.beginPath();
        g.ellipse(hx, hy, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(180,83,9,0.55)";
        g.lineWidth = 3 * dpr;
        g.stroke();
        // Brow ridge.
        g.fillStyle = "#1a0f0a";
        g.beginPath();
        g.ellipse(hx, hy - headH * 0.12, headW * 0.42, headH * 0.08, 0, Math.PI, 0);
        g.fill();
        // Glowing eyes that blink and glance toward the screen.
        const blink = Math.abs(Math.sin(t * 0.9)) > 0.97 ? 0.15 : 1;
        const look = Math.sin(t * 0.6) * headW * 0.05 + headW * 0.04;
        g.globalCompositeOperation = "lighter";
        for (const sgn of [-1, 1]) {
          const exx = hx + sgn * headW * 0.19;
          const eyy = hy - headH * 0.04;
          const glow = g.createRadialGradient(exx, eyy, 0, exx, eyy, headW * 0.22);
          glow.addColorStop(0, `rgba(253,230,138,${0.9 * peek})`);
          glow.addColorStop(1, "rgba(245,158,11,0)");
          g.fillStyle = glow;
          g.beginPath();
          g.arc(exx, eyy, headW * 0.22, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#fff7d6";
          g.beginPath();
          g.ellipse(exx, eyy, headW * 0.09, headW * 0.055 * blink, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#b45309";
          g.beginPath();
          g.arc(exx + look, eyy, headW * 0.03 * blink, 0, Math.PI * 2);
          g.fill();
        }
        g.globalCompositeOperation = "source-over";
        // Steam rolling off the giant.
        if (Math.random() < 0.5) {
          steam.push({ x: hx + rand(-headW * 0.6, headW * 0.6), y: hy + rand(-headH * 0.2, headH * 0.4), r: m * rand(0.03, 0.06), vr: m * rand(0.04, 0.09), vy: -m * rand(0.05, 0.12), life: 1 });
        }
        // A hand gripping the wall.
        const gx = hx + headW * 0.85;
        for (let f = 0; f < 4; f++) {
          g.fillStyle = "#3b2418";
          g.beginPath();
          g.ellipse(gx + f * headW * 0.12, wallTop + headH * 0.03 - peek * headH * 0.04, headW * 0.055, headH * 0.07, 0, 0, Math.PI * 2);
          g.fill();
        }
      }

      // Stone wall.
      if (rise > 0) {
        const bh = wallH / 4;
        for (let row = 0; row < 5; row++) {
          const y = wallTop + row * bh;
          const off = row % 2 ? bh * 0.9 : 0;
          for (let x = -off; x < w; x += bh * 1.8) {
            const shade = 70 + ((Math.floor(x / bh) * 37 + row * 13) % 20);
            g.fillStyle = `rgb(${shade + 18}, ${shade + 12}, ${shade + 8})`;
            g.fillRect(x, y, bh * 1.8 - 3 * dpr, bh - 3 * dpr);
          }
        }
        g.fillStyle = "#292524";
        g.fillRect(0, wallTop - 4 * dpr, w, 6 * dpr);
        const shadeGrad = g.createLinearGradient(0, wallTop, 0, wallTop + wallH * 0.4);
        shadeGrad.addColorStop(0, "rgba(0,0,0,0.35)");
        shadeGrad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = shadeGrad;
        g.fillRect(0, wallTop, w, wallH * 0.4);
      }

      // Steam and dust in front.
      for (let i = steam.length - 1; i >= 0; i--) {
        const p = steam[i]!;
        p.r += p.vr * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.45;
        if (p.life <= 0) {
          steam.splice(i, 1);
          continue;
        }
        const sg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        sg.addColorStop(0, `rgba(245,245,244,${0.55 * p.life})`);
        sg.addColorStop(1, "rgba(245,245,244,0)");
        g.fillStyle = sg;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const p = dust[i]!;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 200 * dpr * dt;
        p.life -= dt;
        if (p.life <= 0) {
          dust.splice(i, 1);
          continue;
        }
        g.fillStyle = `rgba(168,162,158,${p.life * 0.7})`;
        g.beginPath();
        g.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
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
// Pirate Voyage: a cartoon ship rides the waves across the screen; coins splash, gulls circle.

const SEA = ["rgba(29,78,216,0.9)", "rgba(37,99,235,0.92)", "rgba(56,189,248,0.95)"];

export const pirateVoyage: EffectFactory = (c) => {
  const g = ctx2d(c.canvas);
  const s = sized(c);
  const coins: Array<{ x: number; y: number; vx: number; vy: number; spin: number; life: number }> = [];
  const gulls = Array.from({ length: 4 }, (_, i) => ({ x: rand(-0.3, 0.2), y: rand(0.12, 0.35), v: rand(0.08, 0.14), ph: i * 1.7 }));
  let coinTimer = 0.6;
  c.audio?.rumble(c.duration / 1000);

  const waveY = (layer: number, x: number, t: number, base: number) =>
    base + Math.sin(x * 0.006 / s.dpr + t * (1.2 + layer * 0.4) + layer * 2) * s.h * 0.012 * (1 + layer * 0.5) + Math.sin(x * 0.017 / s.dpr - t * 2 + layer) * s.h * 0.005;

  return {
    frame(t, dt, progress) {
      beginFrame(g, c, s);
      const { w, h, dpr } = s;
      const m = Math.min(w, h);
      const rise = easeOutCubic(phase(progress, 0, 0.15)) * (1 - easeInOut(phase(progress, 0.88, 1)));
      const seaH = h * 0.2 * rise;
      const base = h - seaH;
      if (rise <= 0) return;

      // Gulls.
      g.strokeStyle = "#f8fafc";
      g.lineWidth = 2.5 * dpr;
      g.lineCap = "round";
      for (const gl of gulls) {
        const x = (gl.x + gl.v * t) * w;
        const y = gl.y * h + Math.sin(t + gl.ph) * h * 0.02;
        const flap = Math.sin(t * 8 + gl.ph) * m * 0.012;
        const span = m * 0.025;
        g.beginPath();
        g.moveTo(x - span, y - flap);
        g.quadraticCurveTo(x - span * 0.4, y - span * 0.6, x, y);
        g.quadraticCurveTo(x + span * 0.4, y - span * 0.6, x + span, y - flap);
        g.stroke();
      }

      // Back waves.
      const drawWave = (layer: number, offset: number) => {
        g.fillStyle = SEA[layer]!;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8 * dpr) g.lineTo(x, waveY(layer, x, t, base + offset));
        g.lineTo(w, h);
        g.closePath();
        g.fill();
      };
      drawWave(0, -seaH * 0.15);
      drawWave(1, seaH * 0.1);

      // The ship sails in from the edge and out the far side.
      const sx = (-0.25 + 1.45 * phase(progress, 0.06, 0.94)) * w;
      const sy = waveY(1, sx, t, base + seaH * 0.1);
      const slope = (waveY(1, sx + 10 * dpr, t, base) - waveY(1, sx - 10 * dpr, t, base)) / (20 * dpr);
      drawShip(g, sx, sy, m * 0.3, Math.atan(slope) * 0.8, t, dpr);

      drawWave(2, seaH * 0.38);
      // Foam on the front wave.
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 3 * dpr;
      g.setLineDash([18 * dpr, 14 * dpr]);
      g.lineDashOffset = -t * 40 * dpr;
      g.beginPath();
      for (let x = 0; x <= w; x += 8 * dpr) {
        const y = waveY(2, x, t, base + seaH * 0.38);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);

      // Gold coins splashing up behind the ship.
      coinTimer -= dt;
      if (coinTimer <= 0 && progress < 0.85 && sx > 0 && sx < w) {
        coinTimer = rand(0.15, 0.4) / (0.6 + c.intensity);
        for (let i = 0; i < 3; i++) coins.push({ x: sx - m * 0.08, y: sy, vx: rand(-0.15, 0.05) * w, vy: -rand(0.35, 0.6) * h, spin: rand(0, 6), life: 2 });
        c.audio?.pop();
      }
      for (let i = coins.length - 1; i >= 0; i--) {
        const p = coins[i]!;
        p.vy += h * 0.9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 10;
        p.life -= dt;
        if (p.life <= 0 || p.y > h) {
          coins.splice(i, 1);
          continue;
        }
        const r = m * 0.016;
        g.save();
        g.translate(p.x, p.y);
        g.scale(Math.abs(Math.cos(p.spin)) + 0.15, 1);
        g.fillStyle = "#facc15";
        g.strokeStyle = "#a16207";
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.beginPath();
        g.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2);
        g.fill();
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

/** A cartoon ship facing +x, waterline at (x, y), `size` ≈ overall length. */
function drawShip(g: CanvasRenderingContext2D, x: number, y: number, size: number, tilt: number, t: number, dpr: number) {
  const L = size;
  const outline = "#451a03";
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.lineWidth = 2.5 * dpr;
  g.strokeStyle = outline;
  g.lineJoin = "round";

  // Masts.
  g.fillStyle = "#78350f";
  g.fillRect(-L * 0.12, -L * 0.75, L * 0.025, L * 0.62);
  g.fillRect(L * 0.13, -L * 0.62, L * 0.022, L * 0.5);
  // Sails, billowing.
  const bil = Math.sin(t * 2) * L * 0.015;
  const sail = (mx: number, top: number, bottom: number, width: number) => {
    g.fillStyle = "#fef3c7";
    g.beginPath();
    g.moveTo(mx - width * 0.5, top);
    g.quadraticCurveTo(mx + width * 0.15 + bil, (top + bottom) / 2, mx - width * 0.5, bottom);
    g.lineTo(mx + width * 0.5, bottom);
    g.quadraticCurveTo(mx + width * 0.85 + bil, (top + bottom) / 2, mx + width * 0.5, top);
    g.closePath();
    g.fill();
    g.stroke();
  };
  sail(-L * 0.11, -L * 0.7, -L * 0.42, L * 0.3);
  sail(-L * 0.11, -L * 0.38, -L * 0.17, L * 0.36);
  sail(L * 0.14, -L * 0.57, -L * 0.18, L * 0.28);
  // Emblem on the main sail: a simple gold star (original insignia).
  g.fillStyle = "#f59e0b";
  star(g, -L * 0.07, -L * 0.28, L * 0.05, 5, 0.45);
  g.fill();
  // Flag.
  const wave = Math.sin(t * 6) * L * 0.02;
  g.fillStyle = "#dc2626";
  g.beginPath();
  g.moveTo(-L * 0.11, -L * 0.75);
  g.quadraticCurveTo(-L * 0.02, -L * 0.77 + wave, L * 0.05, -L * 0.72 + wave);
  g.lineTo(-L * 0.11, -L * 0.68);
  g.closePath();
  g.fill();
  g.stroke();
  // Hull.
  g.fillStyle = "#92400e";
  g.beginPath();
  g.moveTo(-L * 0.5, -L * 0.14);
  g.lineTo(L * 0.42, -L * 0.14);
  g.quadraticCurveTo(L * 0.5, -L * 0.13, L * 0.55, -L * 0.2);
  g.quadraticCurveTo(L * 0.4, L * 0.06, L * 0.25, L * 0.06);
  g.lineTo(-L * 0.36, L * 0.06);
  g.quadraticCurveTo(-L * 0.48, L * 0.02, -L * 0.5, -L * 0.14);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = "#fbbf24";
  g.lineWidth = 2 * dpr;
  g.beginPath();
  g.moveTo(-L * 0.48, -L * 0.08);
  g.lineTo(L * 0.46, -L * 0.08);
  g.stroke();
  g.fillStyle = "#1c1917";
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(-L * 0.3 + i * L * 0.17, -L * 0.02, L * 0.018, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
