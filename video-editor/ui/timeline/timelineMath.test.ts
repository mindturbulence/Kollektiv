import { describe, it, expect } from 'vitest';
import { formatTimecode, clipsInViewport, keyframeMarkerTimes } from './timelineMath';
import type { Clip, Keyframe } from '../../core/types';

const clip = (over: Partial<Clip>): Clip => ({
  id: 'c1', trackId: 't1', mediaId: 'm1', start: 0, duration: 5, inPoint: 0, speed: 1, volume: 1,
  fadeIn: 0, fadeOut: 0, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
  keyframes: [], effects: [], ...over,
});

const kf = (over: Partial<Keyframe>): Keyframe => ({ id: 'k1', time: 0, property: 'opacity', value: 1, easing: 'linear', ...over });

describe('formatTimecode', () => {
  it('formats mm:ss:ff at 30fps', () => {
    expect(formatTimecode(65.5, 30)).toBe('01:05:15');
  });
  it('includes hours once >= 1h', () => {
    expect(formatTimecode(3661, 30)).toBe('01:01:01:00');
  });
});

describe('clipsInViewport', () => {
  it('culls clips outside the viewport + margin', () => {
    const near = clip({ id: 'near', start: 0, duration: 1 });
    const far = clip({ id: 'far', start: 1000, duration: 1 });
    const result = clipsInViewport([near, far], 10, 0, 200, 50);
    expect(result.map(c => c.id)).toEqual(['near']);
  });
  it('renders everything when the viewport is unmeasured (width 0)', () => {
    const a = clip({ id: 'a', start: 0, duration: 1 });
    const b = clip({ id: 'b', start: 1000, duration: 1 });
    expect(clipsInViewport([a, b], 10, 0, 0, 50).map(c => c.id)).toEqual(['a', 'b']);
  });
});

describe('keyframeMarkerTimes', () => {
  it('dedupes keyframes at the same frame across different properties', () => {
    const keyframes = [
      kf({ id: 'k1', time: 1, property: 'opacity' }),
      kf({ id: 'k2', time: 1.001, property: 'scale' }), // same frame at 30fps
      kf({ id: 'k3', time: 2, property: 'x' }),
    ];
    expect(keyframeMarkerTimes(keyframes, 5, 30)).toEqual([1, 2]);
  });

  it('excludes keyframes outside [0, duration]', () => {
    const keyframes = [kf({ id: 'k1', time: -1 }), kf({ id: 'k2', time: 2 }), kf({ id: 'k3', time: 10 })];
    expect(keyframeMarkerTimes(keyframes, 5, 30)).toEqual([2]);
  });

  it('returns times sorted ascending', () => {
    const keyframes = [kf({ id: 'k1', time: 3 }), kf({ id: 'k2', time: 1 })];
    expect(keyframeMarkerTimes(keyframes, 5, 30)).toEqual([1, 3]);
  });
});
