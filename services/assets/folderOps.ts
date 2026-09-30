/**
 * Folder operations for the Assets Manager — create, rename, delete.
 *
 * Uses the File System Access API (user-picked directory handles), NOT OPFS.
 * The plan wording said "OPFS getDirectoryHandle operations" but the actual
 * API is identical — both expose FileSystemDirectoryHandle. Callers must
 * ensure 'readwrite' permission before calling (assetRootManager.ensureWritable).
 *
 * Review note R2: The wording in the plan was misleading but harmless;
 * these are standard FSA methods.
 */

import { resolveDir } from './fileOps';


/**
 * Create a new folder at `parentPath/name` inside `root`.
 * Returns the new handle. Throws if the name already exists.
 */
export async function createFolder(
  root: FileSystemDirectoryHandle,
  parentPath: string,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  if (!name.trim()) throw new Error('Folder name cannot be empty.');
  if (name.includes('/') || name.includes('\\'))
    throw new Error('Folder name cannot contain slashes.');
  const parent = await resolveDir(root, parentPath);
  // getDirectoryHandle with create:false throws NotFoundError if it exists,
  // which is what we want — caller can detect the "already exists" case.
  let existing: FileSystemDirectoryHandle | null = null;
  try {
    existing = await parent.getDirectoryHandle(name, { create: false });
  } catch { /* not found — good */ }
  if (existing) throw new Error(`A folder named "${name}" already exists here.`);
  return parent.getDirectoryHandle(name, { create: true });
}

/**
 * Rename `oldName` folder inside `parentPath` to `newName`.
 *
 * File System Access API has no atomic folder rename, so we:
 * 1. Create the new folder.
 * 2. Move all children (files + sub-folders recursively) into it.
 * 3. Delete the old folder once empty.
 *
 * The operation is NOT journal-recorded at this level — callers record it.
 */
export async function renameFolder(
  root: FileSystemDirectoryHandle,
  parentPath: string,
  oldName: string,
  newName: string,
): Promise<void> {
  if (!newName.trim()) throw new Error('Folder name cannot be empty.');
  if (newName === oldName) return;
  const parent = await resolveDir(root, parentPath);
  let targetExists = false;
  try {
    await parent.getDirectoryHandle(newName, { create: false });
    targetExists = true;
  } catch { /* not found */ }
  if (targetExists) throw new Error(`A folder named "${newName}" already exists here.`);

  const srcDir = await parent.getDirectoryHandle(oldName, { create: false });
  const destDir = await parent.getDirectoryHandle(newName, { create: true });
  await copyDirContents(srcDir, destDir);
  // Remove source after all contents are copied.
  await parent.removeEntry(oldName, { recursive: true });
}

/**
 * Delete the folder at `folderPath` inside `root`.
 *
 * Review note (Weakest Assumption): `removeEntry({ recursive: true })` is
 * required for non-empty folders. We count children first and require
 * the caller to confirm non-empty deletion via `allowNonEmpty`.
 *
 * @param allowNonEmpty  Pass true only after the user has confirmed.
 * @returns The number of direct children found (for confirmation dialogs).
 */
export async function deleteFolder(
  root: FileSystemDirectoryHandle,
  folderPath: string,
  allowNonEmpty = false,
): Promise<void> {
  const parts = folderPath.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('Cannot delete the root folder.');
  const name = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('/');
  const parent = await resolveDir(root, parentPath);
  const dir = await parent.getDirectoryHandle(name, { create: false });

  if (!allowNonEmpty) {
    // Peek — if there's anything inside, refuse without confirmation.
    const children = (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]();
    const first = await children.next();
    if (!first.done) {
      throw new FolderNotEmptyError(
        `"${name}" is not empty. Confirm deletion to proceed.`,
      );
    }
  }

  await parent.removeEntry(name, { recursive: true });
}

/** Thrown by deleteFolder when the folder has children and allowNonEmpty=false. */
export class FolderNotEmptyError extends Error {
  override name = 'FolderNotEmptyError';
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Recursively copies all entries from `src` into `dest`. */
async function copyDirContents(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of src as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind === 'file') {
      const fh = handle as FileSystemFileHandle;
      const blob = await fh.getFile();
      const out = await dest.getFileHandle(name, { create: true });
      const w = await out.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      const subSrc = handle as FileSystemDirectoryHandle;
      const subDest = await dest.getDirectoryHandle(name, { create: true });
      await copyDirContents(subSrc, subDest);
    }
  }
}
