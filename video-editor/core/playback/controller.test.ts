import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackController } from './controller';
import { dispatch, getSnapshot, __resetForTests } from '../store';
import type { Clip, ComposedFrame, Compositor, MediaEngine, Project, Renderer, Track } from '../types';
import { DEFAULT_TRANSFORM } from '../types';

// ─── Fake rAF: single pending callback, advanced manually. ──────────────────
let rafCb: ((t: number) => void) | null = null;
function installFakeRaf(): void {
  rafCb = null;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    rafCb = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    rafCb = null;
  });
}
function flushRaf(): void {
  const cb = rafCb;
  rafCb = null;
  cb?.(0);
}

// ─── Fake AudioContext: currentTime is settable, nodes are recorded. ───────
class FakeGain {
  gain = { setValueCurveAtTime: vi.fn(), value: 1 };
  connect = vi.fn();
}
class FakeSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain(): FakeGain { return new FakeGain(); }
  createBufferSource(): FakeSource { return new FakeSource(); }
  close = vi.fn(async () => {});
}

function track(overrides: Partial<Track>): Track {
  return { id: 't', kind: 'video', name: 'V', muted: false, hidden: false, locked: false, ...overrides };
}
function clip(overrides: Partial<Clip>): Clip {
  return {
    id: 'c', trackId: 't', mediaId: 'm', start: 0, duration: 10, inPoint: 0, speed: 1,
    volume: 1, fadeIn: 0, fadeOut: 0, transform: { ...DEFAULT_TRANSFORM }, keyframes: [], effects: [],
    ...overrides,
  };
}
function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', settings: { width: 100, height: 100, fps: 30, background: '#000' },
    media: [{ id: 'm', kind: 'video', name: 'a.mp4', file: new Blob(), duration: 10, width: 10, height: 10, hasAudio: true }],
    tracks: [track({ id: 't' })], clips: [clip({})], transitions: [], markers: [], createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

function fakeMedia(): MediaEngine {
  return {
    probe: vi.fn(),
    getVideoFrame: vi.fn(async () => null),
    getAudioBuffer: vi.fn(async () => ({ duration: 10 } as unknown as AudioBuffer)),
    thumbnail: vi.fn(async () => undefined),
    waveform: vi.fn(() => new Float32Array()),
    dispose: vi.fn(),
  };
}
function fakeRenderer(): Renderer & { frames: ComposedFrame[] } {
  const frames: ComposedFrame[] = [];
  return {
    kind: 'canvas2d',
    resize: vi.fn(),
    drawFrame: vi.fn((f: ComposedFrame) => { frames.push(f); }),
    canvas: {} as HTMLCanvasElement,
    dispose: vi.fn(),
    frames,
  };
}
function fakeCompositor(impl?: (p: Project, t: number) => Promise<ComposedFrame>) {
  const calls: number[] = [];
  const compose = vi.fn(async (p: Project, t: number) => {
    calls.push(t);
    if (impl) return impl(p, t);
    return { background: '#000', layers: [], transitions: [] };
  });
  return { calls, compose } satisfies Compositor & { calls: number[]; compose: typeof compose };
}

beforeEach(() => {
  __resetForTests();
  installFakeRaf();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPlaybackController', () => {
  it('play() schedules audio for audible clips and anchors the clock', async () => {
    dispatch({ type: 'loadProject', project: project() });
    const media = fakeMedia();
    const controller = createPlaybackController({ media, renderer: fakeRenderer(), compositor: fakeCompositor() });

    controller.play();
    expect(getSnapshot().isPlaying).toBe(true);
    await vi.waitFor(() => expect(media.getAudioBuffer).toHaveBeenCalled());
    controller.dispose();
  });

  it('advances the playhead and re-renders on each rAF tick', async () => {
    dispatch({ type: 'loadProject', project: project() });
    const renderer = fakeRenderer();
    const compositor = fakeCompositor();
    const controller = createPlaybackController({ media: fakeMedia(), renderer, compositor });

    controller.play();
    await vi.waitFor(() => expect(rafCb).not.toBeNull());
    flushRaf();
    await Promise.resolve();
    expect(compositor.calls.length).toBeGreaterThan(0);
    expect(renderer.drawFrame).toHaveBeenCalled();
    controller.dispose();
  });

  it('pause() cancels the clock and stops scheduled audio nodes', async () => {
    dispatch({ type: 'loadProject', project: project() });
    const controller = createPlaybackController({ media: fakeMedia(), renderer: fakeRenderer(), compositor: fakeCompositor() });
    controller.play();
    await vi.waitFor(() => expect(getSnapshot().isPlaying).toBe(true));
    controller.pause();
    expect(getSnapshot().isPlaying).toBe(false);
    expect(rafCb).toBeNull();
    controller.dispose();
  });

  it('stops at the project end and sets isPlaying false', async () => {
    const p = project({ clips: [clip({ start: 0, duration: 5 })] });
    dispatch({ type: 'loadProject', project: p });
    dispatch({ type: 'setPlayhead', time: 5 });
    const controller = createPlaybackController({ media: fakeMedia(), renderer: fakeRenderer(), compositor: fakeCompositor() });
    controller.play();
    await vi.waitFor(() => expect(rafCb).not.toBeNull());
    flushRaf();
    await Promise.resolve();
    expect(getSnapshot().playhead).toBe(5);
    expect(getSnapshot().isPlaying).toBe(false);
    controller.dispose();
  });

  it('seek() while paused re-composes and draws the frame at the new time', async () => {
    dispatch({ type: 'loadProject', project: project() });
    const renderer = fakeRenderer();
    const compositor = fakeCompositor();
    const controller = createPlaybackController({ media: fakeMedia(), renderer, compositor });

    controller.seek(3);
    await vi.waitFor(() => expect(renderer.drawFrame).toHaveBeenCalled());
    expect(getSnapshot().playhead).toBe(3);
    expect(compositor.calls).toContain(3);
    controller.dispose();
  });

  it('refresh() coalesces concurrent composes, drawing only the latest and closing stale bitmaps', async () => {
    dispatch({ type: 'loadProject', project: project() });
    const renderer = fakeRenderer();
    let resolveFirst!: (f: ComposedFrame) => void;
    const staleBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const freshBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    let call = 0;
    const compositor: Compositor = {
      compose: vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return new Promise<ComposedFrame>(resolve => { resolveFirst = resolve; });
        }
        return { background: '#000', layers: [{ source: freshBitmap, transform: DEFAULT_TRANSFORM, effects: [] }], transitions: [] };
      }),
    };
    const controller = createPlaybackController({ media: fakeMedia(), renderer, compositor });

    controller.refresh(); // in flight, seq=1
    controller.refresh(); // in flight, seq=2 (newer)
    await vi.waitFor(() => expect(call).toBe(2));
    resolveFirst({ background: '#000', layers: [{ source: staleBitmap, transform: DEFAULT_TRANSFORM, effects: [] }], transitions: [] });
    await vi.waitFor(() => expect(renderer.drawFrame).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(staleBitmap.close).toHaveBeenCalledTimes(1));

    expect(freshBitmap.close).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('subscribes to the store and refreshes on edits made while paused', async () => {
    dispatch({ type: 'loadProject', project: project() });
    const renderer = fakeRenderer();
    const compositor = fakeCompositor();
    const controller = createPlaybackController({ media: fakeMedia(), renderer, compositor });
    compositor.compose.mockClear();

    dispatch({ type: 'updateClip', clipId: 'c', patch: { volume: 0.5 } });
    await vi.waitFor(() => expect(compositor.compose).toHaveBeenCalled());
    controller.dispose();
  });
});
