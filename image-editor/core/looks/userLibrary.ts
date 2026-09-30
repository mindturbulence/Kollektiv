// ─── Kollektiv Image Editor — user look library (Looks plan §7, Phase 5) ─────
// My Looks (saved recipes) and user assets (imported .cube LUTs, texture
// images) in IndexedDB, plus the `.klook` share format: the recipe JSON with
// every user asset it references embedded. Asset ids are `user:<uuid>` and
// stay stable across export/import, so a shared look resolves the same way.
// Dependency direction: lutRegistry → userLibrary (never the reverse).

import { openDB, type IDBPDatabase } from 'idb';
import { makeRecipe, parseRecipe, type LookRecipe } from './recipe';
import { parseCube } from './cube';

export interface MyLook { id: string; name: string; recipe: LookRecipe; createdAt: number }
export interface UserAsset { id: string; kind: 'lut' | 'texture'; name: string; cube?: string; image?: Blob }

const DB_NAME = 'kollektiv-looks';
let _db: Promise<IDBPDatabase> | null = null;
const db = () => (_db ??= openDB(DB_NAME, 1, {
  upgrade(d) {
    d.createObjectStore('looks', { keyPath: 'id' });
    d.createObjectStore('assets', { keyPath: 'id' });
  },
}));

let _looks: readonly MyLook[] = [];
let _loaded: Promise<void> | null = null;
const _listeners = new Set<() => void>();
const emit = () => _listeners.forEach(fn => fn());

/** Loads My Looks once (later calls reuse it). */
export function loadMyLooks(): Promise<void> {
  return (_loaded ??= db().then(d => d.getAll('looks')).then((rows: MyLook[]) => {
    _looks = rows.sort((a, b) => a.createdAt - b.createdAt);
    emit();
  }).catch(err => { console.warn('[looks] could not load My Looks:', err); }));
}
export const getMyLooks = (): readonly MyLook[] => _looks;
export function onMyLooksChanged(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

export async function saveMyLook(recipe: LookRecipe, name: string): Promise<MyLook> {
  const look: MyLook = { id: crypto.randomUUID(), name, recipe: { ...recipe, name }, createdAt: Date.now() };
  await (await db()).put('looks', look);
  _looks = [..._looks, look];
  emit();
  return look;
}

export async function renameMyLook(id: string, name: string): Promise<void> {
  const look = _looks.find(l => l.id === id);
  if (!look) return;
  const next = { ...look, name, recipe: { ...look.recipe, name } };
  await (await db()).put('looks', next);
  _looks = _looks.map(l => (l.id === id ? next : l));
  emit();
}

export async function deleteMyLook(id: string): Promise<void> {
  await (await db()).delete('looks', id);
  _looks = _looks.filter(l => l.id !== id);
  emit();
}

export async function getUserAsset(id: string): Promise<UserAsset | undefined> {
  return (await db()).get('assets', id);
}

async function putAsset(asset: UserAsset): Promise<void> {
  await (await db()).put('assets', asset);
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, '') || 'Imported';

/** Imports a .cube LUT (validated by parsing) and saves a My Look that uses it. */
export async function importCubeAsLook(file: File): Promise<MyLook> {
  const text = await file.text();
  parseCube(text); // throws on a malformed file before anything is stored
  const id = `user:${crypto.randomUUID()}`;
  await putAsset({ id, kind: 'lut', name: file.name, cube: text });
  return saveMyLook(makeRecipe(baseName(file), [{ kind: 'lut', enabled: true, assetId: id, strength: 1 }]), baseName(file));
}

/** Stores an image as a texture asset; returns its id for a `texture` component. */
export async function importTexture(file: File): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null); // validate it decodes
  if (!bmp) throw new Error(`${file.name} isn't an image this browser can read`);
  // Plan §7: textures ≤ 2048 px (no mipmaps, so bigger ones only alias and cost memory).
  let image: Blob = file;
  const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  if (k < 1) {
    const oc = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    oc.getContext('2d')!.drawImage(bmp, 0, 0, oc.width, oc.height);
    image = await oc.convertToBlob({ type: 'image/png' });
  }
  bmp.close();
  const id = `user:${crypto.randomUUID()}`;
  await putAsset({ id, kind: 'texture', name: file.name, image });
  return id;
}

// ─── .klook share format ────────────────────────────────────────────────────

interface KlookFile {
  format: 'klook';
  version: 1;
  recipe: unknown;
  assets: { id: string; kind: 'lut' | 'texture'; name: string; cube?: string; image?: string }[];
}

const userAssetIds = (recipe: LookRecipe) =>
  [...new Set(recipe.components.flatMap(c => ('assetId' in c && c.assetId.startsWith('user:') ? [c.assetId] : [])))];

const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
  r.readAsDataURL(b);
});

export async function exportKlook(recipe: LookRecipe): Promise<Blob> {
  const assets: KlookFile['assets'] = [];
  for (const id of userAssetIds(recipe)) {
    const a = await getUserAsset(id);
    if (!a) throw new Error(`the look uses an asset that is no longer stored (${id})`);
    assets.push({ id, kind: a.kind, name: a.name, cube: a.cube, image: a.image ? await blobToDataUrl(a.image) : undefined });
  }
  const file: KlookFile = { format: 'klook', version: 1, recipe, assets };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Imports a .klook (untrusted): validates the recipe and every asset, stores
 *  the assets under their ids and saves the look to My Looks. */
export async function importKlook(file: File): Promise<MyLook> {
  let data: Partial<KlookFile>;
  try { data = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} isn't a .klook file`); }
  if (data.format !== 'klook' || data.version !== 1) throw new Error(`${file.name} isn't a .klook file this version reads`);
  const recipe = parseRecipe(data.recipe);
  if (!recipe) throw new Error(`${file.name} has no valid look`);
  const wanted = new Set(userAssetIds(recipe));
  for (const a of Array.isArray(data.assets) ? data.assets : []) {
    if (!a || typeof a.id !== 'string' || !wanted.has(a.id) || typeof a.name !== 'string') continue;
    if (a.kind === 'lut' && typeof a.cube === 'string') {
      parseCube(a.cube);
      await putAsset({ id: a.id, kind: 'lut', name: a.name, cube: a.cube });
    } else if (a.kind === 'texture' && typeof a.image === 'string' && a.image.startsWith('data:image/')) {
      const image = await (await fetch(a.image)).blob();
      await putAsset({ id: a.id, kind: 'texture', name: a.name, image });
    } else continue;
    wanted.delete(a.id);
  }
  if (wanted.size) throw new Error(`${file.name} is missing ${wanted.size} of its assets`);
  return saveMyLook({ ...recipe, id: crypto.randomUUID() }, recipe.name);
}
