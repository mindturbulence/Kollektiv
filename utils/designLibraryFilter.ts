import type { DesignRecipe, RecipePageType } from '../types';
import type { DesignSpec } from './designSpec';

export const RECIPE_PAGE_TYPES: RecipePageType[] = ['landing', 'dashboard', 'portfolio', 'ecommerce', 'docs', 'app', 'other'];

export interface RecipeFilter {
  query: string;
  pageType: 'all' | RecipePageType;
  /** Exact tag (case-insensitive); null/empty = no tag filter. */
  tag: string | null;
}

/** Case-insensitive substring match over title, tags and overview; page type and tag narrow further. Keeps input order. */
export function filterRecipes(recipes: DesignRecipe[], { query, pageType, tag }: RecipeFilter): DesignRecipe[] {
  const q = query.trim().toLowerCase();
  const t = tag?.toLowerCase() ?? '';
  return recipes.filter((r) => {
    if (pageType !== 'all' && r.pageType !== pageType) return false;
    if (t && !r.tags.some((x) => x.toLowerCase() === t)) return false;
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.overview.toLowerCase().includes(q) ||
      r.tags.some((x) => x.toLowerCase().includes(q))
    );
  });
}

/** Distinct tags (case-folded, first spelling kept) sorted by usage count descending, then alphabetically. */
export function collectTags(recipes: DesignRecipe[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const r of recipes) {
    for (const raw of r.tags) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.n++;
      else counts.set(key, { label, n: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((c) => c.label);
}

export type RecipeSortMode = 'recent' | 'az' | 'random';

// Small seeded PRNG so "Random" stays put across re-renders until the caller changes the seed.
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Returns a new array: newest first, A-Z by title (ties newest first), or a seeded shuffle of the input order. */
export function sortRecipes(recipes: DesignRecipe[], mode: RecipeSortMode, seed = 1): DesignRecipe[] {
  const out = [...recipes];
  if (mode === 'random') {
    const next = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  const byRecent = (a: DesignRecipe, b: DesignRecipe) => b.createdAt - a.createdAt;
  return out.sort(mode === 'az'
    ? (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || byRecent(a, b)
    : byRecent);
}

/** Distinct counts over the given recipes: colours by hex (case-insensitive), fonts by family (text before " / "). Old recipes without tokens add nothing. */
export function libraryStats(recipes: DesignRecipe[]): { recipes: number; colours: number; fonts: number } {
  const colours = new Set<string>();
  const fonts = new Set<string>();
  for (const r of recipes) {
    for (const hex of r.palette ?? []) {
      const key = typeof hex === 'string' ? hex.trim().toLowerCase() : '';
      if (key) colours.add(key);
    }
    for (const font of r.fonts ?? []) {
      const family = typeof font === 'string' ? font.split(' / ')[0].trim().toLowerCase() : '';
      if (family) fonts.add(family);
    }
  }
  return { recipes: recipes.length, colours: colours.size, fonts: fonts.size };
}

/** First n tags of a frequency-sorted list plus how many were left out. */
export function topTags(tags: string[], n: number): { shown: string[]; hiddenCount: number } {
  const k = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const shown = tags.slice(0, k);
  return { shown, hiddenCount: tags.length - shown.length };
}

/** Minimal spec for a freshly ingested recipe; the vision draft or the user fills it in later. */
export const emptyRecipeSpec = (title: string): DesignSpec => ({
  frontMatter: { name: title },
  sections: { Overview: '' },
});

/** Comma-separated tag text -> trimmed tags, de-duplicated case-insensitively (first spelling kept). */
export const parseTags = (text: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
};
