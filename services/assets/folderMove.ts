/**
 * Background folder-move service (plan Phase 4, Jev §2.4: background + progress).
 *
 * Moves all files inside a source folder into a destination folder recursively,
 * recording each file in the undo journal (real root ids, so undo resolves).
 * The operation runs in a loop that checks a cancel signal, so the UI stays
 * interactive throughout; the emptied source directory is removed at the end.
 *
 * Callers must:
 *  1. Ensure readwrite permission on both roots before calling.
 *  2. Validate the drop with `isInvalidFolderDrop` (self / descendant / parent).
 *  3. Provide a progress callback for toast updates.
 */

import { moveOne, resolveDir, entryExists, keepBothName } from './fileOps';
import { recordOp } from './undoJournal';
import type { Transferred } from './fileOps';

export interface FolderMoveProgress {
  moved: number;
  total: number;
  currentFile: string;
}

export interface FolderMoveResult {
  moved: Transferred[];
  failed: { path: string; error: string }[];
  cancelled: boolean;
}

/**
 * Count all files under a directory handle (recursive) for progress reporting.
 * Best-effort; returns 0 on error.
 */
export async function countFilesDeep(dir: FileSystemDirectoryHandle): Promise<number> {
  let total = 0;
  try {
    for await (const [, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file') total++;
      else total += await countFilesDeep(handle as FileSystemDirectoryHandle);
    }
  } catch { /* best-effort */ }
  return total;
}

/**
 * Check whether `candidate` is the same directory as `target` or a descendant
 * of it by walking upward from `candidate` via path string comparison.
 *
 * @param srcPath   Source folder path relative to root (e.g. "photos/2025").
 * @param destPath  Destination path relative to root.
 */
export function isDescendantOrSelf(srcPath: string, destPath: string): boolean {
  if (srcPath === destPath) return true;
  const normalSrc = srcPath.endsWith('/') ? srcPath : srcPath + '/';
  return destPath.startsWith(normalSrc);
}

/**
 * Drop-target guard for folder → folder drags (plan §4.2, §7 "descendant-guard").
 * Invalid when the target is the source itself, a descendant of it (would
 * create a cycle), or its parent (the folder already lives there — a no-op).
 *
 * @param srcPath   Path of the folder being dragged, relative to its root.
 * @param destPath  Path of the folder being dropped onto, relative to the same root.
 */
export function isInvalidFolderDrop(srcPath: string, destPath: string): boolean {
  if (srcPath === destPath) return true;
  const normalSrc = srcPath.endsWith('/') ? srcPath : srcPath + '/';
  if (destPath.startsWith(normalSrc)) return true;
  const normalDest = destPath.endsWith('/') ? destPath : destPath + '/';
  return srcPath.startsWith(normalDest);
}

/**
 * Move a directory tree from `srcPath` to `destPath` (inside `destRoot`),
 * file-by-file, with cancellation and progress reporting. `destPath` is the
 * final container of the contents — callers that nest (drop folder `photos`
 * onto `archive`) pass `archive/photos` as `destPath`.
 *
 * @param srcRootId   Root id of the source (journal ids must be real for undo).
 * @param srcRoot     Root handle for the source.
 * @param srcPath     Source folder path relative to srcRoot.
 * @param destRootId  Root id of the destination.
 * @param destRoot    Root handle for the destination.
 * @param destPath    Destination folder path relative to destRoot.
 * @param cancelRef   Set `.current = true` to cancel mid-flight.
 * @param onProgress  Called after each file move.
 */
export async function moveFolder(
  srcRootId: string,
  srcRoot: FileSystemDirectoryHandle,
  srcPath: string,
  destRootId: string,
  destRoot: FileSystemDirectoryHandle,
  destPath: string,
  cancelRef: { current: boolean },
  onProgress?: (p: FolderMoveProgress) => void,
): Promise<FolderMoveResult> {
  const result: FolderMoveResult = { moved: [], failed: [], cancelled: false };

  const srcDir = await resolveDir(srcRoot, srcPath);
  // Count files upfront for progress denominator (best-effort).
  const total = await countFilesDeep(srcDir);
  const moved = 0;

  await moveDirRecursive(
    srcRootId, srcRoot, srcPath, srcDir,
    destRootId, destRoot, destPath,
    cancelRef, result, { moved, total }, onProgress,
  );

  // Journal everything that moved as a single batch (also on cancel: a partial
  // completion journals what actually moved, plan §4.2).
  if (result.moved.length > 0) {
    const srcName = srcPath.split('/').filter(Boolean).pop() ?? srcPath;
    const destParent = destPath.includes('/') ? destPath.slice(0, destPath.lastIndexOf('/')) : '';
    await recordOp({
      kind: 'transfer',
      mode: 'move',
      label: destParent ? `Move folder "${srcName}" to "${destParent}"` : `Move folder "${srcName}"`,
      items: result.moved,
    }).catch(() => {});
  }

  return result;
}

// ── Internal recursive worker ─────────────────────────────────────────────────

async function moveDirRecursive(
  srcRootId: string,
  srcRoot: FileSystemDirectoryHandle,
  srcDirPath: string,
  srcDirHandle: FileSystemDirectoryHandle,
  destRootId: string,
  destRoot: FileSystemDirectoryHandle,
  destDirPath: string,
  cancelRef: { current: boolean },
  result: FolderMoveResult,
  counter: { moved: number; total: number },
  onProgress?: (p: FolderMoveProgress) => void,
): Promise<void> {
  // Ensure destination exists.
  const destDirHandle = await resolveDir(destRoot, '').then(async r => {
    let cur = r;
    for (const seg of destDirPath.split('/').filter(Boolean)) {
      cur = await cur.getDirectoryHandle(seg, { create: true });
    }
    return cur;
  });

  for await (const [name, handle] of srcDirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (cancelRef.current) {
      result.cancelled = true;
      return;
    }

    const srcItemPath = srcDirPath ? `${srcDirPath}/${name}` : name;

    if (handle.kind === 'file') {
      const fh = handle as FileSystemFileHandle;
      try {
        let destName = name;
        if (await entryExists(destDirHandle, name)) {
          destName = await keepBothName(destDirHandle, name);
        }
        await moveOne(fh, srcDirHandle, name, destDirHandle, destName);
        const destItemPath = destDirPath ? `${destDirPath}/${destName}` : destName;
        result.moved.push({
          fromId: `${srcRootId}:${srcItemPath}`,
          toId: `${destRootId}:${destItemPath}`,
          fromRootId: srcRootId,
          fromPath: srcItemPath,
          toRootId: destRootId,
          toPath: destItemPath,
        });
        counter.moved++;
        onProgress?.({ moved: counter.moved, total: counter.total, currentFile: name });
      } catch (err) {
        result.failed.push({ path: srcItemPath, error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      // Recurse into subfolder.
      const subSrc = handle as FileSystemDirectoryHandle;
      const subDestPath = destDirPath ? `${destDirPath}/${name}` : name;
      await moveDirRecursive(
        srcRootId, srcRoot, srcItemPath, subSrc,
        destRootId, destRoot, subDestPath,
        cancelRef, result, counter, onProgress,
      );
    }
  }

  // Remove the now-empty source directory.
  if (!result.cancelled) {
    try {
      const parts = srcDirPath.split('/').filter(Boolean);
      if (parts.length > 0) {
        const parentPath = parts.slice(0, -1).join('/');
        const folderName = parts[parts.length - 1];
        const parentHandle = await resolveDir(srcRoot, parentPath);
        await parentHandle.removeEntry(folderName, { recursive: false }); // should be empty
      }
    } catch { /* best-effort cleanup */ }
  }
}
