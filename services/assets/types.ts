/**
 * Assets Manager — shared types (plan Task 2/3).
 *
 * Identity is `${rootId}:${relativePath}` everywhere (files and directory
 * nodes) — fixes ImageGallery's filename/path-only collision bug when two
 * roots (or two folders) share a name.
 */

/** File System Access API permission grant states. */
export type FsPermissionState = 'granted' | 'denied' | 'prompt';

/**
 * lib.dom.d.ts in this project's TS target does not ship the File System
 * Access permission methods (fileUtils.ts casts to `any` for the same
 * reason) — declare the slice this module needs instead of casting at
 * every call site.
 */
export interface PermissionCapableHandle {
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<FsPermissionState>;
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<FsPermissionState>;
}

export interface AssetFile {
  /** `${rootId}:${path}` — stable identity across renames of sibling files in other folders. */
  id: string;
  rootId: string;
  /** Path relative to the root handle, forward-slash separated, no leading slash. */
  path: string;
  name: string;
  /** Lowercased extension without the dot. */
  ext: string;
  handle: FileSystemFileHandle;
}

export interface DirectoryNode {
  id: string;
  rootId: string;
  path: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  children: DirectoryNode[];
}

export interface ScanProgress {
  scannedDirs: number;
  scannedFiles: number;
}

/** Folder skipped entirely during scans/listings (plan: soft-delete trash). */
export const TRASH_FOLDER_NAME = '.kollektiv-trash';

/** Depth limit for directory tree scans (plan Task 2 acceptance criterion). */
export const MAX_SCAN_DEPTH = 12;

export interface AssetRoot {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: number;
}

export type RootStatus = 'granted' | 'prompt' | 'denied' | 'missing';

export interface AssetRootState extends AssetRoot {
  status: RootStatus;
}
