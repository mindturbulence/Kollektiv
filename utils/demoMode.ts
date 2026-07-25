/**
 * Demo Mode Storage Service
 *
 * Provides an OPFS-backed IFileSystemManager implementation for Firefox/Safari
 * users who cannot use the File System Access API (showDirectoryPicker).
 *
 * Also exports reactive signals so the UI can react to demo-mode state.
 */

import type { IFileSystemManager } from './fileUtils';
import type { AuthContextType } from '../contexts/AuthContext';
import type { LLMSettings } from '../types';

// ── Reactive demo-mode signal ──────────────────────────────────────────────

type Listener = (active: boolean) => void;
const listeners = new Set<Listener>();

let _isDemoMode = false;

/** Subscribe to demo-mode state changes. Returns unsubscribe function. */
export function onDemoModeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isDemoMode(): boolean {
  return _isDemoMode;
}

function setDemoMode(active: boolean) {
  if (_isDemoMode === active) return;
  _isDemoMode = active;
  listeners.forEach((fn) => fn(active));
}

// ── OPFS-backed DemoFileSystemManager ──────────────────────────────────────

/**
 * A lightweight IFileSystemManager that uses the Origin Private File System
 * (OPFS) as its backing store. All data is sandboxed to the browser origin
 * and does not require the File System Access API (showDirectoryPicker).
 *
 * Intended for Firefox/Safari users or anyone who wants to try the app
 * without granting folder access.
 */
export class DemoFileSystemManager implements IFileSystemManager {
  /** In-memory fallback when OPFS is unavailable or an operation fails. */
  private store = new Map<string, Blob>();

  /** Whether we successfully obtained an OPFS root handle. */
  private opfsAvailable = false;

  /** Cached OPFS root handle. */
  private opfsRoot: FileSystemDirectoryHandle | null = null;

  /** Keep the IFileSystemManager interface happy — demo mode is always "ready". */
  public isInitialized = true;

  public storageProvider: 'local' | 'drive' = 'local';
  public appDirectoryName: string | null = 'Demo Vault';
  public accessToken: string | null = null;
  public rootFolderId: string | null = null;
  public pathCache: Map<string, { id: string; mimeType: string }> = new Map();
  public lastError: string | null = null;
  public isMigrationPaused = false;
  public isMigrationAborted = false;

  constructor() {
    this.initOpfs();
  }

  private async initOpfs(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage) {
        this.opfsRoot = await navigator.storage.getDirectory();
        this.opfsAvailable = true;
      }
    } catch (e) {
      console.warn('[DemoMode] OPFS not available, falling back to in-memory store:', e);
      this.opfsAvailable = false;
    }
  }

  // ── IFileSystemManager implementation ─────────────────────────────────────

  async initialize(_settings: LLMSettings, _auth: AuthContextType): Promise<boolean> {
    return true;
  }

  isDirectorySelected(): boolean {
    return true;
  }

  async selectAndSetAppDataDirectory(): Promise<FileSystemDirectoryHandle | null> {
    return null; // Demo mode: no real folder selection
  }

  async requestExistingPermission(): Promise<boolean> {
    return true;
  }

  async saveFile(filePath: string, content: Blob): Promise<string> {
    // Try OPFS first, fall back to in-memory
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        const handle = await this.getOpfsFileHandle(filePath, true);
        if (!handle) throw new Error('OPFS file handle unavailable');
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return filePath;
      } catch (e) {
        console.warn('[DemoMode] OPFS save failed, falling back to memory:', e);
      }
    }
    this.store.set(filePath, content);
    return filePath;
  }

  async readFile(filePath: string): Promise<string | null> {
    const blob = await this.getFileAsBlob(filePath);
    if (!blob) return null;
    try {
      return await blob.text();
    } catch {
      return null;
    }
  }

  async getFileAsBlob(filePath: string): Promise<Blob | null> {
    // Try OPFS first
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        const handle = await this.getOpfsFileHandle(filePath, false);
        if (handle) {
          const file = await handle.getFile();
          return file;
        }
      } catch {
        // Not found in OPFS, fall through
      }
    }
    return this.store.get(filePath) ?? null;
  }

  async deleteFile(filePath: string): Promise<void> {
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        const handle = await this.getOpfsFileHandle(filePath, false);
        if (!handle) return;
        // OPFS doesn't have a direct delete on FileSystemFileHandle.
        // We remove the entry from its parent directory.
        const segments = this.normalizePath(filePath).split('/');
        const fileName = segments.pop();
        if (!fileName) return;
        let dir = this.opfsRoot;
        for (const seg of segments) {
          if (seg) dir = await dir.getDirectoryHandle(seg);
        }
        await dir.removeEntry(fileName);
      } catch {
        // Fall through
      }
    }
    this.store.delete(filePath);
  }

  async *listDirectoryContents(path: string): AsyncGenerator<FileSystemHandle> {
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        let dir = this.opfsRoot;
        const segments = this.normalizePath(path).split('/').filter(Boolean);
        for (const seg of segments) {
          dir = await dir.getDirectoryHandle(seg);
        }
        for await (const [key] of (dir as any).entries()) {
          try {
            const child = await dir.getDirectoryHandle(key);
            yield child as unknown as FileSystemHandle;
          } catch {
            const child = await dir.getFileHandle(key);
            yield child as unknown as FileSystemHandle;
          }
        }
        return;
      } catch {
        // Fall through
      }
    }
    // In-memory fallback: yield entries from the store with matching prefix
    const prefix = this.normalizePath(path) ? `${this.normalizePath(path)}/` : '';
    const seen = new Set<string>();
    for (const key of this.store.keys()) {
      if (!key.startsWith(prefix)) continue;
      const remainder = key.slice(prefix.length);
      const firstSlash = remainder.indexOf('/');
      const entryName = firstSlash >= 0 ? remainder.slice(0, firstSlash) : remainder;
      if (!entryName || seen.has(entryName)) continue;
      seen.add(entryName);
      // We can't yield real FileSystemHandles from in-memory data,
      // but we yield a minimal mock for listing purposes.
      yield {
        kind: firstSlash >= 0 ? 'directory' : 'file',
        name: entryName,
      } as unknown as FileSystemHandle;
    }
  }

  async reset(): Promise<void> {
    this.store.clear();
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        for await (const [key] of (this.opfsRoot as any).entries()) {
          await this.opfsRoot.removeEntry(key, { recursive: true });
        }
      } catch (e) {
        console.warn('[DemoMode] OPFS reset failed:', e);
      }
    }
  }

  async calculateTotalSize(): Promise<number> {
    let total = 0;
    for (const blob of this.store.values()) {
      total += blob.size;
    }
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        total += await this.calculateOpfsSize(this.opfsRoot);
      } catch {
        // ignore
      }
    }
    return total;
  }

  // ── Stubs for Google Drive / migration methods ────────────────────────────

  async migrateLocalToDrive(): Promise<void> {
    // No-op: demo mode has no Google Drive integration
  }

  async syncDriveToLocal(): Promise<void> {
    // No-op: demo mode has no Google Drive integration
  }

  async scanForKollektivFolder(): Promise<{ id: string; name: string } | null> {
    return null;
  }

  async createKollektivFolder(): Promise<string> {
    throw new Error('Google Drive is not available in demo mode.');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  private async getOpfsFileHandle(
    filePath: string,
    create: boolean
  ): Promise<FileSystemFileHandle | null> {
    if (!this.opfsRoot) return null;
    const segments = this.normalizePath(filePath).split('/');
    const fileName = segments.pop();
    if (!fileName) return null;

    let dir = this.opfsRoot;
    for (const seg of segments) {
      if (!seg) continue;
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return await dir.getFileHandle(fileName, { create });
  }

  private async calculateOpfsSize(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<number> {
    let total = 0;
    for await (const [, entryVal] of (dirHandle as any).entries()) {
      const _fileHandle = entryVal;

      if (_fileHandle.kind === 'file') {
        const file = await (_fileHandle as FileSystemFileHandle).getFile();
        total += file.size;
      } else if (_fileHandle.kind === 'directory') {
        total += await this.calculateOpfsSize(_fileHandle as FileSystemDirectoryHandle);
      }
    }
    return total;
  }
}

// ── Demo mode lifecycle ────────────────────────────────────────────────────

/**
 * Activate demo mode. Swaps the active file system manager to a
 * DemoFileSystemManager and sets the demo-mode signal.
 */
export function enterDemoMode(): DemoFileSystemManager {
  const demo = new DemoFileSystemManager();
  // The caller (onboarding flow) is responsible for swapping
  // fileSystemManager via setActiveFileManager().
  setDemoMode(true);
  return demo;
}

/**
 * Deactivate demo mode. Swaps back to a fresh LocalFileSystemManager.
 */
export function exitDemoMode(): void {
  setDemoMode(false);
  // The caller is responsible for swapping fileSystemManager back.
}

/** Convenience: returns a descriptive label for the demo mode storage provider. */
export const DEMO_MODE_LABEL = 'DEMO';
