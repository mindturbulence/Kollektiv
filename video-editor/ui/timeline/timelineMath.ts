// ─── Timeline UI — pure helpers ──────────────────────────────────────────────
// ponytail: core/timeline/{snapping,placement,razor-snap}.ts don't exist yet
// (owned by another agent). These are small local equivalents scoped to the
// timeline UI's own needs; if the real modules land with compatible
// signatures, this file can re-export from there instead.

import type { Clip, MediaItem, Track } from '../../core/types';

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

/** Rounds a time (s) to the nearest frame boundary for `fps`. */
export function frameSnap(time: number, fps: number): number {
  return Math.round(time * fps) / fps;
}

/** Snaps `time` to the closest of `points` within `threshold` (s); else `time`. */
export function snapTime(time: number, points: number[], threshold: number): { time: number; snappedTo: number | null } {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.abs(p - time);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  if (best !== null && bestDist <= threshold) return { time: best, snappedTo: best };
  return { time, snappedTo: null };
}

/** Snap points for dragging: other clips' start/end, the playhead, markers, and 0. */
export function collectSnapPoints(clips: Clip[], excludeClipIds: Set<string>, playhead: number, markers: number[]): number[] {
  const points = [0, playhead, ...markers];
  for (const c of clips) {
    if (excludeClipIds.has(c.id)) continue;
    points.push(c.start, c.start + c.duration);
  }
  return points;
}

export interface TrimBounds { min: number; max: number }

/** Valid range for dragging one edge of `clip`, given its source media (undefined for text/image-without-limit). */
export function trimBounds(clip: Clip, edge: 'start' | 'end', media: MediaItem | undefined): TrimBounds {
  const minFrame = 1 / 60; // at least ~1 frame at 60fps; good enough floor without fps in scope here
  if (edge === 'start') {
    const earliest = media ? clip.start - clip.inPoint / clip.speed : -Infinity;
    return { min: Math.max(0, earliest), max: clip.start + clip.duration - minFrame };
  }
  const latest = media ? clip.start + (media.duration - clip.inPoint) / clip.speed : Infinity;
  return { min: clip.start + minFrame, max: latest };
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

export interface Cut { trackId: string; fromClipId: string; toClipId: string; time: number }

/** Adjacent same-track clip pairs (cuts), sorted by track then time. */
export function findCuts(clips: Clip[]): Cut[] {
  const byTrack = new Map<string, Clip[]>();
  for (const c of clips) {
    const list = byTrack.get(c.trackId) ?? [];
    list.push(c);
    byTrack.set(c.trackId, list);
  }
  const cuts: Cut[] = [];
  const EPS = 1e-3;
  for (const [trackId, list] of byTrack) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (Math.abs(a.start + a.duration - b.start) <= EPS) {
        cuts.push({ trackId, fromClipId: a.id, toClipId: b.id, time: b.start });
      }
    }
  }
  return cuts;
}

/** Whether a track accepts a clip being moved from another track of the same kind. */
export function canAcceptClip(track: Track | undefined, sourceKind: Track['kind']): boolean {
  return !!track && !track.locked && track.kind === sourceKind;
}

/** Clamp for setZoom, mirrored from core/store so drag-zoom feels immediate before dispatch settles. */
export function clampZoom(zoom: number): number {
  return Math.min(2000, Math.max(2, zoom));
}
