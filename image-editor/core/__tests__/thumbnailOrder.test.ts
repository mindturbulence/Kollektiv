import { describe, expect, it } from 'vitest';
import { nextThumbIndex } from '../looks/thumbnails';

describe('nextThumbIndex', () => {
  it('renders visible thumbnails first, then the rest in order', () => {
    const done = new Set<number>();
    const visible = new Set([5, 6]);
    const order: number[] = [];
    for (let i = nextThumbIndex(8, done, v => visible.has(v)); i >= 0; i = nextThumbIndex(8, done, v => visible.has(v))) {
      done.add(i);
      order.push(i);
    }
    expect(order).toEqual([5, 6, 0, 1, 2, 3, 4, 7]);
  });

  it('falls back to list order without visibility info', () => {
    expect(nextThumbIndex(3, new Set([0]))).toBe(1);
    expect(nextThumbIndex(2, new Set([0, 1]))).toBe(-1);
  });
});
