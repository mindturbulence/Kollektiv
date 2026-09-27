// OWNED BY: timeline agent. Pure snap-point collection + nearest-point snap.

import type { Project } from '../types';

export type SnapSource = 'zero' | 'playhead' | 'clip-start' | 'clip-end' | 'marker';

export interface SnapPoint {
  time: number;
  source: SnapSource;
}

/** Every candidate snap target on the timeline: 0, the playhead, clip edges, markers. */
export function collectSnapPoints(project: Project, playhead: number): SnapPoint[] {
  const points: SnapPoint[] = [{ time: 0, source: 'zero' }, { time: playhead, source: 'playhead' }];
  for (const clip of project.clips) {
    points.push({ time: clip.start, source: 'clip-start' });
    points.push({ time: clip.start + clip.duration, source: 'clip-end' });
  }
  for (const marker of project.markers) {
    points.push({ time: marker.time, source: 'marker' });
  }
  return points;
}

export interface SnapResult {
  time: number;
  snappedTo: SnapPoint | null;
}

/** Nearest point within `thresholdSeconds`, or `time` unchanged if none qualifies. */
export function snap(time: number, points: SnapPoint[], thresholdSeconds: number): SnapResult {
  let best: SnapPoint | null = null;
  let bestDist = thresholdSeconds;
  for (const p of points) {
    const d = Math.abs(p.time - time);
    if (d <= bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best ? { time: best.time, snappedTo: best } : { time, snappedTo: null };
}
