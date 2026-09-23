import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, any>();
vi.mock('../../utils/db', () => ({
  getHandle: vi.fn(async (key: string) => store.get(key)),
  setHandle: vi.fn(async (key: string, val: any) => {
    store.set(key, val);
  }),
}));

import { listRoots, addRoot, removeRoot, requestRootPermission } from './assetRootManager';

function mockDirHandle(name: string, permission: 'granted' | 'denied' | 'prompt' = 'granted') {
  return {
    kind: 'directory' as const,
    name,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
  };
}

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe('assetRootManager', () => {
  it('addRoot persists a new root and lists it with status', async () => {
    const handle = mockDirHandle('Photos');
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handle) });

    const added = await addRoot();
    expect(added?.name).toBe('Photos');
    expect(added?.status).toBe('granted');

    const roots = await listRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].name).toBe('Photos');
  });

  it('removeRoot only rewrites the persisted list, never touches disk', async () => {
    const handle = mockDirHandle('Photos');
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handle) });
    const added = await addRoot();
    expect(await listRoots()).toHaveLength(1);

    await removeRoot(added!.id);
    expect(await listRoots()).toHaveLength(0);
    // No filesystem-mutating method (e.g. removeEntry) was ever called on the handle.
    expect((handle as any).removeEntry).toBeUndefined();
  });

  it('cancelling the picker (AbortError) returns null and adds nothing', async () => {
    const abortErr = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => { throw abortErr; }) });
    const result = await addRoot();
    expect(result).toBeNull();
    expect(await listRoots()).toHaveLength(0);
  });

  it('listRoots surfaces a stale handle as status "missing", not silently dropped', async () => {
    const handle = mockDirHandle('Gone');
    handle.queryPermission = vi.fn(async () => {
      throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
    });
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handle) });
    await addRoot();

    const roots = await listRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].status).toBe('missing');
  });

  it('listRoots surfaces permission-denied explicitly rather than swallowing it', async () => {
    const handle = mockDirHandle('Locked', 'denied');
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handle) });
    await addRoot();

    const roots = await listRoots();
    expect(roots[0].status).toBe('denied');
  });

  it('requestRootPermission performs the interactive re-grant and reports the result', async () => {
    const handle = mockDirHandle('Reconnect', 'prompt');
    handle.requestPermission = vi.fn(async () => 'granted');
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handle) });
    const added = await addRoot();

    const status = await requestRootPermission({ id: added!.id, name: added!.name, handle: handle as any, addedAt: added!.addedAt });
    expect(status).toBe('granted');
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
  });

  it('re-adding the same folder name refreshes the handle instead of duplicating', async () => {
    const handleV1 = mockDirHandle('Photos');
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handleV1) });
    await addRoot();

    const handleV2 = mockDirHandle('Photos');
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(async () => handleV2) });
    await addRoot();

    const roots = await listRoots();
    expect(roots).toHaveLength(1);
  });
});
