/**
 * Assets Manager — duplicate detection (plan Task 20) on the dHash computed
 * with the thumbnail: near-identical images differ by a few bits. ("Find
 * similar", T21, waits on the owner's phash-vs-embeddings decision.) Grouping is single-link (union-find), so a chain of close
 * images lands in one group for review. Nothing here deletes: resolving
 * duplicates is the user's call (soft-delete, T15, is owner-gated).
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

