// OWNED BY: timeline agent. Pure placement/query helpers over a Project.

import type { Clip, MediaItem, Project } from '../types';

export function clipAt(project: Project, trackId: string, time: number): Clip | null {
  return project.clips.find(c => c.trackId === trackId && time >= c.start && time < c.start + c.duration) ?? null;
}

export function projectDuration(project: Project): number {
  let end = 0;
  for (const c of project.clips) end = Math.max(end, c.start + c.duration);
  for (const m of project.markers) end = Math.max(end, m.time);
  return end;
}

export function frameQuantize(time: number, fps: number): number {
  if (fps <= 0) return time;
  return Math.round(time * fps) / fps;
}

/**
 * Earliest start >= minStart on `trackId` where a clip of `duration` seconds
 * fits without overlapping an existing clip.
 * ponytail: linear scan over a per-track sort — fine at editor scale
 * (hundreds of clips), revisit with an interval tree if that stops being true.
 */
export function findFreeSlot(project: Project, trackId: string, duration: number, minStart = 0): number {
  const onTrack = project.clips.filter(c => c.trackId === trackId).sort((a, b) => a.start - b.start);
  let candidate = Math.max(0, minStart);
  for (const c of onTrack) {
    if (candidate + duration <= c.start + 1e-6) return candidate;
    const clipEnd = c.start + c.duration;
    if (clipEnd > candidate) candidate = clipEnd;
  }
  return candidate;
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
