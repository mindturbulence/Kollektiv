import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildZip, makeUniqueName } from './zipDownload';

describe('buildZip', () => {
  it('throws on empty entries (callers must no-op, never ship an empty zip)', async () => {
    await expect(buildZip([])).rejects.toThrow('no entries');
  });

  it('assembles entries into a valid zip containing all names', async () => {
    const blob = await buildZip([
      { name: 'a.txt', content: 'alpha' },
      { name: 'b.txt', content: 'beta' },
    ]);
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).sort()).toEqual(['a.txt', 'b.txt']);
    expect(await zip.file('a.txt')!.async('string')).toBe('alpha');
  });

  it('accepts Blob content', async () => {
    const blob = await buildZip([{ name: 'x.bin', content: new Blob([new Uint8Array([1, 2, 3])]) }]);
    const zip = await JSZip.loadAsync(blob);
    const bytes = await zip.file('x.bin')!.async('uint8array');
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});

describe('makeUniqueName', () => {
  it('returns base.ext when free and records it', () => {
    const taken = new Set<string>();
    expect(makeUniqueName('frame_001', 'jpg', taken)).toBe('frame_001.jpg');
    expect(taken.has('frame_001.jpg')).toBe(true);
  });

  it('dedupes case-insensitively with -2, -3 suffixes', () => {
    const taken = new Set<string>();
    expect(makeUniqueName('Photo', 'png', taken)).toBe('Photo.png');
    expect(makeUniqueName('photo', 'png', taken)).toBe('photo-2.png');
    expect(makeUniqueName('PHOTO', 'png', taken)).toBe('PHOTO-3.png');
  });
});
