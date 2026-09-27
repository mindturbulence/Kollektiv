// Ported from openreel@5f3c85e packages/core/src/video/speed-engine.ts — MIT,
// (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv.
//
// Upstream is a stateful class (a clipId -> ClipSpeedData Map, plus an
// AnimationEngine dependency for easing). This is a v2 standalone module
// with no owner yet, so it's reworked into pure functions over a small
// `SpeedParams` type instead: no registry, no easing dependency (a 4-branch
// switch below covers it). The math (ramp interpolation, freeze-frame time
// accounting, binary-search inverse for ramps) is unchanged from upstream.

import type { EasingType } from '../types';

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 20;

/** A speed-ramp control point; `time` is source-time seconds. */
export interface SpeedRampKeyframe {
  time: number;
  speed: number;
  easing: EasingType;
}

/** A held frame; `startTime`/`duration` are timeline-local seconds. */
export interface FreezeFrameSpec {
  sourceTime: number;
  startTime: number;
  duration: number;
}

export interface SpeedParams {
  /** Constant speed (1 = normal). Ignored once `keyframes` cover a source time. */
  speed: number;
  reverse?: boolean;
  sourceDuration: number;
  /** Speed ramps; need not be pre-sorted. */
  keyframes?: SpeedRampKeyframe[];
  freezeFrames?: FreezeFrameSpec[];
}

export function clampSpeed(speed: number): number {
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
}

function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'hold':
      return 0;
    default:
      return t;
  }
}

function speedAtSourceTime(params: SpeedParams, sourceTime: number): number {
  const keyframes = params.keyframes;
  if (!keyframes || keyframes.length === 0) return clampSpeed(params.speed);

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (sourceTime <= sorted[0].time) return clampSpeed(sorted[0].speed);
  const last = sorted[sorted.length - 1];
  if (sourceTime >= last.time) return clampSpeed(last.speed);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (sourceTime >= a.time && sourceTime <= b.time) {
      const span = b.time - a.time;
      const linear = span > 0 ? (sourceTime - a.time) / span : 0;
      const eased = applyEasing(linear, a.easing);
      return clampSpeed(a.speed + (b.speed - a.speed) * eased);
    }
  }
  return clampSpeed(params.speed);
}

/** Numerically integrates 1/speed over source time to get elapsed timeline time. */
function integrateTimelineTime(params: SpeedParams, sourceTime: number): number {
  const steps = Math.max(100, Math.ceil(sourceTime * 100));
  if (steps <= 0) return 0;
  const dt = sourceTime / steps;
  let timelineTime = 0;
  for (let i = 0; i < steps; i++) {
    timelineTime += dt / speedAtSourceTime(params, i * dt);
  }
  return timelineTime;
}

/** Timeline-clock duration for a clip of `sourceDuration` at `speed` (or a ramp). */
export function timelineDurationFor(
  sourceDuration: number,
  speed: number,
  keyframes?: SpeedRampKeyframe[],
): number {
  if (keyframes && keyframes.length > 0) {
    return integrateTimelineTime({ speed, sourceDuration, keyframes }, sourceDuration);
  }
  return sourceDuration / clampSpeed(speed);
}

function sourceTimeForRamp(params: SpeedParams, localTime: number): number {
  const total = integrateTimelineTime(params, params.sourceDuration);
  if (localTime <= 0) return 0;
  if (localTime >= total) return params.sourceDuration;

  let low = 0;
  let high = params.sourceDuration;
  const tolerance = 0.0001;
  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    if (integrateTimelineTime(params, mid) < localTime) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Maps timeline-local time (seconds since the clip's timeline start) to
 * source time, accounting for freeze frames, speed ramps, constant speed
 * and reverse, in that order — mirrors upstream's
 * `getSourceTimeAtPlaybackTime`.
 */
export function sourceTimeAt(params: SpeedParams, localTime: number): number {
  let adjusted = localTime;
  for (const ff of params.freezeFrames ?? []) {
    if (localTime >= ff.startTime && localTime < ff.startTime + ff.duration) {
      return ff.sourceTime;
    }
    if (ff.startTime + ff.duration <= localTime) adjusted -= ff.duration;
    else if (ff.startTime < localTime) break;
  }

  let sourceTime: number;
  if (params.keyframes && params.keyframes.length > 0) {
    sourceTime = sourceTimeForRamp(params, adjusted);
  } else {
    sourceTime = adjusted * clampSpeed(params.speed);
  }
  if (params.reverse) sourceTime = params.sourceDuration - sourceTime;
  return Math.max(0, Math.min(params.sourceDuration, sourceTime));
}
