// ─── Kollektiv Image Editor — LookRenderer ───────────────────────────────────
// Applies a Look recipe to "everything below" in ONE fused WebGL2 pass
// (plan §3.3): develop → LUT → curve → split tone → fade → vignette → grain,
// then mixed with the original by the look's strength (layer opacity).
// All math is float in one fragment shader and quantized once on output, so
// chaining components can't band. Exposure, white balance and grain work in
// linear light. Grain and vignette use DOCUMENT coordinates (the caller
// passes the canvas→document matrix), so a zoomed-out preview and a full-size
// export show the same grain size and vignette shape.
//
// One context per renderer (the LayerPainter owns one, like BlendCompositor).

import { buildCurvesLUT } from '../adjust/kernels';
import { getLut, lutRegistryVersion } from './lutRegistry';
import type { LookComponent, LookRecipe } from './recipe';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp sampler3D;
out vec4 o;
uniform sampler2D u_src; uniform sampler3D u_lut; uniform sampler2D u_curve;
uniform vec2 u_size;          // canvas px
uniform mat3 u_toDoc;         // canvas px (y down) → document px
uniform vec2 u_docSize;
uniform float u_strength;
// develop
uniform bool u_dev; uniform float u_exposure, u_contrast, u_temp, u_tint, u_sat;
// lut
uniform bool u_useLut; uniform float u_lutN, u_lutStrength; uniform vec3 u_domMin, u_domMax;
uniform bool u_useCurve;
// split tone
uniform bool u_split; uniform vec3 u_shadowCol, u_highCol; uniform float u_shadowSat, u_highSat, u_balance;
uniform float u_fade;
uniform bool u_vig; uniform float u_vigAmount, u_vigMid, u_vigFeather;
uniform bool u_grain; uniform float u_grainAmt, u_grainSize, u_seed;

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + u_seed * 0.6180339) * 43758.5453); }
float vnoise(vec2 p) {                                   // value noise, smooth within a cell
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);   // canvas px, y down
  vec4 src = texture(u_src, px / u_size);
  vec3 c = src.rgb;
  vec2 doc = (u_toDoc * vec3(px, 1.0)).xy;

  if (u_dev) {
    vec3 lin = toLin(c) * exp2(u_exposure);
    lin *= vec3(1.0 + 0.25 * u_temp, 1.0 - 0.15 * u_tint, 1.0 - 0.25 * u_temp);
    c = toSrgb(lin);
    c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
    c = mix(vec3(luma(c)), c, 1.0 + u_sat);
    c = clamp(c, 0.0, 1.0);
  }
  if (u_useLut) {
    vec3 t = clamp((c - u_domMin) / (u_domMax - u_domMin), 0.0, 1.0);
    vec3 g = texture(u_lut, (t * (u_lutN - 1.0) + 0.5) / u_lutN).rgb;
    c = mix(c, g, u_lutStrength);
  }
  if (u_useCurve) {
    c = vec3(texture(u_curve, vec2(c.r, 0.5)).r, texture(u_curve, vec2(c.g, 0.5)).r, texture(u_curve, vec2(c.b, 0.5)).r);
  }
  if (u_split) {
    float l = luma(c);
    float ws = 1.0 - smoothstep(0.0, 0.5 + 0.4 * u_balance, l);
    float wh = smoothstep(0.5 + 0.4 * u_balance, 1.0, l);
    c += (u_shadowCol - luma(u_shadowCol)) * u_shadowSat * ws * 0.35;
    c += (u_highCol - luma(u_highCol)) * u_highSat * wh * 0.35;
  }
  c = mix(vec3(u_fade * 0.22), vec3(1.0 - u_fade * 0.04), c);  // lifted blacks, milky whites

  vec3 lin = toLin(clamp(c, 0.0, 1.0));
  if (u_vig) {
    float r = length((doc / u_docSize - 0.5) * 2.0) / 1.41421;   // 0 centre … 1 corner
    float w = smoothstep(u_vigMid - u_vigFeather * 0.5, u_vigMid + u_vigFeather * 0.5, r);
    lin = u_vigAmount < 0.0 ? lin * (1.0 + u_vigAmount * w) : mix(lin, vec3(1.0), u_vigAmount * w);
  }
  if (u_grain) {
    vec2 q = doc / u_grainSize;
    float n = vnoise(q) + 0.5 * vnoise(q * 2.03 + 17.0) - 0.75;  // two octaves, zero-mean
    float l = luma(lin);
    float amp = u_grainAmt * 0.35 * (0.35 + 2.6 * l * (1.0 - l)); // strongest in the mids
    lin *= 1.0 + n * amp;
  }
  c = toSrgb(lin);
  o = vec4(mix(src.rgb, c, u_strength), src.a);
}`;

function hueToRgb(h: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

export class LookRenderer {
  private readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly u: Uniforms;
  private readonly srcTex: WebGLTexture;
  private readonly lutTex: WebGLTexture;
  private readonly curveTex: WebGLTexture;
  private lutKey = '';
  private curveKey = '';

  /** Throws when WebGL2 is unavailable — callers skip the look (no CPU twin). */
  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.program = this.link();
    gl.useProgram(this.program);
    this.u = new Proxy({} as Uniforms, {
      get: (cache, name: string) => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(this.program, name))),
    });
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.srcTex = this.tex(gl.TEXTURE0, gl.TEXTURE_2D, gl.NEAREST);
    this.lutTex = this.tex(gl.TEXTURE1, gl.TEXTURE_3D, gl.LINEAR);
    this.curveTex = this.tex(gl.TEXTURE2, gl.TEXTURE_2D, gl.LINEAR);
    gl.uniform1i(this.u.u_src, 0);
    gl.uniform1i(this.u.u_lut, 1);
    gl.uniform1i(this.u.u_curve, 2);
    // Placeholder 2³ LUT so the sampler is always complete.
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 2, 2, 2, 0, gl.RGBA, gl.FLOAT, new Float32Array(32));
    gl.activeTexture(gl.TEXTURE2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(256));
  }

  private link(): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`LookRenderer shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`LookRenderer link: ${gl.getProgramInfoLog(p)}`);
    return p;
  }

  private tex(unit: number, target: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.activeTexture(unit);
    gl.bindTexture(target, t);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return t;
  }

  /**
   * Shades `source` (the pixels below the look, `w`×`h` canvas px) and returns
   * the result canvas. `toDoc` maps canvas px → document px as a 2×3 affine
   * [a, b, c, d, e, f] (DOMMatrix order); `strength` is 0–1.
   */
  render(
    source: TexImageSource, w: number, h: number,
    recipe: LookRecipe, strength: number,
    toDoc: [number, number, number, number, number, number], docW: number, docH: number,
  ): OffscreenCanvas {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const [a, b, c, d, e, f] = toDoc;
    gl.uniformMatrix3fv(this.u.u_toDoc, false, [a, b, 0, c, d, 0, e, f, 1]);
    gl.uniform2f(this.u.u_size, w, h);
    gl.uniform2f(this.u.u_docSize, Math.max(1, docW), Math.max(1, docH));
    gl.uniform1f(this.u.u_strength, Math.max(0, Math.min(1, strength)));
    this.setComponents(recipe.components.filter(comp => comp.enabled));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  private setComponents(list: LookComponent[]): void {
    const gl = this.gl;
    const u = this.u;
    const find = <K extends LookComponent['kind']>(k: K) => list.find(c => c.kind === k) as Extract<LookComponent, { kind: K }> | undefined;

    const dev = find('develop');
    gl.uniform1i(u.u_dev, dev ? 1 : 0);
    if (dev) {
      gl.uniform1f(u.u_exposure, dev.exposure); gl.uniform1f(u.u_contrast, dev.contrast);
      gl.uniform1f(u.u_temp, dev.temp); gl.uniform1f(u.u_tint, dev.tint); gl.uniform1f(u.u_sat, dev.saturation);
    }

    const lutC = find('lut');
    const lut = lutC ? getLut(lutC.assetId) : undefined;
    gl.uniform1i(u.u_useLut, lut ? 1 : 0);
    if (lutC && lut) {
      const key = `${lutC.assetId}@${lutRegistryVersion()}`;
      if (key !== this.lutKey) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.FLOAT, lut.data);
        this.lutKey = key;
      }
      gl.uniform1f(u.u_lutN, lut.size);
      gl.uniform1f(u.u_lutStrength, lutC.strength);
      gl.uniform3fv(u.u_domMin, lut.domainMin);
      gl.uniform3fv(u.u_domMax, lut.domainMax);
    }

    const curve = find('curve');
    gl.uniform1i(u.u_useCurve, curve ? 1 : 0);
    if (curve) {
      const key = JSON.stringify(curve.rgb);
      if (key !== this.curveKey) {
        const table = buildCurvesLUT(curve.rgb.map(([x, y]) => ({ x: Math.round(x * 255), y: Math.round(y * 255) })));
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, table);
        this.curveKey = key;
      }
    }

    const split = find('splitTone');
    gl.uniform1i(u.u_split, split ? 1 : 0);
    if (split) {
      gl.uniform3fv(u.u_shadowCol, hueToRgb(split.shadowHue));
      gl.uniform3fv(u.u_highCol, hueToRgb(split.highlightHue));
      gl.uniform1f(u.u_shadowSat, split.shadowSat); gl.uniform1f(u.u_highSat, split.highlightSat);
      gl.uniform1f(u.u_balance, split.balance);
    }

    gl.uniform1f(u.u_fade, find('fade')?.amount ?? 0);

    const vig = find('vignette');
    gl.uniform1i(u.u_vig, vig && vig.amount !== 0 ? 1 : 0);
    if (vig) { gl.uniform1f(u.u_vigAmount, vig.amount); gl.uniform1f(u.u_vigMid, vig.midpoint); gl.uniform1f(u.u_vigFeather, Math.max(0.001, vig.feather)); }

    const grain = find('grain');
    gl.uniform1i(u.u_grain, grain && grain.amount > 0 ? 1 : 0);
    if (grain) { gl.uniform1f(u.u_grainAmt, grain.amount); gl.uniform1f(u.u_grainSize, grain.size); gl.uniform1f(u.u_seed, grain.seed); }
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
