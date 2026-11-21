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
  vec3 sky = mix(vec3(0.005, 0.01, 0.03), vec3(0.02, 0.035, 0.09), uv.y);
  vec2 sp = uv * vec2(aspect, 1.0) * 140.0;
  float st = hash(floor(sp));
  sky += step(0.996, st) * (0.5 + 0.5 * sin(uTime * 2.0 + st * 60.0)) * 0.9;

  vec3 col = sky;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * aspect * 1.1 + fi * 1.9;
    float wave = fbm(vec2(x * 1.2 + uTime * 0.07 * (fi + 1.0), uTime * 0.04 + fi * 3.0));
    float center = 0.42 + 0.22 * wave + fi * 0.07;
    float d = uv.y - center;
    float curtain = d > 0.0 ? exp(-d * (5.0 - fi)) : exp(-d * d * 500.0);
    float rays = 0.35 + 0.65 * fbm(vec2(x * 14.0 + uTime * 0.5, uv.y * 1.5 + fi));
    vec3 c = mix(vec3(0.16, 0.95, 0.6), vec3(0.62, 0.42, 1.0), clamp(d * 3.5 + 0.2 + fi * 0.25, 0.0, 1.0));
    col += c * curtain * rays * (0.45 + 0.75 * uIntensity) * (1.0 - fi * 0.2);
  }
  float ground = 0.08 + 0.025 * fbm(vec2(uv.x * aspect * 4.0, 1.0));
  col = mix(col, vec3(0.0), smoothstep(ground + 0.004, ground, uv.y));
  fragColor = vec4(col, 1.0);
}
