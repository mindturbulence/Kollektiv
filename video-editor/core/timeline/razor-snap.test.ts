import { describe, expect, it } from 'vitest';
import { getRazorSplitPosition } from './razor-snap';
import type { SnapPoint } from './snapping';

describe('getRazorSplitPosition', () => {
  it('snaps to the playhead when paused and within threshold', () => {
    const result = getRazorSplitPosition({ cursorTime: 5.02, playhead: 5, isPlaying: false });
    expect(result).toEqual({ splitTime: 5, snappedToPlayhead: true, snappedTo: null });
  });

  it('does not snap to the playhead while playing', () => {
    const result = getRazorSplitPosition({ cursorTime: 5.02, playhead: 5, isPlaying: true });
    expect(result.snappedToPlayhead).toBe(false);
    expect(result.splitTime).toBeCloseTo(5.02);
  });

  it('snaps to the nearest shift-held snap point over the playhead', () => {
    const snapPoints: SnapPoint[] = [{ time: 5, source: 'playhead' }, { time: 8, source: 'clip-start' }];
    const result = getRazorSplitPosition({ cursorTime: 8.05, playhead: 5, isPlaying: false, shiftHeld: true, snapPoints });
    expect(result).toEqual({ splitTime: 8, snappedToPlayhead: false, snappedTo: { time: 8, source: 'clip-start' } });
  });

  it('falls back to the raw cursor time when nothing is near', () => {
    const result = getRazorSplitPosition({ cursorTime: 12, playhead: 5, isPlaying: false });
    expect(result).toEqual({ splitTime: 12, snappedToPlayhead: false, snappedTo: null });
  });
});
