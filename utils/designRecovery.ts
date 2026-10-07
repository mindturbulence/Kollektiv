/**
 * Pure planning for SD-10: turn `design-library/<id>/` folders that the manifest does not know into index entries.
 * No I/O here; designLibraryStorage does the listing/reading and the single guarded manifest write.
 */

import { parseDesignSpec, specOverview, type DesignSpec } from './designSpec';
import { deriveRecipeTokens } from './designRecipeTokens';
import type { DesignRecipe } from '../types';

export type RecoveryFolder = {
  id: string;
  hasSpec: boolean;
  /** DESIGN.md text; null/undefined when it exists but could not be read. */
  specText?: string | null;
  /** File names inside `refs/`. */
  refNames: string[];
  /** DESIGN.md last-modified time (ms), when the provider exposes it. */
  modified?: number;
};

const REF_NAME = /\.(png|jpe?g|webp)$/i;

const leadingInt = (name: string): number => {
  const m = /^\d+/.exec(name);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
};

/** Numeric by leading integer ("2.png" before "10.png"); names without one go last; ties by name. */
const sortRefNames = (names: string[]): string[] =>
  names
    .filter((n) => REF_NAME.test(n))
    .sort((a, b) => {
      const d = leadingInt(a) - leadingInt(b);
      return Number.isNaN(d) || d === 0 ? (a < b ? -1 : a > b ? 1 : 0) : d;
    });

const parseOrNull = (text: string | null | undefined): DesignSpec | null => {
  if (text == null) return null;
  try {
    return parseDesignSpec(text).spec;
  } catch {
    return null;
  }
};

export function planRecovery(
  folders: RecoveryFolder[],
  knownIds: Set<string>,
  now: number,
): { recover: DesignRecipe[]; unreadable: string[] } {
  const recover: DesignRecipe[] = [];
  const unreadable: string[] = [];
  const seen = new Set(knownIds);
  for (const f of folders) {
    if (seen.has(f.id) || !f.hasSpec) continue;
    seen.add(f.id);
    const spec = parseOrNull(f.specText);
    if (!spec) {
      unreadable.push(f.id);
      continue;
    }
    const name = spec.frontMatter.name;
    const ts = typeof f.modified === 'number' && Number.isFinite(f.modified) ? f.modified : now;
    recover.push({
      id: f.id,
      createdAt: ts,
      updatedAt: ts,
      title: typeof name === 'string' && name.trim() ? name.trim() : f.id,
      pageType: 'other',
      tags: [],
      refs: sortRefNames(f.refNames).map((n) => `design-library/${f.id}/refs/${n}`),
      overview: specOverview(spec),
      ...deriveRecipeTokens(spec.frontMatter),
    });
  }
  return { recover, unreadable };
}
