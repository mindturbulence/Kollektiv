import { describe, it, expect, vi } from 'vitest';
import { keepBothName, moveOne, transferFiles } from './fileOps';
import type { AssetFile } from './types';

function mockFile(name: string, path: string, content = 'x'): AssetFile {
  return {
    id: `r1:${path}`,
    rootId: 'r1',
    path,
    name,
    ext: name.split('.').pop() ?? '',
    handle: { getFile: async () => new File([content], name) } as unknown as FileSystemFileHandle,
  };
}

/** A folder with the given file names; writes are recorded. */
function mockDir(names: string[] = []) {
  const files = new Set(names);
  const written: string[] = [];
  const dir = {
    getFileHandle: vi.fn(async (n: string, opts?: { create?: boolean }) => {
      if (!files.has(n) && !opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      files.add(n);
      return { createWritable: async () => ({ write: vi.fn(), close: async () => { written.push(n); } }) };
    }),
    getDirectoryHandle: vi.fn(async () => { throw new Error('NotFound'); }),
    removeEntry: vi.fn(async (n: string) => { files.delete(n); }),
  };
  return { dir: dir as unknown as FileSystemDirectoryHandle, files, written, raw: dir };
}

describe('moveOne', () => {
  it('uses handle.move() when available, without copy+delete', async () => {
    const move = vi.fn().mockResolvedValue(undefined);
    const src = mockDir(['a.png']), dest = mockDir();
    await moveOne({ move } as unknown as FileSystemFileHandle, src.dir, 'a.png', dest.dir, 'a.png');
    expect(move).toHaveBeenCalledWith(dest.dir, 'a.png');
    expect(src.raw.removeEntry).not.toHaveBeenCalled();
  });

  it('falls back to copy + delete when move() is unavailable', async () => {
    const src = mockDir(['b.png']), dest = mockDir();
    await moveOne(mockFile('b.png', 'sub/b.png').handle, src.dir, 'b.png', dest.dir, 'c.png');
    expect(dest.written).toEqual(['c.png']);
    expect(src.raw.removeEntry).toHaveBeenCalledWith('b.png');
  });
});

describe('transferFiles', () => {
  const dest = (d: FileSystemDirectoryHandle) => ({ rootId: 'r2', path: 'out', handle: d });

  it('copies with keep-both: a same-named file gets a number, ids follow', async () => {
    const src = mockDir(['a.png']), out = mockDir(['a.png', 'a (2).png']);
    const res = await transferFiles([{ file: mockFile('a.png', 'in/a.png'), srcDir: src.dir }], dest(out.dir), 'copy', 'keep-both');
    expect(out.written).toEqual(['a (3).png']);
    expect(res.done).toEqual([{ fromId: 'r1:in/a.png', toId: 'r2:out/a (3).png', fromRootId: 'r1', fromPath: 'in/a.png', toRootId: 'r2', toPath: 'out/a (3).png' }]);
    expect(src.raw.removeEntry).not.toHaveBeenCalled();
  });

  it('skip leaves conflicts alone; a per-file error does not stop the batch', async () => {
    const src = mockDir(['a.png', 'b.png', 'c.png']), out = mockDir(['a.png']);
    const bad: AssetFile = { ...mockFile('c.png', 'c.png'), handle: { getFile: async () => { throw new Error('locked'); } } as unknown as FileSystemFileHandle };
    const res = await transferFiles([
      { file: mockFile('a.png', 'a.png'), srcDir: src.dir },
      { file: mockFile('b.png', 'b.png'), srcDir: src.dir },
      { file: bad, srcDir: src.dir },
    ], dest(out.dir), 'move', 'skip');
    expect(res.skipped).toEqual(['a.png']);
    expect(res.done.map(d => d.toPath)).toEqual(['out/b.png']);
    expect(res.failed).toEqual([{ path: 'c.png', error: 'locked' }]);
  });

  it('moving into the folder a file is already in is a no-op', async () => {
    const d = mockDir(['a.png']);
    const res = await transferFiles([{ file: { ...mockFile('a.png', 'out/a.png'), rootId: 'r2', id: 'r2:out/a.png' }, srcDir: d.dir }], dest(d.dir), 'move', 'keep-both');
    expect(res.skipped).toEqual(['out/a.png']);
    expect(d.written).toEqual([]);
  });

  it('keepBothName finds the first free number', async () => {
    expect(await keepBothName(mockDir(['x.jpg', 'x (2).jpg']).dir, 'x.jpg')).toBe('x (3).jpg');
    expect(await keepBothName(mockDir([]).dir, 'noext')).toBe('noext (2)');
  });
});
