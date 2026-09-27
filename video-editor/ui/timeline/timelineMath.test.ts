import { describe, it, expect } from 'vitest';
import { formatTimecode, frameSnap, snapTime, trimBounds, clipsInViewport, findCuts } from './timelineMath';
import type { Clip, MediaItem } from '../../core/types';

const clip = (over: Partial<Clip>): Clip => ({
  id: 'c1', trackId: 't1', mediaId: 'm1', start: 0, duration: 5, inPoint: 0, speed: 1, volume: 1,
  fadeIn: 0, fadeOut: 0, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
  keyframes: [], effects: [], ...over,
});

const media = (over: Partial<MediaItem>): MediaItem => ({
  id: 'm1', kind: 'video', name: 'a.mp4', file: new Blob(), duration: 10, width: 1920, height: 1080, hasAudio: true, ...over,
});

describe('formatTimecode', () => {
  it('formats mm:ss:ff at 30fps', () => {
    expect(formatTimecode(65.5, 30)).toBe('01:05:15');
  });
  it('includes hours once >= 1h', () => {
    expect(formatTimecode(3661, 30)).toBe('01:01:01:00');
  });
});

describe('frameSnap', () => {
  it('rounds to the nearest frame', () => {
    expect(frameSnap(1.001, 30)).toBeCloseTo(1, 5);
  });
});

describe('snapTime', () => {
  it('snaps within threshold', () => {
    expect(snapTime(5.02, [5, 10], 0.05)).toEqual({ time: 5, snappedTo: 5 });
  });
  it('leaves time untouched outside threshold', () => {
    expect(snapTime(5.2, [5, 10], 0.05)).toEqual({ time: 5.2, snappedTo: null });
  });
});

describe('trimBounds', () => {
  it('clamps the start edge to source inPoint availability', () => {
    const c = clip({ start: 2, duration: 3, inPoint: 1 });
    const b = trimBounds(c, 'start', media({}));
    expect(b.min).toBeCloseTo(1, 5); // 2 - 1/1
    expect(b.max).toBeLessThan(c.start + c.duration);
  });
  it('clamps the end edge to remaining source duration', () => {
    const c = clip({ start: 0, duration: 3, inPoint: 8 }); // media.duration=10, so 2s left
    const b = trimBounds(c, 'end', media({ duration: 10 }));
    expect(b.max).toBeCloseTo(2, 5);
  });
  it('is unbounded for clips without media (text/image without a source limit)', () => {
    const c = clip({ mediaId: undefined, start: 0, duration: 3, inPoint: 0 });
    const b = trimBounds(c, 'end', undefined);
    expect(b.max).toBe(Infinity);
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

describe('findCuts', () => {
  it('finds an adjacent same-track pair as a cut', () => {
    const a = clip({ id: 'a', trackId: 't1', start: 0, duration: 5 });
    const b = clip({ id: 'b', trackId: 't1', start: 5, duration: 3 });
    const cuts = findCuts([a, b]);
    expect(cuts).toEqual([{ trackId: 't1', fromClipId: 'a', toClipId: 'b', time: 5 }]);
  });
  it('ignores clips with a gap between them', () => {
    const a = clip({ id: 'a', trackId: 't1', start: 0, duration: 5 });
    const b = clip({ id: 'b', trackId: 't1', start: 6, duration: 3 });
    expect(findCuts([a, b])).toEqual([]);
  });
});
