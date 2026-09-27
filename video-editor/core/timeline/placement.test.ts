import { describe, expect, it } from 'vitest';
import { baseProject, makeMarker } from '../actions/fixtures';
import { clipAt, findFreeSlot, frameQuantize, projectDuration } from './placement';

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
