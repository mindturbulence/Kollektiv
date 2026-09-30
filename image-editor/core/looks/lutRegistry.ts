// ─── Kollektiv Image Editor — LUT asset registry ─────────────────────────────
// Recipes reference LUTs by assetId; this resolves ids to parsed tables:
//   proc:<name>  in-house procedural looks, generated on first use (procLuts)
//   file:<name>  bundled third-party LUTs in public/looks/<name>.cube,
//                fetched lazily; listeners are told when one arrives so the
//                viewport can repaint (the store doesn't change)
//   user:<uuid>  user-imported LUTs and texture images (IndexedDB, userLibrary),
//                loaded lazily the same way

import { parseCube, type CubeLut } from './cube';
import { buildProcLut } from './procLuts';
import type { Layer } from '../types';
import type { LookRecipe } from './recipe';
import { getUserAsset } from './userLibrary';

const _luts = new Map<string, CubeLut>();
const _textures = new Map<string, ImageBitmap>();
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
  if (assetId.startsWith('file:') || assetId.startsWith('user:')) void loadLut(assetId);
  return undefined;
}

async function cubeText(assetId: string): Promise<string> {
  if (assetId.startsWith('user:')) {
    const a = await getUserAsset(assetId);
    if (a?.kind !== 'lut' || !a.cube) throw new Error('not in the look library of this browser');
    return a.cube;
  }
  const r = await fetch(`/looks/${encodeURIComponent(assetId.slice(5))}.cube`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Loads and registers a `file:`/`user:` LUT once; failures are logged, not
 *  thrown (the look renders without that component rather than breaking the frame). */
export function loadLut(assetId: string): Promise<void> {
  if (_luts.has(assetId) || !/^(file|user):/.test(assetId)) return Promise.resolve();
  let p = _pending.get(assetId);
  if (!p) {
    p = cubeText(assetId)
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
  const recipes: LookRecipe[] = [];
  const walk = (list: Layer[]) => list.forEach(l => {
    if (l.type === 'group') walk(l.children);
    if (l.type === 'look') recipes.push(l.recipe);
  });
  walk(layers);
  await Promise.all(recipes.map(preloadRecipeLuts));
}

export async function preloadRecipeLuts(recipe: LookRecipe): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const c of recipe.components) {
    if (!c.enabled) continue;
    if (c.kind === 'lut' && !getLut(c.assetId)) jobs.push(loadLut(c.assetId));
    else if (c.kind === 'texture' && !getTexture(c.assetId)) jobs.push(loadTexture(c.assetId));
  }
  await Promise.all(jobs);
}

/** A user texture image when loaded; starts loading it otherwise. */
export function getTexture(assetId: string): ImageBitmap | undefined {
  const hit = _textures.get(assetId);
  if (!hit) void loadTexture(assetId);
  return hit;
}

export function loadTexture(assetId: string): Promise<void> {
  if (_textures.has(assetId) || !assetId.startsWith('user:')) return Promise.resolve();
  const key = `tex:${assetId}`;
  let p = _pending.get(key);
  if (!p) {
    p = getUserAsset(assetId)
      .then(a => { if (a?.kind !== 'texture' || !a.image) throw new Error('not in the look library of this browser'); return createImageBitmap(a.image); })
      .then(bmp => { _textures.set(assetId, bmp); _version++; _listeners.forEach(fn => fn()); })
      .catch(err => console.warn(`[looks] could not load texture ${assetId}:`, err))
      .finally(() => _pending.delete(key));
    _pending.set(key, p);
  }
  return p;
}

export function onLutsChanged(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Bumped on every async registration — part of the look render cache key. */
export function lutRegistryVersion(): number {
  return _version;
}
