import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { splitProjectForStorage, joinStoredProject, startAutosave } from './index';
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
});
