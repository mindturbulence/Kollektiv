import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Minimal in-memory fake standing in for `idb`'s openDB — no fake-indexeddb
// dependency in this repo, and jsdom doesn't implement IndexedDB. Enough
// surface (transaction/objectStore/get/put/delete/getAll) for deleteProject,
// renameProject, duplicateProject and their callers below.
const { fakeStores, resetFakeDb } = vi.hoisted(() => {
  type Store = Map<string, unknown>;
  let stores: { projects: Store; media: Store };
  const reset = () => { stores = { projects: new Map(), media: new Map() }; };
  reset();
  return { fakeStores: () => stores, resetFakeDb: reset };
});
vi.mock('idb', () => ({
  openDB: vi.fn(async () => {
    const stores = fakeStores();
    const storeApi = (name: 'projects' | 'media') => ({
      get: async (key: string) => stores[name].get(key),
      getAll: async () => Array.from(stores[name].values()),
      put: async (val: unknown, key: string) => { stores[name].set(key, val); },
      delete: async (key: string) => { stores[name].delete(key); },
    });
    return {
      transaction: (_names: string[]) => ({
        objectStore: (name: 'projects' | 'media') => storeApi(name),
        done: Promise.resolve(),
      }),
      get: async (name: 'projects' | 'media', key: string) => stores[name].get(key),
      getAll: async (name: 'projects' | 'media') => Array.from(stores[name].values()),
      put: async (name: 'projects' | 'media', val: unknown, key: string) => { stores[name].set(key, val); },
      delete: async (name: 'projects' | 'media', key: string) => { stores[name].delete(key); },
    };
  }),
}));

import {
  splitProjectForStorage,
  joinStoredProject,
  startAutosave,
  unreferencedMediaIds,
  saveProject,
  loadProject,
  deleteProject,
  renameProject,
  duplicateProject,
  estimateStorage,
  listProjects,
} from './index';
import { makeMedia, makeProject } from '../actions/fixtures';
import type { EditorState, Project } from '../types';

describe('splitProjectForStorage / joinStoredProject', () => {
  it('round-trips a project, moving blobs and waveforms out of and back into media items', () => {
    const blob = new Blob(['hello'], { type: 'video/mp4' });
    const waveform = new Float32Array([0, 0.5, 1]);
    const project = makeProject({ media: [makeMedia('m1', { file: blob, waveform })] });

    const { stored, media } = splitProjectForStorage(project);

    expect(stored.media[0]).not.toHaveProperty('file');
    expect(stored.media[0]).not.toHaveProperty('waveform');
    expect(media.get('m1')?.blob).toBe(blob);
    expect(media.get('m1')?.waveform).toBe(waveform);

    const rejoined = joinStoredProject(stored, media);
    expect(rejoined.media[0].file).toBe(blob);
    expect(rejoined.media[0].waveform).toBe(waveform);
    expect(rejoined.id).toBe(project.id);
  });

  it('falls back to an empty Blob when a media record is missing (deleted / evicted)', () => {
    const project = makeProject({ media: [makeMedia('m1')] });
    const { stored } = splitProjectForStorage(project);

    const rejoined = joinStoredProject(stored, new Map());
    expect(rejoined.media[0].file).toBeInstanceOf(Blob);
    expect(rejoined.media[0].file.size).toBe(0);
    expect(rejoined.media[0].waveform).toBeUndefined();
  });
});

describe('startAutosave', () => {
  let listeners: Array<() => void>;
  let snapshot: EditorState;

  function makeDeps(overrides: { save?: (p: Project) => Promise<void>; onError?: (e: unknown) => void } = {}) {
    listeners = [];
    return {
      getSnapshot: () => snapshot,
      subscribe: (fn: () => void) => { listeners.push(fn); return () => { listeners = listeners.filter(l => l !== fn); }; },
      save: overrides.save ?? vi.fn().mockResolvedValue(undefined),
      markSaved: vi.fn(),
      onError: overrides.onError ?? vi.fn(),
      debounceMs: 1500,
    };
  }

  const fire = () => listeners.forEach(fn => fn());

  beforeEach(() => {
    vi.useFakeTimers();
    snapshot = { project: makeProject(), selectedClipIds: [], playhead: 0, isPlaying: false, zoom: 80, tool: 'select', snapping: true, isDirty: false, canUndo: false, canRedo: false };
  });
  afterEach(() => vi.useRealTimers());

  it('does not save when the store is clean', async () => {
    const deps = makeDeps();
    startAutosave(deps);
    fire();
    await vi.advanceTimersByTimeAsync(1500);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('debounces: only fires once after 1.5s of quiet following the LAST mutation', async () => {
    const deps = makeDeps();
    startAutosave(deps);
    snapshot = { ...snapshot, isDirty: true };
    fire();
    await vi.advanceTimersByTimeAsync(1000);
    fire(); // resets the timer
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(deps.markSaved).toHaveBeenCalledTimes(1);
  });

  it('keeps the store dirty (no markSaved) and reports when save rejects', async () => {
    const err = new Error('quota exceeded');
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(err) });
    startAutosave(deps);
    snapshot = { ...snapshot, isDirty: true };
    fire();
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => expect(deps.onError).toHaveBeenCalledWith(err));
    expect(deps.markSaved).not.toHaveBeenCalled();
  });

  it('stops scheduling after the returned unsubscribe is called', async () => {
    const deps = makeDeps();
    const stop = startAutosave(deps);
    stop();
    snapshot = { ...snapshot, isDirty: true };
    fire(); // no-op: unsubscribed already removed this listener from `listeners`... but ensure no throw
    await vi.advanceTimersByTimeAsync(1500);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('flushes a pending dirty save when stopped (leaving the editor)', async () => {
    const deps = makeDeps();
    const stop = startAutosave(deps);
    snapshot = { ...snapshot, isDirty: true };
    fire();
    await vi.advanceTimersByTimeAsync(500); // still inside the debounce window
    stop();
    expect(deps.save).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(deps.markSaved).toHaveBeenCalledTimes(1));
  });

  it('keeps the store dirty when the project changed while a save was in flight', async () => {
    let resolveSave: () => void = () => {};
    const deps = makeDeps({ save: vi.fn(() => new Promise<void>(r => { resolveSave = r; })) });
    startAutosave(deps);
    snapshot = { ...snapshot, isDirty: true };
    fire();
    await vi.advanceTimersByTimeAsync(1500); // save #1 starts
    snapshot = { ...snapshot, project: { ...snapshot.project!, name: 'edited mid-save' } };
    resolveSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.markSaved).not.toHaveBeenCalled();
  });
});

describe('unreferencedMediaIds (pure GC reference counting)', () => {
  it('flags media only the deleted project used', () => {
    expect(unreferencedMediaIds(['m1', 'm2'], [['m2', 'm3']])).toEqual(['m1']);
  });

  it('keeps media still referenced by another remaining project', () => {
    expect(unreferencedMediaIds(['m1'], [['m1']])).toEqual([]);
  });

  it('dedupes the deleted project media ids', () => {
    expect(unreferencedMediaIds(['m1', 'm1'], [])).toEqual(['m1']);
  });
});

describe('deleteProject / renameProject / duplicateProject (IDB-backed)', () => {
  beforeEach(() => resetFakeDb());

  it('GCs a media blob no other project references, in the same delete', async () => {
    const shared = makeMedia('shared');
    const onlyMine = makeMedia('onlyMine');
    const p1 = makeProject({ id: 'p1', media: [shared, onlyMine] });
    const p2 = makeProject({ id: 'p2', media: [shared] });
    await saveProject(p1);
    await saveProject(p2);

    await deleteProject('p1');

    expect(await loadProject('p2')).toBeTruthy();
    expect(fakeStores().media.has('onlyMine')).toBe(false);
    expect(fakeStores().media.has('shared')).toBe(true);
  });

  it('renameProject updates the name and bumps updatedAt', async () => {
    const project = makeProject({ id: 'p1', name: 'Old name', updatedAt: 0 });
    await saveProject(project);

    await renameProject('p1', 'New name');

    const [summary] = await listProjects();
    expect(summary.name).toBe('New name');
    expect(summary.updatedAt).toBeGreaterThan(0);
  });

  it('duplicateProject clones metadata under a new id, sharing media ids', async () => {
    const media = makeMedia('m1');
    const project = makeProject({ id: 'p1', name: 'Original', media: [media] });
    await saveProject(project);

    const newId = await duplicateProject('p1');
    if (!newId) throw new Error('expected a new project id');

    expect(newId).not.toBe('p1');
    const summaries = await listProjects();
    expect(summaries.map((s) => s.id).sort()).toEqual(['p1', newId].sort());
    // Same media store record — the blob was never copied.
    expect(fakeStores().media.get('m1')).toBeDefined();
  });

  it('duplicateProject returns null for a missing project', async () => {
    expect(await duplicateProject('nope')).toBeNull();
  });
});

describe('estimateStorage', () => {
  it('returns usage/quota when the Storage API is available', async () => {
    const estimate = vi.fn().mockResolvedValue({ usage: 100, quota: 1000 });
    vi.stubGlobal('navigator', { storage: { estimate } });

    expect(await estimateStorage()).toEqual({ usage: 100, quota: 1000 });
    vi.unstubAllGlobals();
  });

  it('returns null when unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(await estimateStorage()).toBeNull();
    vi.unstubAllGlobals();
  });
});
