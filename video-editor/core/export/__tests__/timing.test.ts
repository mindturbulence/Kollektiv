import { describe, it, expect } from 'vitest';
import { frameCount, frameTime, resolveRange } from '../timing';

describe('resolveRange', () => {
  it('passes an explicit range through unchanged', () => {
    expect(resolveRange({ start: 1, end: 4 }, 10)).toEqual({ start: 1, end: 4 });
  });

  it('defaults to the whole project when unset', () => {
    expect(resolveRange(undefined, 12.5)).toEqual({ start: 0, end: 12.5 });
  });

  it('throws for a zero-duration project with no explicit range', () => {
    expect(() => resolveRange(undefined, 0)).toThrow();
  });
});

describe('frameCount / frameTime', () => {
  it('rounds range*fps to the nearest frame', () => {
    expect(frameCount({ start: 0, end: 2 }, 30)).toBe(60);
    expect(frameCount({ start: 0, end: 1 / 3 }, 30)).toBe(10);
  });

  it('derives each frame time from its index, not accumulation', () => {
    const range = { start: 1, end: 3 };
    const fps = 25;
    const times = Array.from({ length: frameCount(range, fps) }, (_, i) => frameTime(range, fps, i));
    expect(times[0]).toBe(1);
    expect(times[times.length - 1]).toBeCloseTo(1 + (times.length - 1) / fps, 10);
    // No drift: time[i] must equal exactly start + i/fps, not a running sum.
    expect(frameTime(range, fps, 49)).toBeCloseTo(1 + 49 / 25, 10);
  });
});
