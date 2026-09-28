import { describe, expect, it } from 'vitest';
import { baseProject, makeMarker } from '../actions/fixtures';
import { collectSnapPoints, snap } from './snapping';

describe('collectSnapPoints', () => {
  it('includes zero, playhead, clip edges, and markers', () => {
    const project = { ...baseProject(), markers: [makeMarker('mk1', 7)] };
    const points = collectSnapPoints(project, 3);
    expect(points).toEqual(
      expect.arrayContaining([
        { time: 0, source: 'zero' },
        { time: 3, source: 'playhead' },
        { time: 0, source: 'clip-start' },
        { time: 5, source: 'clip-end' },
        { time: 7, source: 'marker' },
      ]),
    );
  });
});

describe('collectSnapPoints excludeClipIds', () => {
  it('drops edges of excluded clips so a clip cannot snap to itself', () => {
    // t1: c1 [0,5), c2 [5,10); t2: c3 [0,4). Excluding both clips starting at
    // 0 leaves no clip-start point at time 0, while c2's edges are untouched.
    const project = baseProject();
    const points = collectSnapPoints(project, 0, new Set(['c1', 'c3']));
    expect(points).not.toEqual(expect.arrayContaining([{ time: 0, source: 'clip-start' }]));
    expect(points).toEqual(expect.arrayContaining([{ time: 5, source: 'clip-start' }, { time: 10, source: 'clip-end' }]));
  });
});

describe('snap', () => {
  const points = [{ time: 0, source: 'zero' as const }, { time: 10, source: 'clip-start' as const }];

  it('snaps to the nearest point within threshold', () => {
    expect(snap(9.7, points, 0.5)).toEqual({ time: 10, snappedTo: points[1] });
  });

  it('leaves the time unchanged when nothing is within threshold', () => {
    expect(snap(5, points, 0.5)).toEqual({ time: 5, snappedTo: null });
  });

  it('picks the closer of two candidates', () => {
    expect(snap(4.9, [{ time: 0, source: 'zero' as const }, { time: 10, source: 'clip-start' as const }], 6)).toEqual({
      time: 0,
      snappedTo: { time: 0, source: 'zero' },
    });
  });
});
