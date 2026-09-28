import { describe, it, expect } from 'vitest';
import { floodFill } from '../selection/FloodFill';
import { maskGeometry } from '../selection/maskGeometry';

/** 4×2 image: left 2 columns red, right 2 columns red+delta, one blue pixel at (3,1). */
function image(delta: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(4 * 2 * 4);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      px[i] = x < 2 ? 200 : 200 - delta; px[i + 3] = 255;
    }
  }
  px.set([0, 0, 255, 255], (1 * 4 + 3) * 4);
  return px;
}
const selected = (m: Uint8Array) => [...m].map(String).join('');

describe('floodFill', () => {
  it('uses per-channel tolerance: a delta at the tolerance joins, one past it does not', () => {
    expect(selected(floodFill(image(10), 4, 2, 0, 0, 10).mask)).toBe('1111' + '1110');
    expect(selected(floodFill(image(11), 4, 2, 0, 0, 10).mask)).toBe('1100' + '1100');
  });

  it('non-contiguous mode selects disconnected matches', () => {
    const px = image(100);
    px.set([200, 0, 0, 255], 3 * 4); // (3,0) matches the seed but is walled off
    expect(selected(floodFill(px, 4, 2, 0, 0, 0, true).mask)).toBe('1100' + '1100');
    expect(selected(floodFill(px, 4, 2, 0, 0, 0, false).mask)).toBe('1101' + '1100');
  });

  it('reports tight bounds', () => {
    expect(floodFill(image(100), 4, 2, 3, 0, 0).bounds).toEqual({ x: 2, y: 0, width: 2, height: 2 });
  });
});

describe('maskGeometry', () => {
  it('emits exact per-row runs and a closed outline for an L shape', () => {
    // 3×2 mask: row0 = ##. , row1 = #.. (offset 10,20)
    const on = [1, 1, 0, 1, 0, 0];
    const rgba = new Uint8ClampedArray(on.flatMap(v => [0, 0, 0, v ? 255 : 0]));
    const { runs, edges } = maskGeometry(rgba, 3, 2, 10, 20);
    expect(runs).toEqual([10, 20, 2, 10, 21, 1]);
    // Total outline length of the L = perimeter 8 pixel units.
    let len = 0;
    for (let i = 0; i < edges.length; i += 4) len += Math.abs(edges[i + 2] - edges[i]) + Math.abs(edges[i + 3] - edges[i + 1]);
    expect(len).toBe(8);
  });
});
