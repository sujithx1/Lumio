#version 460 core
#include <flutter/runtime_effect.glsl>
precision highp float;

uniform vec2 uSize;
uniform float uTime;
uniform float uIntensity;
uniform float uProgress;
out vec4 fragColor;

#include "common.glsl"

vec4 light(vec3 c) {
  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
  return vec4(min(c, vec3(a)), a);
}

void main() {
  vec2 frag = FlutterFragCoord().xy;
  vec2 uv = vec2(frag.x / uSize.x, 1.0 - frag.y / uSize.y);
  float aspect = uSize.x / uSize.y;
  float grow = smoothstep(0.0, 0.25, uProgress);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * aspect * 1.1 + fi * 1.9;
    float wave = fbm(vec2(x * 1.2 + uTime * 0.07 * (fi + 1.0), uTime * 0.04 + fi * 3.0));
    float center = 0.55 + 0.2 * wave + fi * 0.06;
    float d = uv.y - center;
    float curtain = d > 0.0 ? exp(-d * (4.0 - fi)) : exp(-d * d * 400.0);
    float rays = 0.35 + 0.65 * fbm(vec2(x * 14.0 + uTime * 0.5, uv.y * 1.5 + fi));
    float reveal = smoothstep(grow * 1.4, grow * 1.4 - 0.35, uv.x);
    vec3 c = mix(vec3(0.16, 0.95, 0.6), vec3(0.62, 0.42, 1.0), clamp(d * 3.5 + 0.2 + fi * 0.25, 0.0, 1.0));
    col += c * curtain * rays * reveal * (0.5 + 0.7 * uIntensity) * (1.0 - fi * 0.2);
  }
  fragColor = light(col);
}
