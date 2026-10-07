import { describe, it, expect } from 'vitest';
import { filterRecipes, collectTags, emptyRecipeSpec, parseTags, sortRecipes, libraryStats, topTags } from './designLibraryFilter';
import { serializeDesignSpec, specOverview } from './designSpec';
import type { DesignRecipe } from '../types';

const mk = (over: Partial<DesignRecipe>): DesignRecipe => ({
  id: 'x', createdAt: 1, updatedAt: 1, title: 'T', pageType: 'landing', tags: [], refs: [], overview: '', ...over,
});

const recipes = [
  mk({ id: 'a', title: 'Stripe Home', pageType: 'landing', tags: ['saas', 'dark'], overview: 'Calm gradient hero' }),
  mk({ id: 'b', title: 'Linear Board', pageType: 'app', tags: ['saas', 'minimal'], overview: 'Dense issue tracker' }),
  mk({ id: 'c', title: 'Studio Folio', pageType: 'portfolio', tags: ['Minimal'], overview: 'Editorial grid' }),
];

const ids = (r: DesignRecipe[]) => r.map((x) => x.id);
const all = { query: '', pageType: 'all' as const, tag: null };

describe('filterRecipes', () => {
  it('returns everything for an empty filter', () => {
    expect(ids(filterRecipes(recipes, all))).toEqual(['a', 'b', 'c']);
  });
  it('matches title, tags and overview case-insensitively', () => {
    expect(ids(filterRecipes(recipes, { ...all, query: 'STRIPE' }))).toEqual(['a']);
    expect(ids(filterRecipes(recipes, { ...all, query: 'minim' }))).toEqual(['b', 'c']);
    expect(ids(filterRecipes(recipes, { ...all, query: 'tracker' }))).toEqual(['b']);
  });
  it('ignores surrounding whitespace in the query', () => {
    expect(ids(filterRecipes(recipes, { ...all, query: '  folio ' }))).toEqual(['c']);
  });
  it('narrows by page type', () => {
    expect(ids(filterRecipes(recipes, { ...all, pageType: 'app' }))).toEqual(['b']);
    expect(filterRecipes(recipes, { ...all, pageType: 'docs' })).toEqual([]);
  });
  it('narrows by exact tag, case-insensitive', () => {
    expect(ids(filterRecipes(recipes, { ...all, tag: 'saas' }))).toEqual(['a', 'b']);
    expect(ids(filterRecipes(recipes, { ...all, tag: 'minimal' }))).toEqual(['b', 'c']);
    expect(filterRecipes(recipes, { ...all, tag: 'sa' })).toEqual([]);
  });
  it('combines all filters', () => {
    expect(ids(filterRecipes(recipes, { query: 'board', pageType: 'app', tag: 'saas' }))).toEqual(['b']);
    expect(filterRecipes(recipes, { query: 'board', pageType: 'landing', tag: 'saas' })).toEqual([]);
  });
});

describe('collectTags', () => {
  it('sorts by frequency then alphabetically, folding case', () => {
    // saas x2 and minimal x2 (Minimal/minimal fold together) tie, so alphabetical; dark x1 last
    expect(collectTags(recipes)).toEqual(['minimal', 'saas', 'dark']);
  });
  it('returns empty for no recipes or blank tags', () => {
    expect(collectTags([])).toEqual([]);
    expect(collectTags([mk({ tags: ['', '  '] })])).toEqual([]);
  });
});

describe('sortRecipes', () => {
  const many = ['Echo', 'alpha', 'Delta', 'Charlie', 'bravo', 'Foxtrot', 'Golf', 'Hotel'].map((title, i) =>
    mk({ id: title, title, createdAt: i + 1 }));

  it('recent: newest first, without mutating the input', () => {
    const input = [...many];
    expect(ids(sortRecipes(input, 'recent'))).toEqual([...ids(many)].reverse());
    expect(input).toEqual(many);
  });
  it('az: ignores case, ties go newest first', () => {
    const tied = [mk({ id: 'old', title: 'Same', createdAt: 1 }), mk({ id: 'new', title: 'same', createdAt: 9 }), mk({ id: 'z', title: 'Zed', createdAt: 5 })];
    expect(ids(sortRecipes(tied, 'az'))).toEqual(['new', 'old', 'z']);
    expect(sortRecipes(many, 'az').map((r) => r.title)).toEqual(['alpha', 'bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']);
  });
  it('random: same seed repeats, another seed reorders, nothing is lost or mutated', () => {
    const input = [...many];
    const a = ids(sortRecipes(input, 'random', 7));
    expect(ids(sortRecipes(input, 'random', 7))).toEqual(a);
    expect(ids(sortRecipes(input, 'random', 8))).not.toEqual(a);
    expect([...a].sort()).toEqual([...ids(many)].sort());
    expect(input).toEqual(many);
  });
  it('handles empty and single-item lists in every mode', () => {
    for (const mode of ['recent', 'az', 'random'] as const) {
      expect(sortRecipes([], mode)).toEqual([]);
      expect(ids(sortRecipes([recipes[0]], mode))).toEqual(['a']);
    }
  });
});

describe('libraryStats', () => {
  it('is all zeros for no recipes and for recipes without tokens', () => {
    expect(libraryStats([])).toEqual({ recipes: 0, colours: 0, fonts: 0 });
    expect(libraryStats([mk({}), mk({ palette: [], fonts: [] })])).toEqual({ recipes: 2, colours: 0, fonts: 0 });
  });
  it('counts distinct colours case-insensitively and distinct font families', () => {
    const stats = libraryStats([
      mk({ palette: ['#FFFFFF', '#111111'], fonts: ['Inter / 56px', 'Playfair Display / 72px'] }),
      mk({ palette: ['#ffffff', '#ff0000'], fonts: ['Inter / 16px', 'inter'] }),
    ]);
    expect(stats).toEqual({ recipes: 2, colours: 3, fonts: 2 });
  });
  it('ignores blank and non-string entries', () => {
    const bad = mk({ palette: ['', '  ', '#000000'], fonts: ['', ' / 12px', 'Mono'] });
    (bad.palette as unknown[]).push(42, null);
    (bad.fonts as unknown[]).push(undefined, {});
    expect(libraryStats([bad])).toEqual({ recipes: 1, colours: 1, fonts: 1 });
  });
});

describe('topTags', () => {
  const tags = ['a', 'b', 'c', 'd'];
  it('splits at n', () => {
    expect(topTags(tags, 2)).toEqual({ shown: ['a', 'b'], hiddenCount: 2 });
  });
  it('shows everything when n equals or exceeds the length', () => {
    expect(topTags(tags, 4)).toEqual({ shown: tags, hiddenCount: 0 });
    expect(topTags(tags, 9)).toEqual({ shown: tags, hiddenCount: 0 });
  });
  it('hides everything for n = 0 and tolerates bad n or no tags', () => {
    expect(topTags(tags, 0)).toEqual({ shown: [], hiddenCount: 4 });
    expect(topTags(tags, -3)).toEqual({ shown: [], hiddenCount: 4 });
    expect(topTags(tags, NaN)).toEqual({ shown: [], hiddenCount: 4 });
    expect(topTags([], 8)).toEqual({ shown: [], hiddenCount: 0 });
  });
});

describe('emptyRecipeSpec', () => {
  it('serializes and has an empty overview', () => {
    const spec = emptyRecipeSpec('My Recipe');
    expect(spec.frontMatter).toEqual({ name: 'My Recipe' });
    expect(specOverview(spec)).toBe('');
    expect(() => serializeDesignSpec(spec)).not.toThrow();
  });

  it('parseTags trims, drops blanks and de-duplicates case-insensitively', () => {
    expect(parseTags(' saas, Dark ,,SAAS, dark , minimal')).toEqual(['saas', 'Dark', 'minimal']);
    expect(parseTags('')).toEqual([]);
  });
});
