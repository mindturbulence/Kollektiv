import { describe, it, expect, vi } from 'vitest';
import { scanDirectoryTree, listFolderFiles } from './directoryScanner';
import { MAX_SCAN_DEPTH } from './types';

/** Minimal mock matching the FileSystemDirectoryHandle/FileSystemFileHandle shape this module reads. */
function mockDir(name: string, entries: Array<{ kind: 'file' | 'directory'; name: string; children?: any[] }>) {
  return {
    kind: 'directory' as const,
    name,
    values: async function* () {
      for (const e of entries) {
        if (e.kind === 'directory') {
          yield mockDir(e.name, e.children ?? []);
        } else {
          yield { kind: 'file' as const, name: e.name };
        }
      }
    },
  };
}

function mockThrowingDir(name: string) {
  return {
    kind: 'directory' as const,
    name,
    values: async function* () {
      throw new Error('permission denied');
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    },
  };
}

describe('scanDirectoryTree', () => {
  it('skips the trash folder', async () => {
    const root = mockDir('root', [
      { kind: 'directory', name: 'photos', children: [] },
      { kind: 'directory', name: '.kollektiv-trash', children: [{ kind: 'file', name: 'deleted.png' }] },
    ]);
    const tree = await scanDirectoryTree('r1', root as any);
    expect(tree.children.map(c => c.name)).toEqual(['photos']);
  });

  it('respects the depth cap', async () => {
    // Build a chain deeper than MAX_SCAN_DEPTH.
    let deepest: any = { kind: 'directory', name: `d${MAX_SCAN_DEPTH + 5}`, children: [] };
    for (let i = MAX_SCAN_DEPTH + 4; i >= 0; i--) {
      deepest = { kind: 'directory', name: `d${i}`, children: [deepest] };
    }
    const root = mockDir('root', [deepest]);
    const tree = await scanDirectoryTree('r1', root as any);

    let depth = 0;
    let node = tree;
    while (node.children.length > 0) {
      node = node.children[0];
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(MAX_SCAN_DEPTH);
  });

  it('returns a partial tree when a subdirectory read throws', async () => {
    const root = {
      kind: 'directory' as const,
      name: 'root',
      values: async function* () {
        yield mockThrowingDir('broken');
        yield mockDir('ok', []);
      },
    };
    const tree = await scanDirectoryTree('r1', root as any);
    // 'broken' still appears (readable at listing time) but its children are empty; 'ok' unaffected.
    expect(tree.children.map(c => c.name).sort()).toEqual(['broken', 'ok']);
    expect(tree.children.find(c => c.name === 'broken')!.children).toEqual([]);
  });

  it('root-scopes ids so two roots with the same folder name never collide', async () => {
    const dirA = mockDir('Photos', []);
    const dirB = mockDir('Photos', []);
    const treeA = await scanDirectoryTree('rootA', dirA as any);
    const treeB = await scanDirectoryTree('rootB', dirB as any);
    expect(treeA.id).not.toEqual(treeB.id);
  });
});

describe('listFolderFiles', () => {
  it('lists files and skips directories, with root-scoped path ids', async () => {
    const folder = mockDir('pics', [
      { kind: 'file', name: 'a.png' },
      { kind: 'file', name: 'b.JPG' },
      { kind: 'directory', name: 'subdir', children: [] },
    ]);
    const { files, truncated } = await listFolderFiles('root1', folder as any, 'pics');
    expect(truncated).toBe(false);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ id: 'root1:pics/a.png', ext: 'png', path: 'pics/a.png' });
    expect(files[1]).toMatchObject({ ext: 'jpg' }); // lowercased
  });

  it('same filename in two different folders yields two distinct ids', async () => {
    const folderA = mockDir('folderA', [{ kind: 'file', name: 'x.png' }]);
    const folderB = mockDir('folderB', [{ kind: 'file', name: 'x.png' }]);
    const resA = await listFolderFiles('root1', folderA as any, 'folderA');
    const resB = await listFolderFiles('root1', folderB as any, 'folderB');
    expect(resA.files[0].id).not.toEqual(resB.files[0].id);
  });

  it('reports truncated:true and partial results when the iterator throws mid-read', async () => {
    let yielded = 0;
    const folder = {
      kind: 'directory' as const,
      name: 'pics',
      values: async function* () {
        yield { kind: 'file' as const, name: 'first.png' };
        yielded++;
        throw new Error('device disconnected');
      },
    };
    const { files, truncated } = await listFolderFiles('root1', folder as any, 'pics');
    expect(yielded).toBe(1);
    expect(truncated).toBe(true);
    expect(files).toHaveLength(1);
  });

  it('reports progress on large folders', async () => {
    const entries = Array.from({ length: 450 }, (_, i) => ({ kind: 'file' as const, name: `f${i}.png` }));
    const folder = mockDir('big', entries);
    const onProgress = vi.fn();
    const { files } = await listFolderFiles('root1', folder as any, 'big', onProgress);
    expect(files).toHaveLength(450);
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls.at(-1)![0].scannedFiles).toBe(450);
  });
});
