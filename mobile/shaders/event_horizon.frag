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

// Mirrors desktop/src/effects/renderers/shaders.ts (eventHorizonShader). Centred on phones.
void main() {
  vec2 frag = FlutterFragCoord().xy;
  vec2 uv = vec2(frag.x / uSize.x, 1.0 - frag.y / uSize.y);
  float aspect = uSize.x / uSize.y;
  vec2 p = (uv - vec2(0.5, 0.55)) * vec2(aspect, 1.0);
  float open = smoothstep(0.0, 0.25, uProgress) * (1.0 - smoothstep(0.85, 1.0, uProgress));
  float rh = max(0.001, 0.13 * open * (0.8 + 0.4 * uIntensity));
  float r = length(p);

  vec2 q = vec2(p.x, p.y * 3.2);
  float rd = length(q);
  float ang = atan(q.y, q.x);
  float spin = ang - uTime * 1.6 - 1.4 / (rd + 0.05);
  float turb = fbm(vec2(cos(spin), sin(spin)) * 2.0 + vec2(rd * 9.0, 0.0));
  float diskMask = smoothstep(rh * 1.15, rh * 1.5, rd) * smoothstep(rh * 4.8, rh * 2.0, rd);
  float doppler = 0.55 + 0.45 * cos(ang + 0.3);
  vec3 disk = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.92, 0.75), turb) * diskMask * doppler * (0.5 + 1.1 * turb);

  float arc = smoothstep(rh * 1.05, rh * 1.25, r) * smoothstep(rh * 2.1, rh * 1.4, r) * smoothstep(-0.1, 0.7, p.y / (r + 1e-4));
  vec3 lensed = vec3(1.0, 0.6, 0.25) * arc * (0.45 + 0.6 * turb);
  float photon = exp(-pow((r - rh * 1.08) / (0.004 + 0.006 * uIntensity), 2.0));
  vec3 ring = vec3(1.0, 0.85, 0.6) * photon * 1.2;

  float sa = atan(p.y, p.x);
  vec2 suv = vec2(sa / 6.28318 * 40.0, (log(r + 0.001) + uTime * (0.25 + 0.3 * uIntensity)) * 7.0);
  vec2 cell = floor(suv);
  vec2 f = fract(suv) - 0.5;
  float s = hash(cell);
  float starPt = step(0.93, s) * smoothstep(0.14, 0.0, length(f)) * smoothstep(rh * 6.0, rh * 1.6, r) * open;
  vec3 stars = vec3(0.8, 0.85, 1.0) * starPt;

  float shadow = 1.0 - smoothstep(rh * 0.97, rh * 1.02, r);
  float front = step(q.y, 0.0);
  vec3 behind = lensed + ring + stars + disk * (1.0 - front);
  vec4 outer = light(behind + vec3(0.25, 0.1, 0.35) * exp(-r / (rh * 2.5 + 1e-4)) * 0.35 * open);
  vec4 base = vec4(outer.rgb * (1.0 - shadow), max(outer.a, shadow * open));
  vec4 fd = light(disk * front);
  fragColor = vec4(fd.rgb + base.rgb * (1.0 - fd.a), fd.a + base.a * (1.0 - fd.a));
}
