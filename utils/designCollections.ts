/**
 * designCollections — pure tree logic for Web Design Library collections ({id, name, parentId?, order}).
 * Hand-edited manifests can hold dangling parents, self-parents and cycles; nothing here may loop or drop an entry:
 * a missing/self parent counts as root, and a cycle is broken at its first entry by order.
 */

import type { DesignCollection, DesignRecipe } from '../types';

export interface CollectionNode {
  collection: DesignCollection;
  depth: number;
  children: CollectionNode[];
}

/** Sidebar selection: a collection id, or the virtual views 'all' / 'unsorted'. */
export type CollectionSelection = string;

const byOrder = (a: DesignCollection, b: DesignCollection) => a.order - b.order || a.name.localeCompare(b.name);

const uniqueById = (collections: DesignCollection[]): DesignCollection[] => [...new Map(collections.map((c) => [c.id, c])).values()];

/** parentId when it points at another existing collection, else undefined (= root). */
const effectiveParent = (c: DesignCollection, ids: Set<string>): string | undefined =>
  c.parentId && c.parentId !== c.id && ids.has(c.parentId) ? c.parentId : undefined;

const childrenByParent = (collections: DesignCollection[]): Map<string | undefined, DesignCollection[]> => {
  const ids = new Set(collections.map((c) => c.id));
  const map = new Map<string | undefined, DesignCollection[]>();
  for (const c of collections) {
    const key = effectiveParent(c, ids);
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  for (const list of map.values()) list.sort(byOrder);
  return map;
};

/** Nested tree, siblings sorted by order then name. Every collection appears exactly once. */
export function buildTree(collections: DesignCollection[]): CollectionNode[] {
  const unique = uniqueById(collections);
  const kids = childrenByParent(unique);
  const seen = new Set<string>();
  const grow = (c: DesignCollection, depth: number): CollectionNode => {
    seen.add(c.id);
    const children: CollectionNode[] = [];
    for (const k of kids.get(c.id) ?? []) if (!seen.has(k.id)) children.push(grow(k, depth + 1));
    return { collection: c, depth, children };
  };
  const roots = (kids.get(undefined) ?? []).map((c) => grow(c, 0));
  // Entries only reachable through a cycle: surface them as roots instead of losing them.
  for (const c of [...unique].sort(byOrder)) if (!seen.has(c.id)) roots.push(grow(c, 0));
  return roots;
}

/** Depth-first flattening in display order (for indented <select> lists). */
export function flattenTree(nodes: CollectionNode[]): { collection: DesignCollection; depth: number }[] {
  return nodes.flatMap((n) => [{ collection: n.collection, depth: n.depth }, ...flattenTree(n.children)]);
}

/** All collections nested under `id` at any depth (never `id` itself), cycle-safe. */
export function descendantIds(collections: DesignCollection[], id: string): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop();
    for (const c of collections) {
      if (c.parentId === cur && c.id !== id && !out.has(c.id)) {
        out.add(c.id);
        queue.push(c.id);
      }
    }
  }
  return out;
}

/** True when `id` sits anywhere below `ancestorId`. */
export const isDescendant = (collections: DesignCollection[], id: string, ancestorId: string): boolean =>
  descendantIds(collections, ancestorId).has(id);

/** Case-insensitive, trimmed name clash among the children of `parentId` (undefined = root). `excludeId` skips one entry (rename/move/delete). */
export function siblingNameTaken(collections: DesignCollection[], name: string, parentId: string | undefined, excludeId?: string): boolean {
  const ids = new Set(collections.map((c) => c.id));
  const wanted = name.trim().toLowerCase();
  return collections.some(
    (c) => c.id !== excludeId && effectiveParent(c, ids) === parentId && c.name.trim().toLowerCase() === wanted,
  );
}

/** What deleting `id` moves up one level: its direct recipes and direct sub-collections. */
export function countAffected(collections: DesignCollection[], recipes: DesignRecipe[], id: string): { recipes: number; subCollections: number } {
  const ids = new Set(collections.map((c) => c.id));
  return {
    recipes: recipes.filter((r) => r.collectionId === id).length,
    subCollections: collections.filter((c) => c.id !== id && effectiveParent(c, ids) === id).length,
  };
}

/** The parent a promoted entry lands under when `id` is deleted (undefined = root). */
export function parentOfCollection(collections: DesignCollection[], id: string): string | undefined {
  const target = collections.find((c) => c.id === id);
  return target ? effectiveParent(target, new Set(collections.map((c) => c.id))) : undefined;
}

/** Next `order` value for a new/moved entry among the children of `parentId`. */
export function nextOrder(collections: DesignCollection[], parentId: string | undefined, excludeId?: string): number {
  const ids = new Set(collections.map((c) => c.id));
  return collections
    .filter((c) => c.id !== excludeId && effectiveParent(c, ids) === parentId)
    .reduce((max, c) => Math.max(max, c.order), -1) + 1;
}

/** The recipe's collection when it still exists; an orphaned id counts as Unsorted. */
const liveCollectionId = (r: DesignRecipe, ids: Set<string>): string | undefined =>
  r.collectionId && ids.has(r.collectionId) ? r.collectionId : undefined;

/** Recipes shown for a sidebar selection: a collection includes its descendants; unknown selections behave as "all". */
export function inCollection(recipes: DesignRecipe[], collections: DesignCollection[], selection: CollectionSelection): DesignRecipe[] {
  const ids = new Set(collections.map((c) => c.id));
  if (selection === 'unsorted') return recipes.filter((r) => !liveCollectionId(r, ids));
  if (!ids.has(selection)) return recipes;
  const scope = descendantIds(collections, selection).add(selection);
  return recipes.filter((r) => scope.has(liveCollectionId(r, ids) ?? ''));
}

/** Recipes per collection id, each count including every descendant. */
export function recipeCounts(collections: DesignCollection[], recipes: DesignRecipe[]): Map<string, number> {
  return new Map(collections.map((c) => [c.id, inCollection(recipes, collections, c.id).length]));
}
