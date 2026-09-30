/**
 * Assets Manager — duplicate detection (plan Task 20) and find-similar (Task 21 v1)
 * on the dHash computed with the thumbnail: near-identical images differ by a
 * few bits. Grouping is single-link (union-find), so a chain of close images
 * lands in one group for review. Nothing here deletes; resolving duplicates is
 * the user's call (Move to Trash, from the grid).
 */
import { hamming } from './assetFacts';

export interface Hashed { id: string; dhash: string }

export function groupDuplicates(items: Hashed[], threshold = 5): string[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hamming(items[i].dhash, items[j].dhash) <= threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, string[]>();
  items.forEach((it, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), it.id]); });
  return [...groups.values()].filter(g => g.length > 1);
}


/** Nearest images to `target` by dHash distance, closest first (excluding itself).
 *  v1 of "find similar": local and instant; embeddings can replace it later. */
export function findSimilar(target: Hashed, items: Hashed[], limit = 48, maxDistance = 14): { id: string; distance: number }[] {
  return items
    .filter(it => it.id !== target.id)
    .map(it => ({ id: it.id, distance: hamming(target.dhash, it.dhash) }))
    .filter(r => r.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
