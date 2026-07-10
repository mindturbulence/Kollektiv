import { describe, it, expect } from 'vitest';
import {
    aggregateAndSort, sortSubproperties, convertNumericKeysToString,
    filterTopN, filterByTag, removeTags, isValidRegex, applyFiltersToSubproperties,
    listToRegex, getSuggestedPrompt, buildFilterRegex, applyTagFilters,
} from './tagTools';

describe('aggregateAndSort', () => {
    it('sums tag counts across folders and sorts descending', () => {
        const input = { folderA: { cat: 2, dog: 9 }, folderB: { cat: 3 } };
        // dog=9, cat=2+3=5 -> unambiguous descending order (no tie), unlike an equal-count fixture
        // which would leave the result order-dependent on Array.sort's stability plus insertion order.
        expect(aggregateAndSort(input)).toEqual({ dog: 9, cat: 5 });
        expect(Object.keys(aggregateAndSort(input))).toEqual(['dog', 'cat']);
    });
});

describe('sortSubproperties', () => {
    it('sorts each folder subobject by count descending', () => {
        const input = { folderA: { cat: 1, dog: 9 } };
        expect(sortSubproperties(input)).toEqual({ folderA: { dog: 9, cat: 1 } });
    });
});

describe('convertNumericKeysToString', () => {
    it('wraps purely-numeric subkeys in parentheses', () => {
        const input = { folder: { '1girl': 5, '123': 2 } };
        expect(convertNumericKeysToString(input)).toEqual({ folder: { '1girl': 5, '(123)': 2 } });
    });
});

describe('filterTopN', () => {
    it('keeps only the first N entries', () => {
        expect(filterTopN({ a: 1, b: 2, c: 3 }, 2)).toEqual({ a: 1, b: 2 });
    });
});

describe('filterByTag / removeTags', () => {
    const tags = { cat: 5, dog: 3, catfish: 1 };
    it('filterByTag keeps only keys matching the pattern', () => {
        expect(filterByTag(tags, /^cat$/)).toEqual({ cat: 5 });
    });
    it('removeTags deletes keys matching the pattern', () => {
        expect(removeTags({ ...tags }, /^cat$/)).toEqual({ dog: 3, catfish: 1 });
    });
});

describe('isValidRegex', () => {
    it('returns true for valid patterns and false for invalid ones', () => {
        expect(isValidRegex('^abc$')).toBe(true);
        expect(isValidRegex('(unterminated')).toBe(false);
    });
});

describe('applyFiltersToSubproperties', () => {
    it('applies a filter function to every folder subobject', () => {
        const input = { folderA: { cat: 5, dog: 1 }, folderB: { cat: 2 } };
        const result = applyFiltersToSubproperties(input, filterByTag, /^cat$/);
        expect(result).toEqual({ folderA: { cat: 5 }, folderB: { cat: 2 } });
    });
});

describe('listToRegex', () => {
    it('builds a partial-match regex from a comma-separated list', () => {
        const re = listToRegex('cat, dog');
        expect(re.test('catfish')).toBe(true);
        expect('cat, dog'.split(',').every(v => re.test(v.trim()))).toBe(true);
    });
    it('builds an exact-match regex when exactMatch is true', () => {
        const re = listToRegex('cat, dog', true);
        expect(re.test('catfish')).toBe(false);
        expect(re.test('cat')).toBe(true);
    });
    it('escapes regex special characters in list values', () => {
        const re = listToRegex('a.b', true);
        expect(re.test('aXb')).toBe(false);
        expect(re.test('a.b')).toBe(true);
    });
});

describe('getSuggestedPrompt', () => {
    it('joins flat tag objects into a single Prompt string', () => {
        expect(getSuggestedPrompt({ cat: 5, dog: 3 })).toEqual({ Prompt: 'cat, dog' });
    });
    it('joins per-folder nested tag objects into one prompt per folder', () => {
        expect(getSuggestedPrompt({ folderA: { cat: 5 }, folderB: { dog: 3 } })).toEqual({ folderA: 'cat', folderB: 'dog' });
    });
    it('returns undefined for falsy input', () => {
        expect(getSuggestedPrompt(undefined as any)).toBeUndefined();
    });
});

describe('buildFilterRegex', () => {
    it('builds a partial-match regex for method "partial"', () => {
        const re = buildFilterRegex('partial', 'cat, dog');
        expect(re && (re as RegExp).test('catfish')).toBe(true);
    });
    it('builds an exact-match regex for method "exact"', () => {
        const re = buildFilterRegex('exact', 'cat');
        expect(re && (re as RegExp).test('catfish')).toBe(false);
    });
    it('passes the raw string through for method "regex"', () => {
        expect(buildFilterRegex('regex', '^cat$')).toBe('^cat$');
    });
    it('returns null for method "none" or an empty value', () => {
        expect(buildFilterRegex('none', 'cat')).toBeNull();
        expect(buildFilterRegex('partial', '')).toBeNull();
    });
});

describe('applyTagFilters', () => {
    const flatTags = { cat: 5, dog: 3, catfish: 1 };
    const folderTags = { folderA: { cat: 5, dog: 3 }, folderB: { catfish: 1 } };

    it('applies include/exclude/top-N on flat tags when byFolder is false', () => {
        const result = applyTagFilters(flatTags, {
            byFolder: false, filterMethod: 'exact', filter: 'cat, catfish',
            excludeFilterMethod: 'none', excludeFilter: '', count: 1,
        });
        expect(result).toEqual({ cat: 5 });
    });

    it('applies the same filters per-folder when byFolder is true', () => {
        const result = applyTagFilters(folderTags, {
            byFolder: true, filterMethod: 'none', filter: '',
            excludeFilterMethod: 'exact', excludeFilter: 'catfish', count: 0,
        });
        expect(result).toEqual({ folderA: { cat: 5, dog: 3 }, folderB: {} });
    });

    it('ignores invalid regex filters instead of throwing', () => {
        const result = applyTagFilters(flatTags, {
            byFolder: false, filterMethod: 'regex', filter: '(unterminated',
            excludeFilterMethod: 'none', excludeFilter: '', count: 0,
        });
        expect(result).toEqual(flatTags);
    });
});
