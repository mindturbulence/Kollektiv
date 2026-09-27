import { describe, it, expect, vi } from 'vitest';
import { createMediaEngine, detectKind, clamp, waveform } from '../index';
import type { MediabunnySeam, MediabunnyCanvasSink, CanvasSinkFrame, AudioSinkBuffer } from '../mediabunnySeam';

// jsdom has neither WebCodecs nor createImageBitmap (per task brief) — stub the
// one browser primitive getVideoFrame/thumbnail need so caching/clamping logic
// (the part owned by this module, not mediabunny) is exercisable here.
vi.stubGlobal('createImageBitmap', async (source: unknown) => ({ __source: source, close: vi.fn() }));

function blob(type: string): Blob {
  return new Blob([], { type });
}

function fakeAudioBuffer(channels: number[][], sampleRate: number): AudioBuffer {
  const data = channels.map((c) => Float32Array.from(c));
  return {
    sampleRate,
    length: data[0]?.length ?? 0,
    numberOfChannels: data.length,
    getChannelData: (c: number) => data[c],
    copyToChannel: (source: Float32Array, channel: number, startInChannel = 0) => {
      data[channel].set(source, startInChannel);
    },
  } as unknown as AudioBuffer;
}

describe('detectKind', () => {
  it('classifies by MIME type first', () => {
    expect(detectKind(blob('image/png'), 'clip.mov')).toBe('image');
    expect(detectKind(blob('audio/mpeg'), 'clip.mov')).toBe('audio');
    expect(detectKind(blob('video/mp4'), 'clip.mp3')).toBe('video');
  });

  it('falls back to extension when MIME is missing', () => {
    expect(detectKind(blob(''), 'photo.PNG')).toBe('image');
    expect(detectKind(blob(''), 'song.flac')).toBe('audio');
    expect(detectKind(blob(''), 'movie.mkv')).toBe('video');
  });
});

describe('clamp', () => {
  it('keeps values inside [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('degrades to min when max < min (zero/negative duration)', () => {
    expect(clamp(5, 0, -1)).toBe(0);
  });
});

describe('waveform', () => {
  it('produces one peak per WAVEFORM_BUCKET_SECONDS, max abs across channels', () => {
    const sampleRate = 100; // 1 bucket (0.01s) = 1 sample at this rate
    const left = [0.1, 0.9, -0.2];
    const right = [0.05, 0.1, 0.8];
    const peaks = waveform(fakeAudioBuffer([left, right], sampleRate));
    expect(peaks.length).toBe(3);
    expect(peaks[0]).toBeCloseTo(0.1);
    expect(peaks[1]).toBeCloseTo(0.9);
    expect(peaks[2]).toBeCloseTo(0.8);
  });

  it('clamps peaks to 1', () => {
    const peaks = waveform(fakeAudioBuffer([[2.5]], 100));
    expect(peaks[0]).toBe(1);
  });
});

/** Minimal fake seam: one video track that always canDecode, whose
 *  CanvasSink.canvases() yields frames at the given timestamps. */
function fakeSeam(frameTimestamps: number[], duration: number): { seam: MediabunnySeam; disposeCalls: number[] } {
  const disposeCalls: number[] = [];
  let inputCount = 0;

  function makeSink(): MediabunnyCanvasSink {
    return {
      getCanvas: vi.fn(),
      // Mirrors mediabunny's CanvasSink.canvases(start): the first yielded
      // frame is the last one at or before `start` (matching getCanvas()'s
      // "last frame <= timestamp" semantics), then it continues forward.
      canvases: async function* (start: number) {
        const firstAfter = frameTimestamps.findIndex((t) => t > start + 1e-8);
        const startIdx = firstAfter === -1 ? frameTimestamps.length - 1 : Math.max(0, firstAfter - 1);
        for (const timestamp of frameTimestamps.slice(Math.max(0, startIdx))) {
          const frame: CanvasSinkFrame = { canvas: {} as CanvasImageSource, timestamp };
          yield frame;
        }
      },
    };
  }

  const seam: MediabunnySeam = {
    createInput: () => {
      const id = ++inputCount;
      return {
        computeDuration: async () => duration,
        getPrimaryVideoTrack: async () => ({
          displayWidth: 1920,
          displayHeight: 1080,
          canDecode: async () => true,
          computePacketStats: async () => ({ averagePacketRate: 30 }),
          createCanvasSink: () => makeSink(),
        }),
        getPrimaryAudioTrack: async () => null,
        dispose: () => disposeCalls.push(id),
      };
    },
  };
  return { seam, disposeCalls };
}

describe('createMediaEngine — probe (video, via fake seam)', () => {
  it('reads duration/dims/fps from the seam and disposes the input', async () => {
    const { seam, disposeCalls } = fakeSeam([0], 12);
    const engine = createMediaEngine(async () => seam);
    const probe = await engine.probe(blob('video/mp4'), 'clip.mp4');
    expect(probe).toEqual({ kind: 'video', duration: 12, width: 1920, height: 1080, fps: 30, hasAudio: false });
    expect(disposeCalls.length).toBe(1);
  });
});

describe('createMediaEngine — getVideoFrame caching and clamping', () => {
  it('reuses one session per mediaId (does not recreate the seam input)', async () => {
    let createInputCalls = 0;
    const { seam } = fakeSeam([0, 1, 2, 3, 4], 5);
    const countingSeam: MediabunnySeam = {
      createInput: (file) => {
        createInputCalls++;
        return seam.createInput(file);
      },
    };
    const engine = createMediaEngine(async () => countingSeam);
    await engine.getVideoFrame('m1', blob('video/mp4'), 0);
    await engine.getVideoFrame('m1', blob('video/mp4'), 1);
    await engine.getVideoFrame('m1', blob('video/mp4'), 2);
    expect(createInputCalls).toBe(1);
  });

  it('clamps the requested time into [0, duration)', async () => {
    const { seam } = fakeSeam([0, 1, 2], 3);
    const canvasesSpy = vi.fn(seam.createInput);
    const engine = createMediaEngine(async () => ({ createInput: canvasesSpy }));
    // Requesting past the end should not throw and should still resolve to a frame.
    const frameAtEnd = await engine.getVideoFrame('m2', blob('video/mp4'), 999);
    expect(frameAtEnd).not.toBeNull();
    const frameNegative = await engine.getVideoFrame('m2', blob('video/mp4'), -5);
    expect(frameNegative).not.toBeNull();
  });

  it('disposes a session on dispose(mediaId) and lets a fresh call recreate it', async () => {
    let createInputCalls = 0;
    const { seam, disposeCalls } = fakeSeam([0], 5);
    const countingSeam: MediabunnySeam = {
      createInput: (file) => {
        createInputCalls++;
        return seam.createInput(file);
      },
    };
    const engine = createMediaEngine(async () => countingSeam);
    await engine.getVideoFrame('m3', blob('video/mp4'), 0);
    expect(createInputCalls).toBe(1);
    engine.dispose('m3');
    expect(disposeCalls.length).toBe(1);
    await engine.getVideoFrame('m3', blob('video/mp4'), 0);
    expect(createInputCalls).toBe(2);
  });
});

describe('createMediaEngine — getAudioBuffer caching', () => {
  it('caches per mediaId + sampleRate', async () => {
    let audioSinkCalls = 0;
    const seam: MediabunnySeam = {
      createInput: () => ({
        computeDuration: async () => 1,
        getPrimaryVideoTrack: async () => null,
        getPrimaryAudioTrack: async () => ({
          numberOfChannels: 1,
          sampleRate: 48000,
          computeDuration: async () => 1,
          canDecode: async () => true,
          createAudioBufferSink: () => {
            audioSinkCalls++;
            return {
              buffers: async function* (): AsyncGenerator<AudioSinkBuffer> {
                yield { buffer: fakeAudioBuffer([[0.1]], 48000), timestamp: 0 };
              },
            };
          },
        }),
        dispose: () => {},
      }),
    };
    const engine = createMediaEngine(async () => seam);
    const ctx = { sampleRate: 48000, createBuffer: (_channels: number, len: number, sr: number) => fakeAudioBuffer([new Array(len).fill(0)], sr) } as unknown as BaseAudioContext;
    const a = await engine.getAudioBuffer('m4', blob('audio/mpeg'), ctx);
    const b = await engine.getAudioBuffer('m4', blob('audio/mpeg'), ctx);
    expect(a).toBe(b);
    expect(audioSinkCalls).toBe(1);
  });
});
