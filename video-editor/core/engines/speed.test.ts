// Ported from openreel@5f3c85e packages/core/src/video/speed-engine.test.ts —
// MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv:
// adapted from the SpeedEngine class API to the pure sourceTimeAt/
// timelineDurationFor functions.

import { describe, it, expect } from 'vitest';
import { clampSpeed, sourceTimeAt, timelineDurationFor, SPEED_MIN, SPEED_MAX } from './speed';
import type { SpeedParams } from './speed';

describe('clampSpeed', () => {
  it('clamps to the valid range', () => {
    expect(clampSpeed(0.01)).toBe(SPEED_MIN);
    expect(clampSpeed(100)).toBe(SPEED_MAX);
    expect(clampSpeed(2)).toBe(2);
  });
});

describe('sourceTimeAt — constant speed', () => {
  it('returns the same time at 1x', () => {
    const p: SpeedParams = { speed: 1, sourceDuration: 10 };
    expect(sourceTimeAt(p, 0)).toBe(0);
    expect(sourceTimeAt(p, 5)).toBe(5);
    expect(sourceTimeAt(p, 10)).toBe(10);
  });

  it('returns doubled time at 2x', () => {
    const p: SpeedParams = { speed: 2, sourceDuration: 10 };
    expect(sourceTimeAt(p, 0)).toBe(0);
    expect(sourceTimeAt(p, 2.5)).toBe(5);
    expect(sourceTimeAt(p, 5)).toBe(10);
  });

  it('returns halved time at 0.5x', () => {
    const p: SpeedParams = { speed: 0.5, sourceDuration: 10 };
    expect(sourceTimeAt(p, 0)).toBe(0);
    expect(sourceTimeAt(p, 10)).toBe(5);
    expect(sourceTimeAt(p, 20)).toBe(10);
  });

  it('clamps source time to the clip duration', () => {
    const p: SpeedParams = { speed: 2, sourceDuration: 10 };
    expect(sourceTimeAt(p, 100)).toBeLessThanOrEqual(10);
  });

  it('handles reverse playback', () => {
    const p: SpeedParams = { speed: 1, sourceDuration: 10, reverse: true };
    expect(sourceTimeAt(p, 0)).toBe(10);
    expect(sourceTimeAt(p, 5)).toBe(5);
    expect(sourceTimeAt(p, 10)).toBe(0);
  });

  it('handles reverse playback at 2x', () => {
    const p: SpeedParams = { speed: 2, sourceDuration: 10, reverse: true };
    expect(sourceTimeAt(p, 0)).toBe(10);
    expect(sourceTimeAt(p, 2.5)).toBe(5);
    expect(sourceTimeAt(p, 5)).toBe(0);
  });
});

describe('timelineDurationFor — constant speed', () => {
  it('is unchanged at 1x', () => {
    expect(timelineDurationFor(10, 1)).toBe(10);
  });

  it('halves at 2x', () => {
    expect(timelineDurationFor(10, 2)).toBe(5);
  });

  it('doubles at 0.5x', () => {
    expect(timelineDurationFor(10, 0.5)).toBe(20);
  });
});

describe('sourceTimeAt — freeze frames', () => {
  it('holds the frozen source time for the freeze window', () => {
    const p: SpeedParams = {
      speed: 1,
      sourceDuration: 10,
      freezeFrames: [{ sourceTime: 3, startTime: 5, duration: 2 }],
    };
    expect(sourceTimeAt(p, 5)).toBe(3);
    expect(sourceTimeAt(p, 6)).toBe(3);
  });

  it('resumes source time after subtracting the held duration', () => {
    const p: SpeedParams = {
      speed: 1,
      sourceDuration: 10,
      freezeFrames: [{ sourceTime: 3, startTime: 5, duration: 2 }],
    };
    // At timeline t=8: 2s of the freeze already elapsed, so source
    // time has advanced by (8 - 2) = 6s of unfrozen playback.
    expect(sourceTimeAt(p, 8)).toBe(6);
  });
});

describe('sourceTimeAt — speed ramps', () => {
  it('matches constant speed for a flat two-point ramp', () => {
    const p: SpeedParams = {
      speed: 1,
      sourceDuration: 10,
      keyframes: [
        { time: 0, speed: 2, easing: 'linear' },
        { time: 10, speed: 2, easing: 'linear' },
      ],
    };
    expect(sourceTimeAt(p, 2.5)).toBeCloseTo(5, 2);
  });

  it('is monotonic across the ramp', () => {
    const p: SpeedParams = {
      speed: 1,
      sourceDuration: 10,
      keyframes: [
        { time: 0, speed: 1, easing: 'linear' },
        { time: 10, speed: 4, easing: 'linear' },
      ],
    };
    let prev = -1;
    for (let t = 0; t <= 8; t += 1) {
      const st = sourceTimeAt(p, t);
      expect(st).toBeGreaterThanOrEqual(prev);
      prev = st;
    }
  });

  it('timelineDurationFor shortens for a ramp toward higher speed', () => {
    const flat = timelineDurationFor(10, 1);
    const ramped = timelineDurationFor(10, 1, [
      { time: 0, speed: 1, easing: 'linear' },
      { time: 10, speed: 4, easing: 'linear' },
    ]);
    expect(ramped).toBeLessThan(flat);
  });
});
