// ─── Kollektiv Image Editor — built-in looks ────────────────────────────────
// The bundled catalog. LUT looks use in-house procedural LUTs (`proc:`) or the
// one vetted CC0 file (`file:cold-vs-warm`, darkyboys/opensource-luts, see
// public/looks/LICENSES.md). Evocative names, never trademarked film stocks.
// Categories were triaged with Jev (2026-09-29); uncertain ones by hand.

import { COMPONENT_DEFAULTS as D, makeRecipe, type LookComponent, type LookRecipe } from './recipe';

export type LookCategory = 'film_color' | 'film_bw' | 'cinematic' | 'fade_matte';

export const LOOK_CATEGORIES: { id: LookCategory; label: string }[] = [
  { id: 'film_color', label: 'Film Color' },
  { id: 'film_bw', label: 'Film B&W' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'fade_matte', label: 'Fade & Matte' },
];

export interface BuiltinLook { key: string; name: string; category: LookCategory; build: () => LookRecipe }

/** A LUT look with a touch of grain (unless `extra` brings its own), the common finishing pair. */
const lutLook = (key: string, name: string, category: LookCategory, assetId: string, extra: LookComponent[] = []): BuiltinLook => ({
  key, name, category,
  build: () => makeRecipe(name, [
    { ...D.lut, assetId }, ...extra,
    ...(extra.some(c => c.kind === 'grain') ? [] : [{ ...D.grain, amount: 0.15, size: 1.3 }]),
  ]),
});

export const BUILTIN_LOOKS: BuiltinLook[] = [
  lutLook('warm-portrait', 'Warm Portrait', 'film_color', 'proc:warm-portrait'),
  lutLook('vivid-slide', 'Vivid Slide', 'film_color', 'proc:vivid-slide'),
  lutLook('cross-process', 'Cross Process', 'film_color', 'proc:cross-process'),
  lutLook('teal-orange', 'Teal & Orange', 'cinematic', 'proc:teal-orange'),
  lutLook('tungsten-night', 'Tungsten Night', 'cinematic', 'proc:tungsten-night', [{ ...D.vignette, amount: -0.3 }]),
  lutLook('bleach-bypass', 'Bleach Bypass', 'cinematic', 'proc:bleach-bypass'),
  lutLook('cold-vs-warm', 'Cold vs Warm', 'cinematic', 'file:cold-vs-warm'),
  lutLook('cool-pastel', 'Cool Pastel', 'fade_matte', 'proc:cool-pastel'),
  lutLook('faded-print', 'Faded Print', 'fade_matte', 'proc:faded-print'),
  lutLook('soft-mono', 'Soft Mono', 'fade_matte', 'proc:soft-mono'),
  lutLook('hard-mono', 'Hard Mono', 'film_bw', 'proc:hard-mono', [{ ...D.vignette, amount: -0.25 }]),
  lutLook('selenium', 'Selenium', 'film_bw', 'proc:selenium'),
  lutLook('sepia', 'Sepia', 'film_bw', 'proc:sepia'),
  // Phase 3 looks built on halation/bloom, light leaks, fringe and frames
  // (categories Jev-triaged 2026-09-29; Pastel Haze 0.59 → decided by hand).
  lutLook('golden-hour', 'Golden Hour', 'film_color', 'proc:warm-portrait', [
    { ...D.halation, amount: 0.35, radius: 20 }, { ...D.lightLeak, amount: 0.3, hue: 32, seed: 4 },
  ]),
  lutLook('expired-film', 'Expired Film', 'film_color', 'proc:faded-print', [
    { ...D.lightLeak, amount: 0.55, hue: 18, seed: 11 }, { ...D.chromaticAberration, amount: 2 },
    { ...D.grain, amount: 0.45, size: 1.8 }, { ...D.vignette, amount: -0.35 },
  ]),
  lutLook('lomo', 'Lomo', 'film_color', 'proc:vivid-slide', [
    { ...D.vignette, amount: -0.6, midpoint: 0.45 }, { ...D.chromaticAberration, amount: 3 },
    { ...D.lightLeak, amount: 0.25, hue: 350, seed: 3 },
  ]),
  lutLook('summer-leak', 'Summer Leak', 'film_color', 'proc:warm-portrait', [{ ...D.lightLeak, amount: 0.6, hue: 40, seed: 7 }]),
  lutLook('neon-night', 'Neon Night', 'cinematic', 'proc:tungsten-night', [
    { ...D.bloom, amount: 0.5, radius: 36, threshold: 0.55 }, { ...D.halation, amount: 0.4, radius: 18 },
    { ...D.chromaticAberration, amount: 3 },
  ]),
  lutLook('anamorphic', 'Anamorphic', 'cinematic', 'proc:teal-orange', [
    { ...D.bloom, amount: 0.3, radius: 64, threshold: 0.6 }, { ...D.chromaticAberration, amount: 4 },
    { ...D.vignette, amount: -0.3 },
  ]),
  lutLook('instant-print', 'Instant Print', 'fade_matte', 'proc:cool-pastel', [
    { ...D.fade, amount: 0.2 }, { ...D.frame, style: 'polaroid', width: 0.05, color: '#f6f3ec' },
  ]),
  lutLook('pastel-haze', 'Pastel Haze', 'fade_matte', 'proc:cool-pastel', [
    { ...D.bloom, amount: 0.3, radius: 48, threshold: 0.5 }, { ...D.lightLeak, amount: 0.3, hue: 330, seed: 9 },
  ]),
  lutLook('noir-glow', 'Noir Glow', 'film_bw', 'proc:hard-mono', [
    { ...D.bloom, amount: 0.35, radius: 40, threshold: 0.6 }, { ...D.grain, amount: 0.5, size: 1.8 },
    { ...D.vignette, amount: -0.5 },
  ]),
  lutLook('darkroom-print', 'Darkroom Print', 'film_bw', 'proc:selenium', [
    { ...D.grain, amount: 0.35, size: 1.6 }, { ...D.frame, style: 'rounded', width: 0.04, color: '#111111' },
  ]),
  // Procedural textures (Jev: Old Print → Film B&W 0.93; Dusty Film 0.49 → decided by hand).
  lutLook('old-print', 'Old Print', 'film_bw', 'proc:sepia', [
    { ...D.paper, amount: 0.5, scale: 7 }, { ...D.dust, amount: 0.45, scratches: 0.5, seed: 5 },
    { ...D.vignette, amount: -0.35 },
  ]),
  lutLook('dusty-film', 'Dusty Film', 'fade_matte', 'proc:faded-print', [
    { ...D.dust, amount: 0.5, scratches: 0.25, seed: 13 }, { ...D.grain, amount: 0.35, size: 1.6 },
  ]),
  {
    key: 'dream-glow', name: 'Dream Glow', category: 'fade_matte',
    build: () => makeRecipe('Dream Glow', [
      { ...D.develop, contrast: -0.15 },
      { ...D.bloom, amount: 0.6, radius: 80, threshold: 0.45 },
      { ...D.fade, amount: 0.2 },
    ]),
  },
  {
    key: 'matte-frame', name: 'Matte Frame', category: 'fade_matte',
    build: () => makeRecipe('Matte Frame', [
      { ...D.curve, rgb: [[0, 0.1], [0.3, 0.3], [0.75, 0.78], [1, 0.95]] },
      { ...D.fade, amount: 0.25 },
      { ...D.frame, style: 'thin', width: 0.05, color: '#f4f1ea' },
    ]),
  },
  {
    key: 'warm-fade', name: 'Warm Fade', category: 'fade_matte',
    build: () => makeRecipe('Warm Fade', [
      { ...D.develop, temp: 0.35, contrast: -0.1, saturation: -0.1 },
      { ...D.splitTone, shadowHue: 200, shadowSat: 0.35, highlightHue: 38, highlightSat: 0.45 },
      { ...D.fade, amount: 0.45 },
      { ...D.grain, amount: 0.3, size: 1.5 },
      { ...D.vignette, amount: -0.3 },
    ]),
  },
  {
    key: 'soft-matte', name: 'Soft Matte', category: 'fade_matte',
    build: () => makeRecipe('Soft Matte', [
      { ...D.develop, contrast: -0.2, saturation: -0.25 },
      { ...D.curve, rgb: [[0, 0.08], [0.25, 0.24], [0.75, 0.8], [1, 0.95]] },
      { ...D.fade, amount: 0.3 },
      { ...D.grain, amount: 0.2, size: 1.2 },
    ]),
  },
  {
    key: 'grainy-mono', name: 'Grainy Mono', category: 'film_bw',
    build: () => makeRecipe('Grainy Mono', [
      { ...D.develop, saturation: -1, contrast: 0.25 },
      { ...D.grain, amount: 0.6, size: 2 },
      { ...D.vignette, amount: -0.45, midpoint: 0.55 },
    ]),
  },
];
