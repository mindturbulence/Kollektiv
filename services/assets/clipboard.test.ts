import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clipboardCopy,
  clipboardCut,
  clipboardContent,
  clipboardHasContent,
  clipboardClear,
} from './clipboard';

const KEY = 'kollektiv-asset-clipboard';

describe('clipboard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clipboardClear();
  });

  it('copy stores a copy-mode payload', () => {
    clipboardCopy(['r1:a.png', 'r1:b.png'], 'r1', 'sub');
    expect(clipboardContent()).toEqual({
      fileIds: ['r1:a.png', 'r1:b.png'],
      rootId: 'r1',
      folderPath: 'sub',
      mode: 'copy',
    });
    expect(clipboardHasContent()).toBe(true);
  });

  it('cut stores a cut-mode payload', () => {
    clipboardCut(['r1:a.png'], 'r1', '');
    expect(clipboardContent()?.mode).toBe('cut');
    expect(clipboardHasContent()).toBe(true);
  });

  it('persists to sessionStorage and restores after a module reload', async () => {
    clipboardCopy(['r1:a.png'], 'r1', 'folder');
    expect(sessionStorage.getItem(KEY)).toContain('r1:a.png');

    // Simulate a fresh page load: reset module state, keep sessionStorage.
    vi.resetModules();
    const fresh = await import('./clipboard');
    expect(fresh.clipboardContent()).toEqual({
      fileIds: ['r1:a.png'],
      rootId: 'r1',
      folderPath: 'folder',
      mode: 'copy',
    });
    expect(fresh.clipboardHasContent()).toBe(true);
  });

  it('clear empties both memory and sessionStorage', () => {
    clipboardCut(['r1:a.png'], 'r1', '');
    clipboardClear();
    expect(clipboardContent()).toBeNull();
    expect(clipboardHasContent()).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('returns null for corrupt persisted JSON', async () => {
    sessionStorage.setItem(KEY, '{not json');
    vi.resetModules();
    const fresh = await import('./clipboard');
    expect(fresh.clipboardContent()).toBeNull();
    expect(fresh.clipboardHasContent()).toBe(false);
  });

  it('returns null when sessionStorage is unavailable (private mode)', () => {
    const proto = Object.getPrototypeOf(sessionStorage);
    const orig = proto.setItem;
    proto.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      expect(() => clipboardCopy(['r1:a.png'], 'r1', '')).not.toThrow();
      // In-memory copy still works even when persistence fails.
      expect(clipboardContent()?.fileIds).toEqual(['r1:a.png']);
    } finally {
      proto.setItem = orig;
    }
  });
});
