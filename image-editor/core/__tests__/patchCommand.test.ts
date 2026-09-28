import { describe, it, expect } from 'vitest';
import { dirtyRect } from '../history/patchCommand';

describe('dirtyRect', () => {
  it('pads, rounds outward and clamps to the bitmap', () => {
    expect(dirtyRect(10.4, 20.6, 30.2, 40.1, 1, 100, 100)).toEqual({ x: 9, y: 19, width: 23, height: 23 });
    expect(dirtyRect(-5, -5, 5, 5, 2, 100, 100)).toEqual({ x: 0, y: 0, width: 7, height: 7 });
    expect(dirtyRect(95, 95, 120, 120, 0, 100, 100)).toEqual({ x: 95, y: 95, width: 5, height: 5 });
  });

  it('returns null when the stroke never touched the bitmap', () => {
    expect(dirtyRect(-50, -50, -10, -10, 1, 100, 100)).toBeNull();
    expect(dirtyRect(200, 10, 300, 20, 1, 100, 100)).toBeNull();
  });
});
