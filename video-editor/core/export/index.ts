// Export (plan §4/§7): WebCodecs via mediabunny, ffmpeg.wasm fallback when
// VideoEncoder is unavailable or no codec is encodable.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { Compositor, ComposedFrame, Exporter, ExportOptions, ExportProgress, MediaEngine, Project } from '../types';
import { createRenderer } from '../render';
import { closeIfBitmap, projectEnd } from '../playback/compositor';
import { audioVideoConverter } from '../../../services/convert/audioVideoConverter';
import { collectAudibleSegments, mixAudio, type ExportRange } from './audioMix';
import { pickAudioCodec, pickVideoCodec, type AudioCodecId, type VideoCodecId } from './codecs';
import { evenDimensions } from './limits';
import { frameCount, frameTime, resolveRange } from './timing';
import { encodeWav } from './wav';

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Export aborted', 'AbortError');
}

function closeFrameBitmaps(frame: ComposedFrame): void {
  for (const layer of frame.layers) closeIfBitmap(layer.source);
  for (const t of frame.transitions) {
    closeIfBitmap(t.from.source);
    closeIfBitmap(t.to.source);
  }
}

async function exportWebCodecs(
  project: Project,
  media: MediaEngine,
  compositor: Compositor,
  opts: ExportOptions,
  range: ExportRange,
  dims: { width: number; height: number },
  videoCodec: VideoCodecId,
  audioCodec: AudioCodecId | null,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(dims.width, dims.height);
  const renderer = createRenderer(canvas);
  const target = new BufferTarget();
  const format = opts.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat();
  const output = new Output({ format, target });

  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: opts.videoBitrate });
  output.addVideoTrack(videoSource);
  const audioSource = audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: opts.audioBitrate }) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();

  try {
    const total = frameCount(range, opts.fps);
    for (let i = 0; i < total; i++) {
      throwIfAborted(signal);
      const t = frameTime(range, opts.fps, i);
      const frame = await compositor.compose(project, t);
      try {
        renderer.drawFrame(frame);
        await videoSource.add(i / opts.fps, 1 / opts.fps);
      } finally {
        closeFrameBitmaps(frame);
      }
      onProgress({ phase: 'rendering', progress: total > 0 ? i / total : 1 });
    }
    videoSource.close();

    if (audioSource) {
      throwIfAborted(signal);
      onProgress({ phase: 'encoding-audio', progress: 0 });
      const buffer = await mixAudio(project, media, range);
      if (buffer) await audioSource.add(buffer);
      audioSource.close();
      onProgress({ phase: 'encoding-audio', progress: 1 });
    }

    onProgress({ phase: 'finalizing', progress: 0 });
    await output.finalize();
    onProgress({ phase: 'finalizing', progress: 1 });
  } catch (err) {
    await output.cancel().catch(() => { /* already finalized/canceled */ });
    renderer.dispose();
    throw err;
  }

  renderer.dispose();
  const mime = opts.container === 'mp4' ? 'video/mp4' : 'video/webm';
  return new Blob([target.buffer as ArrayBuffer], { type: mime });
}

async function exportFfmpegFallback(
  project: Project,
  media: MediaEngine,
  compositor: Compositor,
  opts: ExportOptions,
  range: ExportRange,
  dims: { width: number; height: number },
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(dims.width, dims.height);
  const renderer = createRenderer(canvas);
  onProgress({ phase: 'fallback-ffmpeg', progress: 0 });

  const total = frameCount(range, opts.fps);
  const frames: ArrayBuffer[] = [];
  try {
    for (let i = 0; i < total; i++) {
      throwIfAborted(signal);
      const t = frameTime(range, opts.fps, i);
      const frame = await compositor.compose(project, t);
      try {
        renderer.drawFrame(frame);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
        frames.push(await blob.arrayBuffer());
      } finally {
        closeFrameBitmaps(frame);
      }
      // Frame rendering is the bulk of fallback work; leave room for the mux itself.
      onProgress({ phase: 'fallback-ffmpeg', progress: total > 0 ? (i / total) * 0.8 : 0.8 });
    }
  } finally {
    renderer.dispose();
  }

  throwIfAborted(signal);
  const mixed = await mixAudio(project, media, range);
  const audio = mixed ? encodeWav(mixed) : undefined;

  throwIfAborted(signal);
  const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const onAbort = (): void => audioVideoConverter.cancel(jobId);
  signal.addEventListener('abort', onAbort);
  try {
    const result = await audioVideoConverter.encodeFrames({ id: jobId, frames, fps: opts.fps, container: opts.container, audio });
    onProgress({ phase: 'fallback-ffmpeg', progress: 1 });
    return new Blob([result.data], { type: result.mime });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export function createExporter(deps: { media: MediaEngine; compositor: Compositor }): Exporter {
  const { media, compositor } = deps;

  return {
    async export(project: Project, opts: ExportOptions, onProgress: (p: ExportProgress) => void, signal: AbortSignal): Promise<Blob> {
      throwIfAborted(signal);
      onProgress({ phase: 'preparing', progress: 0 });

      const dims = evenDimensions(opts.width, opts.height);
      const range = resolveRange(opts.range, projectEnd(project));
      const hasAudio = collectAudibleSegments(project, range).length > 0;

      const canUseWebCodecs = typeof VideoEncoder !== 'undefined';
      const videoCodec = canUseWebCodecs
        ? await pickVideoCodec(opts.container, canEncodeVideo, { width: dims.width, height: dims.height, frameRate: opts.fps, bitrate: opts.videoBitrate })
        : null;
      const audioCodec = canUseWebCodecs && hasAudio
        ? await pickAudioCodec(opts.container, canEncodeAudio, { bitrate: opts.audioBitrate })
        : null;

      onProgress({ phase: 'preparing', progress: 1 });

      if (videoCodec && (!hasAudio || audioCodec)) {
        return exportWebCodecs(project, media, compositor, opts, range, dims, videoCodec, audioCodec, onProgress, signal);
      }
      return exportFfmpegFallback(project, media, compositor, opts, range, dims, onProgress, signal);
    },
  };
}
