/**
 * Assets Manager — soft-delete via .kollektiv-trash.
 *
 * Review note C1: TRASH_FOLDER_NAME is already in types.ts and
 * scanDirectoryTree already skips it. The gap is in listFolderFiles —
 * that fix belongs in Phase 2 (when trash integration is active).
 *
 * Structure: .kollektiv-trash/<timestamp>/<original-relative-path>
 * so collisions between same-named files from different folders are impossible.
 *
 * Cleanup: purgeTrash() runs opportunistically on root load and removes
 * entries older than `olderThanDays` (default 30).
 */

import { TRASH_FOLDER_NAME, MAX_SCAN_DEPTH } from './types';
import { resolveDir, moveOne } from './fileOps';
import type { AssetFile } from './types';

/** One trashed entry, recorded for restore. */
export interface TrashedEntry {
  /** Timestamp-keyed subfolder name inside .kollektiv-trash. */
  batchKey: string;
  /** Original path relative to root (to restore to). */
  originalPath: string;
  /** Filename as trashed. */
  name: string;
  /** Unix ms when it was trashed. */
  trashedAt: number;
}

/** Moves one or more files to .kollektiv-trash/<batchKey>/<originalRelativePath>. */
export async function moveToTrash(
  root: FileSystemDirectoryHandle,
  files: AssetFile[],
): Promise<TrashedEntry[]> {
  if (files.length === 0) return [];

  const batchKey = String(Date.now());
  const trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true });
  const batchDir = await trashRoot.getDirectoryHandle(batchKey, { create: true });
  const results: TrashedEntry[] = [];

  for (const file of files) {
    try {
      // Mirror the original folder structure inside the batch dir.
      const parts = file.path.split('/').filter(Boolean);
      const fileName = parts.pop()!; // file name
      // Build the subfolder chain.
      let destDir: FileSystemDirectoryHandle = batchDir;
      for (const seg of parts) {
        destDir = await destDir.getDirectoryHandle(seg, { create: true });
      }
      const srcParts = file.path.split('/').filter(Boolean);
      const srcFileName = srcParts[srcParts.length - 1];
      const srcDirPath = srcParts.slice(0, -1).join('/');
      const srcDir = await resolveDir(root, srcDirPath);

      await moveOne(file.handle, srcDir, srcFileName, destDir, fileName);
      results.push({
        batchKey,
        originalPath: file.path,
        name: fileName,
        trashedAt: Date.now(),
      });
    } catch (err) {
      console.error(`[trash] Failed to trash ${file.path}:`, err);
    }
  }

  return results;
}

/**
 * Restore files from trash back to their original locations.
 * Missing source files (already purged) are silently skipped.
 */
export async function restoreFromTrash(
  root: FileSystemDirectoryHandle,
  entries: TrashedEntry[],
): Promise<void> {
  const trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: false }).catch(() => null);
  if (!trashRoot) return;

  for (const entry of entries) {
    try {
      const batchDir = await trashRoot.getDirectoryHandle(entry.batchKey, { create: false });
      const parts = entry.originalPath.split('/').filter(Boolean);
      const fileName = parts[parts.length - 1];
      const subPath = parts.slice(0, -1).join('/');

      // Navigate to the mirrored subfolder in batchDir.
      let srcDir: FileSystemDirectoryHandle = batchDir;
      for (const seg of subPath.split('/').filter(Boolean)) {
        srcDir = await srcDir.getDirectoryHandle(seg, { create: false });
      }

      const srcHandle = await srcDir.getFileHandle(fileName);
      const destDir = await resolveDir(root, subPath);
      await moveOne(srcHandle, srcDir, fileName, destDir, fileName);
    } catch (err) {
      console.error(`[trash] Failed to restore ${entry.originalPath}:`, err);
    }
  }
}

/** Lists every trashed file across all batches, newest trashed first. */
export async function listTrash(root: FileSystemDirectoryHandle): Promise<TrashedEntry[]> {
  let trashRoot: FileSystemDirectoryHandle;
  try {
    trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: false });
  } catch {
    return [];
  }

  const out: TrashedEntry[] = [];
  for await (const [batchKey, batchHandle] of trashRoot as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (batchHandle.kind !== 'directory') continue;
    const trashedAt = Number(batchKey);
    if (Number.isNaN(trashedAt)) continue;
    try {
      await collectBatchFiles(batchHandle as FileSystemDirectoryHandle, '', batchKey, trashedAt, out, 0);
    } catch { /* unreadable batch — skip it */ }
  }
  out.sort((a, b) => b.trashedAt - a.trashedAt);
  return out;
}

async function collectBatchFiles(
  dir: FileSystemDirectoryHandle,
  path: string,
  batchKey: string,
  trashedAt: number,
  out: TrashedEntry[],
  depth: number,
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;
  for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    const entryPath = path ? `${path}/${name}` : name;
    if (handle.kind === 'file') {
      out.push({ batchKey, originalPath: entryPath, name, trashedAt });
    } else {
      await collectBatchFiles(handle as FileSystemDirectoryHandle, entryPath, batchKey, trashedAt, out, depth + 1);
    }
  }
}

/** Permanently deletes the given trashed files; returns how many were removed. */
export async function deleteForever(
  root: FileSystemDirectoryHandle,
  entries: TrashedEntry[],
): Promise<number> {
  let trashRoot: FileSystemDirectoryHandle;
  try {
    trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: false });
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    try {
      const batchDir = await trashRoot.getDirectoryHandle(entry.batchKey, { create: false });
      const parts = entry.originalPath.split('/').filter(Boolean);
      const fileName = parts.pop()!;
      let dir = batchDir;
      for (const seg of parts) dir = await dir.getDirectoryHandle(seg, { create: false });
      await dir.removeEntry(fileName);
      removed++;
    } catch { /* already gone */ }
  }
  return removed;
}

/** Removes every batch — empties the whole trash for this root. */
export async function emptyTrash(root: FileSystemDirectoryHandle): Promise<void> {
  let trashRoot: FileSystemDirectoryHandle;
  try {
    trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: false });
  } catch {
    return;
  }

  const names: string[] = [];
  for await (const [name] of trashRoot as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    names.push(name);
  }
  for (const name of names) {
    try {
      await trashRoot.removeEntry(name, { recursive: true });
    } catch { /* best-effort */ }
  }
}

/**
 * Purge trash entries older than `olderThanDays` days.
 * Runs opportunistically — errors are swallowed.
 * Called on root load to keep disk usage bounded.
 */
export async function purgeTrash(
  root: FileSystemDirectoryHandle,
  olderThanDays = 30,
): Promise<void> {
  let trashRoot: FileSystemDirectoryHandle;
  try {
    trashRoot = await root.getDirectoryHandle(TRASH_FOLDER_NAME, { create: false });
  } catch {
    return; // no trash folder at all
  }

  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];

  for await (const [batchKey] of trashRoot as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    const ts = Number(batchKey);
    if (!isNaN(ts) && ts < cutoff) toDelete.push(batchKey);
  }

  for (const key of toDelete) {
    try {
      await trashRoot.removeEntry(key, { recursive: true });
    } catch { /* best-effort */ }
  }
}
