// ─── Looks Lab — Phase 0 GPU probes ─────────────────────────────────────────
// Measurements that decide the Looks pipeline (plan §3.3–3.4 / Phase 0):
// can this GPU do RGBA16F 3D LUTs and float render targets, how accurate is
// the LUT path, how fast is the fused look pass, and what does the look
// layer's per-repaint "read composite → shade → draw back" cost versus a cache.
// Spike code: run from the #looks-lab page on the user's real GPU.

export interface ProbeRow { name: string; value: string; ok?: boolean }

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

function ctx(w = 1, h = 1): { gl: WebGL2RenderingContext; canvas: OffscreenCanvas } | null {
  const canvas = new OffscreenCanvas(w, h);
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  return gl ? { gl, canvas } : null;
}

function program(gl: WebGL2RenderingContext, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return p;
}

/** Identity N³ LUT as RGBA float data, red fastest (the .cube order). */
function identityLut(n: number): Float32Array {
  const d = new Float32Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    d[i++] = r / (n - 1); d[i++] = g / (n - 1); d[i++] = b / (n - 1); d[i++] = 1;
  }
  return d;
}

function uploadLut(gl: WebGL2RenderingContext, n: number, data: Float32Array): WebGLTexture {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, data);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
  return t;
}

function floatTarget(gl: WebGL2RenderingContext, w: number, h: number): WebGLFramebuffer | null {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? fb : null;
}

export function gpuCaps(): ProbeRow[] {
  const c = ctx();
  if (!c) return [{ name: 'WebGL2', value: 'not available — Looks cannot run', ok: false }];
  const { gl } = c;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const floatRT = !!gl.getExtension('EXT_color_buffer_float');
  const max2d = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const max3d = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
  const fb = floatRT ? floatTarget(gl, 4, 4) : null;
  return [
    { name: 'WebGL2', value: 'available', ok: true },
    { name: 'GPU', value: String(renderer) },
    { name: 'MAX_TEXTURE_SIZE', value: `${max2d}px (24 MP ≈ 6000px: ${max2d >= 6000 ? 'single tile' : 'needs tiled export'})`, ok: max2d >= 4096 },
    { name: 'MAX_3D_TEXTURE_SIZE', value: `${max3d} (LUTs need 33–65)`, ok: max3d >= 65 },
    { name: 'EXT_color_buffer_float', value: floatRT ? 'yes' : 'no — no RGBA16F render targets', ok: floatRT },
    { name: 'RGBA16F framebuffer', value: fb ? 'complete' : 'incomplete', ok: !!fb },
  ];
}

const LUT_FS = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler3D lut; uniform float n;
void main() {
  vec3 c = vec3(uv.x, fract(uv.x * 7.0), 1.0 - uv.x);        // a sweep through the cube
  vec3 t = (c * (n - 1.0) + 0.5) / n;                          // texel-centre remap
  o = vec4(texture(lut, t).rgb - c, 1.0);                      // error vs. identity
}`;

/** Identity 33³ RGBA16F LUT: worst-case error of trilinear sampling, in 8-bit levels. */
export function lutAccuracy(): ProbeRow {
  const c = ctx(1024, 1);
  if (!c || !c.gl.getExtension('EXT_color_buffer_float')) return { name: '3D LUT accuracy', value: 'skipped (no float targets)', ok: false };
  const { gl } = c;
  try {
    const p = program(gl, LUT_FS);
    gl.useProgram(p);
    uploadLut(gl, 33, identityLut(33));
    gl.uniform1i(gl.getUniformLocation(p, 'lut'), 1);
    gl.uniform1f(gl.getUniformLocation(p, 'n'), 33);
    const fb = floatTarget(gl, 1024, 1);
    if (!fb) return { name: '3D LUT accuracy', value: 'RGBA16F target incomplete', ok: false };
    gl.viewport(0, 0, 1024, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Float32Array(1024 * 4);
    gl.readPixels(0, 0, 1024, 1, gl.RGBA, gl.FLOAT, px);
    let max = 0;
    for (let i = 0; i < px.length; i += 4) max = Math.max(max, Math.abs(px[i]), Math.abs(px[i + 1]), Math.abs(px[i + 2]));
    const levels = max * 255;
    return { name: '3D LUT accuracy (identity 33³, RGBA16F)', value: `max error ${levels.toFixed(3)} / 255`, ok: levels < 0.5 };
  } catch (e) {
    return { name: '3D LUT accuracy', value: `failed: ${(e as Error).message}`, ok: false };
  }
}

const FUSED_FS = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler3D lut; uniform float n; uniform vec2 res; uniform float seed;
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
void main() {
  vec3 c = texture(src, uv).rgb;
  c = texture(lut, (c * (n - 1.0) + 0.5) / n).rgb;             // grade
  c = mix(vec3(0.06), vec3(0.97), c);                          // fade
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += mix(vec3(0.02, 0.0, 0.04), vec3(0.04, 0.02, -0.02), l); // split tone
  vec3 lin = toLin(c);
  vec2 dp = floor(uv * res / 2.0);                             // document-space grain cell
  float g = (hash(dp) + hash(dp * 0.5 + 7.0) * 0.5 - 0.75) * 0.06 * (1.0 - l);
  lin *= 1.0 + g;
  float v = smoothstep(0.95, 0.35, length(uv - 0.5));           // vignette
  o = vec4(toSrgb(lin * mix(0.7, 1.0, v)), 1.0);
}`;

/** Fused look pass (grade+fade+split+grain+vignette) into RGBA16F, ms/frame. */
export function fusedPassTiming(size: number): ProbeRow {
  const c = ctx(size, size);
  if (!c || !c.gl.getExtension('EXT_color_buffer_float')) return { name: `Fused pass ${size}²`, value: 'skipped', ok: false };
  const { gl } = c;
  try {
    const p = program(gl, FUSED_FS);
    gl.useProgram(p);
    const src = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    const pixels = new Uint8Array(size * size * 4).map((_, i) => (i * 2654435761) >>> 24);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    uploadLut(gl, 33, identityLut(33));
    gl.uniform1i(gl.getUniformLocation(p, 'src'), 0);
    gl.uniform1i(gl.getUniformLocation(p, 'lut'), 1);
    gl.uniform1f(gl.getUniformLocation(p, 'n'), 33);
    gl.uniform2f(gl.getUniformLocation(p, 'res'), size, size);
    const fb = floatTarget(gl, size, size);
    if (!fb) return { name: `Fused pass ${size}²`, value: 'RGBA16F target incomplete', ok: false };
    gl.viewport(0, 0, size, size);
    const px = new Float32Array(4);
    const frame = (i: number) => { gl.uniform1f(gl.getUniformLocation(p, 'seed'), i); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    frame(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px); // warm-up + sync
    const N = 20;
    const t0 = performance.now();
    for (let i = 1; i <= N; i++) frame(i);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);             // waits for the GPU
    const ms = (performance.now() - t0) / N;
    return { name: `Fused look pass ${size}² (RGBA16F)`, value: `${ms.toFixed(2)} ms/frame`, ok: ms < 16 };
  } catch (e) {
    return { name: `Fused pass ${size}²`, value: `failed: ${(e as Error).message}`, ok: false };
  }
}

/**
 * The look layer's repaint path at a 4K viewport: take "everything below"
 * from a 2D canvas, upload it, shade it, and draw it back — versus drawing a
 * cached result. Decides whether the render cache (plan §3.4) is mandatory.
 */
export function repaintCost(w = 3840, h = 2160): ProbeRow[] {
  const base = new OffscreenCanvas(w, h);
  const b = base.getContext('2d')!;
  const grad = b.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#203040'); grad.addColorStop(1, '#e0a060');
  b.fillStyle = grad; b.fillRect(0, 0, w, h);
  const c = ctx(w, h);
  if (!c) return [{ name: 'Repaint cost', value: 'no WebGL2', ok: false }];
  const { gl, canvas } = c;
  const p = program(gl, FUSED_FS);
  gl.useProgram(p);
  uploadLut(gl, 33, identityLut(33));
  gl.uniform1i(gl.getUniformLocation(p, 'src'), 0);
  gl.uniform1i(gl.getUniformLocation(p, 'lut'), 1);
  gl.uniform1f(gl.getUniformLocation(p, 'n'), 33);
  gl.uniform2f(gl.getUniformLocation(p, 'res'), w, h);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.viewport(0, 0, w, h);
  const out = new OffscreenCanvas(w, h).getContext('2d')!;

  const N = 10;
  let t0 = performance.now();
  for (let i = 0; i < N; i++) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, base);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    out.drawImage(canvas, 0, 0);                                  // back into the 2D compositor
  }
  out.getImageData(0, 0, 1, 1);                                   // sync
  const live = (performance.now() - t0) / N;

  const cached = canvas.transferToImageBitmap();
  t0 = performance.now();
  for (let i = 0; i < N; i++) out.drawImage(cached, 0, 0);
  out.getImageData(0, 0, 1, 1);
  const hit = (performance.now() - t0) / N;
  cached.close();
  return [
    { name: `Look repaint, uncached (${w}×${h})`, value: `${live.toFixed(1)} ms/frame`, ok: live < 16 },
    { name: `Look repaint, cached (${w}×${h})`, value: `${hit.toFixed(2)} ms/frame`, ok: hit < 4 },
  ];
}
