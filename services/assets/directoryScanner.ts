/**
 * Directory scan core (plan Task 2), ported from ImageGallery's lib/fileTree.ts
 * with two fixes: path identity is root-scoped (`${rootId}:${path}`, not just
 * filename) and the trash folder + a depth cap are respected.
 */
import type { AssetFile, DirectoryNode, ScanProgress } from './types';
import { TRASH_FOLDER_NAME, MAX_SCAN_DEPTH } from './types';

function nodeId(rootId: string, path: string): string {
  return `${rootId}:${path}`;
}

/**
 * Recursively scans directory *structure only* (no file listing) to build the
 * folder tree used by the sidebar. Depth-limited; `.kollektiv-trash` skipped;
 * a permission error on a subdirectory truncates that branch, not the scan.
 */
export async function scanDirectoryTree(
  rootId: string,
  handle: FileSystemDirectoryHandle,
  path = '',
  depth = 0,
): Promise<DirectoryNode> {
  const children: DirectoryNode[] = [];
  if (depth < MAX_SCAN_DEPTH) {
    try {
      for await (const entry of (handle as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
        if (entry.kind !== 'directory') continue;
        if (entry.name === TRASH_FOLDER_NAME) continue;
        const childPath = path ? `${path}/${entry.name}` : entry.name;
        children.push(
          await scanDirectoryTree(rootId, entry as FileSystemDirectoryHandle, childPath, depth + 1),
        );
      }
    } catch (e) {
      console.warn(`[assets] could not fully read directory "${path || handle.name}":`, e);
      // Partial tree — branch is preserved, deeper children are just absent.
    }
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  return { id: nodeId(rootId, path), rootId, path, name: handle.name, handle, children };
}

export interface ListFolderResult {
  files: AssetFile[];
  /** True when the listing stopped early due to a read error (permission loss, etc). */
  truncated: boolean;
}

const PROGRESS_CHUNK = 200;

/**
 * Lists files directly inside one folder (non-recursive). Chunked so large
 * folders (10k+ entries) yield to the event loop and report progress instead
 * of blocking; never calls `getFile()` — callers decide what to read.
 */
export async function listFolderFiles(
  rootId: string,
  handle: FileSystemDirectoryHandle,
  path: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ListFolderResult> {
  const files: AssetFile[] = [];
  let scannedFiles = 0;
  let truncated = false;
  try {
    for await (const entry of (handle as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      if (entry.kind !== 'file') continue;
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      const dot = entry.name.lastIndexOf('.');
      const ext = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : '';
      files.push({
        id: nodeId(rootId, entryPath),
        rootId,
        path: entryPath,
        name: entry.name,
        ext,
        handle: entry as FileSystemFileHandle,
      });
      scannedFiles++;
      if (scannedFiles % PROGRESS_CHUNK === 0) {
        onProgress?.({ scannedDirs: 1, scannedFiles });
        // Yield to the event loop so the UI thread isn't blocked on huge folders.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (e) {
    console.warn(`[assets] could not fully list folder "${path || handle.name}":`, e);
    truncated = true;
  }
  onProgress?.({ scannedDirs: 1, scannedFiles });
  return { files, truncated };
}
