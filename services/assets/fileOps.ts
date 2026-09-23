/**
 * File move operations (plan Task 14, pulled forward for drag-and-drop
 * folder organization). Feature-detects `FileSystemFileHandle.move()`
 * (Chromium-only, not in lib.dom.d.ts yet); falls back to read+write+delete
 * on browsers without it. Requires a same-root move — both handles must
 * already be granted 'readwrite' (the caller's root permission check covers
 * this since Assets Manager only ever opens roots for read+write locally).
 */
import type { AssetFile } from './types';

interface MovableFileHandle extends FileSystemFileHandle {
  move?(dir: FileSystemDirectoryHandle, name?: string): Promise<void>;
}

export interface MoveResult {
  moved: string[];
  failed: { path: string; error: string }[];
}

/** Moves `files` (all currently inside `sourceDirHandle`) into `destDirHandle`. */
export async function moveFilesToFolder(
  files: AssetFile[],
  sourceDirHandle: FileSystemDirectoryHandle,
  destDirHandle: FileSystemDirectoryHandle,
): Promise<MoveResult> {
  const moved: string[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const file of files) {
    try {
      const fh = file.handle as MovableFileHandle;
      if (typeof fh.move === 'function') {
        await fh.move(destDirHandle, file.name);
      } else {
        const blob = await file.handle.getFile();
        const newHandle = await destDirHandle.getFileHandle(file.name, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        await sourceDirHandle.removeEntry(file.name);
      }
      moved.push(file.path);
    } catch (e) {
      failed.push({ path: file.path, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { moved, failed };
}
