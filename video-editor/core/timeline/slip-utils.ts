// Ported from freecut@4d62e80 src/features/timeline/utils/slip-utils.ts — MIT,
// (c) 2025 FreeCut. Modified for Kollektiv: freecut clamps a delta expressed
// in source-native frames against explicit sourceStart/sourceEnd/sourceDuration
// fields; our Clip model has no separate sourceEnd, so bounds are derived
// from inPoint/duration/speed against MediaItem.duration (seconds).

import type { Clip, EditAction, MediaItem } from '../types';

const EPS = 1e-6;

/** Clamp a slip delta (source seconds) so inPoint stays within [0, media.duration - used source]. */
export function clampSlipDelta(clip: Clip, media: MediaItem | undefined, deltaSourceSeconds: number): number {
  if (!media || media.kind === 'image') return deltaSourceSeconds;
  let clamped = deltaSourceSeconds;
  if (clip.inPoint + clamped < 0) clamped = -clip.inPoint;
  const usedSourceSeconds = clip.duration * clip.speed;
  const maxInPoint = media.duration - usedSourceSeconds;
  if (clip.inPoint + clamped > maxInPoint) clamped = maxInPoint - clip.inPoint;
  return clamped;
}

/**
 * Slip a clip: shift its source window by `deltaTimelineSeconds` of timeline
 * time (converted to source seconds via speed) without moving start/duration.
 * Returns [] if the delta clamps to nothing (already at a source bound).
 */
export function computeSlip(clip: Clip, media: MediaItem | undefined, deltaTimelineSeconds: number): EditAction[] {
  const deltaSource = deltaTimelineSeconds * clip.speed;
  const clamped = clampSlipDelta(clip, media, deltaSource);
  if (Math.abs(clamped) <= EPS) return [];
  return [{ type: 'updateClip', clipId: clip.id, patch: { inPoint: clip.inPoint + clamped } }];
}
