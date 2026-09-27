// OWNED BY: timeline agent. Pure placement/query helpers over a Project.

import type { Clip, Project } from '../types';

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
