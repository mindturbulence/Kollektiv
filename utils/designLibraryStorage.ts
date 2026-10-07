/**
 * designLibraryStorage — Web Design Library recipes on the manifest pattern (see workflowStorage).
 * Index: kollektiv_design_library_manifest.json. Per recipe: design-library/<id>/{DESIGN.md, refs/<n>.<ext>}.
 * Files are always written before the manifest and deleted (and verified gone) before the manifest entry
 * is removed, so the index can never point at nothing or hide files that still exist.
 */

import { fileSystemManager } from './fileUtils';
import { loadManifestSafe, ManifestWriteBlockedError, stampSchemaVersion, type ManifestLoad } from './manifestStore';
import { parseDesignSpec, serializeDesignSpec, specOverview, type DesignSpec } from './designSpec';
import { deriveRecipeTokens } from './designRecipeTokens';
import { planRecovery, type RecoveryFolder } from './designRecovery';
import { isDescendant, nextOrder, parentOfCollection, siblingNameTaken } from './designCollections';
import type { DesignCollection, DesignRecipe, RecipePageType } from '../types';

const MANIFEST_NAME = 'kollektiv_design_library_manifest.json';
const LIBRARY_DIR = 'design-library';

// type alias (not interface) so it satisfies stampSchemaVersion's Record<string, unknown> constraint without a cast
type DesignLibraryManifest = { recipes: DesignRecipe[]; collections: DesignCollection[] };

const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

const isRecipe = (r: unknown): r is DesignRecipe =>
  isObj(r) &&
  typeof r.id === 'string' && !!r.id &&
  typeof r.title === 'string' &&
  typeof r.pageType === 'string' &&
  typeof r.createdAt === 'number' &&
  typeof r.updatedAt === 'number' &&
  typeof r.overview === 'string' &&
  Array.isArray(r.tags) && r.tags.every((t: unknown) => typeof t === 'string') &&
  Array.isArray(r.refs) && r.refs.every((p: unknown) => typeof p === 'string');

/** palette/fonts are optional index data: a malformed field becomes undefined (re-derived on load), non-string entries are dropped. */
const stringsOrUndefined = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

const withCleanTokens = (r: DesignRecipe): DesignRecipe => {
  r.palette = stringsOrUndefined(r.palette);
  r.fonts = stringsOrUndefined(r.fonts);
  return r;
};

const isCollection = (c: unknown): c is DesignCollection =>
  isObj(c) && typeof c.id === 'string' && !!c.id && typeof c.name === 'string' && typeof c.order === 'number';

const getManifest = (): Promise<ManifestLoad<DesignLibraryManifest>> =>
  loadManifestSafe<DesignLibraryManifest>(
    MANIFEST_NAME,
    (parsed) => {
      if (!isObj(parsed)) return null;
      return {
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes.filter(isRecipe).map(withCleanTokens) : [],
        collections: Array.isArray(parsed.collections) ? parsed.collections.filter(isCollection) : [],
      };
    },
    () => ({ recipes: [], collections: [] }),
  );

/** Load for a mutation: throws before any file is touched if the manifest could not be read safely. */
const getManifestForWrite = async (): Promise<ManifestLoad<DesignLibraryManifest>> => {
  const loaded = await getManifest();
  if (!loaded.safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
  return loaded;
};

const saveManifest = async ({ data, safeToSave }: ManifestLoad<DesignLibraryManifest>): Promise<void> => {
  if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
  await fileSystemManager.saveFile(
    MANIFEST_NAME,
    new Blob([JSON.stringify(stampSchemaVersion(data), null, 2)], { type: 'application/json' }),
  );
};

const recipeDir = (id: string) => `${LIBRARY_DIR}/${id}`;
const specPath = (id: string) => `${recipeDir(id)}/DESIGN.md`;

const findRecipe = (m: DesignLibraryManifest, id: string): DesignRecipe => {
  const recipe = m.recipes.find((r) => r.id === id);
  if (!recipe) throw new Error(`Design recipe not found: ${id}`);
  return recipe;
};

const findCollection = (m: DesignLibraryManifest, id: string): DesignCollection => {
  const collection = m.collections.find((c) => c.id === id);
  if (!collection) throw new Error(`Design collection not found: ${id}`);
  return collection;
};

/** Trims and rejects empty names and clashes among siblings (case-insensitive). */
const checkCollectionName = (m: DesignLibraryManifest, rawName: string, parentId: string | undefined, excludeId?: string): string => {
  const name = rawName.trim();
  if (!name) throw new Error('A collection name is required.');
  if (siblingNameTaken(m.collections, name, parentId, excludeId)) {
    throw new Error(`A collection named "${name}" already exists ${parentId ? `in "${findCollection(m, parentId).name}"` : 'at the top level'}.`);
  }
  return name;
};

/** deleteFile swallows errors, so confirm the file is really gone. */
const deleteVerified = async (path: string): Promise<void> => {
  await fileSystemManager.deleteFile(path);
  if (await fileSystemManager.fileExists(path)) throw new Error(`Failed to delete ${path}: file still present`);
};

const nextRefNumber = (existing: string[]): number =>
  existing.reduce((max, p) => {
    const n = parseInt(p.split('/').pop() ?? '', 10);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0) + 1;

/** Writes ref blobs and returns their vault-relative paths. Validates every blob before writing any. */
const writeRefs = async (id: string, existing: string[], refs: { name: string; blob: Blob }[]): Promise<string[]> => {
  for (const { name, blob } of refs) {
    if (!EXT_BY_TYPE[blob.type]) throw new Error(`Unsupported reference image type "${blob.type}" for ${name} (use PNG, JPEG or WebP)`);
  }
  let n = nextRefNumber(existing);
  const paths: string[] = [];
  for (const { blob } of refs) {
    const path = `${recipeDir(id)}/refs/${n++}.${EXT_BY_TYPE[blob.type]}`;
    await fileSystemManager.saveFile(path, blob);
    paths.push(path);
  }
  return paths;
};

export function generateRecipeId(): string {
  return `dr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateCollectionId(): string {
  return `dc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

type RecipeTokens = ReturnType<typeof deriveRecipeTokens>;

const needsTokens = (r: DesignRecipe): boolean => r.palette === undefined || r.fonts === undefined;

/** Palette/fonts from the recipe's DESIGN.md; null when it is missing or unparseable (the recipe is then left underived). */
const deriveFromDisk = async (id: string): Promise<RecipeTokens | null> => {
  try {
    const raw = await fileSystemManager.readFile(specPath(id));
    return raw == null ? null : deriveRecipeTokens(parseDesignSpec(raw).spec.frontMatter);
  } catch {
    return null;
  }
};

/** Sets derived tokens on recipes that still lack them (never touches updatedAt or order). Returns how many changed. */
const applyTokens = (recipes: DesignRecipe[], derived: Map<string, RecipeTokens>): number => {
  let changed = 0;
  for (const r of recipes) {
    const tokens = derived.get(r.id);
    if (!tokens || !needsTokens(r)) continue;
    r.palette = tokens.palette;
    r.fonts = tokens.fonts;
    changed++;
  }
  return changed;
};

/**
 * Recipes saved before SD-03 lack palette/fonts. Derive them once from DESIGN.md and persist with a single manifest
 * write. Recipes whose DESIGN.md cannot be read stay underived (retried on the next load, never written).
 */
export async function loadDesignLibrary(): Promise<{ recipes: DesignRecipe[]; collections: DesignCollection[]; safeToSave: boolean }> {
  const first = await getManifest();
  const derived = new Map<string, RecipeTokens>();
  for (const r of first.data.recipes.filter(needsTokens)) {
    const tokens = await deriveFromDisk(r.id);
    if (tokens) derived.set(r.id, tokens);
  }
  if (!derived.size) return { recipes: first.data.recipes, collections: first.data.collections, safeToSave: first.safeToSave };

  // Re-read so a manifest write that landed while the DESIGN.md files were read is not overwritten.
  const fresh = await getManifest();
  const target = fresh.safeToSave ? fresh : first;
  const changed = applyTokens(target.data.recipes, derived);
  if (fresh.safeToSave && changed) await saveManifest(fresh);
  return { recipes: target.data.recipes, collections: target.data.collections, safeToSave: fresh.safeToSave };
}

export async function addCollection(name: string, parentId?: string): Promise<DesignCollection> {
  const loaded = await getManifestForWrite();
  if (parentId) findCollection(loaded.data, parentId);
  const collection: DesignCollection = {
    id: generateCollectionId(),
    name: checkCollectionName(loaded.data, name, parentId),
    ...(parentId ? { parentId } : {}),
    order: nextOrder(loaded.data.collections, parentId),
  };
  loaded.data.collections.push(collection);
  await saveManifest(loaded);
  return collection;
}

export async function renameCollection(id: string, name: string): Promise<DesignCollection> {
  const loaded = await getManifestForWrite();
  const collection = findCollection(loaded.data, id);
  collection.name = checkCollectionName(loaded.data, name, parentOfCollection(loaded.data.collections, id), id);
  await saveManifest(loaded);
  return collection;
}

/** Re-parent (undefined = top level). Rejects moving a collection into itself or its own descendant. */
export async function moveCollection(id: string, parentId: string | undefined): Promise<DesignCollection> {
  const loaded = await getManifestForWrite();
  const collection = findCollection(loaded.data, id);
  if (parentId) {
    findCollection(loaded.data, parentId);
    if (parentId === id || isDescendant(loaded.data.collections, parentId, id)) {
      throw new Error(`Cannot move "${collection.name}" into itself or one of its own sub-collections.`);
    }
  }
  checkCollectionName(loaded.data, collection.name, parentId, id);
  collection.order = nextOrder(loaded.data.collections, parentId, id);
  if (parentId) collection.parentId = parentId;
  else delete collection.parentId;
  await saveManifest(loaded);
  return collection;
}

/** Manifest-only reorder: applies `order` from the given entries to collections that still exist; unknown ids are ignored. */
export async function saveCollectionsOrder(ordered: Pick<DesignCollection, 'id' | 'order'>[]): Promise<void> {
  const loaded = await getManifestForWrite();
  const orderById = new Map(ordered.map((c) => [c.id, c.order]));
  for (const c of loaded.data.collections) c.order = orderById.get(c.id) ?? c.order;
  await saveManifest(loaded);
}

/**
 * Nothing is deleted with a collection: its sub-collections and recipes move up to its parent (top level when it
 * was top-level). One manifest write. Refuses when a promoted sub-collection would clash by name with an entry
 * already at the destination (the caller reports it; the user renames one and retries).
 */
export async function deleteCollection(id: string): Promise<void> {
  const loaded = await getManifestForWrite();
  const target = findCollection(loaded.data, id);
  const { collections, recipes } = loaded.data;
  const destination = parentOfCollection(collections, id);
  const promoted = collections
    .filter((c) => c.id !== id && parentOfCollection(collections, c.id) === id)
    .sort((a, b) => a.order - b.order);
  const remaining = collections.filter((c) => c.id !== id);
  const staying = remaining.filter((c) => !promoted.includes(c));
  for (const c of promoted) {
    if (siblingNameTaken(staying, c.name, destination)) {
      throw new Error(
        `Cannot delete "${target.name}": its sub-collection "${c.name}" would clash with "${c.name}" ${destination ? `in "${findCollection(loaded.data, destination).name}"` : 'at the top level'}. Rename one of them first.`,
      );
    }
  }
  let order = nextOrder(staying, destination);
  for (const c of promoted) {
    c.order = order++;
    if (destination) c.parentId = destination;
    else delete c.parentId;
  }
  const now = Date.now();
  for (const r of recipes) {
    if (r.collectionId !== id) continue;
    r.updatedAt = now;
    if (destination) r.collectionId = destination;
    else delete r.collectionId;
  }
  loaded.data.collections = remaining;
  await saveManifest(loaded);
}

export async function createRecipe(input: {
  title: string;
  pageType: RecipePageType;
  tags?: string[];
  sourceUrl?: string;
  collectionId?: string;
  refs: { name: string; blob: Blob }[];
  spec: DesignSpec;
}): Promise<DesignRecipe> {
  const loaded = await getManifestForWrite();
  const id = generateRecipeId();
  const refs = await writeRefs(id, [], input.refs);
  await fileSystemManager.saveFile(
    specPath(id),
    new Blob([serializeDesignSpec(input.spec)], { type: 'text/markdown;charset=utf-8' }),
  );
  const now = Date.now();
  const recipe: DesignRecipe = {
    id,
    createdAt: now,
    updatedAt: now,
    title: input.title,
    pageType: input.pageType,
    tags: input.tags ?? [],
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.collectionId ? { collectionId: input.collectionId } : {}),
    refs,
    overview: specOverview(input.spec),
    ...deriveRecipeTokens(input.spec.frontMatter),
  };
  loaded.data.recipes.push(recipe);
  await saveManifest(loaded);
  return recipe;
}

export async function updateRecipe(
  id: string,
  patch: Partial<Pick<DesignRecipe, 'title' | 'pageType' | 'tags' | 'sourceUrl' | 'collectionId'>>,
  spec?: DesignSpec,
): Promise<DesignRecipe> {
  const loaded = await getManifestForWrite();
  const idx = loaded.data.recipes.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Design recipe not found: ${id}`);
  const next: DesignRecipe = { ...loaded.data.recipes[idx], ...patch, updatedAt: Date.now() };
  if (spec) {
    await fileSystemManager.saveFile(
      specPath(id),
      new Blob([serializeDesignSpec(spec)], { type: 'text/markdown;charset=utf-8' }),
    );
    next.overview = specOverview(spec);
    Object.assign(next, deriveRecipeTokens(spec.frontMatter));
  }
  loaded.data.recipes[idx] = next;
  await saveManifest(loaded);
  return next;
}

export async function addRecipeRefs(id: string, refs: { name: string; blob: Blob }[]): Promise<DesignRecipe> {
  const loaded = await getManifestForWrite();
  const recipe = findRecipe(loaded.data, id);
  recipe.refs = [...recipe.refs, ...(await writeRefs(id, recipe.refs, refs))];
  recipe.updatedAt = Date.now();
  await saveManifest(loaded);
  return recipe;
}

export async function removeRecipeRef(id: string, path: string): Promise<DesignRecipe> {
  const loaded = await getManifestForWrite();
  const recipe = findRecipe(loaded.data, id);
  if (!recipe.refs.includes(path)) throw new Error(`Reference not found on recipe ${id}: ${path}`);
  await deleteVerified(path);
  recipe.refs = recipe.refs.filter((p) => p !== path);
  recipe.updatedAt = Date.now();
  await saveManifest(loaded);
  return recipe;
}

/** Manifest-only reorder: `orderedPaths` must be exactly a permutation of the current refs; no files move. */
export async function reorderRecipeRefs(id: string, orderedPaths: string[]): Promise<DesignRecipe> {
  const loaded = await getManifestForWrite();
  const recipe = findRecipe(loaded.data, id);
  const isPermutation =
    orderedPaths.length === recipe.refs.length &&
    new Set(orderedPaths).size === orderedPaths.length &&
    orderedPaths.every((p) => recipe.refs.includes(p));
  if (!isPermutation) throw new Error(`Reorder must list exactly the current references of recipe ${id}`);
  recipe.refs = [...orderedPaths];
  recipe.updatedAt = Date.now();
  await saveManifest(loaded);
  return recipe;
}

export async function loadRecipeSpec(id: string): Promise<ReturnType<typeof parseDesignSpec>> {
  const raw = await fileSystemManager.readFile(specPath(id));
  if (raw == null) throw new Error(`DESIGN.md missing for recipe ${id}`);
  return parseDesignSpec(raw);
}

/** Names of the direct children of `path` of one kind. Providers yield nothing for a missing folder. */
const listNames = async (path: string, kind: FileSystemHandleKind): Promise<string[]> => {
  const names: string[] = [];
  for await (const handle of fileSystemManager.listDirectoryContents(path)) {
    if (handle.kind === kind) names.push(handle.name);
  }
  return names;
};

/** One recipe folder as planRecovery needs it; null = skip (DESIGN.md absent, or the existence check itself failed). */
const readFolder = async (id: string): Promise<RecoveryFolder | null> => {
  try {
    const blob = await fileSystemManager.getFileAsBlob(specPath(id));
    // getFileAsBlob returns null for "absent" and "unreadable" alike; fileExists tells them apart.
    if (!blob && !(await fileSystemManager.fileExists(specPath(id)))) return null;
    return {
      id,
      hasSpec: true,
      specText: blob ? await blob.text() : null,
      refNames: await listNames(`${recipeDir(id)}/refs`, 'file'),
      modified: blob instanceof File ? blob.lastModified : undefined,
    };
  } catch {
    return null;
  }
};

/**
 * Scans design-library/ for recipe folders not in `knownIds`. Folders are read one at a time (fine for hundreds) and only
 * the unknown ones are opened. Any listing failure yields an empty plan: this must never break the page.
 */
const scanOrphans = async (knownIds: Set<string>): Promise<ReturnType<typeof planRecovery>> => {
  const folders: RecoveryFolder[] = [];
  try {
    for (const id of await listNames(LIBRARY_DIR, 'directory')) {
      if (knownIds.has(id)) continue;
      const folder = await readFolder(id);
      if (folder) folders.push(folder);
    }
  } catch {
    return { recover: [], unreadable: [] };
  }
  return planRecovery(folders, knownIds, Date.now());
};

const idsOf = (m: DesignLibraryManifest): Set<string> => new Set(m.recipes.map((r) => r.id));

/** Recipe folders with a parseable DESIGN.md that the index does not list, plus those whose DESIGN.md cannot be read. Never throws. */
export async function findOrphanRecipes(): Promise<{ orphans: string[]; unreadable: string[] }> {
  try {
    const { recover, unreadable } = await scanOrphans(idsOf((await getManifest()).data));
    return { orphans: recover.map((r) => r.id), unreadable };
  } catch {
    return { orphans: [], unreadable: [] };
  }
}

/**
 * Adds an index entry for every orphan folder. Reads files only, never writes, moves or deletes one; existing entries
 * and collections are left as they are. The manifest is re-read just before the single write so a recipe saved during
 * the scan is neither duplicated nor overwritten.
 */
export async function rebuildIndexFromDisk(): Promise<{ recovered: number; unreadable: number }> {
  const first = await getManifestForWrite();
  const { recover, unreadable } = await scanOrphans(idsOf(first.data));
  const fresh = await getManifestForWrite();
  const known = idsOf(fresh.data);
  const added = recover.filter((r) => !known.has(r.id));
  if (added.length) {
    fresh.data.recipes.push(...added);
    await saveManifest(fresh);
  }
  return { recovered: added.length, unreadable: unreadable.length };
}

// ponytail: the now-empty design-library/<id>/ folders stay behind; fileSystemManager has no directory-removal API.
export async function deleteRecipe(id: string): Promise<void> {
  const loaded = await getManifestForWrite();
  const recipe = findRecipe(loaded.data, id);
  await deleteVerified(specPath(id));
  for (const path of recipe.refs) await deleteVerified(path);
  loaded.data.recipes = loaded.data.recipes.filter((r) => r.id !== id);
  await saveManifest(loaded);
}
