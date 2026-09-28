import { describe, expect, it } from 'vitest';
import { baseProject, makeClip, makeMedia, makeMarker } from '../actions/fixtures';
import { clipAt, findCuts, findFreeSlot, frameQuantize, projectDuration, trimBounds } from './placement';

describe('clipAt', () => {
  it('finds the clip covering a time on a track, or null', () => {
    const project = baseProject();
    expect(clipAt(project, 't1', 2)?.id).toBe('c1');
    expect(clipAt(project, 't1', 7)?.id).toBe('c2');
    expect(clipAt(project, 't1', 20)).toBeNull();
  });
});

describe('projectDuration', () => {
  it('is the furthest clip end or marker time', () => {
    const project = { ...baseProject(), markers: [makeMarker('mk1', 100)] };
    expect(projectDuration(project)).toBe(100);
    expect(projectDuration(baseProject())).toBe(10); // c2 ends at 10
  });
});

describe('frameQuantize', () => {
  it('rounds to the nearest frame boundary', () => {
    expect(frameQuantize(1.001, 30)).toBeCloseTo(1);
    expect(frameQuantize(1.02, 30)).toBeCloseTo(1 + 1 / 30);
  });
});

describe('findFreeSlot', () => {
  it('returns minStart when the track is empty there', () => {
    const project = baseProject();
    expect(findFreeSlot(project, 't2', 2, 10)).toBe(10);
  });

  it('skips past occupied ranges to the first gap that fits', () => {
    const project = baseProject(); // t1: c1 [0,5), c2 [5,10)
    expect(findFreeSlot(project, 't1', 3)).toBe(10);
  });

  it('fits into a gap between two clips', () => {
    const project = baseProject();
    const withGap = { ...project, clips: project.clips.filter(c => c.id !== 'c2').map(c => (c.id === 'c1' ? c : { ...c, start: c.start + 20 })) };
    expect(findFreeSlot(withGap, 't1', 2)).toBe(5);
  });
});

describe('trimBounds', () => {
  it('clamps the start edge to source inPoint availability', () => {
    const c = makeClip('c1', 't1', { start: 2, duration: 3, inPoint: 1, mediaId: 'm1' });
    const b = trimBounds(c, 'start', makeMedia('m1'));
    expect(b.min).toBeCloseTo(1, 5); // 2 - 1/1
    expect(b.max).toBeLessThan(c.start + c.duration);
  });
  it('clamps the end edge to remaining source duration', () => {
    const c = makeClip('c1', 't1', { start: 0, duration: 3, inPoint: 8, mediaId: 'm1' }); // media.duration=10, so 2s left
    const b = trimBounds(c, 'end', makeMedia('m1', { duration: 10 }));
    expect(b.max).toBeCloseTo(2, 5);
  });
  it('is unbounded for clips without media (text/image without a source limit)', () => {
    const c = makeClip('c1', 't1', { mediaId: undefined, start: 0, duration: 3, inPoint: 0 });
    const b = trimBounds(c, 'end', undefined);
    expect(b.max).toBe(Infinity);
  });
});

describe('findCuts', () => {
  it('finds an adjacent same-track pair as a cut', () => {
    const a = makeClip('a', 't1', { start: 0, duration: 5 });
    const b = makeClip('b', 't1', { start: 5, duration: 3 });
    const cuts = findCuts([a, b]);
    expect(cuts).toEqual([{ trackId: 't1', fromClipId: 'a', toClipId: 'b', time: 5 }]);
  });
  it('ignores clips with a gap between them', () => {
    const a = makeClip('a', 't1', { start: 0, duration: 5 });
    const b = makeClip('b', 't1', { start: 6, duration: 3 });
    expect(findCuts([a, b])).toEqual([]);
  });
});
