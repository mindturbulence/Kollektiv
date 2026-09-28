// ─── Kollektiv Image Editor — LookRenderer ───────────────────────────────────
// Applies a Look recipe to "everything below" (plan §3.3). One fused pass does
// the per-pixel work: lens fringe → develop → LUT → curve → split tone → fade
// → light leak → glow → vignette → grain → strength mix → frame. Exposure,
// white balance, leaks, glow and grain work in linear light; everything is
// float and quantized once. Grain, vignette, leaks, fringe and frames use
// DOCUMENT coordinates (the caller passes the canvas→document matrix), so a
// zoomed-out preview and a full-size export match.
//
// Halation and bloom need neighbourhood blur, so they get pre-passes: a
// bright-pass into a half-resolution texture, then a dual-Kawase down/up
// pyramid whose depth follows the radius (document px → canvas px) — cheap at
// any radius, never a large Gaussian (plan §3.3). RGBA16F targets when the GPU
// can render to float (EXT_color_buffer_float), RGBA8 otherwise.
//
// One context per renderer (the LayerPainter owns one, like BlendCompositor).

import { buildCurvesLUT } from '../adjust/kernels';
import { getLut, lutRegistryVersion } from './lutRegistry';
import { HSL_BAND_HUES, type LookComponent, type LookRecipe } from './recipe';

const VS = `#version 300 es
layout(location = 0) in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float; precision highp sampler3D;
out vec4 o;
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** Bright-pass: linear-light highlights above a soft threshold, at half res. */
const BRIGHT_FS = `${COMMON}
uniform sampler2D u_src; uniform vec2 u_srcSize; uniform float u_threshold;
void main() {
  // Texture row j ↔ canvas row 2j (top-down), the same orientation the main
  // pass samples the glow in (uv = canvas px / size); down/up keep it.
  vec2 px = gl_FragCoord.xy * 2.0;
  vec3 c = toLin(texture(u_src, px / u_srcSize).rgb);
  float l = luma(c);
  float k = smoothstep(u_threshold, u_threshold + 0.25, l);
  o = vec4(c * k, 1.0);
}`;

/** Dual-Kawase downsample (5 taps) and upsample (8 taps). */
const DOWN_FS = `${COMMON}
uniform sampler2D u_tex; uniform vec2 u_texel;
void main() {
  vec2 uv = gl_FragCoord.xy * 2.0 * u_texel;
  vec3 s = texture(u_tex, uv).rgb * 4.0
    + texture(u_tex, uv + vec2(-1, -1) * u_texel).rgb + texture(u_tex, uv + vec2(1, -1) * u_texel).rgb
    + texture(u_tex, uv + vec2(-1, 1) * u_texel).rgb + texture(u_tex, uv + vec2(1, 1) * u_texel).rgb;
  o = vec4(s / 8.0, 1.0);
}`;
const UP_FS = `${COMMON}
uniform sampler2D u_tex; uniform vec2 u_texel; uniform vec2 u_outSize;
void main() {
  vec2 uv = gl_FragCoord.xy / u_outSize; vec2 t = u_texel;
  vec3 s = texture(u_tex, uv + vec2(-2, 0) * t).rgb + texture(u_tex, uv + vec2(2, 0) * t).rgb
    + texture(u_tex, uv + vec2(0, -2) * t).rgb + texture(u_tex, uv + vec2(0, 2) * t).rgb
    + (texture(u_tex, uv + vec2(-1, -1) * t).rgb + texture(u_tex, uv + vec2(1, -1) * t).rgb
     + texture(u_tex, uv + vec2(-1, 1) * t).rgb + texture(u_tex, uv + vec2(1, 1) * t).rgb) * 2.0;
  o = vec4(s / 12.0, 1.0);
}`;

const MAIN_FS = `${COMMON}
uniform sampler2D u_src; uniform sampler3D u_lut; uniform sampler2D u_curve;
uniform sampler2D u_bloomTex; uniform sampler2D u_haloTex;
uniform vec2 u_size;          // canvas px
uniform mat3 u_toDoc;         // canvas px (y down) → document px
uniform vec2 u_docSize;
uniform float u_pxPerDoc;     // canvas px per document px
uniform float u_strength;
uniform bool u_dev; uniform float u_exposure, u_contrast, u_temp, u_tint, u_sat;
uniform bool u_useLut; uniform float u_lutN, u_lutStrength; uniform vec3 u_domMin, u_domMax;
uniform bool u_useCurve;
uniform bool u_hsl; uniform vec3 u_hslBands[8]; uniform float u_hslHues[8];
uniform bool u_split; uniform vec3 u_shadowCol, u_highCol; uniform float u_shadowSat, u_highSat, u_balance;
uniform float u_fade;
uniform bool u_vig; uniform float u_vigAmount, u_vigMid, u_vigFeather;
uniform bool u_grain; uniform float u_grainAmt, u_grainSize, u_seed;
uniform float u_caAmt;
uniform bool u_leak; uniform float u_leakAmt; uniform vec3 u_leakCol; uniform vec3 u_leakBlob[3];
uniform float u_bloomAmt, u_haloAmt;
uniform bool u_frame; uniform float u_frameW; uniform int u_frameStyle; uniform vec3 u_frameCol;
uniform float u_paperAmt, u_paperScale;
uniform float u_dustAmt, u_scratchAmt, u_dustSeed;

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn, s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h = mx == c.r ? (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0) : mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;
  return vec3(h * 60.0, s, l);
}
vec3 hsl2rgb(vec3 h) {
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + h.x / 30.0, 12.0);
  float a = h.y * min(h.z, 1.0 - h.z);
  return h.z - a * max(vec3(-1.0), min(min(k - 3.0, 9.0 - k), vec3(1.0)));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + u_seed * 0.6180339) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_dustSeed * 1.618) * 43758.5453); }
/** Dust specks on a jittered 36-doc-px grid (3×3 cells so specks aren't clipped)
 *  and a few long faint scratches; all in document px, anti-aliased to 1 canvas px. */
float dust(vec2 doc) {
  float aa = 0.75 / u_pxPerDoc, v = 0.0;
  vec2 cell = floor(doc / 36.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    if (h21(c) > u_dustAmt * 0.35) continue;
    vec2 ctr = (c + vec2(h21(c + 3.1), h21(c + 7.7))) * 36.0;
    float r = 0.6 + 1.8 * h21(c + 11.3);
    v = max(v, 1.0 - smoothstep(r - aa, r + aa, length(doc - ctr)));
  }
  for (int k = 0; k < 4; k++) {
    if (float(k) >= u_scratchAmt * 4.0) break;
    float fk = float(k);
    float x0 = h21(vec2(fk, 1.0)) * u_docSize.x, slope = (h21(vec2(fk, 2.0)) - 0.5) * 0.08;
    float d = abs(doc.x - (x0 + slope * doc.y));
    // Broken, uneven scratches: two noise octaves along the length gate them.
    float n = vnoise(vec2(fk * 7.0, doc.y / 140.0)) * 0.7 + vnoise(vec2(fk * 13.0, doc.y / 35.0)) * 0.3;
    float fade = smoothstep(0.5, 0.75, n);
    v = max(v, (1.0 - smoothstep(0.3 - aa, 0.3 + aa, d)) * fade * 0.55);
  }
  return v;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);   // canvas px, y down
  vec2 uv = px / u_size;
  vec2 doc = (u_toDoc * vec3(px, 1.0)).xy;
  vec2 nd = doc / u_docSize;                                    // 0..1 across the document
  vec4 src = texture(u_src, uv);
  vec3 c = src.rgb;

  if (u_caAmt > 0.0) {                                          // lens fringe, radial, doc-space
    vec2 off = (nd - 0.5) * 2.0 / 1.41421 * u_caAmt * u_pxPerDoc;
    c.r = texture(u_src, (px + off) / u_size).r;
    c.b = texture(u_src, (px - off) / u_size).b;
  }
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
    c = mix(c, texture(u_lut, (t * (u_lutN - 1.0) + 0.5) / u_lutN).rgb, u_lutStrength);
  }
  if (u_useCurve) {
    c = vec3(texture(u_curve, vec2(c.r, 0.5)).r, texture(u_curve, vec2(c.g, 0.5)).r, texture(u_curve, vec2(c.b, 0.5)).r);
  }
  if (u_hsl) {                                                  // per-band hue/sat/lightness
    vec3 hsl = rgb2hsl(c);
    // Interpolate between the two bands around this hue (weights sum to 1, so
    // a band's centre gets exactly its own values).
    vec3 d = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = u_hslHues[i], b = i == 7 ? 360.0 : u_hslHues[i + 1];
      if (hsl.x >= a && hsl.x < b) d = mix(u_hslBands[i], u_hslBands[(i + 1) % 8], (hsl.x - a) / (b - a));
    }
    float grey = smoothstep(0.02, 0.2, hsl.y);                 // greys stay put
    hsl.x = mod(hsl.x + d.x * grey + 360.0, 360.0);
    hsl.y = clamp(hsl.y * (1.0 + d.y * grey), 0.0, 1.0);
    hsl.z = clamp(hsl.z + d.z * 0.25 * grey * hsl.y, 0.0, 1.0);
    c = hsl2rgb(hsl);
  }
  if (u_split) {
    float l = luma(c);
    float ws = 1.0 - smoothstep(0.0, 0.5 + 0.4 * u_balance, l);
    float wh = smoothstep(0.5 + 0.4 * u_balance, 1.0, l);
    c += (u_shadowCol - luma(u_shadowCol)) * u_shadowSat * ws * 0.35;
    c += (u_highCol - luma(u_highCol)) * u_highSat * wh * 0.35;
  }
  c = mix(vec3(u_fade * 0.22), vec3(1.0 - u_fade * 0.04), c);

  vec3 lin = toLin(clamp(c, 0.0, 1.0));
  if (u_leak) {                                                 // seeded warm blobs, screen blend
    vec3 leak = vec3(0.0);
    float aspect = u_docSize.x / u_docSize.y;
    for (int i = 0; i < 3; i++) {
      vec2 d = (nd - u_leakBlob[i].xy) * vec2(aspect, 1.0) / u_leakBlob[i].z;
      leak += exp(-dot(d, d) * 2.2) * mix(u_leakCol, vec3(1.0, 0.86, 0.62), float(i) * 0.3);
    }
    lin = 1.0 - (1.0 - lin) * (1.0 - clamp(leak * u_leakAmt, 0.0, 1.0));
  }
  if (u_bloomAmt > 0.0) lin += texture(u_bloomTex, uv).rgb * u_bloomAmt;
  if (u_haloAmt > 0.0) lin += texture(u_haloTex, uv).rgb * vec3(1.0, 0.32, 0.12) * u_haloAmt * 1.6;
  if (u_vig) {
    float r = length((nd - 0.5) * 2.0) / 1.41421;
    float w = smoothstep(u_vigMid - u_vigFeather * 0.5, u_vigMid + u_vigFeather * 0.5, r);
    lin = u_vigAmount < 0.0 ? lin * (1.0 + u_vigAmount * w) : mix(lin, vec3(1.0), u_vigAmount * w);
  }
  if (u_grain) {
    vec2 q = doc / u_grainSize;
    float n = vnoise(q) + 0.5 * vnoise(q * 2.03 + 17.0) - 0.75;
    float l = luma(lin);
    lin *= 1.0 + n * u_grainAmt * 0.35 * (0.35 + 2.6 * l * (1.0 - l));
  }
  if (u_paperAmt > 0.0) {                                       // paper fibre, doc-space fractal noise
    vec2 q = doc / u_paperScale;
    float f = vnoise(q) * 0.5 + vnoise(q * 2.7 + 5.0) * 0.3 + vnoise(q * 7.3 + 9.0) * 0.2;
    lin *= 1.0 + (f - 0.5) * u_paperAmt * 0.6;
  }
  if (u_dustAmt > 0.0 || u_scratchAmt > 0.0) lin = mix(lin, vec3(0.92), dust(doc) * 0.85); // light specks, like dust on a print
  vec3 outc = mix(src.rgb, toSrgb(lin), u_strength);

  if (u_frame) {                                                // drawn last, never graded
    float w = u_frameW * min(u_docSize.x, u_docSize.y);
    vec2 lo = vec2(w), hi = u_docSize - vec2(w, u_frameStyle == 1 ? w * 3.2 : w);
    vec2 ctr = (lo + hi) * 0.5, he = max((hi - lo) * 0.5, vec2(0.0));
    float rad = u_frameStyle == 2 ? w * 1.2 : 0.0;
    vec2 q = abs(doc - ctr) - he + rad;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;   // > 0 outside the photo
    float aa = 0.5 / u_pxPerDoc;
    outc = mix(outc, u_frameCol, smoothstep(-aa, aa, sd) * u_strength);
  }
  o = vec4(outc, src.a);
}`;

function hueToRgb(h: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
const hexToRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
/** Deterministic 0–1 from a seed (for leak placement). */
const rand = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

interface Level { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

export class LookRenderer {
  private readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly main: WebGLProgram;
  private readonly bright: WebGLProgram;
  private readonly down: WebGLProgram;
  private readonly up: WebGLProgram;
  private readonly locs = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private readonly srcTex: WebGLTexture;
  private readonly lutTex: WebGLTexture;
  private readonly curveTex: WebGLTexture;
  private readonly floatTargets: boolean;
  private readonly pyramids: [Level[], Level[]] = [[], []]; // bloom, halation
  private lutKey = '';
  private curveKey = '';

  /** Throws when WebGL2 is unavailable — callers skip the look (no CPU twin). */
  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    this.main = this.link(MAIN_FS);
    this.bright = this.link(BRIGHT_FS);
    this.down = this.link(DOWN_FS);
    this.up = this.link(UP_FS);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.srcTex = this.tex(gl.TEXTURE0, gl.TEXTURE_2D, gl.LINEAR);
    this.lutTex = this.tex(gl.TEXTURE1, gl.TEXTURE_3D, gl.LINEAR);
    this.curveTex = this.tex(gl.TEXTURE2, gl.TEXTURE_2D, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 2, 2, 2, 0, gl.RGBA, gl.FLOAT, new Float32Array(32)); // placeholder
    gl.activeTexture(gl.TEXTURE2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(256));
    gl.useProgram(this.main);
    gl.uniform1i(this.u(this.main, 'u_src'), 0);
    gl.uniform1i(this.u(this.main, 'u_lut'), 1);
    gl.uniform1i(this.u(this.main, 'u_curve'), 2);
    gl.uniform1i(this.u(this.main, 'u_bloomTex'), 3);
    gl.uniform1i(this.u(this.main, 'u_haloTex'), 4);
    // Units 3/4 must hold complete textures even when glow is off.
    for (const unit of [gl.TEXTURE3, gl.TEXTURE4]) {
      this.tex(unit, gl.TEXTURE_2D, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
  }

  private u(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.locs.get(prog);
    if (!m) { m = new Map(); this.locs.set(prog, m); }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name));
    return m.get(name)!;
  }

  private link(fs: string): WebGLProgram {
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
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
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

  /** (Re)allocates a pyramid: level i is the canvas size / 2^(i+1). */
  private pyramid(which: 0 | 1, w: number, h: number, levels: number): Level[] {
    const gl = this.gl;
    const pyr = this.pyramids[which];
    for (let i = 0; i < levels; i++) {
      const lw = Math.max(1, Math.ceil(w / 2 ** (i + 1))), lh = Math.max(1, Math.ceil(h / 2 ** (i + 1)));
      if (pyr[i] && pyr[i].w === lw && pyr[i].h === lh) continue;
      if (pyr[i]) { gl.deleteTexture(pyr[i].tex); gl.deleteFramebuffer(pyr[i].fb); }
      const tex = this.tex(gl.TEXTURE5, gl.TEXTURE_2D, gl.LINEAR);
      if (this.floatTargets) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, lw, lh, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, lw, lh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      pyr[i] = { tex, fb, w: lw, h: lh };
    }
    return pyr.slice(0, levels);
  }

  /** Bright-pass + dual-Kawase blur of the source; returns the half-res result. */
  private glow(which: 0 | 1, w: number, h: number, threshold: number, radiusPx: number): WebGLTexture {
    const gl = this.gl;
    const levels = Math.max(1, Math.min(7, Math.round(Math.log2(Math.max(2, radiusPx) / 2))));
    const pyr = this.pyramid(which, w, h, levels);
    gl.useProgram(this.bright);
    gl.uniform1i(this.u(this.bright, 'u_src'), 0);
    gl.uniform2f(this.u(this.bright, 'u_srcSize'), w, h);
    gl.uniform1f(this.u(this.bright, 'u_threshold'), threshold);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pyr[0].fb);
    gl.viewport(0, 0, pyr[0].w, pyr[0].h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.useProgram(this.down);
    gl.uniform1i(this.u(this.down, 'u_tex'), 5);
    for (let i = 1; i < levels; i++) {
      gl.bindTexture(gl.TEXTURE_2D, pyr[i - 1].tex);
      gl.uniform2f(this.u(this.down, 'u_texel'), 1 / pyr[i - 1].w, 1 / pyr[i - 1].h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pyr[i].fb);
      gl.viewport(0, 0, pyr[i].w, pyr[i].h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.useProgram(this.up);
    gl.uniform1i(this.u(this.up, 'u_tex'), 5);
    for (let i = levels - 2; i >= 0; i--) {
      gl.bindTexture(gl.TEXTURE_2D, pyr[i + 1].tex);
      gl.uniform2f(this.u(this.up, 'u_texel'), 0.5 / pyr[i + 1].w, 0.5 / pyr[i + 1].h);
      gl.uniform2f(this.u(this.up, 'u_outSize'), pyr[i].w, pyr[i].h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pyr[i].fb);
      gl.viewport(0, 0, pyr[i].w, pyr[i].h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pyr[0].tex;
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const [a, b, c, d, e, f] = toDoc;
    const pxPerDoc = 1 / Math.max(1e-6, Math.hypot(a, b));
    const list = recipe.components.filter(comp => comp.enabled);
    const find = <K extends LookComponent['kind']>(k: K) => list.find(x => x.kind === k) as Extract<LookComponent, { kind: K }> | undefined;

    // Glow pre-passes (they leave the main program unbound).
    const bloom = find('bloom');
    const halo = find('halation');
    const bloomTex = bloom && bloom.amount > 0 ? this.glow(0, w, h, bloom.threshold, bloom.radius * pxPerDoc) : null;
    const haloTex = halo && halo.amount > 0 ? this.glow(1, w, h, halo.threshold, halo.radius * pxPerDoc) : null;
    if (bloomTex) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bloomTex); }
    if (haloTex) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, haloTex); }

    const m = this.main;
    gl.useProgram(m);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.uniformMatrix3fv(this.u(m, 'u_toDoc'), false, [a, b, 0, c, d, 0, e, f, 1]);
    gl.uniform2f(this.u(m, 'u_size'), w, h);
    gl.uniform2f(this.u(m, 'u_docSize'), Math.max(1, docW), Math.max(1, docH));
    gl.uniform1f(this.u(m, 'u_pxPerDoc'), pxPerDoc);
    gl.uniform1f(this.u(m, 'u_strength'), Math.max(0, Math.min(1, strength)));
    gl.uniform1f(this.u(m, 'u_bloomAmt'), bloomTex ? bloom!.amount : 0);
    gl.uniform1f(this.u(m, 'u_haloAmt'), haloTex ? halo!.amount : 0);
    this.setComponents(m, find);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  private setComponents(
    m: WebGLProgram,
    find: <K extends LookComponent['kind']>(k: K) => Extract<LookComponent, { kind: K }> | undefined,
  ): void {
    const gl = this.gl;
    const u = (name: string) => this.u(m, name);

    const dev = find('develop');
    gl.uniform1i(u('u_dev'), dev ? 1 : 0);
    if (dev) {
      gl.uniform1f(u('u_exposure'), dev.exposure); gl.uniform1f(u('u_contrast'), dev.contrast);
      gl.uniform1f(u('u_temp'), dev.temp); gl.uniform1f(u('u_tint'), dev.tint); gl.uniform1f(u('u_sat'), dev.saturation);
    }

    const lutC = find('lut');
    const lut = lutC ? getLut(lutC.assetId) : undefined;
    gl.uniform1i(u('u_useLut'), lut ? 1 : 0);
    if (lutC && lut) {
      const key = `${lutC.assetId}@${lutRegistryVersion()}`;
      if (key !== this.lutKey) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.FLOAT, lut.data);
        this.lutKey = key;
      }
      gl.uniform1f(u('u_lutN'), lut.size);
      gl.uniform1f(u('u_lutStrength'), lutC.strength);
      gl.uniform3fv(u('u_domMin'), lut.domainMin);
      gl.uniform3fv(u('u_domMax'), lut.domainMax);
    }

    const curve = find('curve');
    gl.uniform1i(u('u_useCurve'), curve ? 1 : 0);
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

    const hsl = find('hsl');
    gl.uniform1i(u('u_hsl'), hsl && hsl.bands.some(b => b.some(v => v !== 0)) ? 1 : 0);
    if (hsl) {
      gl.uniform3fv(u('u_hslBands'), hsl.bands.flat());
      gl.uniform1fv(u('u_hslHues'), [...HSL_BAND_HUES]);
    }

    const split = find('splitTone');
    gl.uniform1i(u('u_split'), split ? 1 : 0);
    if (split) {
      gl.uniform3fv(u('u_shadowCol'), hueToRgb(split.shadowHue));
      gl.uniform3fv(u('u_highCol'), hueToRgb(split.highlightHue));
      gl.uniform1f(u('u_shadowSat'), split.shadowSat); gl.uniform1f(u('u_highSat'), split.highlightSat);
      gl.uniform1f(u('u_balance'), split.balance);
    }

    gl.uniform1f(u('u_fade'), find('fade')?.amount ?? 0);

    const vig = find('vignette');
    gl.uniform1i(u('u_vig'), vig && vig.amount !== 0 ? 1 : 0);
    if (vig) { gl.uniform1f(u('u_vigAmount'), vig.amount); gl.uniform1f(u('u_vigMid'), vig.midpoint); gl.uniform1f(u('u_vigFeather'), Math.max(0.001, vig.feather)); }

    const grain = find('grain');
    gl.uniform1i(u('u_grain'), grain && grain.amount > 0 ? 1 : 0);
    if (grain) { gl.uniform1f(u('u_grainAmt'), grain.amount); gl.uniform1f(u('u_grainSize'), grain.size); gl.uniform1f(u('u_seed'), grain.seed); }

    gl.uniform1f(u('u_caAmt'), find('chromaticAberration')?.amount ?? 0);

    const leak = find('lightLeak');
    gl.uniform1i(u('u_leak'), leak && leak.amount > 0 ? 1 : 0);
    if (leak) {
      gl.uniform1f(u('u_leakAmt'), leak.amount);
      gl.uniform3fv(u('u_leakCol'), hueToRgb(leak.hue));
      // Three blobs hugging the edges, placed by the seed.
      const blobs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const s = leak.seed * 3 + i;
        const edge = rand(s) < 0.5 ? rand(s + 0.3) * 0.25 : 1 - rand(s + 0.3) * 0.25;
        const along = rand(s + 0.7);
        const onX = rand(s + 0.9) < 0.5;
        blobs.push(onX ? edge : along, onX ? along : edge, 0.25 + 0.35 * rand(s + 1.3));
      }
      gl.uniform3fv(u('u_leakBlob'), blobs);
    }

    const paper = find('paper');
    gl.uniform1f(u('u_paperAmt'), paper?.amount ?? 0);
    gl.uniform1f(u('u_paperScale'), paper?.scale ?? 6);
    const dustC = find('dust');
    gl.uniform1f(u('u_dustAmt'), dustC?.amount ?? 0);
    gl.uniform1f(u('u_scratchAmt'), dustC?.scratches ?? 0);
    gl.uniform1f(u('u_dustSeed'), dustC?.seed ?? 1);

    const frame = find('frame');
    gl.uniform1i(u('u_frame'), frame && frame.width > 0 ? 1 : 0);
    if (frame) {
      gl.uniform1f(u('u_frameW'), frame.width);
      gl.uniform1i(u('u_frameStyle'), frame.style === 'polaroid' ? 1 : frame.style === 'rounded' ? 2 : 0);
      gl.uniform3fv(u('u_frameCol'), hexToRgb(frame.color));
    }
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
