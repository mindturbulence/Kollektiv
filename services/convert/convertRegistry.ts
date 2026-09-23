/**
 * Converter capability matrix (plan W1).
 *
 * Central validation for "can this source become that target?" decisions.
 * Deliberately a flat map, not a plugin system (Phase 3 S2).
 *
 * License note (plan R3): kollektiv is GPL-3.0; VERT is AGPL-3.0. Libraries only —
 * never port VERT source into this repo.
 */
import {
  IMAGE_SOURCE_EXTS,
  SUPPORTED_SOURCE_EXTS,
  CONVERTER_LIMITS,
  getFormatById,
  IMAGE_TARGET_FORMATS,
  AUDIO_TARGET_FORMATS,
  VIDEO_TARGET_FORMATS,
  type ConverterFormatDef,
} from '../../constants/converterFormats';

export type ConvertEngine = 'magick' | 'ffmpeg';

export interface SourceFileDescriptor {
  name: string;
  /** Lowercased extension without dot. */
  ext: string;
  size: number;
  /** video duration in seconds when known (drives the E3 pre-check). */
  durationS?: number;
}

export type RegistryRejectReason =
  | 'unsupported-source'
  | 'unsupported-target'
  | 'same-format'
  | 'video-too-large'
  | 'video-too-long';

export interface RegistryVerdict {
  ok: boolean;
  engine?: ConvertEngine;
  target?: ConverterFormatDef;
  rejectReason?: RegistryRejectReason;
  /** True when the ffmpeg core (~32MB) must be lazily fetched before this job runs. */
  requiresFfmpegCore?: boolean;
}

const AUDIO_SOURCE_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma'];
const VIDEO_SOURCE_EXTS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv'];

const IMAGE_SOURCE = new Set(IMAGE_SOURCE_EXTS);
const ALL_SOURCE = new Set(SUPPORTED_SOURCE_EXTS);

function categoryForExt(ext: string): 'image' | 'audio' | 'video' | undefined {
  if (IMAGE_SOURCE.has(ext)) return 'image';
  if (AUDIO_SOURCE_EXTS.includes(ext)) return 'audio';
  if (VIDEO_SOURCE_EXTS.includes(ext)) return 'video';
  return undefined;
}

function targetsForCategory(cat: 'image' | 'audio' | 'video'): ConverterFormatDef[] {
  switch (cat) {
    case 'image': return IMAGE_TARGET_FORMATS;
    case 'audio': return AUDIO_TARGET_FORMATS;
    case 'video': return VIDEO_TARGET_FORMATS;
  }
}

/**
 * Validate a source→target pair.
 *
 * - Unknown source ext or target id → reject before queueing (plan failure table).
 * - Cross-category targets are rejected (image→mp3 etc.).
 * - Identical ext+engine no-ops are rejected as same-format.
 * - E3 pre-check: video sources >500MB or >10min rejected BEFORE queueing
 *   (single-thread wasm ~2GB memory ceiling).
 */
export function evaluateConversion(src: SourceFileDescriptor, targetId: string): RegistryVerdict {
  const ext = src.ext.toLowerCase();
  if (!ALL_SOURCE.has(ext)) {
    return { ok: false, rejectReason: 'unsupported-source' };
  }

  const target = getFormatById(targetId);
  if (!target) {
    return { ok: false, rejectReason: 'unsupported-target' };
  }

  const cat = categoryForExt(ext);
  if (!cat) {
    return { ok: false, rejectReason: 'unsupported-source' };
  }

  const allowedTargets = targetsForCategory(cat);
  if (!allowedTargets.some(t => t.id === target.id)) {
    return { ok: false, rejectReason: 'unsupported-target' };
  }

  const engine: ConvertEngine = cat === 'image' ? 'magick' : 'ffmpeg';

  // No-op guard: same engine + same container ext produces an identical file.
  if (cat !== 'image' && target.ext === ext && engine === 'ffmpeg') {
    return { ok: false, rejectReason: 'same-format' };
  }

  // E3 pre-check — applies to video sources (and audio durations when known).
  if (cat === 'video' || (cat === 'audio' && src.durationS !== undefined)) {
    if (src.size > CONVERTER_LIMITS.VIDEO_MAX_BYTES) {
      return { ok: false, rejectReason: 'video-too-large' };
    }
    if (src.durationS !== undefined && src.durationS > CONVERTER_LIMITS.VIDEO_MAX_DURATION_S) {
      return { ok: false, rejectReason: 'video-too-long' };
    }
  }

  return { ok: true, engine, target, requiresFfmpegCore: engine === 'ffmpeg' };
}

/** Targets offered for a given source extension (drives the per-row picker). */
export function getTargetsForSource(ext: string): ConverterFormatDef[] {
  const cat = categoryForExt(ext.toLowerCase());
  return cat ? targetsForCategory(cat) : [];
}

/** Unknown extension check — lets the UI reject rows before queueing. */
export function isKnownSourceExt(ext: string): boolean {
  return ALL_SOURCE.has(ext.toLowerCase());
}

export { categoryForExt };
