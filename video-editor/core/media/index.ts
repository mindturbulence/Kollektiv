// OWNED BY: media agent. Mediabunny-backed MediaEngine (core/types.ts contract).
import type { MediaEngine, MediaKind, MediaProbe } from '../types';
import { WAVEFORM_BUCKET_SECONDS } from '../types';
import {
  loadRealMediabunnySeam,
  type MediabunnySeam,
  type MediabunnyInput,
  type MediabunnyCanvasSink,
  type CanvasSinkFrame,
} from './mediabunnySeam';

const THUMBNAIL_WIDTH = 160;
const IMAGE_DEFAULT_DURATION = 5;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma']);

/** MIME/extension classification — mediabunny is only consulted for probe details. */
export function detectKind(file: Blob, name: string): MediaKind {
  const mime = (file as File).type ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'video';
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Peak amplitude (0..1, max abs across channels) per WAVEFORM_BUCKET_SECONDS.
 *  Ported from openreel@5f3c85e packages/core/src/media/mediabunny-engine.ts
 *  generateWaveform peak logic — MIT, (c) 2024-2026 Augustus Otu and
 *  Contributors. Modified for Kollektiv: buffer is already fully decoded, so
 *  this runs synchronously over an AudioBuffer instead of streaming samples. */
export function waveform(buffer: AudioBuffer): Float32Array {
  const bucketSamples = Math.max(1, Math.round(WAVEFORM_BUCKET_SECONDS * buffer.sampleRate));
  const bucketCount = Math.max(1, Math.ceil(buffer.length / bucketSamples));
  const peaks = new Float32Array(bucketCount);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));

  for (let b = 0; b < bucketCount; b++) {
    const start = b * bucketSamples;
    const end = Math.min(start + bucketSamples, buffer.length);
    let peak = 0;
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    peaks[b] = Math.min(1, peak);
  }
  return peaks;
}

interface VideoSession {
  input: MediabunnyInput;
  sink: MediabunnyCanvasSink;
  duration: number;
  iterator: AsyncGenerator<CanvasSinkFrame, void, unknown> | null;
  current: CanvasSinkFrame | null;
  next: CanvasSinkFrame | null;
  done: boolean;
}

export function createMediaEngine(loadSeam: () => Promise<MediabunnySeam> = loadRealMediabunnySeam): MediaEngine {
  let seam: MediabunnySeam | null = null;
  const ensureSeam = async (): Promise<MediabunnySeam> => (seam ??= await loadSeam());

  const videoSessions = new Map<string, VideoSession>();
  const imageBitmaps = new Map<string, ImageBitmap>();
  const audioBuffers = new Map<string, AudioBuffer>();

  async function getOrCreateImageBitmap(mediaId: string, file: Blob): Promise<ImageBitmap> {
    const cached = imageBitmaps.get(mediaId);
    if (cached) return cached;
    const bitmap = await createImageBitmap(file);
    imageBitmaps.set(mediaId, bitmap);
    return bitmap;
  }

  async function getOrCreateVideoSession(mediaId: string, file: Blob): Promise<VideoSession | null> {
    const cached = videoSessions.get(mediaId);
    if (cached) return cached;
    const s = await ensureSeam();
    const input = s.createInput(file);
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      input.dispose();
      return null;
    }
    const duration = await input.computeDuration();
    const session: VideoSession = {
      input,
      sink: track.createCanvasSink(),
      duration,
      iterator: null,
      current: null,
      next: null,
      done: false,
    };
    videoSessions.set(mediaId, session);
    return session;
  }

  /** Sequential-access decode: advances the iterator forward, seeking only
   *  when the requested time moves backwards. Ported from
   *  openreel@5f3c85e packages/core/src/media/mediabunny-engine.ts
   *  ExportFrameDecoder.getSequentialFrame — MIT, (c) 2024-2026 Augustus Otu
   *  and Contributors. Modified for Kollektiv: operates on the CanvasSink
   *  seam directly and returns the wrapped frame instead of a cloned canvas
   *  (callers createImageBitmap() from it, which copies pixels itself). */
  async function stepToFrame(session: VideoSession, timestamp: number): Promise<CanvasSinkFrame | null> {
    if (!session.iterator || (session.current && timestamp < session.current.timestamp - 1e-8)) {
      await session.iterator?.return?.(undefined);
      session.current = null;
      session.next = null;
      session.done = false;
      session.iterator = session.sink.canvases(timestamp);
      const first = await session.iterator.next();
      if (first.done) {
        session.done = true;
        return null;
      }
      session.current = first.value;
    }

    while (true) {
      if (!session.next && !session.done) {
        const step = await session.iterator!.next();
        if (step.done) {
          session.done = true;
        } else {
          session.next = step.value;
        }
      }
      if (session.next && session.next.timestamp <= timestamp + 1e-8) {
        session.current = session.next;
        session.next = null;
        continue;
      }
      break;
    }

    if (!session.current || session.current.timestamp > timestamp + 1e-8) return null;
    return session.current;
  }

  async function probeImage(file: Blob): Promise<MediaProbe> {
    const bitmap = await createImageBitmap(file);
    try {
      return { kind: 'image', duration: IMAGE_DEFAULT_DURATION, width: bitmap.width, height: bitmap.height, hasAudio: false };
    } finally {
      bitmap.close();
    }
  }

  async function probeAvInput(input: MediabunnyInput, kind: MediaKind): Promise<MediaProbe> {
    try {
      const duration = await input.computeDuration();
      const videoTrack = await input.getPrimaryVideoTrack();
      const audioTrack = await input.getPrimaryAudioTrack();
      let width = 0;
      let height = 0;
      let fps: number | undefined;
      if (videoTrack) {
        width = videoTrack.displayWidth;
        height = videoTrack.displayHeight;
        try {
          const stats = await videoTrack.computePacketStats(100);
          fps = stats.averagePacketRate || undefined;
        } catch {
          fps = undefined;
        }
      }
      return { kind, duration, width, height, fps, hasAudio: !!audioTrack };
    } finally {
      input.dispose();
    }
  }

  async function decodeFullAudioViaMediabunny(file: Blob, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
    const s = await ensureSeam();
    const input = s.createInput(file);
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) return null;
      const duration = await track.computeDuration();
      const sampleRate = track.sampleRate;
      const channels = Math.max(1, track.numberOfChannels);
      const length = Math.max(1, Math.ceil(duration * sampleRate));
      const out = ctx.createBuffer(channels, length, sampleRate);
      const sink = track.createAudioBufferSink();
      for await (const wrapped of sink.buffers(0, duration)) {
        const offset = Math.round(wrapped.timestamp * sampleRate);
        for (let c = 0; c < channels; c++) {
          const source = wrapped.buffer.getChannelData(Math.min(c, wrapped.buffer.numberOfChannels - 1));
          out.copyToChannel(source, c, offset);
        }
      }
      return out;
    } finally {
      input.dispose();
    }
  }

  async function decodeFullAudioViaWebAudio(file: Blob, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
    try {
      const bytes = await file.arrayBuffer();
      return await ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  }

  async function drawThumbnailCanvas(source: CanvasImageSource, srcW: number, srcH: number): Promise<string> {
    const height = Math.max(1, Math.round((THUMBNAIL_WIDTH * srcH) / Math.max(1, srcW)));
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(source, 0, 0, THUMBNAIL_WIDTH, height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  return {
    async probe(file: Blob, name: string): Promise<MediaProbe> {
      const kind = detectKind(file, name);
      if (kind === 'image') return probeImage(file);
      const s = await ensureSeam();
      return probeAvInput(s.createInput(file), kind);
    },

    async getVideoFrame(mediaId: string, file: Blob, sourceTime: number): Promise<ImageBitmap | null> {
      if (detectKind(file, '') === 'image') {
        const bitmap = await getOrCreateImageBitmap(mediaId, file);
        return createImageBitmap(bitmap);
      }
      const session = await getOrCreateVideoSession(mediaId, file);
      if (!session) return null;
      const t = clamp(sourceTime, 0, Math.max(0, session.duration - 1e-6));
      const frame = await stepToFrame(session, t);
      if (!frame) return null;
      return createImageBitmap(frame.canvas);
    },

    async getAudioBuffer(mediaId: string, file: Blob, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
      const cacheKey = `${mediaId}:${ctx.sampleRate}`;
      const cached = audioBuffers.get(cacheKey);
      if (cached) return cached;

      const buffer = (await decodeFullAudioViaMediabunny(file, ctx)) ?? (await decodeFullAudioViaWebAudio(file, ctx));
      if (buffer) audioBuffers.set(cacheKey, buffer);
      return buffer;
    },

    async thumbnail(file: Blob, kind: MediaKind, sourceTime = 0): Promise<string | undefined> {
      if (kind === 'audio') return undefined;
      if (kind === 'image') {
        const bitmap = await createImageBitmap(file);
        try {
          return await drawThumbnailCanvas(bitmap, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      }
      const s = await ensureSeam();
      const input = s.createInput(file);
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) return undefined;
        const sink = track.createCanvasSink({ width: THUMBNAIL_WIDTH, fit: 'contain' });
        const frame = await sink.getCanvas(Math.max(0, sourceTime));
        if (!frame) return undefined;
        return await drawThumbnailCanvas(frame.canvas, track.displayWidth, track.displayHeight);
      } finally {
        input.dispose();
      }
    },

    waveform,

    dispose(mediaId?: string): void {
      const disposeVideo = (id: string, session: VideoSession) => {
        void session.iterator?.return?.(undefined);
        session.input.dispose();
        videoSessions.delete(id);
      };
      const disposeImage = (id: string, bitmap: ImageBitmap) => {
        bitmap.close();
        imageBitmaps.delete(id);
      };

      if (mediaId) {
        const session = videoSessions.get(mediaId);
        if (session) disposeVideo(mediaId, session);
        const bitmap = imageBitmaps.get(mediaId);
        if (bitmap) disposeImage(mediaId, bitmap);
        for (const key of [...audioBuffers.keys()]) {
          if (key.startsWith(`${mediaId}:`)) audioBuffers.delete(key);
        }
        return;
      }

      for (const [id, session] of [...videoSessions]) disposeVideo(id, session);
      for (const [id, bitmap] of [...imageBitmaps]) disposeImage(id, bitmap);
      audioBuffers.clear();
    },
  };
}
