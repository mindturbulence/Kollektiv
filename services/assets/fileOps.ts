/**
 * File operations (plan Tasks 13, 14): rename, copy and move with a conflict
 * policy. Feature-detects `FileSystemFileHandle.move()` (Chromium-only, not in
 * lib.dom.d.ts yet); falls back to read+write+delete without it. Callers ask
 * for 'readwrite' permission first (assetRootManager.ensureWritable).
 */
import type { AssetFile } from './types';

interface MovableFileHandle extends FileSystemFileHandle {
  move?(dir: FileSystemDirectoryHandle, name?: string): Promise<void>;
}

// ── Rename / copy / move with a conflict policy (plan Tasks 13, 14) ──────

/** 'skip' leaves a same-named file alone; 'keep-both' writes "name (2).ext". */
export type ConflictPolicy = 'skip' | 'keep-both';

export interface Destination { rootId: string; path: string; handle: FileSystemDirectoryHandle }

/** One completed transfer, in the index's terms (ids are `${rootId}:${path}`). */
export interface Transferred { fromId: string; toId: string; fromRootId: string; fromPath: string; toRootId: string; toPath: string }

export interface TransferResult { done: Transferred[]; skipped: string[]; failed: { path: string; error: string }[] }

const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const parentPath = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export async function entryExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try { await dir.getFileHandle(name); return true; } catch { /* NotFound */ }
  try { await dir.getDirectoryHandle(name); return true; } catch { return false; }
}

/** "photo.jpg" → "photo (2).jpg", "photo (3).jpg", … — the first free name. */
export async function keepBothName(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await entryExists(dir, candidate))) return candidate;
  }
  throw new Error(`no free name for ${name}`);
}

/** Walks `path` (forward-slash, relative) from a root to a folder handle. */
export async function resolveDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part);
  return dir;
}

export async function resolveFile(root: FileSystemDirectoryHandle, path: string): Promise<{ dir: FileSystemDirectoryHandle; handle: FileSystemFileHandle; name: string }> {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dir = await resolveDir(root, parentPath(path));
  return { dir, handle: await dir.getFileHandle(name), name };
}

async function copyInto(handle: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string): Promise<void> {
  const blob = await handle.getFile();
  const out = await dest.getFileHandle(name, { create: true });
  const w = await out.createWritable();
  await w.write(blob);
  await w.close();
}

/** Moves (or renames, when `dest` is the source folder) one file. move() when
 *  the browser has it, else copy + delete. The caller has checked the name is free. */
export async function moveOne(handle: FileSystemFileHandle, srcDir: FileSystemDirectoryHandle, srcName: string, dest: FileSystemDirectoryHandle, name: string): Promise<void> {
  const fh = handle as MovableFileHandle;
  if (typeof fh.move === 'function') { await fh.move(dest, name); return; }
  await copyInto(handle, dest, name);
  await srcDir.removeEntry(srcName);
}

/**
 * Copies or moves files into `dest`, honouring the conflict policy. Each item
 * carries its own source folder (a filtered/collection view can span folders
 * and roots). Moving into the folder a file is already in is a no-op.
 */
export async function transferFiles(
  items: { file: AssetFile; srcDir: FileSystemDirectoryHandle }[],
  dest: Destination,
  mode: 'move' | 'copy',
  policy: ConflictPolicy,
): Promise<TransferResult> {
  const result: TransferResult = { done: [], skipped: [], failed: [] };
  for (const { file, srcDir } of items) {
    try {
      if (mode === 'move' && file.rootId === dest.rootId && parentPath(file.path) === dest.path) { result.skipped.push(file.path); continue; }
      let name = file.name;
      if (await entryExists(dest.handle, name)) {
        if (policy === 'skip') { result.skipped.push(file.path); continue; }
        name = await keepBothName(dest.handle, name);
      }
      if (mode === 'move') await moveOne(file.handle, srcDir, file.name, dest.handle, name);
      else await copyInto(file.handle, dest.handle, name);
      const toPath = joinPath(dest.path, name);
      result.done.push({ fromId: file.id, toId: `${dest.rootId}:${toPath}`, fromRootId: file.rootId, fromPath: file.path, toRootId: dest.rootId, toPath });
    } catch (e) {
      result.failed.push({ path: file.path, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
