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
  vec2 uv = (frag - 0.5 * uSize) / min(uSize.x, uSize.y);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float open = smoothstep(0.0, 0.22, uProgress) * (1.0 - smoothstep(0.82, 1.0, uProgress));
  float radius = 0.30 * open * (0.75 + 0.45 * uIntensity);

  float swirl = a + 2.2 / (r + 0.12) - uTime * (1.4 + 1.2 * uIntensity);
  float arms = 0.5 + 0.5 * sin(swirl * 4.0);
  float n = fbm(vec2(cos(swirl), sin(swirl)) * 1.6 + vec2(r * 4.0, -uTime * 0.6));

  float ringWidth = 0.006 + 0.012 * uIntensity;
  float ring = exp(-pow((r - radius) / ringWidth, 2.0)) * 0.9 + exp(-pow((r - radius) / 0.07, 2.0)) * 0.3;
  vec3 col = mix(vec3(0.49, 0.36, 1.0), vec3(0.13, 0.83, 0.93), arms * n);
  col = mix(col, vec3(0.95, 0.35, 0.85), smoothstep(0.6, 0.9, n) * 0.5);

  float disk = smoothstep(radius * 3.0, radius * 0.7, r) * open;
  vec3 c = col * arms * n * 1.6 * disk;
  c += ring * vec3(0.875, 0.825, 1.0) * 1.3 * open;
  c *= smoothstep(radius * 0.35, radius * 0.9, r) + 0.02;

  vec2 suv = vec2(a / 6.28318 * 48.0, (log(r + 0.001) * 3.0 + uTime * (0.8 + uIntensity)) * 6.0);
  vec2 cell = floor(suv);
  vec2 f = fract(suv) - 0.5;
  float s = hash(cell);
  float star = step(0.9, s) * smoothstep(0.14, 0.0, length(f)) * (0.6 + 0.4 * sin(uTime * 5.0 + s * 40.0));
  c += star * vec3(0.85, 0.9, 1.0) * smoothstep(radius * 0.9, radius * 1.6, r) * (0.4 + 0.6 * open);
  c += vec3(0.03, 0.01, 0.07) * (1.0 - r);
  fragColor = vec4(c, 1.0);
}
