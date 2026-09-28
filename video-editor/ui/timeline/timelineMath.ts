// ─── Timeline UI — pure helpers ──────────────────────────────────────────────
// View-specific math only. Snapping, placement, frame quantization, trim
// bounds, and cut-detection live in core/timeline/{snapping,placement}.ts —
// import from there instead of duplicating.

import type { Clip, Keyframe, Track } from '../../core/types';
import { frameQuantize } from '../../core/timeline/placement';

/** mm:ss:ff or hh:mm:ss:ff (once >= 1h), frame count from `fps`. */
export function formatTimecode(seconds: number, fps: number): string {
  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const framesPerSec = Math.max(1, Math.round(fps));
  const ff = totalFrames % framesPerSec;
  const totalSeconds = Math.floor(totalFrames / framesPerSec);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}` : `${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/** Clips whose [start, start+duration] pixel range intersects the viewport + margin. */
export function clipsInViewport(clips: Clip[], zoom: number, scrollLeft: number, viewportWidth: number, marginPx: number): Clip[] {
  if (viewportWidth <= 0) return clips; // jsdom / unmeasured layout: don't cull
  const lo = scrollLeft - marginPx;
  const hi = scrollLeft + viewportWidth + marginPx;
  return clips.filter(c => {
    const left = c.start * zoom;
    const right = left + c.duration * zoom;
    return right >= lo && left <= hi;
  });
}

/** Whether a track accepts a clip being moved from another track of the same kind. */
export function canAcceptClip(track: Track | undefined, sourceKind: Track['kind']): boolean {
  return !!track && !track.locked && track.kind === sourceKind;
}

/** Clamp for setZoom, mirrored from core/store so drag-zoom feels immediate before dispatch settles. */
export function clampZoom(zoom: number): number {
  return Math.min(2000, Math.max(2, zoom));
}

/**
 * Distinct on-clip frame times (clip-relative seconds) across every keyframe
 * of every property, for drawing one diamond per frame instead of one per
 * property. Dedupes on the rounded frame index (not the float time) and
 * clips to [0, duration] since a keyframe can't outlive a trim that hasn't
 * removed it yet.
 */
export function keyframeMarkerTimes(keyframes: Keyframe[], duration: number, fps: number): number[] {
  const frames = new Set<number>();
  for (const k of keyframes) {
    if (k.time < -1e-6 || k.time > duration + 1e-6) continue;
    frames.add(Math.round(k.time * fps));
  }
  return [...frames].sort((a, b) => a - b).map(f => frameQuantize(f / fps, fps));
}
