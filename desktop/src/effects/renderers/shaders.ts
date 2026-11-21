import { shaderEffect } from "../gl";
import type { EffectFactory } from "../types";

/** A wormhole opens, spirals and closes; stars stream into it. */
const cosmicPortalShader = shaderEffect(/* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float open = smoothstep(0.0, 0.22, u_progress) * (1.0 - smoothstep(0.82, 1.0, u_progress));
  float radius = 0.30 * open * (0.75 + 0.45 * u_intensity);

  float swirl = a + 2.2 / (r + 0.12) - u_time * (1.4 + 1.2 * u_intensity);
  float arms = 0.5 + 0.5 * sin(swirl * 4.0);
  // Sample noise on the unit circle so it is periodic in angle (no seam where atan wraps).
  float n = fbm(vec2(cos(swirl), sin(swirl)) * 1.6 + vec2(r * 4.0, -u_time * 0.6));

  float ringWidth = 0.006 + 0.012 * u_intensity;
  float ring = exp(-pow((r - radius) / ringWidth, 2.0)) * 0.9 + exp(-pow((r - radius) / 0.07, 2.0)) * 0.3;
  vec3 violet = vec3(0.49, 0.36, 1.0);
  vec3 cyan = vec3(0.13, 0.83, 0.93);
  vec3 magenta = vec3(0.95, 0.35, 0.85);
  vec3 col = mix(violet, cyan, arms * n);
  col = mix(col, magenta, smoothstep(0.6, 0.9, n) * 0.5);

  float disk = smoothstep(radius * 3.0, radius * 0.7, r) * open;
  vec3 c = col * arms * n * 1.6 * disk;
  c += ring * mix(vec3(0.75, 0.65, 1.0), vec3(1.0), 0.5) * 1.3 * open;
  c *= smoothstep(radius * 0.35, radius * 0.9, r) + 0.02;

  // Stars in log-polar space flow toward the centre.
  // A whole number of angular cells keeps the star field seamless.
  vec2 suv = vec2(a / 6.28318 * 48.0, (log(r + 0.001) * 3.0 + u_time * (0.8 + u_intensity)) * 6.0);
  vec2 cell = floor(suv);
  vec2 f = fract(suv) - 0.5;
  float s = hash(cell);
  float star = step(0.9, s) * smoothstep(0.14, 0.0, length(f)) * (0.6 + 0.4 * sin(u_time * 5.0 + s * 40.0));
  c += star * vec3(0.85, 0.9, 1.0) * smoothstep(radius * 0.9, radius * 1.6, r) * (0.4 + 0.6 * open);

  c += vec3(0.03, 0.01, 0.07) * (1.0 - r);
  gl_FragColor = vec4(c, 1.0);
}
`);

/** Curtains of green and violet light ripple across a starry sky. */
const auroraShader = shaderEffect(/* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec3 sky = mix(vec3(0.005, 0.01, 0.03), vec3(0.02, 0.035, 0.09), uv.y);
  vec2 sp = uv * vec2(aspect, 1.0) * 140.0;
  float st = hash(floor(sp));
  sky += step(0.996, st) * (0.5 + 0.5 * sin(u_time * 2.0 + st * 60.0)) * 0.9;

  vec3 col = sky;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * aspect * 1.1 + fi * 1.9;
    float wave = fbm(vec2(x * 1.2 + u_time * 0.07 * (fi + 1.0), u_time * 0.04 + fi * 3.0));
    float center = 0.42 + 0.22 * wave + fi * 0.07;
    float d = uv.y - center;
    // Sharp lower edge, long soft upper fade, like real curtains.
    float curtain = d > 0.0 ? exp(-d * (5.0 - fi)) : exp(-d * d * 500.0);
    float rays = 0.35 + 0.65 * fbm(vec2(x * 14.0 + u_time * 0.5, uv.y * 1.5 + fi));
    vec3 c = mix(vec3(0.16, 0.95, 0.6), vec3(0.62, 0.42, 1.0), clamp(d * 3.5 + 0.2 + fi * 0.25, 0.0, 1.0));
    col += c * curtain * rays * (0.45 + 0.75 * u_intensity) * (1.0 - fi * 0.2);
  }
  // Ground silhouette.
  float ground = 0.08 + 0.025 * fbm(vec2(uv.x * aspect * 4.0, 1.0));
  col = mix(col, vec3(0.0), smoothstep(ground + 0.004, ground, uv.y));
  gl_FragColor = vec4(col, 1.0);
}
`);

/** Molten light rises from the bottom edge and throws up embers. */
const volcanoShader = shaderEffect(/* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float rise = smoothstep(0.0, 0.35, u_progress) * (1.0 - 0.5 * smoothstep(0.8, 1.0, u_progress));
  float h = 0.1 + 0.3 * rise * (0.6 + 0.6 * u_intensity);

  float n = fbm(vec2(p.x * 3.0, p.y * 3.0 - u_time * 1.1));
  float lava = smoothstep(h + 0.1, h - 0.14, uv.y + (n - 0.5) * 0.35);
  vec3 dark = vec3(0.025, 0.008, 0.008);
  vec3 hot = mix(vec3(0.75, 0.08, 0.02), vec3(1.0, 0.55, 0.08), n);
  hot = mix(hot, vec3(1.0, 0.93, 0.6), smoothstep(0.62, 0.92, n) * lava);
  vec3 col = mix(dark, hot, lava);
  col += vec3(0.65, 0.15, 0.02) * exp(-max(uv.y - h, 0.0) * 4.0) * 0.4 * rise;

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
    col += ember * vec3(1.0, 0.5, 0.12) * smoothstep(1.0, 0.15, uv.y) * rise * 1.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`);

export const cosmicPortal: EffectFactory = (ctx) => {
  const inner = cosmicPortalShader(ctx);
  ctx.audio?.whoosh(ctx.duration / 1000);
  return inner;
};

export const aurora: EffectFactory = auroraShader;

export const volcano: EffectFactory = (ctx) => {
  const inner = volcanoShader(ctx);
  ctx.audio?.rumble(ctx.duration / 1000);
  return inner;
};
