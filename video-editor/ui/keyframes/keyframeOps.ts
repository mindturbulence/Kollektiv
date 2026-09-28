// ─── Kollektiv Video Editor — keyframe ops ───────────────────────────────────
// Pure helpers over Clip.keyframes. No store access; callers dispatch the
// resulting `keyframes` array via `updateClip`.
import type { Clip, EasingType, Keyframe } from '../../core/types';
import { evaluateTransform, evaluateVolumeLevel } from '../../core/playback/keyframes';

const DEFAULT_EASING: EasingType = 'linear';

function sorted(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

/** Half a frame, in seconds, at the given fps. */
function halfFrame(fps: number): number {
  return 1 / fps / 2;
}

/** The keyframe for `property` within half a frame of `localTime`, if any. */
export function keyframeAt(clip: Clip, property: Keyframe['property'], localTime: number, fps: number): Keyframe | undefined {
  const tol = halfFrame(fps);
  return clip.keyframes.find(k => k.property === property && Math.abs(k.time - localTime) <= tol);
}

/** Adds a keyframe at `localTime`, replacing one already at that frame. Returns a new sorted array. */
export function setKeyframe(clip: Clip, property: Keyframe['property'], localTime: number, value: number, fps: number, easing: EasingType = DEFAULT_EASING): Keyframe[] {
  const existing = keyframeAt(clip, property, localTime, fps);
  const rest = existing ? clip.keyframes.filter(k => k.id !== existing.id) : clip.keyframes;
  const next: Keyframe = { id: existing?.id ?? crypto.randomUUID(), time: localTime, property, value, easing: existing?.easing ?? easing };
  return sorted([...rest, next]);
}

/** Removes the keyframe for `property` at `localTime` (within half a frame), if any. */
export function removeKeyframe(clip: Clip, property: Keyframe['property'], localTime: number, fps: number): Keyframe[] {
  const existing = keyframeAt(clip, property, localTime, fps);
  if (!existing) return clip.keyframes;
  return clip.keyframes.filter(k => k.id !== existing.id);
}

/** Updates just the easing of the keyframe for `property` at `localTime`. */
export function setKeyframeEasing(clip: Clip, property: Keyframe['property'], localTime: number, fps: number, easing: EasingType): Keyframe[] {
  const existing = keyframeAt(clip, property, localTime, fps);
  if (!existing) return clip.keyframes;
  return sorted(clip.keyframes.map(k => (k.id === existing.id ? { ...k, easing } : k)));
}

/**
 * The nearest keyframe time (across all properties, or one) strictly before/after
 * `localTime`, for prev/next navigation. Returns undefined if none exists.
 */
export function adjacentKeyframeTime(clip: Clip, property: Keyframe['property'] | null, localTime: number, dir: 'prev' | 'next'): number | undefined {
  const times = clip.keyframes
    .filter(k => property === null || k.property === property)
    .map(k => k.time);
  if (dir === 'prev') {
    const candidates = times.filter(t => t < localTime);
    return candidates.length ? Math.max(...candidates) : undefined;
  }
  const candidates = times.filter(t => t > localTime);
  return candidates.length ? Math.min(...candidates) : undefined;
}

/** Current value of a keyframeable property at `localTime`, honouring keyframes and base value. */
export function valueAt(clip: Clip, property: Keyframe['property'], localTime: number): number {
  if (property === 'volume') return evaluateVolumeLevel(clip, localTime); // fades are output gain, not the edited value
  return evaluateTransform(clip, localTime)[property];
}

/**
 * Builds the `updateClip` patch for committing a slider value at the playhead:
 * writes/updates a keyframe if the property already has any, otherwise just
 * updates the base value (transform.* or volume).
 */
export function commitPropertyValue(clip: Clip, property: Keyframe['property'], localTime: number, fps: number, value: number): Partial<Omit<Clip, 'id' | 'trackId'>> {
  const hasKeyframes = clip.keyframes.some(k => k.property === property);
  if (!hasKeyframes) {
    return property === 'volume' ? { volume: value } : { transform: { ...clip.transform, [property]: value } };
  }
  return { keyframes: setKeyframe(clip, property, localTime, value, fps) };
}
