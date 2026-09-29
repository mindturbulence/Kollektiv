/**
 * Assets Manager — batch rename (plan Task 13). Pure planning: tokens render
 * into new names, and the plan is validated (illegal characters, duplicate
 * targets, collisions with other files) before anything touches the disk, so
 * the preview table is exactly what Apply does.
 *
 * Tokens: {name} {ext} {index} {date} {width} {height} {rating} {label}.
 * The extension is kept unless the pattern contains {ext}.
 */
import type { AssetEntry } from './assetFilter';

export interface RenamePlanItem { entry: AssetEntry; newName: string; error?: string }

const ILLEGAL = /[\/:*?"<>|\u0000-\u001f]/;

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const isoDate = (ms?: number) => {
  if (!ms) return 'nodate';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
};

export function renderName(pattern: string, e: AssetEntry, index: number, indexWidth: number): string {
  const dot = e.file.name.lastIndexOf('.');
  const stem = dot > 0 ? e.file.name.slice(0, dot) : e.file.name;
  const ext = dot > 0 ? e.file.name.slice(dot + 1) : '';
  const out = pattern.replace(/\{(name|ext|index|date|width|height|rating|label)\}/g, (_, t: string) => {
    switch (t) {
      case 'name': return stem;
      case 'ext': return ext;
      case 'index': return pad(index, indexWidth);
      case 'date': return isoDate(e.facts?.mtime);
      case 'width': return String(e.facts?.width ?? 0);
      case 'height': return String(e.facts?.height ?? 0);
      case 'rating': return String(e.meta?.rating ?? 0);
      case 'label': return e.meta?.label ?? 'none';
      default: return '';
    }
  }).trim();
  return pattern.includes('{ext}') || !ext ? out : `${out}.${ext}`;
}

/**
 * Plans the rename of `entries` (all in one folder). `otherNames` are the
 * folder's names that aren't being renamed — a target equal to one of them is
 * a conflict. Names that swap within the batch are fine (applied in two phases).
 */
export function planRename(entries: AssetEntry[], pattern: string, start: number, otherNames: Iterable<string>): RenamePlanItem[] {
  const width = Math.max(2, String(start + entries.length - 1).length);
  const others = new Set([...otherNames].map(n => n.toLowerCase()));
  const plan = entries.map((entry, i) => ({ entry, newName: renderName(pattern, entry, start + i, width) } as RenamePlanItem));
  const seen = new Map<string, number>();
  for (const p of plan) seen.set(p.newName.toLowerCase(), (seen.get(p.newName.toLowerCase()) ?? 0) + 1);
  for (const p of plan) {
    const key = p.newName.toLowerCase();
    if (!p.newName || /^\.+$/.test(p.newName)) p.error = 'empty name';
    else if (ILLEGAL.test(p.newName)) p.error = 'contains \ / : * ? " < > |';
    else if ((seen.get(key) ?? 0) > 1) p.error = 'same name as another file in this batch';
    else if (others.has(key)) p.error = 'a file with this name already exists';
  }
  return plan;
}

export const planIsValid = (plan: RenamePlanItem[]) => plan.length > 0 && plan.every(p => !p.error);
