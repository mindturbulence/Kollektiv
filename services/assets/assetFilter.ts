/**
 * Assets Manager — filter + sort (plan Task 7). Pure: criteria compose with
 * AND; text matches the file name, tags and caption (case-insensitive).
 */
import type { AssetFacts } from './assetFacts';
import type { AssetMeta, FilterCriteria } from './assetLibrary';
import type { AssetFile } from './types';

export interface AssetEntry { file: AssetFile; facts?: AssetFacts; meta?: AssetMeta }

export type SortKey = 'name' | 'date' | 'size' | 'dimensions' | 'rating';

export function matches(e: AssetEntry, c: FilterCriteria): boolean {
  const m = e.meta ?? {};
  if (c.minRating && (m.rating ?? 0) < c.minRating) return false;
  if (c.labels?.length && (!m.label || !c.labels.includes(m.label))) return false;
  if (c.tags?.length && !c.tags.every(t => m.tags?.some(x => x.toLowerCase() === t.toLowerCase()))) return false;
  if (c.exts?.length && !c.exts.includes(e.file.ext)) return false;
  const mtime = e.facts?.mtime;
  if (c.from !== undefined && (mtime === undefined || mtime < c.from)) return false;
  if (c.to !== undefined && (mtime === undefined || mtime > c.to)) return false;
  const q = c.text?.trim().toLowerCase();
  if (q) {
    const hay = [e.file.name, ...(m.tags ?? []), m.caption ?? ''].join('\n').toLowerCase();
    if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

export function isEmptyCriteria(c: FilterCriteria): boolean {
  return !c.text?.trim() && !c.minRating && !c.labels?.length && !c.tags?.length && !c.exts?.length && c.from === undefined && c.to === undefined;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortEntries(list: AssetEntry[], key: SortKey, descending = false): AssetEntry[] {
  const val = (e: AssetEntry): number | string => {
    switch (key) {
      case 'name': return e.file.name;
      case 'date': return e.facts?.mtime ?? 0;
      case 'size': return e.facts?.size ?? 0;
      case 'dimensions': return (e.facts?.width ?? 0) * (e.facts?.height ?? 0);
      case 'rating': return e.meta?.rating ?? 0;
    }
  };
  const out = [...list].sort((a, b) => {
    const va = val(a), vb = val(b);
    const d = typeof va === 'string' ? collator.compare(va, vb as string) : (va) - (vb as number);
    return d !== 0 ? d : collator.compare(a.file.name, b.file.name);
  });
  return descending ? out.reverse() : out;
}
