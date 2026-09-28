// ─── Kollektiv Image Editor — built-in looks (Phase 1) ──────────────────────
// Procedural only (no LUT assets yet). Evocative names, never trademarked film
// stocks (plan §6). The full catalog arrives with the Looks panel (Phase 2–3).

import { COMPONENT_DEFAULTS as D, makeRecipe, type LookRecipe } from './recipe';

export interface BuiltinLook { key: string; name: string; build: () => LookRecipe }

export const BUILTIN_LOOKS: BuiltinLook[] = [
  {
    key: 'warm-fade', name: 'Warm Fade',
    build: () => makeRecipe('Warm Fade', [
      { ...D.develop, temp: 0.35, contrast: -0.1, saturation: -0.1 },
      { ...D.splitTone, shadowHue: 200, shadowSat: 0.35, highlightHue: 38, highlightSat: 0.45 },
      { ...D.fade, amount: 0.45 },
      { ...D.grain, amount: 0.3, size: 1.5 },
      { ...D.vignette, amount: -0.3 },
    ]),
  },
  {
    key: 'soft-matte', name: 'Soft Matte',
    build: () => makeRecipe('Soft Matte', [
      { ...D.develop, contrast: -0.2, saturation: -0.25 },
      { ...D.curve, rgb: [[0, 0.08], [0.25, 0.24], [0.75, 0.8], [1, 0.95]] },
      { ...D.fade, amount: 0.3 },
      { ...D.grain, amount: 0.2, size: 1.2 },
    ]),
  },
  {
    key: 'grainy-mono', name: 'Grainy Mono',
    build: () => makeRecipe('Grainy Mono', [
      { ...D.develop, saturation: -1, contrast: 0.25 },
      { ...D.grain, amount: 0.6, size: 2 },
      { ...D.vignette, amount: -0.45, midpoint: 0.55 },
    ]),
  },
];
