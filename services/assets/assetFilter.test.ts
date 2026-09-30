import { describe, it, expect } from 'vitest';
import { sortEntries, matches, isEmptyCriteria } from './assetFilter';
import type { AssetEntry } from './assetFilter';
import type { AssetFile } from './types';

function entry(name: string, opts: { sortOrder?: number; rating?: number; mtime?: number } = {}): AssetEntry {
  const file: AssetFile = { id: `r1:${name}`, rootId: 'r1', path: name, name, ext: 'png', handle: {} as FileSystemFileHandle };
  const meta = opts.sortOrder !== undefined || opts.rating !== undefined
    ? { sortOrder: opts.sortOrder, rating: opts.rating }
    : undefined;
  return { file, meta, facts: opts.mtime !== undefined ? { mtime: opts.mtime, size: 0 } : undefined };
}

const names = (list: AssetEntry[]) => list.map(e => e.file.name);

describe('sortEntries — manual order', () => {
  it('sorts by ascending sortOrder', () => {
    const list = [entry('c.png', { sortOrder: 3 }), entry('a.png', { sortOrder: 1 }), entry('b.png', { sortOrder: 2 })];
    expect(names(sortEntries(list, 'manual'))).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('puts entries without sortOrder last, tie-breaking by name', () => {
    const list = [
      entry('z.png'),                    // no sortOrder → MAX_SAFE_INTEGER
      entry('b.png', { sortOrder: 9 }),
      entry('a.png'),                    // no sortOrder → tie with z → name order
      entry('a.png'),                    // duplicate name — stable within
    ];
    const out = names(sortEntries(list, 'manual'));
    expect(out[0]).toBe('b.png');
    expect(out.slice(1)).toEqual(['a.png', 'a.png', 'z.png']);
  });

  it('descending reverses the manual order', () => {
    const list = [entry('a.png', { sortOrder: 1 }), entry('b.png', { sortOrder: 2 }), entry('c.png', { sortOrder: 3 })];
    expect(names(sortEntries(list, 'manual', true))).toEqual(['c.png', 'b.png', 'a.png']);
  });

  it('does not mutate the input list', () => {
    const list = [entry('c.png', { sortOrder: 3 }), entry('a.png', { sortOrder: 1 })];
    const before = list.map(e => e.file.name);
    sortEntries(list, 'manual');
    expect(names(list)).toEqual(before);
  });
});

describe('sortEntries — other keys (regression after comparator fix)', () => {
  it('sorts by name using numeric-aware collation', () => {
    const list = [entry('img10.png'), entry('img2.png'), entry('img1.png')];
    expect(names(sortEntries(list, 'name'))).toEqual(['img1.png', 'img2.png', 'img10.png']);
    expect(names(sortEntries(list, 'name', true))).toEqual(['img10.png', 'img2.png', 'img1.png']);
  });

  it('sorts by date ascending and descending', () => {
    const list = [entry('old.png', { mtime: 100 }), entry('new.png', { mtime: 300 }), entry('mid.png', { mtime: 200 })];
    expect(names(sortEntries(list, 'date'))).toEqual(['old.png', 'mid.png', 'new.png']);
    expect(names(sortEntries(list, 'date', true))).toEqual(['new.png', 'mid.png', 'old.png']);
  });

  it('sorts by rating with unrated entries first', () => {
    const list = [entry('five.png', { rating: 5 }), entry('none.png'), entry('two.png', { rating: 2 })];
    expect(names(sortEntries(list, 'rating'))).toEqual(['none.png', 'two.png', 'five.png']);
  });
});

describe('matches / isEmptyCriteria', () => {
  it('matches on minRating', () => {
    expect(matches(entry('a.png', { rating: 4 }), { minRating: 3 })).toBe(true);
    expect(matches(entry('a.png', { rating: 1 }), { minRating: 3 })).toBe(false);
    expect(matches(entry('a.png'), { minRating: 3 })).toBe(false);
  });

  it('isEmptyCriteria reflects active filters', () => {
    expect(isEmptyCriteria({})).toBe(true);
    expect(isEmptyCriteria({ text: '  ' })).toBe(true);
    expect(isEmptyCriteria({ text: 'cat' })).toBe(false);
    expect(isEmptyCriteria({ minRating: 2 })).toBe(false);
  });
});
