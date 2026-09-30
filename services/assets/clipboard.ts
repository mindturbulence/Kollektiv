/**
 * Assets Manager — clipboard for cut/copy/paste.
 *
 * Holds file IDs + source folder context so paste knows where to fetch handles.
 * Session-only (Jev §2.3) via sessionStorage: each tab gets its own clipboard,
 * no data leaks across sessions.
 */

const STORAGE_KEY = 'kollektiv-asset-clipboard';

export interface ClipboardPayload {
  /** Asset IDs (`${rootId}:${path}`) of the source files. */
  fileIds: string[];
  /** Root ID that owns the source files (for handle resolution). */
  rootId: string;
  /** Folder path the source files sit in (for handle resolution). */
  folderPath: string;
  mode: 'copy' | 'cut';
}

let _payload: ClipboardPayload | null = null;

function persist(): void {
  try {
    if (_payload) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_payload));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* quota / private-mode — graceful */ }
}

function restore(): ClipboardPayload | null {
  if (_payload) return _payload;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) _payload = JSON.parse(raw) as ClipboardPayload;
  } catch { /* corrupt — ignore */ }
  return _payload;
}

/** Copy file IDs to the clipboard (non-destructive). */
export function clipboardCopy(fileIds: string[], rootId: string, folderPath: string): void {
  _payload = { fileIds, rootId, folderPath, mode: 'copy' };
  persist();
}

/** Cut file IDs to the clipboard (paste will move, then clear). */
export function clipboardCut(fileIds: string[], rootId: string, folderPath: string): void {
  _payload = { fileIds, rootId, folderPath, mode: 'cut' };
  persist();
}

/** Returns the current clipboard content, or null if empty. */
export function clipboardContent(): ClipboardPayload | null {
  return restore();
}

/** True when there's something to paste. */
export function clipboardHasContent(): boolean {
  return restore() !== null;
}

/** Clear the clipboard (called after a successful cut-paste). */
export function clipboardClear(): void {
  _payload = null;
  persist();
}
