import { shaderEffect } from "../gl";
import type { EffectFactory } from "../types";

/** Curtains of green and violet light ripple across the top of the screen. Transparent elsewhere. */
const auroraShader = shaderEffect(/* glsl */ `
void main() {
  vec2 uv = edgeUv();
  float aspect = u_res.x / u_res.y;
  float grow = smoothstep(0.0, 0.25, u_progress);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * aspect * 1.1 + fi * 1.9;
    float wave = fbm(vec2(x * 1.2 + u_time * 0.07 * (fi + 1.0), u_time * 0.04 + fi * 3.0));
    float center = 0.55 + 0.2 * wave + fi * 0.06;
    float d = uv.y - center;
    float curtain = d > 0.0 ? exp(-d * (4.0 - fi)) : exp(-d * d * 400.0);
    float rays = 0.35 + 0.65 * fbm(vec2(x * 14.0 + u_time * 0.5, uv.y * 1.5 + fi));
    // Enters from the Send Zone edge and spreads across.
    float reveal = smoothstep(grow * 1.4, grow * 1.4 - 0.35, uv.x);
    vec3 c = mix(vec3(0.16, 0.95, 0.6), vec3(0.62, 0.42, 1.0), clamp(d * 3.5 + 0.2 + fi * 0.25, 0.0, 1.0));
    col += c * curtain * rays * reveal * (0.5 + 0.7 * u_intensity) * (1.0 - fi * 0.2);
  }
  gl_FragColor = light(col);
}
`);

/** Molten light rises from the bottom edge and throws up embers. */
const volcanoShader = shaderEffect(/* glsl */ `
void main() {
  vec2 uv = edgeUv();
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float rise = smoothstep(0.0, 0.35, u_progress) * (1.0 - 0.6 * smoothstep(0.8, 1.0, u_progress));
  // Higher on the Send Zone side, like lava pouring in from the edge.
  float h = (0.06 + 0.26 * rise * (0.6 + 0.6 * u_intensity)) * (1.15 - 0.35 * uv.x);

  float n = fbm(vec2(p.x * 3.0, p.y * 3.0 - u_time * 1.1));
  float lava = smoothstep(h + 0.08, h - 0.1, uv.y + (n - 0.5) * 0.3);
  vec3 hot = mix(vec3(0.75, 0.08, 0.02), vec3(1.0, 0.55, 0.08), n);
  hot = mix(hot, vec3(1.0, 0.93, 0.6), smoothstep(0.62, 0.92, n) * lava);
  float glow = exp(-max(uv.y - h, 0.0) * 6.0) * 0.45 * rise;
  vec3 col = hot * lava + vec3(0.9, 0.25, 0.03) * glow * (1.0 - lava);
  float alpha = max(lava, glow * 0.8);

  vec3 embers = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 12.0 + fi * 9.0;
    vec2 q = p * scale;
    q.y -= u_time * (2.0 + fi) * (1.0 + u_intensity);
    q.x += sin(q.y * 0.35 + fi * 2.0) * 0.5;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float rnd = hash(cell + fi * 7.13);
    float ember = step(0.9 - 0.06 * u_intensity, rnd) * smoothstep(0.16, 0.0, length(f + vec2(rnd - 0.5, 0.0) * 0.5));
    embers += ember * vec3(1.0, 0.5, 0.12) * smoothstep(0.9, 0.1, uv.y) * rise * 1.6;
  }
  vec4 e = light(embers);
  gl_FragColor = vec4(col * alpha + e.rgb * (1.0 - alpha), alpha + e.a * (1.0 - alpha));
}
`);

/** A black hole near the Send Zone edge: dark shadow, photon ring, Doppler-bright disk, infalling stars. */
const eventHorizonShader = shaderEffect(/* glsl */ `
void main() {
  vec2 uv = edgeUv();
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv - vec2(0.3, 0.5)) * vec2(aspect, 1.0);
  float open = smoothstep(0.0, 0.25, u_progress) * (1.0 - smoothstep(0.85, 1.0, u_progress));
  float rh = max(0.001, 0.11 * open * (0.8 + 0.4 * u_intensity));
  float r = length(p);

  // Accretion disk, seen nearly edge-on.
  vec2 q = vec2(p.x, p.y * 3.2);
  float rd = length(q);
  float ang = atan(q.y, q.x);
  float spin = ang - u_time * 1.6 - 1.4 / (rd + 0.05);
  float turb = fbm(vec2(cos(spin), sin(spin)) * 2.0 + vec2(rd * 9.0, 0.0));
  float diskMask = smoothstep(rh * 1.15, rh * 1.5, rd) * smoothstep(rh * 4.8, rh * 2.0, rd);
  float doppler = 0.55 + 0.45 * cos(ang + 0.3);
  vec3 disk = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.92, 0.75), turb) * diskMask * doppler * (0.5 + 1.1 * turb);

  // The far side of the disk, bent up over the top by lensing.
  float arc = smoothstep(rh * 1.05, rh * 1.25, r) * smoothstep(rh * 2.1, rh * 1.4, r) * smoothstep(-0.1, 0.7, p.y / (r + 1e-4));
  vec3 lensed = vec3(1.0, 0.6, 0.25) * arc * (0.45 + 0.6 * turb);

  float photon = exp(-pow((r - rh * 1.08) / (0.004 + 0.006 * u_intensity), 2.0));
  vec3 ring = vec3(1.0, 0.85, 0.6) * photon * 1.2;

  // Stars spiralling in.
  float sa = atan(p.y, p.x);
  vec2 suv = vec2(sa / 6.28318 * 40.0, (log(r + 0.001) + u_time * (0.25 + 0.3 * u_intensity)) * 7.0);
  vec2 cell = floor(suv);
  vec2 f = fract(suv) - 0.5;
  float s = hash(cell);
  float starPt = step(0.93, s) * smoothstep(0.14, 0.0, length(f)) * smoothstep(rh * 6.0, rh * 1.6, r) * open;
  vec3 stars = vec3(0.8, 0.85, 1.0) * starPt;

  float shadow = 1.0 - smoothstep(rh * 0.97, rh * 1.02, r);
  float front = step(q.y, 0.0); // near half of the disk passes in front of the shadow
  vec3 behind = lensed + ring + stars + disk * (1.0 - front);
  vec4 outer = light(behind + vec3(0.25, 0.1, 0.35) * exp(-r / (rh * 2.5 + 1e-4)) * 0.35 * open);
  // Composite: [outer light] -> [black shadow] -> [front disk]
  vec4 base = vec4(outer.rgb * (1.0 - shadow), max(outer.a, shadow * open));
  vec4 fd = light(disk * front);
  gl_FragColor = vec4(fd.rgb + base.rgb * (1.0 - fd.a), fd.a + base.a * (1.0 - fd.a));
}
`);

export const aurora: EffectFactory = auroraShader;

export const volcano: EffectFactory = (ctx) => {
  const inner = volcanoShader(ctx);
  ctx.audio?.rumble(ctx.duration / 1000);
  return inner;
};

export const eventHorizon: EffectFactory = (ctx) => {
  const inner = eventHorizonShader(ctx);
  ctx.audio?.rumble(ctx.duration / 1000);
  ctx.audio?.whoosh(Math.min(4, ctx.duration / 1000));
  return inner;
};
