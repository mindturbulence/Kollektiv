import { describe, it, expect, vi } from 'vitest';
import { moveFilesToFolder } from './fileOps';
import type { AssetFile } from './types';

function mockFile(name: string, path: string, content = 'x'): AssetFile {
  return {
    id: `r1:${path}`,
    rootId: 'r1',
    path,
    name,
    ext: name.split('.').pop() ?? '',
    handle: {
      getFile: async () => new File([content], name),
    } as unknown as FileSystemFileHandle,
  };
}

function mockDestDir(getFileHandle = vi.fn(), createWritable = vi.fn()) {
  return {
    getFileHandle,
    createWritable,
  } as unknown as FileSystemDirectoryHandle;
}

describe('moveFilesToFolder', () => {
  it('uses handle.move() when available, without falling back to copy+delete', async () => {
    const move = vi.fn().mockResolvedValue(undefined);
    const file: AssetFile = { ...mockFile('a.png', 'a.png'), handle: { move } as unknown as FileSystemFileHandle };
    const sourceDir = { removeEntry: vi.fn() } as unknown as FileSystemDirectoryHandle;
    const destDir = mockDestDir();

    const result = await moveFilesToFolder([file], sourceDir, destDir);

    expect(move).toHaveBeenCalledWith(destDir, 'a.png');
    expect(result.moved).toEqual(['a.png']);
    expect(result.failed).toEqual([]);
    expect((sourceDir as any).removeEntry).not.toHaveBeenCalled();
  });

  it('falls back to copy+delete when move() is unavailable', async () => {
    const file = mockFile('b.png', 'sub/b.png');
    const writable = { write: vi.fn(), close: vi.fn() };
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable: async () => writable });
    const removeEntry = vi.fn();
    const sourceDir = { removeEntry } as unknown as FileSystemDirectoryHandle;
    const destDir = mockDestDir(getFileHandle);

    const result = await moveFilesToFolder([file], sourceDir, destDir);

    expect(getFileHandle).toHaveBeenCalledWith('b.png', { create: true });
    expect(writable.write).toHaveBeenCalled();
    expect(writable.close).toHaveBeenCalled();
    expect(removeEntry).toHaveBeenCalledWith('b.png');
    expect(result.moved).toEqual(['sub/b.png']);
  });

  it('reports a per-file failure without aborting the rest of the batch', async () => {
    const ok = mockFile('ok.png', 'ok.png');
    const bad: AssetFile = {
      ...mockFile('bad.png', 'bad.png'),
      handle: { getFile: async () => { throw new Error('locked'); } } as unknown as FileSystemFileHandle,
    };
    const sourceDir = { removeEntry: vi.fn() } as unknown as FileSystemDirectoryHandle;
    const writable = { write: vi.fn(), close: vi.fn() };
    const destDir = mockDestDir(vi.fn().mockResolvedValue({ createWritable: async () => writable }));

    const result = await moveFilesToFolder([ok, bad], sourceDir, destDir);

    expect(result.moved).toEqual(['ok.png']);
    expect(result.failed).toEqual([{ path: 'bad.png', error: 'locked' }]);
  });
});
