import { describe, it, expect, vi } from 'vitest';
import { createFolder, renameFolder, deleteFolder, FolderNotEmptyError } from './folderOps';

/**
 * Minimal in-memory FileSystemDirectoryHandle mock: nested dirs/files as a
 * Map, getDirectoryHandle/getFileHandle/removeEntry + async iteration
 * (folderOps iterates entries to peek children and copy contents).
 */
function makeDir(entries: Record<string, unknown> = {}) {
  const children = new Map<string, { kind: 'dir'; node: any } | { kind: 'file'; node: any }>();

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
    removeEntry: vi.fn(async (name: string, _opts?: { recursive?: boolean }) => {
      if (!children.has(name)) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      children.delete(name);
    }),
    [Symbol.asyncIterator]: async function* () {
      for (const [name, c] of children) yield [name, c.node];
    },
  };

  for (const [name, spec] of Object.entries(entries)) {
    if (spec === 'dir') children.set(name, { kind: 'dir', node: makeDir() });
    else children.set(name, { kind: 'file', node: { kind: 'file', getFile: async () => new File(['x'], name), createWritable: async () => ({ write: vi.fn(), close: vi.fn() }) } });
  }
  return dir as FileSystemDirectoryHandle;
}

describe('createFolder', () => {
  it('rejects empty names', async () => {
    await expect(createFolder(makeDir(), '', '   ')).rejects.toThrow('cannot be empty');
  });

  it('rejects names containing slashes', async () => {
    const root = makeDir();
    await expect(createFolder(root, '', 'a/b')).rejects.toThrow('slashes');
    await expect(createFolder(root, '', 'a\\b')).rejects.toThrow('slashes');
  });

  it('rejects a duplicate folder name', async () => {
    const root = makeDir({ photos: 'dir' });
    await expect(createFolder(root, '', 'photos')).rejects.toThrow('already exists');
  });

  it('creates a subfolder under a nested parent path', async () => {
    const root = makeDir({ a: 'dir' });
    const h = await createFolder(root, 'a', 'b');
    expect(h).toBeTruthy();
    // Now resolvable by path — proves it landed inside a/b.
    const a = await root.getDirectoryHandle('a');
    await expect(a.getDirectoryHandle('b')).resolves.toBeTruthy();
  });
});

describe('renameFolder', () => {
  it('is a no-op when the name is unchanged', async () => {
    const root = makeDir({ photos: 'dir' });
    await renameFolder(root, '', 'photos', 'photos');
    await expect(root.getDirectoryHandle('photos')).resolves.toBeTruthy();
  });

  it('rejects renaming onto an existing folder', async () => {
    const root = makeDir({ photos: 'dir', archive: 'dir' });
    await expect(renameFolder(root, '', 'photos', 'archive')).rejects.toThrow('already exists');
  });

  it('rejects an empty new name', async () => {
    const root = makeDir({ photos: 'dir' });
    await expect(renameFolder(root, '', 'photos', '  ')).rejects.toThrow('cannot be empty');
  });

  it('renames and preserves children', async () => {
    const root = makeDir({ photos: 'dir' });
    await renameFolder(root, '', 'photos', 'holiday');
    await expect(root.getDirectoryHandle('holiday')).resolves.toBeTruthy();
    await expect(root.getDirectoryHandle('photos')).rejects.toThrow();
  });
});

describe('deleteFolder', () => {
  it('refuses to delete the root folder', async () => {
    const root = makeDir();
    await expect(deleteFolder(root, '')).rejects.toThrow('root folder');
    await expect(deleteFolder(root, '/')).rejects.toThrow('root folder');
  });

  it('throws FolderNotEmptyError on a non-empty folder without allowNonEmpty', async () => {
    const root = makeDir({ photos: 'dir' });
    // photos has a child file → non-empty.
    const photos = await root.getDirectoryHandle('photos');
    await photos.getFileHandle('x.png', { create: true });
    await expect(deleteFolder(root, 'photos')).rejects.toBeInstanceOf(FolderNotEmptyError);
    // Still there.
    await expect(root.getDirectoryHandle('photos')).resolves.toBeTruthy();
  });

  it('deletes when allowNonEmpty is true (user confirmed)', async () => {
    const root = makeDir({ photos: 'dir' });
    const photos = await root.getDirectoryHandle('photos');
    await photos.getFileHandle('x.png', { create: true });
    await deleteFolder(root, 'photos', true);
    await expect(root.getDirectoryHandle('photos')).rejects.toThrow();
  });

  it('deletes an empty folder without confirmation', async () => {
    const root = makeDir({ empty: 'dir' });
    await deleteFolder(root, 'empty');
    await expect(root.getDirectoryHandle('empty')).rejects.toThrow();
  });

  it('deletes a nested folder by path', async () => {
    const root = makeDir({ a: 'dir' });
    const a = await root.getDirectoryHandle('a');
    await a.getDirectoryHandle('b', { create: true });
    await deleteFolder(root, 'a/b');
    await expect(a.getDirectoryHandle('b')).rejects.toThrow();
  });
});
