import { parse, stringify } from 'yaml';
import { DESIGN_HEADINGS, EST_MARKER, REQUIRED_FRONT_MATTER } from './designSpec';

export type ColorRow = { name: string; value: string };

export type FrontMatterSplit = {
  /** Editable rows of `colors`, or null when `colors` is not a flat name -> string map (then it stays in `other`). */
  colors: ColorRow[] | null;
  /** Every other front matter key, in original order. */
  other: Record<string, unknown>;
  /** Where `colors` sat among the original keys, so a rebuild keeps the key order. */
  colorsAt: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function splitFrontMatter(fm: Record<string, unknown>): FrontMatterSplit {
  const keys = Object.keys(fm);
  const raw = fm.colors;
  if ('colors' in fm && !(isRecord(raw) && Object.values(raw).every((v) => typeof v === 'string'))) {
    return { colors: null, other: { ...fm }, colorsAt: 0 };
  }
  const idx = keys.indexOf('colors');
  return {
    colors: isRecord(raw) ? Object.entries(raw).map(([name, value]) => ({ name, value: String(value) })) : [],
    other: Object.fromEntries(Object.entries(fm).filter(([k]) => k !== 'colors')),
    colorsAt: idx < 0 ? keys.length : idx,
  };
}

/** Inverse of splitFrontMatter. Rows without a name are dropped; an empty colour map omits the `colors` key. */
export function rebuildFrontMatter({ colors, other, colorsAt }: FrontMatterSplit): Record<string, unknown> {
  if (colors === null) return { ...other };
  const map = Object.fromEntries(colors.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.value]));
  const entries = Object.entries(other);
  if (Object.keys(map).length > 0) entries.splice(colorsAt, 0, ['colors', map]);
  return Object.fromEntries(entries);
}

/** YAML text for the "other tokens" textarea; empty when there are none. */
export const otherToYaml = (other: Record<string, unknown>): string =>
  Object.keys(other).length === 0 ? '' : stringify(other);

export type OtherParse = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

/** Parses the textarea. `colorsInForm` = the Colors form owns `colors`, so the key may not appear here too. */
export function parseOtherTokens(text: string, colorsInForm: boolean): OtherParse {
  let value: unknown;
  try {
    value = parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (value === null || value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return { ok: false, error: 'Tokens must be a YAML mapping (key: value pairs).' };
  if (colorsInForm && 'colors' in value) return { ok: false, error: 'Edit colors in the Colors form, not here.' };
  return { ok: true, value };
}

/** First problem with the colour rows, or null. Fully blank rows are ignored. */
export function validateColors(rows: ColorRow[]): string | null {
  const seen = new Set<string>();
  for (const { name, value } of rows) {
    const n = name.trim();
    if (!n) {
      if (value.trim()) return 'Every color needs a name.';
      continue;
    }
    if (seen.has(n)) return `Color name "${n}" is used twice.`;
    seen.add(n);
  }
  return null;
}

/** Key paths of the leaves (strings, numbers, nulls) that match `test`, e.g. "colors.accent", "spacing[1]". */
const findLeaves = (value: unknown, test: (leaf: unknown) => boolean, path = ''): string[] => {
  if (Array.isArray(value)) return value.flatMap((v, i) => findLeaves(v, test, `${path}[${i}]`));
  if (isRecord(value)) return Object.entries(value).flatMap(([k, v]) => findLeaves(v, test, path ? `${path}.${k}` : k));
  return test(value) ? [path] : [];
};

/** Key paths whose string value still carries a guess marker such as "(est.)". */
export const findEstimated = (value: unknown): string[] =>
  findLeaves(value, (v) => typeof v === 'string' && v.search(EST_MARKER) >= 0);

/** Key paths with no value — typically an unquoted `#hex`, which YAML reads as a comment. */
export const findEmptyTokens = (value: unknown): string[] => findLeaves(value, (v) => v === null);

export const missingFrontMatter = (fm: Record<string, unknown>): string[] =>
  REQUIRED_FRONT_MATTER.filter((k) => !(k in fm));

/** One draft text per standard heading (empty when absent) in heading order, then any extra sections found. */
export function sectionDrafts(sections: Record<string, string>): Record<string, string> {
  const known = new Set<string>(DESIGN_HEADINGS);
  return {
    ...Object.fromEntries(DESIGN_HEADINGS.map((h) => [h, sections[h] ?? ''])),
    ...Object.fromEntries(Object.entries(sections).filter(([k]) => !known.has(k))),
  };
}

/** Trimmed, non-empty sections only (an empty section is the same as a missing one). */
export const compactSections = (drafts: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(drafts).map(([k, v]) => [k, v.trim()] as const).filter(([, v]) => v));
