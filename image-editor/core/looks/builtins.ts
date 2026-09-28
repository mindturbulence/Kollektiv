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

/** A LUT look with a touch of grain, the common finishing pair. */
const lutLook = (key: string, name: string, category: LookCategory, assetId: string, extra: LookComponent[] = []): BuiltinLook => ({
  key, name, category,
  build: () => makeRecipe(name, [{ ...D.lut, assetId }, ...extra, { ...D.grain, amount: 0.15, size: 1.3 }]),
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
