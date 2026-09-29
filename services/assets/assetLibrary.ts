/**
 * Assets Manager — user-authored data (plan Tasks 5, 7, 8, 10–12).
 *
 * Ratings, colour labels, tags, captions, copyright, saved filters, collections
 * and stacks: the only things a user can't recompute, so the only things in
 * the vault manifest `kollektiv_assets_index.json` (loadManifestSafe +
 * stampSchemaVersion). Recomputable facts live in assetFacts.ts (IndexedDB).
 *
 * The library works without a vault — in memory, with an honest "not saved"
 * status — and degrades to read-only when the manifest exists but can't be
 * read (ManifestWriteBlockedError). Ids are `${rootId}:${path}`; `relocate`
 * is the one place an id changes (rename, move, undo).
 */
import { fileSystemManager } from '../../utils/fileUtils';
import { loadManifestSafe, stampSchemaVersion } from '../../utils/manifestStore';

export const COLOR_LABELS = ['red', 'yellow', 'green', 'blue', 'purple'] as const;
export type ColorLabel = typeof COLOR_LABELS[number];

export interface AssetMeta {
  rating?: number;        // 1–5; absent = unrated
  label?: ColorLabel;
  tags?: string[];
  caption?: string;
  copyright?: string;
}

export interface FilterCriteria {
  text?: string;
  minRating?: number;
  labels?: ColorLabel[];
  tags?: string[];
  exts?: string[];
  /** Inclusive, epoch ms, on the file's modification time. */
  from?: number;
  to?: number;
}

export interface SavedFilter { id: string; name: string; criteria: FilterCriteria }
export interface Collection { id: string; name: string; ids: string[] }
/** ids[0] is the stack's top (the card that stays visible). */
export interface Stack { id: string; ids: string[] }

export interface LibraryData {
  assets: Record<string, AssetMeta>;
  filters: SavedFilter[];
  collections: Collection[];
  stacks: Stack[];
}

export type LibraryStatus =
  | { kind: 'saved' }
  | { kind: 'no-vault' }          // works in memory; nothing persisted
  | { kind: 'read-only'; reason: string };

export const INDEX_MANIFEST = 'kollektiv_assets_index.json';

const empty = (): LibraryData => ({ assets: {}, filters: [], collections: [], stacks: [] });

// ── Pure helpers (unit-tested) ──────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Validates an untrusted manifest; null when it isn't one. */
export function parseLibrary(raw: any): LibraryData | null {
  if (!raw || typeof raw !== 'object' || typeof raw.assets !== 'object' || raw.assets === null) return null;
  const assets: Record<string, AssetMeta> = {};
  for (const [id, m] of Object.entries(raw.assets as Record<string, any>)) {
    if (!m || typeof m !== 'object') continue;
    const meta: AssetMeta = {};
    if (typeof m.rating === 'number' && m.rating >= 1 && m.rating <= 5) meta.rating = Math.round(m.rating);
    if ((COLOR_LABELS as readonly unknown[]).includes(m.label)) meta.label = m.label;
    const tags = strList(m.tags);
    if (tags.length) meta.tags = tags;
    if (str(m.caption)) meta.caption = m.caption;
    if (str(m.copyright)) meta.copyright = m.copyright;
    if (Object.keys(meta).length) assets[id] = meta;
  }
  const byId = (x: any) => x && typeof x === 'object' && typeof x.id === 'string';
  return {
    assets,
    filters: (Array.isArray(raw.filters) ? raw.filters : []).filter((f: any) => byId(f) && typeof f.name === 'string' && f.criteria && typeof f.criteria === 'object'),
    collections: (Array.isArray(raw.collections) ? raw.collections : []).filter((c: any) => byId(c) && typeof c.name === 'string')
      .map((c: any) => ({ id: c.id, name: c.name, ids: strList(c.ids) })),
    stacks: (Array.isArray(raw.stacks) ? raw.stacks : []).filter(byId)
      .map((s: any) => ({ id: s.id, ids: strList(s.ids) })).filter((s: Stack) => s.ids.length > 1),
  };
}

/** Re-keys one asset everywhere it's referenced (metadata, collections, stacks). */
export function relocateIn(data: LibraryData, oldId: string, newId: string): LibraryData {
  if (oldId === newId) return data;
  const assets = { ...data.assets };
  if (assets[oldId]) { assets[newId] = assets[oldId]; delete assets[oldId]; }
  const swap = (ids: string[]) => ids.map(i => (i === oldId ? newId : i));
  return {
    ...data,
    assets,
    collections: data.collections.map(c => (c.ids.includes(oldId) ? { ...c, ids: swap(c.ids) } : c)),
    stacks: data.stacks.map(s => (s.ids.includes(oldId) ? { ...s, ids: swap(s.ids) } : s)),
  };
}

/** Copies an asset's metadata to a new id (copy keeps ratings/tags; the copy joins no collection). */
export function copyMetaIn(data: LibraryData, fromId: string, toId: string): LibraryData {
  const m = data.assets[fromId];
  return m ? { ...data, assets: { ...data.assets, [toId]: { ...m } } } : data;
}

// ── Store ───────────────────────────────────────────────────────────────

let _data: LibraryData = empty();
let _status: LibraryStatus = { kind: 'no-vault' };
let _loaded: Promise<void> | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | undefined;
const _listeners = new Set<() => void>();
const emit = () => _listeners.forEach(fn => fn());

export const getLibrary = (): LibraryData => _data;
export const getLibraryStatus = (): LibraryStatus => _status;
export function subscribeLibrary(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Loads the manifest once per session (a vault connected later is picked up by `reloadLibrary`). */
export function loadLibrary(): Promise<void> {
  // A vault connected after a no-vault load: switch to it (session-only edits
  // were shown as unsaved and are dropped).
  if (_status.kind === 'no-vault' && _loaded && fileSystemManager.isDirectorySelected()) _loaded = null;
  return (_loaded ??= reloadLibrary());
}

export async function reloadLibrary(): Promise<void> {
  if (!fileSystemManager.isDirectorySelected()) {
    _status = { kind: 'no-vault' };
    emit();
    return;
  }
  const { data, safeToSave } = await loadManifestSafe<LibraryData>(INDEX_MANIFEST, parseLibrary, empty);
  _data = data;
  _status = safeToSave ? { kind: 'saved' } : { kind: 'read-only', reason: `${INDEX_MANIFEST} exists but could not be read — repair it in Settings > Neural Integrity. Changes stay in this session.` };
  emit();
}

function scheduleSave(): void {
  if (_status.kind !== 'saved') return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { void flushLibrary(); }, 800);
}

/** Writes the manifest now (also used by tests and before handoffs). */
export async function flushLibrary(): Promise<void> {
  clearTimeout(_saveTimer);
  if (_status.kind !== 'saved') return;
  try {
    const body = JSON.stringify(stampSchemaVersion(_data as unknown as Record<string, unknown>));
    await fileSystemManager.saveFile(INDEX_MANIFEST, new Blob([body], { type: 'application/json' }));
  } catch (e) {
    _status = { kind: 'read-only', reason: `Couldn't save ${INDEX_MANIFEST}: ${e instanceof Error ? e.message : String(e)}. Changes stay in this session.` };
    emit();
  }
}

function commit(next: LibraryData): void {
  _data = next;
  emit();
  scheduleSave();
}

export function updateMeta(ids: string[], patch: Partial<AssetMeta> | ((m: AssetMeta) => AssetMeta)): void {
  const assets = { ..._data.assets };
  for (const id of ids) {
    const cur = assets[id] ?? {};
    const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch };
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length) && v !== '')) as AssetMeta;
    if (Object.keys(cleaned).length) assets[id] = cleaned; else delete assets[id];
  }
  commit({ ..._data, assets });
}

export function relocate(oldId: string, newId: string): void { commit(relocateIn(_data, oldId, newId)); }
export function copyMeta(fromId: string, toId: string): void { commit(copyMetaIn(_data, fromId, toId)); }

export function saveFilter(name: string, criteria: FilterCriteria): void {
  commit({ ..._data, filters: [..._data.filters.filter(f => f.name !== name), { id: crypto.randomUUID(), name, criteria }] });
}
export function deleteFilter(id: string): void { commit({ ..._data, filters: _data.filters.filter(f => f.id !== id) }); }

export function createCollection(name: string, ids: string[]): Collection {
  const c = { id: crypto.randomUUID(), name, ids: [...new Set(ids)] };
  commit({ ..._data, collections: [..._data.collections, c] });
  return c;
}
export function addToCollection(collectionId: string, ids: string[]): void {
  commit({ ..._data, collections: _data.collections.map(c => (c.id === collectionId ? { ...c, ids: [...new Set([...c.ids, ...ids])] } : c)) });
}
export function removeFromCollection(collectionId: string, ids: string[]): void {
  commit({ ..._data, collections: _data.collections.map(c => (c.id === collectionId ? { ...c, ids: c.ids.filter(i => !ids.includes(i)) } : c)) });
}
export function deleteCollection(id: string): void { commit({ ..._data, collections: _data.collections.filter(c => c.id !== id) }); }

/** Stacks the ids (first = top); an id already in another stack moves to this one. */
export function createStack(ids: string[]): void {
  const unique = [...new Set(ids)];
  if (unique.length < 2) return;
  const others = _data.stacks.map(s => ({ ...s, ids: s.ids.filter(i => !unique.includes(i)) })).filter(s => s.ids.length > 1);
  commit({ ..._data, stacks: [...others, { id: crypto.randomUUID(), ids: unique }] });
}
export function unstack(stackId: string): void { commit({ ..._data, stacks: _data.stacks.filter(s => s.id !== stackId) }); }
