// ─── Kollektiv Image Editor — LUT asset registry ─────────────────────────────
// Recipes reference LUTs by assetId; this resolves ids to parsed tables.
// Phase 1: in-memory. Bundled LUTs (public/looks/, lazy-fetched) and user
// imports (IndexedDB) register here in later phases.

import type { CubeLut } from './cube';

const _luts = new Map<string, CubeLut>();
let _version = 0;

export function registerLut(assetId: string, lut: CubeLut): void {
  _luts.set(assetId, lut);
  _version++; // renderers re-upload textures when this changes
}

export function getLut(assetId: string): CubeLut | undefined {
  return _luts.get(assetId);
}

/** Bumped on every registration — part of the look render cache key. */
export function lutRegistryVersion(): number {
  return _version;
}
