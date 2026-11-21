#version 460 core
#include <flutter/runtime_effect.glsl>
precision highp float;

uniform vec2 uSize;
uniform float uTime;
uniform float uIntensity;
uniform float uProgress;
out vec4 fragColor;

#include "common.glsl"

void main() {
  vec2 frag = FlutterFragCoord().xy;
  vec2 uv = vec2(frag.x / uSize.x, 1.0 - frag.y / uSize.y);
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float rise = smoothstep(0.0, 0.35, uProgress) * (1.0 - 0.5 * smoothstep(0.8, 1.0, uProgress));
  float h = 0.1 + 0.3 * rise * (0.6 + 0.6 * uIntensity);

  float n = fbm(vec2(p.x * 3.0, p.y * 3.0 - uTime * 1.1));
  float lava = smoothstep(h + 0.1, h - 0.14, uv.y + (n - 0.5) * 0.35);
  vec3 hot = mix(vec3(0.75, 0.08, 0.02), vec3(1.0, 0.55, 0.08), n);
  hot = mix(hot, vec3(1.0, 0.93, 0.6), smoothstep(0.62, 0.92, n) * lava);
  vec3 col = mix(vec3(0.025, 0.008, 0.008), hot, lava);
  col += vec3(0.65, 0.15, 0.02) * exp(-max(uv.y - h, 0.0) * 4.0) * 0.4 * rise;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 12.0 + fi * 9.0;
    vec2 q = p * scale;
    q.y -= uTime * (2.0 + fi) * (1.0 + uIntensity);
    q.x += sin(q.y * 0.35 + fi * 2.0) * 0.5;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float rnd = hash(cell + fi * 7.13);
    float ember = step(0.9 - 0.06 * uIntensity, rnd) * smoothstep(0.16, 0.0, length(f + vec2(rnd - 0.5, 0.0) * 0.5));
    col += ember * vec3(1.0, 0.5, 0.12) * smoothstep(1.0, 0.15, uv.y) * rise * 1.6;
  }
  fragColor = vec4(col, 1.0);
}
