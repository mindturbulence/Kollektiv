import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Compositor, ComposedFrame, MediaEngine, Project } from '../../types';
import { DEFAULT_TRANSFORM } from '../../types';

// ─── mediabunny: fake enough to drive the WebCodecs export path ─────────────
const mediabunnyState = {
  canEncodeVideo: vi.fn(async (..._args: unknown[]) => true),
  canEncodeAudio: vi.fn(async (..._args: unknown[]) => true),
  outputCancel: vi.fn(async () => undefined),
  outputFinalize: vi.fn(async () => undefined),
  videoSourceAdd: vi.fn(async (..._args: unknown[]) => undefined),
  videoSourceClose: vi.fn(),
};

vi.mock('mediabunny', () => {
  class FakeBufferTarget {
    buffer: ArrayBuffer | null = new ArrayBuffer(4);
  }
  class FakeOutput {
    async start(): Promise<void> {}
    addVideoTrack(): void {}
    addAudioTrack(): void {}
    async finalize(): Promise<void> {
      await mediabunnyState.outputFinalize();
    }
    async cancel(): Promise<void> {
      await mediabunnyState.outputCancel();
    }
  }
  class FakeCanvasSource {
    async add(...args: unknown[]): Promise<void> {
      await mediabunnyState.videoSourceAdd(...args);
    }
    close(): void {
      mediabunnyState.videoSourceClose();
    }
  }
  class FakeAudioBufferSource {
    async add(): Promise<void> {}
    close(): void {}
  }
  return {
    Output: FakeOutput,
    BufferTarget: FakeBufferTarget,
    CanvasSource: FakeCanvasSource,
    AudioBufferSource: FakeAudioBufferSource,
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
    canEncodeVideo: (...args: unknown[]) => mediabunnyState.canEncodeVideo(...args),
    canEncodeAudio: (...args: unknown[]) => mediabunnyState.canEncodeAudio(...args),
  };
});

// ─── render: stub renderer (owned by another agent, throws in this repo) ────
const rendererState = { drawFrame: vi.fn(), dispose: vi.fn() };
vi.mock('../../render', () => ({
  createRenderer: () => ({
    kind: 'canvas2d',
    resize: vi.fn(),
    drawFrame: (...args: unknown[]) => rendererState.drawFrame(...args),
    canvas: {},
    dispose: () => rendererState.dispose(),
  }),
}));

// ─── ffmpeg fallback route ───────────────────────────────────────────────────
const encodeFramesMock = vi.fn(async (..._args: unknown[]) => ({ id: 'x', kind: 'result' as const, ok: true as const, data: new ArrayBuffer(8), mime: 'video/mp4', byteLength: 8 }));
const cancelMock = vi.fn();
vi.mock('../../../../services/convert/audioVideoConverter', () => ({
  audioVideoConverter: {
    encodeFrames: (...args: unknown[]) => encodeFramesMock(...args),
    cancel: (...args: unknown[]) => cancelMock(...args),
  },
}));

import { createExporter } from '../index';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: 'proj', settings: { width: 640, height: 360, fps: 30, background: '#000' },
    media: [], tracks: [], clips: [], transitions: [], markers: [],
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

function clipOnTrack(): Project {
  return project({
    tracks: [{ id: 't1', kind: 'video', name: 'v', muted: false, hidden: false, locked: false }],
    clips: [{
      id: 'c1', trackId: 't1', mediaId: undefined, start: 0, duration: 1, inPoint: 0, speed: 1, volume: 1,
      fadeIn: 0, fadeOut: 0, transform: DEFAULT_TRANSFORM, keyframes: [], effects: [],
      text: { content: 'hi', style: { fontFamily: 'sans', fontSize: 24, color: '#fff', bold: false, italic: false, align: 'left' } },
    }],
  });
}

function fakeCompositor(): Compositor {
  const frame: ComposedFrame = { background: '#000', layers: [], transitions: [] };
  return { compose: vi.fn(async () => frame) };
}

function fakeMedia(): MediaEngine {
  return {
    probe: vi.fn(),
    getVideoFrame: vi.fn(async () => null),
    getAudioBuffer: vi.fn(async () => null),
    thumbnail: vi.fn(async () => undefined),
    waveform: vi.fn(() => new Float32Array()),
    dispose: vi.fn(),
  };
}

let OffscreenCanvasCtor: unknown;
let VideoEncoderCtor: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    async convertToBlob(): Promise<Blob> { return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }); }
  }
  OffscreenCanvasCtor = globalThis.OffscreenCanvas;
  VideoEncoderCtor = (globalThis as { VideoEncoder?: unknown }).VideoEncoder;
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
});

afterEach(() => {
  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasCtor);
  vi.stubGlobal('VideoEncoder', VideoEncoderCtor);
  vi.unstubAllGlobals();
});

describe('createExporter — WebCodecs path', () => {
  it('renders frames, finalizes, and returns a Blob when VideoEncoder + codecs are available', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    const exporter = createExporter({ media: fakeMedia(), compositor: fakeCompositor() });
    const progress: string[] = [];
    const blob = await exporter.export(clipOnTrack(), { container: 'mp4', width: 640, height: 360, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 }, p => progress.push(p.phase), new AbortController().signal);
    expect(blob).toBeInstanceOf(Blob);
    expect(mediabunnyState.videoSourceAdd).toHaveBeenCalledTimes(30); // 1s @ 30fps
    expect(mediabunnyState.outputFinalize).toHaveBeenCalledTimes(1);
    expect(progress).toContain('rendering');
    expect(progress).toContain('finalizing');
    expect(encodeFramesMock).not.toHaveBeenCalled();
  });

  it('cancels the output and rejects with AbortError when the signal aborts mid-render', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    const controller = new AbortController();
    let calls = 0;
    const compositor: Compositor = {
      compose: vi.fn(async () => {
        calls++;
        if (calls === 3) controller.abort();
        return { background: '#000', layers: [], transitions: [] };
      }),
    };
    const exporter = createExporter({ media: fakeMedia(), compositor });
    await expect(
      exporter.export(clipOnTrack(), { container: 'mp4', width: 640, height: 360, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 }, () => {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mediabunnyState.outputCancel).toHaveBeenCalledTimes(1);
    expect(mediabunnyState.outputFinalize).not.toHaveBeenCalled();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    const controller = new AbortController();
    controller.abort();
    const exporter = createExporter({ media: fakeMedia(), compositor: fakeCompositor() });
    await expect(
      exporter.export(clipOnTrack(), { container: 'mp4', width: 640, height: 360, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 }, () => {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('createExporter — ffmpeg fallback', () => {
  it('falls back when VideoEncoder is undefined', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    const exporter = createExporter({ media: fakeMedia(), compositor: fakeCompositor() });
    const progress: string[] = [];
    const blob = await exporter.export(clipOnTrack(), { container: 'mp4', width: 640, height: 360, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 }, p => progress.push(p.phase), new AbortController().signal);
    expect(blob).toBeInstanceOf(Blob);
    expect(progress).toContain('fallback-ffmpeg');
    expect(encodeFramesMock).toHaveBeenCalledTimes(1);
    const call = encodeFramesMock.mock.calls[0][0] as { frames: ArrayBuffer[]; fps: number; container: string };
    expect(call.frames).toHaveLength(30);
    expect(call.fps).toBe(30);
    expect(call.container).toBe('mp4');
  });

  it('falls back when the requested codec is not encodable', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    mediabunnyState.canEncodeVideo.mockResolvedValue(false);
    const exporter = createExporter({ media: fakeMedia(), compositor: fakeCompositor() });
    await exporter.export(clipOnTrack(), { container: 'mp4', width: 640, height: 360, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 }, () => {}, new AbortController().signal);
    expect(encodeFramesMock).toHaveBeenCalledTimes(1);
  });

  it('cancels the ffmpeg job via audioVideoConverter.cancel on abort', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    const controller = new AbortController();
    let calls = 0;
    const compositor: Compositor = {
      compose: vi.fn(async () => {
        calls++;
        if (calls === 3) controller.abort();
        return { background: '#000', layers: [], transitions: [] };
      }),
    };
    const exporter = createExporter({ media: fakeMedia(), compositor });
    await expect(
      exporter.export(clipOnTrack(), { container: 'mp4', width: 640, height: 360, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 }, () => {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(encodeFramesMock).not.toHaveBeenCalled();
  });
});
