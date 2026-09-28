// ─── Kollektiv Image Editor — LUT asset registry ─────────────────────────────
// Recipes reference LUTs by assetId; this resolves ids to parsed tables:
//   proc:<name>  in-house procedural looks, generated on first use (procLuts)
//   file:<name>  bundled third-party LUTs in public/looks/<name>.cube,
//                fetched lazily; listeners are told when one arrives so the
//                viewport can repaint (the store doesn't change)
// User-imported LUTs (IndexedDB) register here in a later phase.

import { parseCube, type CubeLut } from './cube';
import { buildProcLut } from './procLuts';
import type { Layer } from '../types';

const _luts = new Map<string, CubeLut>();
const _pending = new Map<string, Promise<void>>();
const _listeners = new Set<() => void>();
let _version = 0;

export function registerLut(assetId: string, lut: CubeLut): void {
  _luts.set(assetId, lut);
  _version++;
  _listeners.forEach(fn => fn());
}

/** Returns the table when available; starts loading a `file:` LUT otherwise. */
export function getLut(assetId: string): CubeLut | undefined {
  const hit = _luts.get(assetId);
  if (hit) return hit;
  if (assetId.startsWith('proc:')) {
    const lut = buildProcLut(assetId.slice(5));
    if (lut) _luts.set(assetId, lut); // sync: no repaint needed, no version bump
    return lut;
  }
  if (assetId.startsWith('file:')) void loadLut(assetId);
  return undefined;
}

/** Fetches and registers a `file:` LUT once; failures are logged, not thrown
 *  (the look renders without that component rather than breaking the frame). */
export function loadLut(assetId: string): Promise<void> {
  if (_luts.has(assetId) || !assetId.startsWith('file:')) return Promise.resolve();
  let p = _pending.get(assetId);
  if (!p) {
    const name = assetId.slice(5);
    p = fetch(`/looks/${encodeURIComponent(name)}.cube`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(text => registerLut(assetId, parseCube(text)))
      .catch(err => console.warn(`[looks] could not load LUT ${assetId}:`, err))
      .finally(() => _pending.delete(assetId));
    _pending.set(assetId, p);
  }
  return p;
}

/** Loads every LUT the looks in `layers` need — call before an uncached,
 *  one-shot render (export, flatten, merge, wand) so it can't miss one. */
export async function preloadLuts(layers: Layer[]): Promise<void> {
  const ids: string[] = [];
  const walk = (list: Layer[]) => list.forEach(l => {
    if (l.type === 'group') walk(l.children);
    if (l.type === 'look') l.recipe.components.forEach(c => { if (c.kind === 'lut' && c.enabled) ids.push(c.assetId); });
  });
  walk(layers);
  await Promise.all(ids.map(id => (getLut(id) ? undefined : loadLut(id))));
}

export function onLutsChanged(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Bumped on every async registration — part of the look render cache key. */
export function lutRegistryVersion(): number {
  return _version;
}
