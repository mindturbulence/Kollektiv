// Ported from freecut@4d62e80 src/features/timeline/utils/razor-snap.ts — MIT,
// (c) 2025 FreeCut. Modified for Kollektiv: freecut's version works in
// pixel/frame-int UI coordinates (cursorX, frameToPixels); this one works
// directly in project seconds and reuses SnapPoint from ./snapping instead of
// a UI-supplied target list, since UI px<->time conversion isn't this
// module's concern.

import type { SnapPoint } from './snapping';

export const RAZOR_PLAYHEAD_SNAP_THRESHOLD_SECONDS = 10 / 30;
export const RAZOR_SNAP_THRESHOLD_SECONDS = 12 / 30;

export interface RazorSplitPositionParams {
  cursorTime: number;
  playhead: number;
  isPlaying: boolean;
  /** When true, snap to the nearest of `snapPoints` within threshold. */
  shiftHeld?: boolean;
  snapPoints?: SnapPoint[];
  snapThresholdSeconds?: number;
  playheadThresholdSeconds?: number;
}

export interface RazorSplitPositionResult {
  splitTime: number;
  snappedToPlayhead: boolean;
  snappedTo: SnapPoint | null;
}

export function getRazorSplitPosition(params: RazorSplitPositionParams): RazorSplitPositionResult {
  const {
    cursorTime,
    playhead,
    isPlaying,
    shiftHeld = false,
    snapPoints,
    snapThresholdSeconds = RAZOR_SNAP_THRESHOLD_SECONDS,
    playheadThresholdSeconds = RAZOR_PLAYHEAD_SNAP_THRESHOLD_SECONDS,
  } = params;

  if (shiftHeld && snapPoints && snapPoints.length > 0) {
    let nearest: SnapPoint | null = null;
    let nearestDist = snapThresholdSeconds;
    for (const p of snapPoints) {
      const d = Math.abs(cursorTime - p.time);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }
    if (nearest) {
      return { splitTime: nearest.time, snappedToPlayhead: nearest.source === 'playhead', snappedTo: nearest };
    }
  }

  const shouldSnapToPlayhead = !isPlaying && Math.abs(cursorTime - playhead) <= playheadThresholdSeconds;
  if (shouldSnapToPlayhead) {
    return { splitTime: playhead, snappedToPlayhead: true, snappedTo: null };
  }

  return { splitTime: cursorTime, snappedToPlayhead: false, snappedTo: null };
}
