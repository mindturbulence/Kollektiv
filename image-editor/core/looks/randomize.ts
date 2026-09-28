// ─── Kollektiv Image Editor — Randomize a look ──────────────────────────────
// Seeded variations of a recipe (plan §5, Huji-style "surprise me"): nudges
// the finishing components within tasteful ranges and reseeds grain/leaks.
// Same recipe + same seed → same result, so a variation can be reproduced.

import type { LookComponent, LookRecipe } from './recipe';

/** mulberry32 — small, fast, deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function varyRecipe(recipe: LookRecipe, seed: number): LookRecipe {
  const r = rng(seed);
  const jitter = (v: number, spread: number, lo: number, hi: number) => clamp(v + (r() * 2 - 1) * spread, lo, hi);
  const components = recipe.components.map((c): LookComponent => {
    switch (c.kind) {
      case 'lut': return { ...c, strength: jitter(c.strength, 0.15, 0.6, 1) };
      case 'fade': return { ...c, amount: jitter(c.amount, 0.12, 0, 0.6) };
      case 'grain': return { ...c, amount: jitter(c.amount, 0.12, 0, 0.8), seed: Math.floor(r() * 1e6) };
      case 'vignette': return { ...c, amount: jitter(c.amount, 0.15, -0.8, 0.2) };
      case 'splitTone': return { ...c, shadowHue: (c.shadowHue + (r() * 2 - 1) * 25 + 360) % 360, highlightHue: (c.highlightHue + (r() * 2 - 1) * 20 + 360) % 360,
        shadowSat: jitter(c.shadowSat, 0.1, 0, 0.8), highlightSat: jitter(c.highlightSat, 0.1, 0, 0.8) };
      case 'lightLeak': return { ...c, amount: jitter(c.amount, 0.15, 0.1, 0.9), hue: (c.hue + (r() * 2 - 1) * 30 + 360) % 360, seed: Math.floor(r() * 1e6) };
      case 'halation': case 'bloom': return { ...c, amount: jitter(c.amount, 0.12, 0, 0.9) };
      case 'develop': return { ...c, temp: jitter(c.temp, 0.1, -1, 1), exposure: jitter(c.exposure, 0.1, -3, 3) };
      default: return c;
    }
  });
  return { ...recipe, components };
}
