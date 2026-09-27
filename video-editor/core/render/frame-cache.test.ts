import { describe, expect, it, vi } from 'vitest';
import { FrameCache } from './frame-cache';

function fakeBitmap(width = 10, height = 10) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

describe('FrameCache', () => {
  it('stores and retrieves a frame by mediaId+frameIndex, tracking hit/miss stats', () => {
    const cache = new FrameCache();
    const bitmap = fakeBitmap();
    cache.set('media-a', 0, bitmap);

    expect(cache.has('media-a', 0)).toBe(true);
    expect(cache.get('media-a', 0)).toBe(bitmap);
    expect(cache.get('media-a', 1)).toBeNull();

    const stats = cache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('evicts the least-recently-used entry once maxEntries is exceeded, closing its bitmap', () => {
    const cache = new FrameCache({ maxEntries: 2, maxSizeBytes: 1024 * 1024 });
    const a = fakeBitmap();
    const b = fakeBitmap();
    const c = fakeBitmap();
    cache.set('m', 0, a);
    cache.set('m', 1, b);
    cache.get('m', 0); // touch 0 so 1 becomes the oldest
    cache.set('m', 2, c);

    expect(a.close).not.toHaveBeenCalled();
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(c.close).not.toHaveBeenCalled();
    expect(cache.has('m', 1)).toBe(false);
    expect(cache.getStats().entries).toBe(2);
  });

  it('evicts by byte cap even under the entry cap', () => {
    const cache = new FrameCache({ maxEntries: 100, maxSizeBytes: 10 * 10 * 4 + 1 });
    const first = fakeBitmap(10, 10); // exactly at the cap alone
    const second = fakeBitmap(10, 10);
    cache.set('m', 0, first);
    cache.set('m', 1, second);

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(cache.has('m', 0)).toBe(false);
    expect(cache.has('m', 1)).toBe(true);
  });

  it('refuses and closes a frame larger than the whole cache budget', () => {
    const cache = new FrameCache({ maxSizeBytes: 100 });
    const tooBig = fakeBitmap(100, 100);
    cache.set('m', 0, tooBig);

    expect(tooBig.close).toHaveBeenCalledTimes(1);
    expect(cache.has('m', 0)).toBe(false);
  });

  it('clearMedia closes only the entries for that mediaId', () => {
    const cache = new FrameCache();
    const a = fakeBitmap();
    const b = fakeBitmap();
    cache.set('media-a', 0, a);
    cache.set('media-b', 0, b);
    cache.clearMedia('media-a');

    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).not.toHaveBeenCalled();
    expect(cache.has('media-a', 0)).toBe(false);
    expect(cache.has('media-b', 0)).toBe(true);
  });

  it('clear closes every cached bitmap and resets stats', () => {
    const cache = new FrameCache();
    const a = fakeBitmap();
    cache.set('m', 0, a);
    cache.get('m', 0);
    cache.clear();

    expect(a.close).toHaveBeenCalledTimes(1);
    expect(cache.getStats()).toEqual({ entries: 0, sizeBytes: 0, hitRate: 0, maxSizeBytes: cache.getStats().maxSizeBytes, hits: 0, misses: 0 });
  });

  it('replacing a key closes the stale bitmap first', () => {
    const cache = new FrameCache();
    const a = fakeBitmap();
    const b = fakeBitmap();
    cache.set('m', 0, a);
    cache.set('m', 0, b);

    expect(a.close).toHaveBeenCalledTimes(1);
    expect(cache.get('m', 0)).toBe(b);
  });
});
