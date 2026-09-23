// ─── Kollektiv Image Editor — Adjustment Kernels ────────────────────────────
// Pure pixel math over Uint8ClampedArray (RGBA, 4 bytes/pixel).
// No DOM, no React, no worker APIs — importable anywhere.

// ─── Curves LUT ──────────────────────────────────────────────────────────────

export interface CurvePoint { x: number; y: number; }

/** Build a 256-entry LUT from control points using Catmull-Rom spline. */
export function buildCurvesLUT(points: CurvePoint[]): Uint8Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0 || sorted[0].x !== 0)  sorted.unshift({ x: 0, y: 0 });
  if (sorted[sorted.length - 1].x !== 255) sorted.push({ x: 255, y: 255 });

  const lut = new Uint8Array(256);

  // 2-point case: pure linear interpolation — Catmull-Rom boundary ghosts give incorrect results.
  if (sorted.length === 2) {
    const x0 = sorted[0].x, y0 = sorted[0].y;
    const x1 = sorted[1].x, y1 = sorted[1].y;
    const dx = Math.max(1, x1 - x0);
    for (let x = 0; x <= 255; x++) {
      const t = Math.max(0, Math.min(1, (x - x0) / dx));
      lut[x] = Math.max(0, Math.min(255, Math.round(y0 + t * (y1 - y0))));
    }
    return lut;
  }

  for (let x = 0; x <= 255; x++) {
    // Find enclosing segment
    let i = 0;
    while (i < sorted.length - 2 && sorted[i + 1].x <= x) i++;

    const p0 = sorted[Math.max(0, i - 1)];
    const p1 = sorted[i];
    const p2 = sorted[Math.min(sorted.length - 1, i + 1)];
    const p3 = sorted[Math.min(sorted.length - 1, i + 2)];

    const dx = p2.x - p1.x;
    const t = dx === 0 ? 0 : (x - p1.x) / dx;
    const t2 = t * t;
    const t3 = t2 * t;

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    lut[x] = Math.max(0, Math.min(255, Math.round(y)));
  }

  return lut;
}

// ─── Levels ──────────────────────────────────────────────────────────────────

/**
 * @param channel 0=RGB, 1=R, 2=G, 3=B
 */
export function applyLevels(
  pixels: Uint8ClampedArray,
  inBlack: number, inWhite: number, gamma: number,
  outBlack: number, outWhite: number,
  channel: number,
): void {
  const range = Math.max(1, inWhite - inBlack);
  const outRange = outWhite - outBlack;
  const g = 1 / Math.max(0.01, gamma);

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const norm = Math.max(0, Math.min(1, (i - inBlack) / range));
    const corr = Math.pow(norm, g);
    lut[i] = Math.max(0, Math.min(255, Math.round(corr * outRange + outBlack)));
  }

  const n = pixels.length;
  if (channel === 0) {
    for (let i = 0; i < n; i += 4) {
      pixels[i]     = lut[pixels[i]];
      pixels[i + 1] = lut[pixels[i + 1]];
      pixels[i + 2] = lut[pixels[i + 2]];
    }
  } else {
    const off = channel - 1;
    for (let i = 0; i < n; i += 4) {
      pixels[i + off] = lut[pixels[i + off]];
    }
  }
}

// ─── Curves ───────────────────────────────────────────────────────────────────

/**
 * @param channel 0=RGB, 1=R, 2=G, 3=B
 */
export function applyCurves(
  pixels: Uint8ClampedArray,
  lut: Uint8Array,
  channel: number,
): void {
  const n = pixels.length;
  if (channel === 0) {
    for (let i = 0; i < n; i += 4) {
      pixels[i]     = lut[pixels[i]];
      pixels[i + 1] = lut[pixels[i + 1]];
      pixels[i + 2] = lut[pixels[i + 2]];
    }
  } else {
    const off = channel - 1;
    for (let i = 0; i < n; i += 4) {
      pixels[i + off] = lut[pixels[i + off]];
    }
  }
}

// ─── Hue / Saturation ─────────────────────────────────────────────────────────
// Inlined (no tuple-returning helpers): the previous rgbToHsl/hslToRgb pair
// allocated a fresh [number, number, number] per pixel, which at 16.7M pixels
// (4096x4096) cost ~3.75s of GC pressure alone. Scratch numbers only, no arrays.

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 0.5)   return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function applyHueSaturation(
  pixels: Uint8ClampedArray,
  hueShift: number,
  saturation: number,
  lightness: number,
  colorize: boolean,
): void {
  const n = pixels.length;
  const colorizeH = ((hueShift + 180) % 360) / 360;
  const colorizeS = Math.max(0, Math.min(1, 0.5 + saturation / 200));

  for (let i = 0; i < n; i += 4) {
    const rn = pixels[i] / 255, gn = pixels[i + 1] / 255, bn = pixels[i + 2] / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    let h: number, s: number;
    const l = (max + min) / 2;
    if (max === min) {
      h = 0; s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn)      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (max === gn) h = ((bn - rn) / d + 2) / 6;
      else                 h = ((rn - gn) / d + 4) / 6;
    }

    let outH: number, outS: number, outL: number;
    if (colorize) {
      outH = colorizeH; outS = colorizeS; outL = l;
    } else {
      outH = (((h * 360 + hueShift) % 360) + 360) / 360 % 1;
      outS = Math.max(0, Math.min(1, s * (1 + saturation / 100)));
      outL = Math.max(0, Math.min(1, l + lightness / 100));
    }

    if (outS === 0) {
      const v = Math.round(outL * 255);
      pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v;
    } else {
      const q = outL < 0.5 ? outL * (1 + outS) : outL + outS - outL * outS;
      const p = 2 * outL - q;
      pixels[i]     = Math.max(0, Math.min(255, Math.round(hue2rgb(p, q, outH + 1 / 3) * 255)));
      pixels[i + 1] = Math.max(0, Math.min(255, Math.round(hue2rgb(p, q, outH) * 255)));
      pixels[i + 2] = Math.max(0, Math.min(255, Math.round(hue2rgb(p, q, outH - 1 / 3) * 255)));
    }
  }
}

// ─── Exposure ────────────────────────────────────────────────────────────────

export function applyExposure(
  pixels: Uint8ClampedArray,
  exposure: number,
  offset: number,
  gammaCorrection: number,
): void {
  const mult = Math.pow(2, exposure);
  const off  = offset * 255;
  const gc   = 1 / Math.max(0.01, gammaCorrection);
  const lut  = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = Math.max(0, Math.min(255, i * mult + off));
    v = Math.pow(v / 255, gc) * 255;
    lut[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  const n = pixels.length;
  for (let i = 0; i < n; i += 4) {
    pixels[i]     = lut[pixels[i]];
    pixels[i + 1] = lut[pixels[i + 1]];
    pixels[i + 2] = lut[pixels[i + 2]];
  }
}
