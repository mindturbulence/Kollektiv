import { describe, expect, it } from 'vitest';
import { evaluateTransform, evaluateVolume } from './keyframes';
import type { Clip, Keyframe } from '../types';
import { DEFAULT_TRANSFORM } from '../types';

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    trackId: 't1',
    mediaId: 'm1',
    start: 0,
    duration: 10,
    inPoint: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    keyframes: [],
    effects: [],
    ...overrides,
  };
}

function kf(overrides: Partial<Keyframe> = {}): Keyframe {
  return { id: 'k', time: 0, property: 'x', value: 0, easing: 'linear', ...overrides };
}

describe('evaluateTransform', () => {
  it('returns the base transform when there are no keyframes', () => {
    const c = clip({ transform: { ...DEFAULT_TRANSFORM, x: 42, scale: 2 } });
    expect(evaluateTransform(c, 5)).toEqual({ ...DEFAULT_TRANSFORM, x: 42, scale: 2 });
  });

  it('interpolates linearly between two keyframes', () => {
    const c = clip({
      keyframes: [kf({ id: 'a', time: 0, property: 'x', value: 0, easing: 'linear' }), kf({ id: 'b', time: 10, property: 'x', value: 100 })],
    });
    expect(evaluateTransform(c, 5).x).toBeCloseTo(50);
  });

  it('clamps to the first/last keyframe outside their range', () => {
    const c = clip({
      keyframes: [kf({ id: 'a', time: 2, property: 'y', value: 10 }), kf({ id: 'b', time: 8, property: 'y', value: 20 })],
    });
    expect(evaluateTransform(c, 0).y).toBe(10);
    expect(evaluateTransform(c, 100).y).toBe(20);
  });

  it('holds the earlier value until the next keyframe under "hold" easing', () => {
    const c = clip({
      keyframes: [kf({ id: 'a', time: 0, property: 'opacity', value: 1, easing: 'hold' }), kf({ id: 'b', time: 10, property: 'opacity', value: 0 })],
    });
    expect(evaluateTransform(c, 9.999).opacity).toBe(1);
    expect(evaluateTransform(c, 10).opacity).toBe(0);
  });

  it('ease-in starts slow (below the linear midpoint before t=0.5)', () => {
    const c = clip({ keyframes: [kf({ id: 'a', time: 0, property: 'scale', value: 0, easing: 'ease-in' }), kf({ id: 'b', time: 10, property: 'scale', value: 10 })] });
    expect(evaluateTransform(c, 5).scale).toBeLessThan(5);
  });

  it('ease-out starts fast (above the linear midpoint before t=0.5)', () => {
    const c = clip({ keyframes: [kf({ id: 'a', time: 0, property: 'scale', value: 0, easing: 'ease-out' }), kf({ id: 'b', time: 10, property: 'scale', value: 10 })] });
    expect(evaluateTransform(c, 5).scale).toBeGreaterThan(5);
  });

  it('ease-in-out matches the linear midpoint value at t=0.5', () => {
    const c = clip({ keyframes: [kf({ id: 'a', time: 0, property: 'rotation', value: 0, easing: 'ease-in-out' }), kf({ id: 'b', time: 10, property: 'rotation', value: 100 })] });
    expect(evaluateTransform(c, 5).rotation).toBeCloseTo(50);
  });

  it('preserves fit, which is never keyframed', () => {
    const c = clip({ transform: { ...DEFAULT_TRANSFORM, fit: 'cover' } });
    expect(evaluateTransform(c, 0).fit).toBe('cover');
  });
});

describe('evaluateVolume', () => {
  it('returns the base volume with no keyframes or fades', () => {
    expect(evaluateVolume(clip({ volume: 1.5 }), 5)).toBe(1.5);
  });

  it('ramps up during fadeIn', () => {
    const c = clip({ volume: 1, fadeIn: 2 });
    expect(evaluateVolume(c, 0)).toBeCloseTo(0);
    expect(evaluateVolume(c, 1)).toBeCloseTo(0.5);
    expect(evaluateVolume(c, 2)).toBeCloseTo(1);
  });

  it('ramps down during fadeOut', () => {
    const c = clip({ volume: 1, duration: 10, fadeOut: 2 });
    expect(evaluateVolume(c, 8)).toBeCloseTo(1);
    expect(evaluateVolume(c, 9)).toBeCloseTo(0.5);
    expect(evaluateVolume(c, 10)).toBeCloseTo(0);
  });

  it('multiplies a keyframed volume by the fade ramp', () => {
    const c = clip({
      duration: 10,
      fadeIn: 2,
      keyframes: [kf({ id: 'a', time: 0, property: 'volume', value: 2, easing: 'linear' }), kf({ id: 'b', time: 10, property: 'volume', value: 2 })],
    });
    expect(evaluateVolume(c, 1)).toBeCloseTo(1); // 2 * 0.5
  });

  it('never returns a negative volume', () => {
    expect(evaluateVolume(clip({ volume: 0, fadeIn: 2 }), 0)).toBe(0);
  });
});
