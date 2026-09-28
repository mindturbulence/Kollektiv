// ─── Kollektiv Image Editor — in-house procedural LUTs ───────────────────────
// Film looks authored as plain colour maths and sampled into 33³ LUTs in the
// browser on first use (milliseconds) — no asset files, no provenance
// questions (GPL-3.0, Looks plan §6). Asset ids: `proc:<name>`. Names are
// evocative, never trademarked film stocks.

import type { CubeLut } from './cube';

type Rgb = [number, number, number];
type LookFn = (r: number, g: number, b: number) => Rgb;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Smooth S-curve around 0.5; k > 0 adds contrast, k < 0 flattens. */
const sCurve = (x: number, k: number) => clamp(x + k * (x - 0.5) * (1 - Math.abs(2 * x - 1)) * 2);
const lift = (x: number, black: number, white = 1) => black + x * (white - black);
const each = (c: Rgb, f: (v: number) => number): Rgb => [f(c[0]), f(c[1]), f(c[2])];

function rgbToHsl(r: number, g: number, b: number): Rgb {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/** 1 at hue `centre`, falling to 0 at `width` degrees away. */
const hueWeight = (h: number, centre: number, width: number) => Math.max(0, 1 - hueDist(h, centre) / width);
const satMul = (r: number, g: number, b: number, s: number): Rgb => {
  const y = luma(r, g, b);
  return [mix(y, r, s), mix(y, g, s), mix(y, b, s)];
};
/** Colour casts weighted toward shadows and highlights. */
const tone = (c: Rgb, shadow: Rgb, highlight: Rgb): Rgb => {
  const y = luma(...c);
  const ws = (1 - y) ** 2, wh = y ** 2;
  return [c[0] + shadow[0] * ws + highlight[0] * wh, c[1] + shadow[1] * ws + highlight[1] * wh, c[2] + shadow[2] * ws + highlight[2] * wh];
};

export const PROC_LUTS: Record<string, { title: string; fn: LookFn }> = {
  'warm-portrait': { title: 'Warm Portrait', fn: (r, g, b) => {
    let c = satMul(r * 1.04, g, b * 0.94, 0.88);
    c = [sCurve(c[0], 0.12), sCurve(c[1], 0.1), sCurve(c[2], 0.08)];
    return each(tone(c, [0.015, 0, 0.02], [0.02, 0.01, -0.02]), (v) => lift(v, 0.03, 0.98));
  } },
  'vivid-slide': { title: 'Vivid Slide', fn: (r, g, b) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    const c = hslToRgb(h + 12 * hueWeight(h, 220, 50), clamp(s * 1.35), l);   // blues toward cyan
    return each([sCurve(c[0], 0.3), sCurve(c[1], 0.3), sCurve(c[2], 0.28)], (v) => lift(v, -0.01));
  } },
  'cool-pastel': { title: 'Cool Pastel', fn: (r, g, b) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    const c = tone(hslToRgb(h + 18 * hueWeight(h, 120, 60), s * 0.7, l), [-0.01, 0.02, 0.06], [0, 0.01, 0.02]);
    return each(c, (v) => lift(sCurve(v, -0.15), 0.08, 0.97));
  } },
  'faded-print': { title: 'Faded Print', fn: (r, g, b) =>
    each(tone(satMul(r, g, b, 0.82), [0.03, 0.02, 0.04], [0.03, 0.015, -0.03]), (v) => lift(sCurve(v, -0.08), 0.12, 0.92)) },
  'cross-process': { title: 'Cross Process', fn: (r, g, b) =>
    tone([sCurve(r, 0.35), sCurve(g, 0.2) * 1.02, lift(b, 0.12, 0.82)], [-0.02, 0, 0.08], [0.02, 0.05, -0.08]) },
  'teal-orange': { title: 'Teal & Orange', fn: (r, g, b) => {
    let [h, s] = rgbToHsl(r, g, b);
    const l = rgbToHsl(r, g, b)[2];
    const skin = hueWeight(h, 28, 35);
    h = skin ? mix(h, 28, skin * 0.35) : mix(h, 190, 0.45 * Math.min(1, s * 2));  // warm → orange, rest → teal
    s = clamp(s * (skin ? 1 + 0.25 * skin : 0.9));
    const c = tone(hslToRgb(h, s, l), [-0.02, 0.02, 0.05], [0.04, 0.015, -0.03]);
    return each(c, (v) => sCurve(v, 0.18));
  } },
  'tungsten-night': { title: 'Tungsten Night', fn: (r, g, b) => {
    const c = tone(satMul(r * 0.86, g * 0.97, b * 1.12, 0.75), [-0.02, 0.01, 0.05], [0, 0.02, 0.03]);
    return each([sCurve(c[0], 0.15), sCurve(c[1], 0.15), sCurve(c[2], 0.12)], (v) => lift(v, 0.02));
  } },
  'bleach-bypass': { title: 'Bleach Bypass', fn: (r, g, b) => {
    const c = satMul(r, g, b, 0.45);
    const y = luma(...c);
    return each(c, (v) => sCurve(mix(v, y, 0.2), 0.45));
  } },
  'soft-mono': { title: 'Soft Mono', fn: (r, g, b) => { const y = lift(sCurve(luma(r, g, b), -0.05), 0.06, 0.96); return [y, y, y]; } },
  'hard-mono': { title: 'Hard Mono', fn: (r, g, b) => { const y = sCurve(0.3 * r + 0.59 * g + 0.11 * b, 0.55); return [y, y, y]; } },
  'selenium': { title: 'Selenium', fn: (r, g, b) => { const y = sCurve(luma(r, g, b), 0.2); return tone([y, y, y], [0.03, 0, 0.05], [0.02, 0.01, -0.01]); } },
  'sepia': { title: 'Sepia', fn: (r, g, b) => {
    const y = luma(r, g, b);
    return [lift(y, 0.08, 1) * 1.07, lift(y, 0.06, 0.96) * 0.98, lift(y, 0.05, 0.86) * 0.82];
  } },
};

/** Samples a procedural look into an N³ LUT (red fastest, like .cube). */
export function buildProcLut(name: string, n = 33): CubeLut | undefined {
  const look = PROC_LUTS[name];
  if (!look) return undefined;
  const data = new Float32Array(n * n * n * 4);
  let i = 0;
  for (let bi = 0; bi < n; bi++) for (let gi = 0; gi < n; gi++) for (let ri = 0; ri < n; ri++) {
    const out = look.fn(ri / (n - 1), gi / (n - 1), bi / (n - 1));
    data[i++] = clamp(out[0]); data[i++] = clamp(out[1]); data[i++] = clamp(out[2]); data[i++] = 1;
  }
  return { title: look.title, size: n, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}
