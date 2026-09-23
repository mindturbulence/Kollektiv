/**
 * Multi-root manager (plan Task 3): owns N arbitrary directory handles,
 * separate from the vault's `fileSystemManager` singleton (utils/fileUtils.ts).
 * Persists via the existing IDB keyval store (utils/db.ts) — no new IDB
 * abstraction. Mirrors fileUtils' queryPermission-first pattern, but never
 * calls `requestPermission` outside a user gesture (it needs one to succeed).
 */
import { getHandle, setHandle } from '../../utils/db';
import type { AssetRoot, AssetRootState, PermissionCapableHandle, RootStatus } from './types';

const STORAGE_KEY = 'assets-roots';

function asPermissionCapable(handle: FileSystemDirectoryHandle): PermissionCapableHandle {
  return handle as unknown as PermissionCapableHandle;
}

async function loadRoots(): Promise<AssetRoot[]> {
  const stored = await getHandle<AssetRoot[]>(STORAGE_KEY);
  return stored ?? [];
}

async function persistRoots(roots: AssetRoot[]): Promise<void> {
  await setHandle(STORAGE_KEY, roots);
}

/**
 * Non-interactive permission check (safe to call at boot, no user gesture
 * required). Returns 'missing' when the handle is stale (folder moved/deleted).
 */
async function checkStatus(handle: FileSystemDirectoryHandle): Promise<RootStatus> {
  try {
    const state = await asPermissionCapable(handle).queryPermission({ mode: 'read' });
    if (state === 'granted' || state === 'prompt' || state === 'denied') return state;
    return 'prompt';
  } catch (e: any) {
    if (e?.name === 'NotFoundError') return 'missing';
    console.warn('[assets] queryPermission failed:', e);
    return 'denied';
  }
}

/** Interactive re-grant — must be called from a user gesture (button click). */
export async function requestRootPermission(root: AssetRoot): Promise<RootStatus> {
  try {
    const state = await asPermissionCapable(root.handle).requestPermission({ mode: 'read' });
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
  } catch (e: any) {
    if (e?.name === 'NotFoundError') return 'missing';
    console.warn('[assets] requestPermission failed:', e);
    return 'denied';
  }
}

/** Lists all persisted roots with their current (non-interactive) permission status. */
export async function listRoots(): Promise<AssetRootState[]> {
  const roots = await loadRoots();
  const withStatus = await Promise.all(
    roots.map(async root => ({ ...root, status: await checkStatus(root.handle) })),
  );
  return withStatus;
}

/** Adds an already-obtained directory handle as a root (e.g. from a drag-and-drop drop event). */
export async function addRootFromHandle(handle: FileSystemDirectoryHandle): Promise<AssetRootState> {
  const status = await checkStatus(handle);
  const roots = await loadRoots();
  // Same folder re-added: refresh the handle in place rather than duplicating.
  const dup = roots.find(r => r.name === handle.name);
  const root: AssetRoot = dup
    ? { ...dup, handle }
    : { id: `root_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: handle.name, handle, addedAt: Date.now() };
  const next = dup ? roots.map(r => (r.id === root.id ? root : r)) : [...roots, root];
  await persistRoots(next);
  return { ...root, status };
}

/** Opens the native directory picker and adds the chosen folder as a root. Requires a user gesture. */
export async function addRoot(): Promise<AssetRootState | null> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('This browser does not support the File System Access API.');
  }
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await (window as any).showDirectoryPicker({ id: 'kollektiv-assets-root', mode: 'read' });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return null; // user cancelled
    throw e;
  }
  return addRootFromHandle(handle);
}

/** Removes a root from the manager's list. Never touches anything on disk. */
export async function removeRoot(rootId: string): Promise<void> {
  const roots = await loadRoots();
  await persistRoots(roots.filter(r => r.id !== rootId));
}
