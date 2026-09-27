import type { ExportRange } from './audioMix';

/** Whole-project range when opts.range is unset (projectDuration from playback/compositor's projectEnd). */
export function resolveRange(range: ExportRange | undefined, projectDuration: number): ExportRange {
  if (range) return range;
  if (projectDuration <= 0) throw new Error('video-editor: nothing to export — project has zero duration');
  return { start: 0, end: projectDuration };
}

/** Number of output frames covering the range at `fps`. Never accumulate 1/fps in a loop — derive each frame's time from its index. */
export function frameCount(range: ExportRange, fps: number): number {
  return Math.max(0, Math.round((range.end - range.start) * fps));
}

/** Absolute timeline time (s) of frame `index`. */
export function frameTime(range: ExportRange, fps: number, index: number): number {
  return range.start + index / fps;
}
