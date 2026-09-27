// Ported from openreel@5f3c85e packages/core/src/video/frame-cache.ts — MIT,
// (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv: keyed
// by mediaId+frameIndex (project frame numbers) instead of source time, and
// the preload queue (playback's concern) is dropped — only the LRU itself.

export interface FrameCacheConfig {
  maxEntries: number;
  maxSizeBytes: number;
}

export interface FrameCacheStats {
  entries: number;
  sizeBytes: number;
  hitRate: number;
  maxSizeBytes: number;
  hits: number;
  misses: number;
}

const DEFAULT_CONFIG: FrameCacheConfig = {
  maxEntries: 100,
  maxSizeBytes: 500 * 1024 * 1024, // 500MB
};

interface CachedFrame {
  bitmap: ImageBitmap;
  mediaId: string;
  frameIndex: number;
  sizeBytes: number;
  lastAccessed: number;
}

/** LRU cache of decoded frames, closed on eviction to release GPU/CPU memory. */
export class FrameCache {
  private readonly cache = new Map<string, CachedFrame>();
  private config: FrameCacheConfig;
  private stats = { hits: 0, misses: 0 };
  private totalSizeBytes = 0;
  // Logical clock, not Date.now(): playback can get()/set() several frames
  // within the same millisecond, and wall-clock ties broke LRU ordering.
  private clock = 0;

  constructor(config: Partial<FrameCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private static key(mediaId: string, frameIndex: number): string {
    return `${mediaId}:${frameIndex}`;
  }

  get(mediaId: string, frameIndex: number): ImageBitmap | null {
    const entry = this.cache.get(FrameCache.key(mediaId, frameIndex));
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    entry.lastAccessed = ++this.clock;
    this.stats.hits++;
    return entry.bitmap;
  }

  has(mediaId: string, frameIndex: number): boolean {
    return this.cache.has(FrameCache.key(mediaId, frameIndex));
  }

  set(mediaId: string, frameIndex: number, bitmap: ImageBitmap): void {
    const sizeBytes = bitmap.width * bitmap.height * 4; // RGBA
    if (sizeBytes > this.config.maxSizeBytes) {
      bitmap.close();
      return;
    }
    this.delete(mediaId, frameIndex); // replace: close any stale entry first
    this.evictUntilFits(sizeBytes);
    this.cache.set(FrameCache.key(mediaId, frameIndex), {
      bitmap,
      mediaId,
      frameIndex,
      sizeBytes,
      lastAccessed: ++this.clock,
    });
    this.totalSizeBytes += sizeBytes;
  }

  delete(mediaId: string, frameIndex: number): boolean {
    const key = FrameCache.key(mediaId, frameIndex);
    const entry = this.cache.get(key);
    if (!entry) return false;
    entry.bitmap.close();
    this.totalSizeBytes -= entry.sizeBytes;
    return this.cache.delete(key);
  }

  clearMedia(mediaId: string): void {
    const frameIndices: number[] = [];
    for (const entry of this.cache.values()) {
      if (entry.mediaId === mediaId) frameIndices.push(entry.frameIndex);
    }
    for (const frameIndex of frameIndices) this.delete(mediaId, frameIndex);
  }

  clear(): void {
    for (const entry of this.cache.values()) entry.bitmap.close();
    this.cache.clear();
    this.totalSizeBytes = 0;
    this.stats = { hits: 0, misses: 0 };
  }

  getStats(): FrameCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      entries: this.cache.size,
      sizeBytes: this.totalSizeBytes,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      maxSizeBytes: this.config.maxSizeBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
    };
  }

  private evictUntilFits(incomingBytes: number): void {
    while (this.cache.size >= this.config.maxEntries) this.evictOldest();
    while (this.totalSizeBytes + incomingBytes > this.config.maxSizeBytes && this.cache.size > 0) {
      this.evictOldest();
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey === null) return;
    const entry = this.cache.get(oldestKey);
    if (!entry) return;
    entry.bitmap.close();
    this.totalSizeBytes -= entry.sizeBytes;
    this.cache.delete(oldestKey);
  }
}
