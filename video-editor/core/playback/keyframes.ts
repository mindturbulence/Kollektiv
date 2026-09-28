// Ported from openreel@5f3c85e packages/core/src/video/keyframe-engine.ts — MIT,
// (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv: reduced to
// our fixed Keyframe.property union and EasingType (no bezier/named presets).
import type { Clip, EasingType, Keyframe, Transform } from '../types';

function ease(t: number, easing: EasingType): number {
  const c = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear': return c;
    case 'ease-in': return c * c;
    case 'ease-out': return c * (2 - c);
    case 'ease-in-out': return c < 0.5 ? 2 * c * c : -1 + (4 - 2 * c) * c;
    case 'hold': return 0; // stays at the earlier keyframe's value until the next one
  }
}

/** Evaluates one property's keyframes at `time` (seconds, relative to clip start). */
function valueAt(keyframes: Keyframe[], time: number, base: number): number {
  if (keyframes.length === 0) return base;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  let a = sorted[0];
  let b = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      a = sorted[i];
      b = sorted[i + 1];
      break;
    }
  }
  const span = b.time - a.time;
  const linear = span > 0 ? (time - a.time) / span : 0;
  const eased = ease(linear, a.easing);
  return a.value + (b.value - a.value) * eased;
}

function forProperty(clip: Clip, property: Keyframe['property']): Keyframe[] {
  return clip.keyframes.filter(k => k.property === property);
}

/** Base transform overridden by any keyframes active at `localTime` (s, relative to clip start). */
export function evaluateTransform(clip: Clip, localTime: number): Transform {
  return {
    x: valueAt(forProperty(clip, 'x'), localTime, clip.transform.x),
    y: valueAt(forProperty(clip, 'y'), localTime, clip.transform.y),
    scale: valueAt(forProperty(clip, 'scale'), localTime, clip.transform.scale),
    rotation: valueAt(forProperty(clip, 'rotation'), localTime, clip.transform.rotation),
    opacity: valueAt(forProperty(clip, 'opacity'), localTime, clip.transform.opacity),
    fit: clip.transform.fit,
  };
}

/** Base volume overridden by keyframes, then multiplied by fade-in/fade-out ramps. */
/** Keyframed volume without fades — what the user edits in the Inspector. */
export function evaluateVolumeLevel(clip: Clip, localTime: number): number {
  return valueAt(forProperty(clip, 'volume'), localTime, clip.volume);
}

/** Audible gain: keyframed level times fade-in/out. */
export function evaluateVolume(clip: Clip, localTime: number): number {
  let v = evaluateVolumeLevel(clip, localTime);
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    v *= Math.max(0, localTime / clip.fadeIn);
  }
  const fadeOutStart = clip.duration - clip.fadeOut;
  if (clip.fadeOut > 0 && localTime > fadeOutStart) {
    v *= Math.max(0, (clip.duration - localTime) / clip.fadeOut);
  }
  return Math.max(0, v);
}
