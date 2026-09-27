// Ported from openreel@5f3c85e packages/core/src/video/color-grading-engine.ts
// — MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv.
//
// Upstream is a stateful WebGL2 engine (color wheels run as a GLSL shader;
// curves/LUT/HSL run on the CPU against an OffscreenCanvas). This module
// keeps only the Canvas2D-reachable scope for v2 (wheels, curves, HSL) and
// drops the WebGL/LUT/waveform-scope code — see engines/README.md. The
// wheels math below is the CPU translation of upstream's COLOR_WHEELS_SHADER;
// curves and HSL are the same per-pixel math as upstream's
// `applyCurvesToData`/`applyHslToData`, just exported instead of private.

export interface RGBOffset {
  r: number;
  g: number;
  b: number;
}

export interface ColorWheels {
  shadows: RGBOffset;
  midtones: RGBOffset;
  highlights: RGBOffset;
  shadowsLift: number;
  midtonesGamma: number;
  highlightsGain: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface Curves {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

/** 8 hue bands, matching upstream's secondary color wheel. */
export interface HSLBands {
  hue: number[];
  saturation: number[];
  luminance: number[];
}

export interface ColorGrading {
  wheels?: ColorWheels;
  curves?: Curves;
  hsl?: HSLBands;
}

export const DEFAULT_COLOR_WHEELS: ColorWheels = {
  shadows: { r: 0, g: 0, b: 0 },
  midtones: { r: 0, g: 0, b: 0 },
  highlights: { r: 0, g: 0, b: 0 },
  shadowsLift: 0,
  midtonesGamma: 1,
  highlightsGain: 1,
};

export const DEFAULT_CURVES: Curves = {
  rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};

export const DEFAULT_HSL: HSLBands = {
  hue: [0, 0, 0, 0, 0, 0, 0, 0],
  saturation: [0, 0, 0, 0, 0, 0, 0, 0],
  luminance: [0, 0, 0, 0, 0, 0, 0, 0],
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** CPU translation of upstream's COLOR_WHEELS_SHADER. Mutates `data` in place. */
export function applyWheels(data: Uint8ClampedArray, wheels: ColorWheels): void {
  const { shadows, midtones, highlights, shadowsLift, midtonesGamma, highlightsGain } = wheels;
  const invGamma = 1 / midtonesGamma;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const shadowWeight = 1 - smoothstep(0, 0.5, luma);
    const highlightWeight = smoothstep(0.5, 1, luma);
    const midtoneWeight = 1 - shadowWeight - highlightWeight;

    r += shadows.r * shadowWeight + midtones.r * midtoneWeight + highlights.r * highlightWeight + shadowsLift * shadowWeight;
    g += shadows.g * shadowWeight + midtones.g * midtoneWeight + highlights.g * highlightWeight + shadowsLift * shadowWeight;
    b += shadows.b * shadowWeight + midtones.b * midtoneWeight + highlights.b * highlightWeight + shadowsLift * shadowWeight;

    r = Math.pow(Math.max(r, 0), invGamma) * (1 + (highlightsGain - 1) * highlightWeight);
    g = Math.pow(Math.max(g, 0), invGamma) * (1 + (highlightsGain - 1) * highlightWeight);
    b = Math.pow(Math.max(b, 0), invGamma) * (1 + (highlightsGain - 1) * highlightWeight);

    data[i] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }
}

/** Same Catmull-Rom LUT build as upstream's `buildCurveLUT`. */
export function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0 || sorted[0].x > 0) {
    sorted.unshift({ x: 0, y: 0 });
  }
  if (sorted[sorted.length - 1].x < 1) {
    sorted.push({ x: 1, y: 1 });
  }
  if (sorted.length === 2) {
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const t = (x - sorted[0].x) / (sorted[1].x - sorted[0].x);
      const y = sorted[0].y + t * (sorted[1].y - sorted[0].y);
      lut[i] = Math.round(Math.max(0, Math.min(255, y * 255)));
    }
    return lut;
  }

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let y = x;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (x >= sorted[j].x && x <= sorted[j + 1].x) {
        const p0 = j > 0 ? sorted[j - 1] : sorted[j];
        const p1 = sorted[j];
        const p2 = sorted[j + 1];
        const p3 = j + 2 < sorted.length ? sorted[j + 2] : sorted[j + 1];
        const t = (x - p1.x) / (p2.x - p1.x);
        const t2 = t * t;
        const t3 = t2 * t;
        y =
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        break;
      }
    }
    lut[i] = Math.round(Math.max(0, Math.min(255, y * 255)));
  }
  return lut;
}

/** Same channel-then-master composition as upstream's `applyCurvesToData`. */
export function applyCurvesToData(data: Uint8ClampedArray, curves: Curves): void {
  const rgbLUT = buildCurveLUT(curves.rgb);
  const redLUT = buildCurveLUT(curves.red);
  const greenLUT = buildCurveLUT(curves.green);
  const blueLUT = buildCurveLUT(curves.blue);

  for (let i = 0; i < data.length; i += 4) {
    const r = redLUT[data[i]];
    const g = greenLUT[data[i + 1]];
    const b = blueLUT[data[i + 2]];
    data[i] = rgbLUT[r];
    data[i + 1] = rgbLUT[g];
    data[i + 2] = rgbLUT[b];
  }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGBOffset {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue2rgb(h + 1 / 3), g: hue2rgb(h), b: hue2rgb(h - 1 / 3) };
}

/** Same 8-band HSL shift as upstream's `applyHslToData`. */
export function applyHslToData(data: Uint8ClampedArray, hsl: HSLBands): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const hslColor = rgbToHsl(r, g, b);

    const hueIndex = Math.floor(hslColor.h * 8) % 8;
    hslColor.h = (hslColor.h + hsl.hue[hueIndex] / 360 + 1) % 1;
    hslColor.s = Math.max(0, Math.min(1, hslColor.s + hsl.saturation[hueIndex]));
    hslColor.l = Math.max(0, Math.min(1, hslColor.l + hsl.luminance[hueIndex]));

    const rgb = hslToRgb(hslColor.h, hslColor.s, hslColor.l);
    data[i] = Math.round(rgb.r * 255);
    data[i + 1] = Math.round(rgb.g * 255);
    data[i + 2] = Math.round(rgb.b * 255);
  }
}

/**
 * Applies wheels, then curves, then HSL to `imageData` in place (order
 * matches upstream's grading stage order). Returns the same ImageData.
 */
export function applyColorGrading(imageData: ImageData, grading: ColorGrading): ImageData {
  const data = imageData.data;
  if (grading.wheels) applyWheels(data, grading.wheels);
  if (grading.curves) applyCurvesToData(data, grading.curves);
  if (grading.hsl) applyHslToData(data, grading.hsl);
  return imageData;
}
