// ─── Kollektiv Image Editor — Adjustment Preview (WebGL2) ───────────────────
// Renders a source ImageBitmap through a GLSL shader for live slider preview.
// transferToImageBitmap() produces a GPU-decoded ImageBitmap synchronously.

import type { AdjustmentDef } from '../types';

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;   // flip Y to match ImageBitmap orientation
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform int  u_mode;       // 1=levels, 2=curves_approx, 3=hue_sat, 4=exposure
// Levels / Curves approx
uniform float u_inBlack, u_inWhite, u_gamma, u_outBlack, u_outWhite;
uniform int   u_channel;   // 0=RGB 1=R 2=G 3=B
// Hue-Sat
uniform float u_hue, u_sat, u_lit;
uniform bool  u_colorize;
// Exposure
uniform float u_exposure, u_offset, u_gammaCorr;

in vec2 v_uv;
out vec4 outColor;

// ── helpers ──
vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if      (mx == c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) / 6.0;
  else if (mx == c.g) h = ((c.b - c.r) / d + 2.0) / 6.0;
  else                h = ((c.r - c.g) / d + 4.0) / 6.0;
  return vec3(h, s, l);
}
float h2r(float p, float q, float t) {
  if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q-p)*6.0*t;
  if (t < 0.5)     return q;
  if (t < 2.0/3.0) return p + (q-p)*(2.0/3.0 - t)*6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z*(1.0+hsl.y) : hsl.z+hsl.y - hsl.z*hsl.y;
  float p = 2.0*hsl.z - q;
  return vec3(h2r(p,q,hsl.x+1.0/3.0), h2r(p,q,hsl.x), h2r(p,q,hsl.x-1.0/3.0));
}
float lvl(float v) {
  float range = max(0.001, (u_inWhite - u_inBlack) / 255.0);
  float n = clamp((v - u_inBlack/255.0) / range, 0.0, 1.0);
  float c = pow(n, 1.0 / max(0.01, u_gamma));
  return clamp(c * (u_outWhite - u_outBlack)/255.0 + u_outBlack/255.0, 0.0, 1.0);
}

void main() {
  vec4 col = texture(u_image, v_uv);

  if (u_mode == 1) {                       // Levels
    if      (u_channel == 0) { col.r = lvl(col.r); col.g = lvl(col.g); col.b = lvl(col.b); }
    else if (u_channel == 1)   col.r = lvl(col.r);
    else if (u_channel == 2)   col.g = lvl(col.g);
    else                       col.b = lvl(col.b);

  } else if (u_mode == 2) {                // Curves — approximate as Levels for preview
    if      (u_channel == 0) { col.r = lvl(col.r); col.g = lvl(col.g); col.b = lvl(col.b); }
    else if (u_channel == 1)   col.r = lvl(col.r);
    else if (u_channel == 2)   col.g = lvl(col.g);
    else                       col.b = lvl(col.b);

  } else if (u_mode == 3) {                // Hue-Sat
    vec3 hsl = rgb2hsl(col.rgb);
    if (u_colorize) {
      hsl.x = mod(u_hue + 180.0, 360.0) / 360.0;
      hsl.y = clamp(0.5 + u_sat / 200.0, 0.0, 1.0);
    } else {
      hsl.x = mod(hsl.x * 360.0 + u_hue, 360.0) / 360.0;
      if (hsl.x < 0.0) hsl.x += 1.0;
      hsl.y = clamp(hsl.y * (1.0 + u_sat / 100.0), 0.0, 1.0);
      hsl.z = clamp(hsl.z + u_lit / 100.0, 0.0, 1.0);
    }
    col.rgb = hsl2rgb(hsl);

  } else if (u_mode == 4) {                // Exposure
    float ex = pow(2.0, u_exposure);
    float gc = 1.0 / max(0.01, u_gammaCorr);
    col.r = pow(clamp(col.r * ex + u_offset, 0.0, 1.0), gc);
    col.g = pow(clamp(col.g * ex + u_offset, 0.0, 1.0), gc);
    col.b = pow(clamp(col.b * ex + u_offset, 0.0, 1.0), gc);
  }

  outColor = col;
}`;

// ─── AdjustmentPreview class ──────────────────────────────────────────────────

export class AdjustmentPreview {
  private readonly _canvas: OffscreenCanvas;
  private readonly _gl: WebGL2RenderingContext;
  private readonly _program: WebGLProgram;
  private readonly _tex: WebGLTexture;

  constructor(width: number, height: number) {
    this._canvas = new OffscreenCanvas(width, height);
    const gl = this._canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not available');
    this._gl = gl;
    this._program = this._buildProgram();
    this._tex = this._initQuadAndTex();
  }

  get width(): number { return this._canvas.width; }
  get height(): number { return this._canvas.height; }

  needsResize(w: number, h: number): boolean {
    return w !== this._canvas.width || h !== this._canvas.height;
  }

  /** Applies adjustment via GPU shader and returns a GPU-decoded ImageBitmap (synchronous). */
  render(source: ImageBitmap, adjustment: AdjustmentDef): ImageBitmap {
    const { _gl: gl, _program: prog, _tex: tex } = this;
    gl.viewport(0, 0, this._canvas.width, this._canvas.height);

    // Upload source bitmap as texture
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0);
    this._setUniforms(adjustment);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return this._canvas.transferToImageBitmap();
  }

  dispose(): void {
    const { _gl: gl } = this;
    gl.deleteTexture(this._tex);
    gl.deleteProgram(this._program);
  }

  // ─── private ───────────────────────────────────────────────────────────────

  private _buildProgram(): WebGLProgram {
    const gl = this._gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('Shader compile: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('Program link: ' + gl.getProgramInfoLog(prog));
    return prog;
  }

  private _initQuadAndTex(): WebGLTexture {
    const gl = this._gl;
    // Full-screen quad
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this._program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // Texture
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private _setUniforms(adj: AdjustmentDef): void {
    const { _gl: gl, _program: prog } = this;
    const u = (name: string) => gl.getUniformLocation(prog, name);

    switch (adj.kind) {
      case 'levels': {
        const ch = adj.channel === 'rgb' ? 0 : adj.channel === 'r' ? 1 : adj.channel === 'g' ? 2 : 3;
        gl.uniform1i(u('u_mode'), 1);
        gl.uniform1f(u('u_inBlack'),  adj.inBlack);
        gl.uniform1f(u('u_inWhite'),  adj.inWhite);
        gl.uniform1f(u('u_gamma'),    adj.gamma);
        gl.uniform1f(u('u_outBlack'), adj.outBlack);
        gl.uniform1f(u('u_outWhite'), adj.outWhite);
        gl.uniform1i(u('u_channel'),  ch);
        break;
      }
      case 'curves': {
        // Approximate: treat first/last point as inBlack/inWhite for preview
        const sorted = [...adj.points].sort((a, b) => a.x - b.x);
        const ch = adj.channel === 'rgb' ? 0 : adj.channel === 'r' ? 1 : adj.channel === 'g' ? 2 : 3;
        gl.uniform1i(u('u_mode'), 2);
        gl.uniform1f(u('u_inBlack'),  sorted[0]?.x ?? 0);
        gl.uniform1f(u('u_inWhite'),  sorted[sorted.length - 1]?.x ?? 255);
        gl.uniform1f(u('u_gamma'),    1.0);
        gl.uniform1f(u('u_outBlack'), sorted[0]?.y ?? 0);
        gl.uniform1f(u('u_outWhite'), sorted[sorted.length - 1]?.y ?? 255);
        gl.uniform1i(u('u_channel'),  ch);
        break;
      }
      case 'hue-saturation':
        gl.uniform1i(u('u_mode'),     3);
        gl.uniform1f(u('u_hue'),      adj.hue);
        gl.uniform1f(u('u_sat'),      adj.saturation);
        gl.uniform1f(u('u_lit'),      adj.lightness);
        gl.uniform1i(u('u_colorize'), adj.colorize ? 1 : 0);
        break;
      case 'exposure':
        gl.uniform1i(u('u_mode'),      4);
        gl.uniform1f(u('u_exposure'),  adj.exposure);
        gl.uniform1f(u('u_offset'),    adj.offset);
        gl.uniform1f(u('u_gammaCorr'), adj.gammaCorrection);
        break;
    }
  }
}
