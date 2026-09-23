// ─── Kollektiv Image Editor — Manual Blend Mode Compositor (WebGL2) ────────
// The 9 blend modes with no Canvas2D globalCompositeOperation equivalent
// (§6 of the engineering plan). Two-texture fragment shader: `base` is
// everything composited so far, `blend` is this one layer rendered alone
// (own transform applied, opacity/blend forced to normal/100 by the caller
// so this shader is the only place opacity is applied for these layers).
//
// Only instantiated by CanvasRenderer when a document actually uses one of
// these modes — the common case (native modes only) never touches this file.

export type ManualBlendMode =
  | 'dissolve' | 'linear-burn' | 'linear-dodge' | 'vivid-light'
  | 'linear-light' | 'pin-light' | 'hard-mix' | 'darker-color' | 'lighter-color';

export const MANUAL_BLEND_MODES: readonly ManualBlendMode[] = [
  'dissolve', 'linear-burn', 'linear-dodge', 'vivid-light',
  'linear-light', 'pin-light', 'hard-mix', 'darker-color', 'lighter-color',
];

const MODE_INDEX: Record<ManualBlendMode, number> = {
  'dissolve': 0, 'linear-burn': 1, 'linear-dodge': 2, 'vivid-light': 3,
  'linear-light': 4, 'pin-light': 5, 'hard-mix': 6, 'darker-color': 7, 'lighter-color': 8,
};

const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_base;
uniform sampler2D u_blend;
uniform int   u_mode;
uniform float u_opacity;   // layer opacity, 0-1
in vec2 v_uv;
out vec4 outColor;

float luminance(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 colorDodge(vec3 base, vec3 blend) {
  return min(vec3(1.0), base / max(vec3(1e-4), (1.0 - blend)));
}
vec3 colorBurn(vec3 base, vec3 blend) {
  return 1.0 - min(vec3(1.0), (1.0 - base) / max(vec3(1e-4), blend));
}

vec3 blendFormula(vec3 base, vec3 blend, vec2 fragCoord) {
  if (u_mode == 0) return blend; // dissolve — alpha handled separately below
  if (u_mode == 1) return clamp(base + blend - 1.0, 0.0, 1.0);            // linear burn
  if (u_mode == 2) return clamp(base + blend, 0.0, 1.0);                  // linear dodge (add)
  if (u_mode == 3) {                                                       // vivid light
    return vec3(
      blend.r < 0.5 ? colorBurn(vec3(base.r), vec3(2.0*blend.r)).r : colorDodge(vec3(base.r), vec3(2.0*(blend.r-0.5))).r,
      blend.g < 0.5 ? colorBurn(vec3(base.g), vec3(2.0*blend.g)).g : colorDodge(vec3(base.g), vec3(2.0*(blend.g-0.5))).g,
      blend.b < 0.5 ? colorBurn(vec3(base.b), vec3(2.0*blend.b)).b : colorDodge(vec3(base.b), vec3(2.0*(blend.b-0.5))).b
    );
  }
  if (u_mode == 4) return clamp(base + 2.0 * blend - 1.0, 0.0, 1.0);       // linear light
  if (u_mode == 5) {                                                       // pin light
    return vec3(
      blend.r < 0.5 ? min(base.r, 2.0*blend.r) : max(base.r, 2.0*blend.r - 1.0),
      blend.g < 0.5 ? min(base.g, 2.0*blend.g) : max(base.g, 2.0*blend.g - 1.0),
      blend.b < 0.5 ? min(base.b, 2.0*blend.b) : max(base.b, 2.0*blend.b - 1.0)
    );
  }
  if (u_mode == 6) return step(vec3(1.0), base + blend);                  // hard mix
  if (u_mode == 7) return luminance(base) <= luminance(blend) ? base : blend; // darker color
  if (u_mode == 8) return luminance(base) >= luminance(blend) ? base : blend; // lighter color
  return blend;
}

void main() {
  vec4 base = texture(u_base, v_uv);
  vec4 blendColor = texture(u_blend, v_uv);

  if (u_mode == 0) {
    // Dissolve: stochastic per-pixel replace, weighted by blend alpha * opacity.
    float threshold = blendColor.a * u_opacity;
    float noise = hash(gl_FragCoord.xy);
    if (noise < threshold) {
      outColor = vec4(mix(base.rgb, blendColor.rgb, base.a), base.a + (1.0 - base.a));
    } else {
      outColor = base;
    }
    return;
  }

  vec3 formula = blendFormula(base.rgb, blendColor.rgb, gl_FragCoord.xy);
  vec3 rgb = mix(blendColor.rgb, formula, base.a);
  float blendA = blendColor.a * u_opacity;
  outColor.rgb = mix(base.rgb, rgb, blendA);
  outColor.a = base.a + blendA * (1.0 - base.a);
}`;

export class BlendCompositor {
  private readonly _canvas: OffscreenCanvas;
  private readonly _gl: WebGL2RenderingContext;
  private readonly _program: WebGLProgram;
  private readonly _baseTex: WebGLTexture;
  private readonly _blendTex: WebGLTexture;

  constructor(width: number, height: number) {
    this._canvas = new OffscreenCanvas(width, height);
    const gl = this._canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not available');
    this._gl = gl;
    this._program = this._buildProgram();
    this._baseTex = this._makeTexture();
    this._blendTex = this._makeTexture();
    this._initQuad();
  }

  get canvas(): OffscreenCanvas { return this._canvas; }

  needsResize(w: number, h: number): boolean {
    return w !== this._canvas.width || h !== this._canvas.height;
  }

  resize(w: number, h: number): void {
    this._canvas.width = w;
    this._canvas.height = h;
  }

  /** Composites `blend` over `base` using `mode`, returns the shared internal
   *  canvas (valid until the next render() call — copy it out if you need to
   *  hold onto it across frames). */
  render(
    base: TexImageSource,
    blend: TexImageSource,
    mode: ManualBlendMode,
    opacity: number,
  ): OffscreenCanvas {
    const gl = this._gl;
    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.useProgram(this._program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._baseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base);
    gl.uniform1i(gl.getUniformLocation(this._program, 'u_base'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._blendTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blend);
    gl.uniform1i(gl.getUniformLocation(this._program, 'u_blend'), 1);

    gl.uniform1i(gl.getUniformLocation(this._program, 'u_mode'), MODE_INDEX[mode]);
    gl.uniform1f(gl.getUniformLocation(this._program, 'u_opacity'), Math.max(0, Math.min(1, opacity)));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this._canvas;
  }

  dispose(): void {
    const gl = this._gl;
    gl.deleteTexture(this._baseTex);
    gl.deleteTexture(this._blendTex);
    gl.deleteProgram(this._program);
  }

  private _buildProgram(): WebGLProgram {
    const gl = this._gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('BlendCompositor shader compile: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('BlendCompositor program link: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private _initQuad(): void {
    const gl = this._gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this._program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private _makeTexture(): WebGLTexture {
    const gl = this._gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }
}
