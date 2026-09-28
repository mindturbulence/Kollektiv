// Ported from freecut@4d62e80 src/features/timeline/utils/slide-utils.ts — MIT,
// (c) 2025 FreeCut. Modified for Kollektiv: freecut's slide operates on a
// TimelineItem store slice via `canJoinItems`/`sourceEnd`; this one is a pure
// function over Clip/Project that emits an EditAction[] batch for the caller
// to dispatch, and requires explicit left/right neighbors (a slide against an
// open end is just a trim — the UI should route it there instead).

import type { Clip, EditAction, MediaItem, Project } from '../types';

const MIN_CLIP_DURATION = 1 / 60; // seconds; never shrink a neighbor below one frame at 60fps
const EPS = 1e-6;

function mediaFor(project: Project, clip: Clip): MediaItem | undefined {
  return clip.mediaId ? project.media.find(m => m.id === clip.mediaId) : undefined;
}

/**
 * Slide `clip` by `deltaSeconds`: its own start moves, duration is
 * unchanged, and the left/right neighbors shrink and extend to close the gap
 * (source and minimum-duration limits are pre-clamped so every emitted step
 * succeeds — a step rejected mid-batch would leave the slide half-applied).
 */
export function computeSlide(
  project: Project,
  clip: Clip,
  leftNeighbor: Clip | null,
  rightNeighbor: Clip | null,
  deltaSeconds: number,
): EditAction[] {
  if (deltaSeconds === 0 || !leftNeighbor || !rightNeighbor) return [];
  let delta = deltaSeconds;

  const shrinking = delta > 0 ? rightNeighbor : leftNeighbor;
  const extending = delta > 0 ? leftNeighbor : rightNeighbor;

  const maxShrink = shrinking.duration - MIN_CLIP_DURATION;
  if (Math.abs(delta) > maxShrink) delta = Math.sign(delta) * Math.max(0, maxShrink);

  const media = mediaFor(project, extending);
  if (media && media.kind !== 'image') {
    // headroom is in source seconds (media duration minus what's already
    // consumed); delta is in timeline seconds, so convert via speed before
    // comparing — otherwise a speed != 1 neighbor's extend clamps too early
    // or too late and the batch below rejects a step mid-flight.
    const headroomSource = delta > 0
      ? media.duration - (extending.inPoint + extending.duration * extending.speed)
      : extending.inPoint;
    const headroom = headroomSource / extending.speed;
    if (Math.abs(delta) > headroom) delta = Math.sign(delta) * Math.max(0, headroom);
  }

  if (Math.abs(delta) <= EPS) return [];

  const trimRight = (time: number): EditAction => ({ type: 'trimClip', clipId: rightNeighbor.id, edge: 'start', time, ripple: false });
  const trimLeft = (time: number): EditAction => ({ type: 'trimClip', clipId: leftNeighbor.id, edge: 'end', time, ripple: false });
  const move: EditAction = { type: 'moveClip', clipId: clip.id, start: clip.start + delta, trackId: clip.trackId };

  // Shrink the neighbor in the direction of travel first (always safe — no
  // overlap risk), then move, then extend the trailing neighbor into the
  // gap the clip just vacated. Reversing this order would make the shrink
  // and the not-yet-moved clip overlap transiently and get rejected.
  return delta > 0
    ? [trimRight(rightNeighbor.start + delta), move, trimLeft(leftNeighbor.start + leftNeighbor.duration + delta)]
    : [trimLeft(leftNeighbor.start + leftNeighbor.duration + delta), move, trimRight(rightNeighbor.start + delta)];
}
