import { describe, it, expect, vi, beforeEach } from 'vitest';
import { moveFolder, isInvalidFolderDrop, countFilesDeep } from './folderMove';

vi.mock('./undoJournal', () => ({ recordOp: vi.fn(async () => {}) }));
import { recordOp } from './undoJournal';

// ── Minimal in-memory File System Access mock ────────────────────────────────
// Enough for resolveDir walks, async iteration, moveOne(handle.move) and the
// end-of-move removeEntry of the emptied source directory.

interface MockNode { kind: 'file' | 'dir'; name: string; parent: MockDir | null; }
interface MockDir extends MockNode { kind: 'dir'; children: Map<string, MockNode>; }
interface MockFile extends MockNode { kind: 'file'; move: (dest: MockDir, newName: string) => Promise<void>; }

function makeDir(name = '', parent: MockDir | null = null): MockDir {
  const children = new Map<string, MockNode>();
  const dir: MockDir = {
    kind: 'dir', name, parent, children,
    async getDirectoryHandle(child: string, opts?: { create?: boolean }) {
      const existing = children.get(child);
      if (existing?.kind === 'dir') return existing;
      if (!opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      const created = makeDir(child, dir);
      children.set(child, created);
      return created;
    },
    async getFileHandle(child: string) {
      const existing = children.get(child);
      if (existing?.kind === 'file') return existing;
      throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
    },
    async removeEntry(child: string) { children.delete(child); },
    async *[Symbol.asyncIterator](): AsyncGenerator<[string, MockNode]> { yield* children.entries(); },
  } as unknown as MockDir;
  return dir;
}

function addFile(dir: MockDir, name: string): MockFile {
  const file: MockFile = {
    kind: 'file', name, parent: dir,
    async move(dest: MockDir, newName: string) {
      file.parent?.children.delete(file.name);
      file.name = newName;
      file.parent = dest;
      dest.children.set(newName, file);
    },
  };
  dir.children.set(name, file);
  return file;
}

function addDir(parent: MockDir, name: string): MockDir {
  const dir = makeDir(name, parent);
  parent.children.set(name, dir);
  return dir;
}

beforeEach(() => vi.mocked(recordOp).mockClear());

/** The mock only implements what folderMove touches — bridge to the DOM types. */
const asHandle = (d: MockDir) => d as unknown as FileSystemDirectoryHandle;

describe('isInvalidFolderDrop (plan §7: descendant-guard)', () => {
  it('blocks self, descendants and the parent (already-there no-op)', () => {
    expect(isInvalidFolderDrop('photos', 'photos')).toBe(true);
    expect(isInvalidFolderDrop('photos', 'photos/2025')).toBe(true);
    expect(isInvalidFolderDrop('photos/2025', 'photos')).toBe(true);
  });

  it('allows siblings and unrelated folders', () => {
    expect(isInvalidFolderDrop('photos', 'archive')).toBe(false);
    expect(isInvalidFolderDrop('photos/2025', 'archive')).toBe(false);
    expect(isInvalidFolderDrop('photos/2025', 'photos-backup')).toBe(false); // prefix trap: not a parent
    expect(isInvalidFolderDrop('photos', 'archive/inner')).toBe(false);
  });
});

describe('countFilesDeep', () => {
  it('counts files across nested folders', async () => {
    const root = makeDir();
    const photos = addDir(root, 'photos');
    addFile(photos, 'a.png');
    const sub = addDir(photos, 'sub');
    addFile(sub, 'c.png');
    expect(await countFilesDeep(asHandle(root))).toBe(2);
    expect(await countFilesDeep(asHandle(makeDir()))).toBe(0);
  });
});

describe('moveFolder', () => {
  it('nests into destPath, keeps subfolders, journals real root ids, reports progress', async () => {
    const root = makeDir();
    const photos = addDir(root, 'photos');
    addFile(photos, 'a.png');
    addFile(photos, 'b.png');
    const sub = addDir(photos, 'sub');
    addFile(sub, 'c.png');
    addDir(root, 'archive');

    const cancel = { current: false };
    const progress: { moved: number; total: number; currentFile: string }[] = [];
    const res = await moveFolder(
      'r1', asHandle(root), 'photos',
      'r1', asHandle(root), 'archive/photos',
      cancel, p => progress.push({ ...p }),
    );

    expect(res.cancelled).toBe(false);
    expect(res.failed).toEqual([]);
    expect(res.moved).toHaveLength(3);
    expect(res.moved[0]).toEqual({
      fromId: 'r1:photos/a.png', toId: 'r1:archive/photos/a.png',
      fromRootId: 'r1', fromPath: 'photos/a.png',
      toRootId: 'r1', toPath: 'archive/photos/a.png',
    });

    const archive = root.children.get('archive') as MockDir;
    const nested = archive.children.get('photos') as MockDir;
    expect(nested.children.get('a.png')).toBeTruthy();
    expect(nested.children.get('b.png')).toBeTruthy();
    expect((nested.children.get('sub') as MockDir).children.get('c.png')).toBeTruthy();
    expect(root.children.has('photos')).toBe(false); // emptied source removed

    expect(progress.at(-1)).toEqual({ moved: 3, total: 3, currentFile: 'c.png' });
    expect(recordOp).toHaveBeenCalledTimes(1);
    expect(recordOp).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'transfer', mode: 'move', label: 'Move folder "photos" to "archive"',
      items: expect.any(Array),
    }));
  });

  it('cancel stops mid-flight: partial journal, source kept, cancelled flag set', async () => {
    const root = makeDir();
    const photos = addDir(root, 'photos');
    addFile(photos, 'a.png');
    addFile(photos, 'b.png');
    addDir(root, 'archive');

    const cancel = { current: false };
    const res = await moveFolder(
      'r1', asHandle(root), 'photos',
      'r1', asHandle(root), 'archive/photos',
      cancel, p => { if (p.moved >= 1) cancel.current = true; },
    );

    expect(res.cancelled).toBe(true);
    expect(res.moved).toHaveLength(1);
    expect(recordOp).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordOp).mock.calls[0][0]).toMatchObject({ items: [expect.objectContaining({ fromPath: 'photos/a.png' })] });
    expect(root.children.has('photos')).toBe(true); // not removed on cancel
    expect((root.children.get('photos') as MockDir).children.has('b.png')).toBe(true);
  });

  it('keeps both when a file of the same name exists at the destination', async () => {
    const root = makeDir();
    const photos = addDir(root, 'photos');
    addFile(photos, 'a.png');
    const archive = addDir(root, 'archive');
    const nested = addDir(archive, 'photos');
    addFile(nested, 'a.png');

    const res = await moveFolder('r1', asHandle(root), 'photos', 'r1', asHandle(root), 'archive/photos', { current: false });
    expect(res.moved).toHaveLength(1);
    expect(res.moved[0].toPath).toBe('archive/photos/a (2).png');
    expect((nested.children.get('a (2).png') as MockFile | undefined)).toBeTruthy();
    expect(root.children.has('photos')).toBe(false);
  });
});
