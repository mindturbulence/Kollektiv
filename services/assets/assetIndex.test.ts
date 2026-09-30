import { describe, expect, it } from 'vitest';
import { dhashFromGray, hamming, summariseExif, factsStamp } from './assetFacts';
import { parseLibrary, relocateIn, copyMetaIn, type LibraryData } from './assetLibrary';
import { matches, sortEntries, isEmptyCriteria, type AssetEntry } from './assetFilter';

describe('assetFacts', () => {
  it('dHash encodes left-brighter-than-right per row', () => {
    const gray = Array.from({ length: 72 }, (_, i) => 100 - (i % 9)); // strictly decreasing → all bits set
    expect(dhashFromGray(gray)).toBe('ffffffffffffffff');
    expect(dhashFromGray(Array.from({ length: 72 }, (_, i) => i % 9))).toBe('0000000000000000');
  });

  it('hamming counts differing bits', () => {
    expect(hamming('ff00', 'ff00')).toBe(0);
    expect(hamming('ff00', 'fe01')).toBe(2);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('summarises piexif output and drops empty fields', () => {
    const ex = { '0th': { 271: 'Canon\0', 272: 'EOS R10', 33432: 'Me' }, Exif: { 33434: [1, 250], 33437: [28, 10], 34855: 400, 36867: '2026:09:29 10:00:00' } };
    expect(summariseExif(ex)).toEqual({ make: 'Canon', model: 'EOS R10', copyright: 'Me', exposure: '1/250s', fNumber: 2.8, iso: 400, taken: '2026:09:29 10:00:00' });
    expect(summariseExif({ '0th': {}, Exif: {} })).toBeUndefined();
  });

  it('stamps facts by size and mtime', () => {
    expect(factsStamp(10, 20)).toBe('10:20');
  });
});

describe('assetLibrary', () => {
  it('validates an untrusted manifest', () => {
    const lib = parseLibrary({
      assets: { 'r:a.jpg': { rating: 9, label: 'red', tags: ['x', 3], caption: 'hi' }, 'r:b.jpg': { rating: 3, label: 'pink' }, 'r:c.jpg': 'junk' },
      collections: [{ id: 'c1', name: 'Best', ids: ['r:a.jpg', 5] }, { name: 'no id' }],
      stacks: [{ id: 's1', ids: ['r:a.jpg'] }, { id: 's2', ids: ['r:a.jpg', 'r:b.jpg'] }],
      filters: [{ id: 'f1', name: 'Good', criteria: { minRating: 4 } }],
    })!;
    expect(lib.assets).toEqual({ 'r:a.jpg': { label: 'red', tags: ['x'], caption: 'hi' }, 'r:b.jpg': { rating: 3 } });
    expect(lib.collections).toEqual([{ id: 'c1', name: 'Best', ids: ['r:a.jpg'] }]);
    expect(lib.stacks).toEqual([{ id: 's2', ids: ['r:a.jpg', 'r:b.jpg'] }]); // single-item stacks dropped
    expect(lib.filters).toHaveLength(1);
    expect(parseLibrary({ nope: true })).toBeNull();
  });

  it('keeps sortOrder across a load so manual order survives restarts', () => {
    const lib = parseLibrary({ assets: { 'r:b.jpg': { sortOrder: 1 }, 'r:a.jpg': { sortOrder: 2 }, 'r:c.jpg': { sortOrder: 'x' }, 'r:d.jpg': { sortOrder: Infinity } } })!;
    expect(lib.assets).toEqual({ 'r:b.jpg': { sortOrder: 1 }, 'r:a.jpg': { sortOrder: 2 } });
  });

  it('relocate re-keys metadata, collections and stacks', () => {
    const lib: LibraryData = { assets: { 'r:a': { rating: 5 } }, filters: [], collections: [{ id: 'c', name: 'C', ids: ['r:a', 'r:b'] }], stacks: [{ id: 's', ids: ['r:b', 'r:a'] }] };
    const out = relocateIn(lib, 'r:a', 'r:z');
    expect(out.assets).toEqual({ 'r:z': { rating: 5 } });
    expect(out.collections[0].ids).toEqual(['r:z', 'r:b']);
    expect(out.stacks[0].ids).toEqual(['r:b', 'r:z']);
    expect(relocateIn(lib, 'r:a', 'r:a')).toBe(lib);
  });

  it('copying keeps metadata but no collection membership', () => {
    const lib: LibraryData = { assets: { 'r:a': { tags: ['t'] } }, filters: [], collections: [{ id: 'c', name: 'C', ids: ['r:a'] }], stacks: [] };
    const out = copyMetaIn(lib, 'r:a', 'q:a');
    expect(out.assets['q:a']).toEqual({ tags: ['t'] });
    expect(out.collections[0].ids).toEqual(['r:a']);
  });
});

describe('assetFilter', () => {
  const e = (name: string, meta: AssetEntry['meta'] = {}, mtime = 0, size = 0): AssetEntry => ({
    file: { id: `r:${name}`, rootId: 'r', path: name, name, ext: name.split('.').pop()!, handle: {} as FileSystemFileHandle },
    facts: { size, mtime }, meta,
  });

  it('composes criteria with AND', () => {
    const a = e('beach.jpg', { rating: 4, label: 'green', tags: ['Sea', 'summer'], caption: 'sunset' }, 100);
    expect(matches(a, { minRating: 4, labels: ['green'], tags: ['sea'], text: 'sun beach', exts: ['jpg'], from: 50, to: 150 })).toBe(true);
    expect(matches(a, { minRating: 5 })).toBe(false);
    expect(matches(a, { labels: ['red'] })).toBe(false);
    expect(matches(a, { tags: ['sea', 'winter'] })).toBe(false);
    expect(matches(a, { text: 'mountain' })).toBe(false);
    expect(matches(a, { exts: ['png'] })).toBe(false);
    expect(matches(a, { from: 101 })).toBe(false);
    expect(isEmptyCriteria({ text: '  ' })).toBe(true);
  });

  it('sorts naturally with a name tie-break', () => {
    const list = [e('img10.jpg', { rating: 2 }), e('img2.jpg', { rating: 2 }), e('a.jpg', { rating: 5 })];
    expect(sortEntries(list, 'name').map(x => x.file.name)).toEqual(['a.jpg', 'img2.jpg', 'img10.jpg']);
    expect(sortEntries(list, 'rating', true).map(x => x.file.name)).toEqual(['a.jpg', 'img10.jpg', 'img2.jpg']);
  });
});

import { planRename, renderName, planIsValid } from './batchRename';
import { groupDuplicates } from './duplicates';

describe('batchRename', () => {
  const e = (name: string, mtime = new Date(2026, 8, 29).getTime()): AssetEntry => ({
    file: { id: `r:${name}`, rootId: 'r', path: name, name, ext: name.split('.').pop()!, handle: {} as FileSystemFileHandle },
    facts: { size: 1, mtime, width: 40, height: 30 }, meta: { rating: 3, label: 'red' },
  });

  it('renders tokens and keeps the extension', () => {
    expect(renderName('{date}_{index}_{name}', e('beach.JPG'), 7, 3)).toBe('2026-09-29_007_beach.JPG');
    expect(renderName('{width}x{height}-{rating}{label}.{ext}', e('a.png'), 1, 2)).toBe('40x30-3red.png');
  });

  it('flags duplicates, collisions and illegal names; allows swaps within the batch', () => {
    const plan = planRename([e('a.jpg'), e('b.jpg')], 'same', 1, ['c.jpg']);
    expect(plan.map(p => p.error)).toEqual(['same name as another file in this batch', 'same name as another file in this batch']);
    expect(planRename([e('a.jpg')], 'c', 1, ['c.jpg'])[0].error).toBe('a file with this name already exists');
    expect(planRename([e('a.jpg')], 'x:y', 1, [])[0].error).toMatch(/contains/);
    const swap = planRename([e('a.jpg'), e('b.jpg')], '{index}', 1, []);
    expect(swap.map(p => p.newName)).toEqual(['01.jpg', '02.jpg']);
    expect(planIsValid(swap)).toBe(true);
  });
});

describe('duplicates', () => {
  it('groups near-identical hashes, single-link', () => {
    const groups = groupDuplicates([
      { id: 'a', dhash: '0000000000000000' },
      { id: 'b', dhash: '0000000000000003' },   // 2 bits from a
      { id: 'c', dhash: '000000000000000f' },   // 2 bits from b (4 from a)
      { id: 'd', dhash: 'ffffffffffffffff' },
    ], 2);
    expect(groups).toEqual([['a', 'b', 'c']]);
  });
});
