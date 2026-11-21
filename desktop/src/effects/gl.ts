import type { EffectFactory } from "./types";

/**
 * GLSL helpers shared by the shader effects. Shaders output PREMULTIPLIED colour: for light,
 * use alpha = brightness so the effect glows over whatever is underneath the transparent window.
 * `u_mirror` is 1.0 when the effect should enter from the right edge instead of the left.
 */
export const GLSL_COMMON = /* glsl */ `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
uniform float u_progress;
uniform float u_mirror;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

/** Screen uv in [0,1], y up, flipped horizontally for the right-edge Send Zone. */
vec2 edgeUv() {
  vec2 uv = gl_FragCoord.xy / u_res;
  if (u_mirror > 0.5) uv.x = 1.0 - uv.x;
  return uv;
}

vec4 light(vec3 c) {
  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
  return vec4(min(c, vec3(a)), a);
}
`;

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

/** Builds a full-screen fragment-shader effect. The shader body receives GLSL_COMMON. */
export function shaderEffect(fragmentBody: string): EffectFactory {
  return ({ canvas, width, height, intensity, mirror }) => {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL is not available");

    const program = gl.createProgram()!;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, GLSL_COMMON + fragmentBody);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program);

    // One triangle that covers the screen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      progress: gl.getUniformLocation(program, "u_progress"),
      mirror: gl.getUniformLocation(program, "u_mirror"),
    };
    let w = width;
    let h = height;

    return {
      frame(t, _dt, progress) {
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(u.res, w, h);
        gl.uniform1f(u.time, t);
        gl.uniform1f(u.intensity, intensity);
        gl.uniform1f(u.progress, progress);
        gl.uniform1f(u.mirror, mirror ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      resize(nw, nh) {
        w = nw;
        h = nh;
      },
      dispose() {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      },
    };
  };
}
