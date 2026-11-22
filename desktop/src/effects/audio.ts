/**
 * Synthesised sound effects (Web Audio). Nothing is downloaded or bundled, and nothing plays
 * unless the sender asked for sound and the effect supports it.
 */
export interface EffectAudio {
  whoosh(seconds: number): void;
  thunder(): void;
  pop(): void;
  chime(): void;
  rumble(seconds: number): void;
  /** A bright metallic "shing" (sword slash). */
  shing(): void;
  /** A soft footstep. */
  step(): void;
  /** A springy "boing" (pitch wobbles up and down). `size` 0..1 makes it bigger and lower. */
  boing(size?: number): void;
  /** A cartoon punch: thump plus a bright burst. */
  pow(): void;
  /** A rope or zip-line "zzzip" (rising sweep). */
  zip(): void;
  /** One soft snore. */
  snore(): void;
  /** Short electric crackle. */
  crackle(): void;
  dispose(): void;
}

export function createAudio(enabled: boolean, intensity: number): EffectAudio | null {
  if (!enabled || typeof AudioContext === "undefined") return null;
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  void ctx.resume().catch(() => {});
  const master = ctx.createGain();
  master.gain.value = 0.18 + 0.32 * intensity;
  master.connect(ctx.destination);

  const noise = (seconds: number) => {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  };

  const envelope = (gain: GainNode, attack: number, hold: number, release: number, peak = 1) => {
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  };

  return {
    whoosh(seconds) {
      const src = noise(seconds);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 1.2;
      const t = ctx.currentTime;
      filter.frequency.setValueAtTime(180, t);
      filter.frequency.exponentialRampToValueAtTime(1400, t + seconds * 0.4);
      filter.frequency.exponentialRampToValueAtTime(160, t + seconds);
      const gain = ctx.createGain();
      envelope(gain, seconds * 0.25, seconds * 0.45, seconds * 0.3, 0.9);
      src.connect(filter).connect(gain).connect(master);
      src.start();

      const hum = ctx.createOscillator();
      hum.type = "sine";
      hum.frequency.setValueAtTime(48, t);
      hum.frequency.linearRampToValueAtTime(72, t + seconds);
      const humGain = ctx.createGain();
      envelope(humGain, seconds * 0.3, seconds * 0.4, seconds * 0.3, 0.5);
      hum.connect(humGain).connect(master);
      hum.start();
      hum.stop(t + seconds);
    },
    thunder() {
      const src = noise(3);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 380;
      const gain = ctx.createGain();
      envelope(gain, 0.03, 0.15, 2.4, 1);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    pop() {
      const src = noise(0.4);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900 + Math.random() * 900;
      const gain = ctx.createGain();
      envelope(gain, 0.005, 0.02, 0.35, 0.8);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    chime() {
      const notes = [1046.5, 1318.5, 1568, 2093];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.07;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
        osc.connect(gain).connect(master);
        osc.start(start);
        osc.stop(start + 0.65);
      });
    },
    rumble(seconds) {
      const src = noise(seconds);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 110;
      const gain = ctx.createGain();
      envelope(gain, seconds * 0.3, seconds * 0.4, seconds * 0.3, 1.4);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    shing() {
      const t = ctx.currentTime;
      const src = noise(0.5);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 2;
      filter.frequency.setValueAtTime(2400, t);
      filter.frequency.exponentialRampToValueAtTime(6000, t + 0.18);
      const gain = ctx.createGain();
      envelope(gain, 0.01, 0.04, 0.35, 0.7);
      src.connect(filter).connect(gain).connect(master);
      src.start();
      for (const [freq, peak] of [[2637, 0.18], [3951, 0.1]] as const) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const ring = ctx.createGain();
        ring.gain.setValueAtTime(0.0001, t);
        ring.gain.exponentialRampToValueAtTime(peak, t + 0.02);
        ring.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        osc.connect(ring).connect(master);
        osc.start(t);
        osc.stop(t + 0.75);
      }
    },
    step() {
      const src = noise(0.08);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      envelope(gain, 0.004, 0.01, 0.06, 0.35);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    boing(size = 0.5) {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const base = 220 - 110 * size;
      osc.frequency.setValueAtTime(base, t);
      // A decaying wobble around a rising pitch.
      for (let i = 1; i <= 12; i++) {
        const k = i / 12;
        osc.frequency.linearRampToValueAtTime(base * (1.6 + 0.9 * k) * (1 + 0.35 * (1 - k) * (i % 2 ? 1 : -1)), t + k * (0.35 + 0.2 * size));
      }
      const gain = ctx.createGain();
      envelope(gain, 0.005, 0.05, 0.35 + 0.2 * size, 0.55);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.7 + 0.2 * size);
    },
    pow() {
      const t = ctx.currentTime;
      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(140, t);
      thump.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      const thumpGain = ctx.createGain();
      envelope(thumpGain, 0.004, 0.03, 0.3, 1.2);
      thump.connect(thumpGain).connect(master);
      thump.start(t);
      thump.stop(t + 0.4);
      const src = noise(0.35);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1600;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      envelope(gain, 0.003, 0.02, 0.22, 0.8);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    zip() {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(1500, t + 0.32);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      const gain = ctx.createGain();
      envelope(gain, 0.02, 0.15, 0.18, 0.18);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.4);
    },
    snore() {
      const src = noise(1.1);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const t = ctx.currentTime;
      filter.frequency.setValueAtTime(180, t);
      filter.frequency.linearRampToValueAtTime(420, t + 0.6);
      filter.frequency.linearRampToValueAtTime(160, t + 1.05);
      const gain = ctx.createGain();
      envelope(gain, 0.45, 0.2, 0.4, 0.45);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    crackle() {
      const t = ctx.currentTime;
      for (let i = 0; i < 7; i++) {
        const src = noise(0.03);
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 2500 + Math.random() * 3000;
        const gain = ctx.createGain();
        const start = t + Math.random() * 0.25;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.35, start + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
        src.connect(filter).connect(gain).connect(master);
        src.start(start);
      }
    },
    dispose() {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.3);
      setTimeout(() => void ctx.close().catch(() => {}), 400);
    },
  };
}
