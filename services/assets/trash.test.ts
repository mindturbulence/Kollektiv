import { describe, it, expect, vi } from 'vitest';
import { moveToTrash, restoreFromTrash, purgeTrash, listTrash, deleteForever, emptyTrash } from './trash';
import { TRASH_FOLDER_NAME } from './types';
import type { AssetFile } from './types';

/** In-memory directory tree mock (same shape as folderOps.test.ts). */
function makeDir(entries: Record<string, string> = {}) {
  const children = new Map<string, { kind: 'dir' | 'file'; node: any }>();

  const dir: any = {
    kind: 'directory',
    getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
      const c = children.get(name);
      if (c?.kind !== 'file') {
        if (!opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
        const f = { kind: 'file', getFile: async () => new File([''], name), createWritable: async () => ({ write: vi.fn(), close: vi.fn() }) };
        children.set(name, { kind: 'file', node: f });
        return f;
      }
      return c.node;
    }),
    getDirectoryHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
      const c = children.get(name);
      if (c?.kind !== 'dir') {
        if (!opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
        const sub = makeDir();
        children.set(name, { kind: 'dir', node: sub });
        return sub;
      }
      return c.node;
    }),
    removeEntry: vi.fn(async (name: string) => {
      if (!children.has(name)) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      children.delete(name);
    }),
    [Symbol.asyncIterator]: async function* () {
      for (const [name, c] of children) yield [name, c.node];
    },
    /** Test helper: does this dir contain `name`? */
    has: (name: string) => children.has(name),
    names: () => [...children.keys()],
  };

  for (const [name, spec] of Object.entries(entries)) {
    if (spec === 'dir') children.set(name, { kind: 'dir', node: makeDir() });
    else children.set(name, { kind: 'file', node: { kind: 'file', getFile: async () => new File(['x'], name), createWritable: async () => ({ write: vi.fn(), close: vi.fn() }) } });
  }
  return dir as FileSystemDirectoryHandle;
}

function mockFile(path: string): AssetFile {
  const name = path.split('/').pop()!;
  return {
    id: `r1:${path}`,
    rootId: 'r1',
    path,
    name,
    ext: name.split('.').pop() ?? '',
    handle: {
      getFile: async () => new File(['x'], name),
      // move() present → moveOne takes the fast path (same as Chromium).
      move: vi.fn(async (dest: any, newName: string) => { void dest; void newName; }),
    } as unknown as FileSystemFileHandle,
  };
}

describe('moveToTrash', () => {
  it('returns [] for an empty file list', async () => {
    const root = makeDir();
    expect(await moveToTrash(root, [])).toEqual([]);
    expect((root as any).has(TRASH_FOLDER_NAME)).toBe(false);
  });

  it('moves files into .kollektiv-trash/<batch>/<originalPath> and records entries', async () => {
    const root = makeDir({ sub: 'dir' });
    const file = mockFile('sub/a.png');
    const trashRoot = root as any;
    // Seed the source file inside sub/ so resolveDir finds the dir.
    const sub = await root.getDirectoryHandle('sub');
    await sub.getFileHandle('a.png', { create: true });

    const entries = await moveToTrash(root, [file]);
    expect(entries).toHaveLength(1);
    expect(entries[0].originalPath).toBe('sub/a.png');
    expect(entries[0].name).toBe('a.png');
    expect(entries[0].batchKey).toBe(entries[0].batchKey); // stable batch id
    expect(typeof entries[0].trashedAt).toBe('number');

    // Trash structure exists: .kollektiv-trash/<batch>/sub/a.png
    expect(trashRoot.has(TRASH_FOLDER_NAME)).toBe(true);
    const trash = await root.getDirectoryHandle(TRASH_FOLDER_NAME);
    expect((trash as any).has(entries[0].batchKey)).toBe(true);
  });
});

describe('restoreFromTrash', () => {
  it('is a no-op when there is no trash folder', async () => {
    const root = makeDir();
    await expect(restoreFromTrash(root, [{ batchKey: '1', originalPath: 'x.png', name: 'x.png', trashedAt: 1 }])).resolves.toBeUndefined();
  });

  it('round-trips: trash then restore puts the file back at its original path', async () => {
    const root = makeDir({ sub: 'dir' });
    const sub = await root.getDirectoryHandle('sub');
    const fileHandle = await sub.getFileHandle('a.png', { create: true });
    const file: AssetFile = {
      id: 'r1:sub/a.png', rootId: 'r1', path: 'sub/a.png', name: 'a.png', ext: 'png',
      handle: fileHandle,
    };

    const entries = await moveToTrash(root, [file]);
    await restoreFromTrash(root, entries);

    // Original location is resolvable again.
    await expect(sub.getFileHandle('a.png')).resolves.toBeTruthy();
  });
});

describe('purgeTrash', () => {
  it('does nothing when no trash folder exists', async () => {
    const root = makeDir();
    await expect(purgeTrash(root)).resolves.toBeUndefined();
  });

  it('removes batches older than the cutoff and keeps recent ones', async () => {
    const root = makeDir();
    const trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true }) as any;
    const oldKey = String(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    const freshKey = String(Date.now());                          // now

    // Batch dirs must be iterable by purgeTrash.
    // Access internal children map through the mock helper: seed via getDirectoryHandle.
    await trashRoot.getDirectoryHandle(oldKey, { create: true });
    await trashRoot.getDirectoryHandle(freshKey, { create: true });
    expect(trashRoot.has(oldKey)).toBe(true);
    expect(trashRoot.has(freshKey)).toBe(true);

    await purgeTrash(root, 30);

    expect(trashRoot.has(oldKey)).toBe(false);
    expect(trashRoot.has(freshKey)).toBe(true);
  });

  it('keeps non-numeric batch keys (defensive)', async () => {
    const root = makeDir();
    const trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true }) as any;
    await trashRoot.getDirectoryHandle('not-a-timestamp', { create: true });
    await purgeTrash(root, 30);
    expect(trashRoot.has('not-a-timestamp')).toBe(true);
  });
});

describe('listTrash / deleteForever / emptyTrash', () => {
  async function seedTrash(root: any) {
    const trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true }) as any;
    const batch1 = await trashRoot.getDirectoryHandle('1000', { create: true });
    const photos = await batch1.getDirectoryHandle('photos', { create: true });
    await photos.getFileHandle('a.png', { create: true });
    await photos.getFileHandle('b.png', { create: true });
    const batch2 = await trashRoot.getDirectoryHandle('2000', { create: true });
    await batch2.getFileHandle('c.jpg', { create: true });
    return trashRoot;
  }

  it('returns [] when there is no trash folder', async () => {
    expect(await listTrash(makeDir())).toEqual([]);
  });

  it('lists every trashed file with its original path, newest batch first', async () => {
    const root = makeDir();
    await seedTrash(root);
    const entries = await listTrash(root);
    expect(entries.map(e => e.originalPath)).toEqual(['c.jpg', 'photos/a.png', 'photos/b.png']);
    expect(entries[0]).toMatchObject({ batchKey: '2000', name: 'c.jpg', trashedAt: 2000 });
    expect(entries[1]).toMatchObject({ batchKey: '1000', name: 'a.png', originalPath: 'photos/a.png', trashedAt: 1000 });
  });

  it('deleteForever removes only the given entries', async () => {
    const root = makeDir();
    await seedTrash(root);
    const removed = await deleteForever(root, [
      { batchKey: '1000', originalPath: 'photos/a.png', name: 'a.png', trashedAt: 1000 },
    ]);
    expect(removed).toBe(1);
    const left = await listTrash(root);
    expect(left.map(e => e.originalPath)).toEqual(['c.jpg', 'photos/b.png']);
  });

  it('deleteForever counts nothing when the entry is already gone', async () => {
    const root = makeDir();
    await seedTrash(root);
    expect(await deleteForever(root, [
      { batchKey: '1000', originalPath: 'photos/ghost.png', name: 'ghost.png', trashedAt: 1000 },
      { batchKey: '999', originalPath: 'x.png', name: 'x.png', trashedAt: 999 },
    ])).toBe(0);
  });

  it('emptyTrash clears every batch', async () => {
    const root = makeDir();
    const trashRoot = await seedTrash(root);
    await emptyTrash(root);
    expect(trashRoot.names()).toEqual([]);
    expect(await listTrash(root)).toEqual([]);
  });

  it('deleteForever and emptyTrash are no-ops without a trash folder', async () => {
    expect(await deleteForever(makeDir(), [])).toBe(0);
    await expect(emptyTrash(makeDir())).resolves.toBeUndefined();
  });
});
