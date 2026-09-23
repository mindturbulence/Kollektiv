/**
 * Converter format constants (plan W1/W2).
 *
 * License note (plan R3): kollektiv is GPL-3.0; VERT is AGPL-3.0. This feature
 * uses the underlying libraries (@imagemagick/magick-wasm, @ffmpeg/ffmpeg) directly —
 * never port VERT source into this repo.
 */

export type ConverterCategory = 'image' | 'audio' | 'video';

export interface ConverterFormatDef {
  id: string;
  /** File extension without dot. */
  ext: string;
  label: string;
  category: ConverterCategory;
  mime: string;
  /** magick format string used for the output blob. */
  magickFormat?: string;
  /** ffmpeg output args appended after `-i input` (codec preset included). */
  ffmpegArgs?: string[];
}

// ── Image (magick-wasm, plan W1) ──────────────────────────────────────

export const IMAGE_TARGET_FORMATS: ConverterFormatDef[] = [
  { id: 'webp', ext: 'webp', label: 'WebP', category: 'image', mime: 'image/webp', magickFormat: 'WEBP' },
  { id: 'avif', ext: 'avif', label: 'AVIF', category: 'image', mime: 'image/avif', magickFormat: 'AVIF' },
  { id: 'png', ext: 'png', label: 'PNG', category: 'image', mime: 'image/png', magickFormat: 'PNG' },
  { id: 'jpeg', ext: 'jpg', label: 'JPEG', category: 'image', mime: 'image/jpeg', magickFormat: 'JPEG' },
  { id: 'gif', ext: 'gif', label: 'GIF', category: 'image', mime: 'image/gif', magickFormat: 'GIF' },
  { id: 'tiff', ext: 'tiff', label: 'TIFF', category: 'image', mime: 'image/tiff', magickFormat: 'TIFF' },
  { id: 'bmp', ext: 'bmp', label: 'BMP', category: 'image', mime: 'image/bmp', magickFormat: 'BMP' },
];

/** Image formats magick can decode (W1 scope: read side). */
export const IMAGE_SOURCE_EXTS = [
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'tif', 'bmp', 'heic', 'heif',
];

// ── Audio (ffmpeg single-thread core, plan W2) ────────────────────────

export const AUDIO_TARGET_FORMATS: ConverterFormatDef[] = [
  { id: 'mp3', ext: 'mp3', label: 'MP3', category: 'audio', mime: 'audio/mpeg', ffmpegArgs: ['-c:a', 'libmp3lame', '-b:a'] },
  { id: 'wav', ext: 'wav', label: 'WAV', category: 'audio', mime: 'audio/wav', ffmpegArgs: ['-c:a', 'pcm_s16le'] },
  { id: 'flac', ext: 'flac', label: 'FLAC', category: 'audio', mime: 'audio/flac', ffmpegArgs: ['-c:a', 'flac'] },
  { id: 'ogg', ext: 'ogg', label: 'OGG', category: 'audio', mime: 'audio/ogg', ffmpegArgs: ['-c:a', 'libvorbis', '-b:a'] },
  { id: 'm4a', ext: 'm4a', label: 'M4A', category: 'audio', mime: 'audio/mp4', ffmpegArgs: ['-c:a', 'aac', '-b:a'] },
  { id: 'aac', ext: 'aac', label: 'AAC', category: 'audio', mime: 'audio/aac', ffmpegArgs: ['-c:a', 'aac', '-b:a'] },
];

// ── Video (ffmpeg single-thread core, plan W2 — short clips only) ─────

export const VIDEO_TARGET_FORMATS: ConverterFormatDef[] = [
  { id: 'mp4', ext: 'mp4', label: 'MP4 (H.264)', category: 'video', mime: 'video/mp4', ffmpegArgs: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'] },
  { id: 'webm', ext: 'webm', label: 'WebM (VP9)', category: 'video', mime: 'video/webm', ffmpegArgs: ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-c:a', 'libopus'] },
  { id: 'gif', ext: 'gif', label: 'GIF', category: 'video', mime: 'image/gif', ffmpegArgs: ['-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0'] },
];

// ── Combined lookups ──────────────────────────────────────────────────

export const ALL_TARGET_FORMATS: ConverterFormatDef[] = [
  ...IMAGE_TARGET_FORMATS,
  ...AUDIO_TARGET_FORMATS,
  ...VIDEO_TARGET_FORMATS,
];

/** All extensions the converter can read (image exts + anything ffmpeg demuxes). */
export const SUPPORTED_SOURCE_EXTS: string[] = [
  ...IMAGE_SOURCE_EXTS,
  'mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma',
  'mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv',
];

export function getFormatById(id: string): ConverterFormatDef | undefined {
  return ALL_TARGET_FORMATS.find(f => f.id === id);
}

export function getExtensionMime(ext: string): string {
  const normalized = ext.toLowerCase();
  const target = ALL_TARGET_FORMATS.find(f => f.ext === normalized);
  if (target) return target.mime;
  const imageMimes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    avif: 'image/avif', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff',
    bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif',
  };
  return imageMimes[normalized] || 'application/octet-stream';
}

// ── Options & limits (plan W1/W2/E3) ──────────────────────────────────

export const CONVERTER_LIMITS = {
  /** Plan W1: prevents OOM on huge batches; enforced with a visible warning. */
  BATCH_CAP: 200,
  /** Plan W2/E3: wasm ~2GB memory ceiling → reject larger clips before queueing. */
  VIDEO_MAX_BYTES: 500 * 1024 * 1024,
  /** Plan W2/E3: reject long-form before queueing. */
  VIDEO_MAX_DURATION_S: 600,
  /** Plan W2: UI guidance — single-thread core is for short clips. */
  VIDEO_RECOMMENDED_MAX_S: 60,
  /** ffmpeg watchdog: terminate hung jobs (plan failure table). */
  FFMPEG_TIMEOUT_MS: 10 * 60 * 1000,
  /** magick worker restart budget (plan S1). */
  WORKER_RESTARTS: 1,
} as const;

/** Filename max length after sanitization (plan W1). */
export const CONVERTER_NAME_MAX_LEN = 200;
