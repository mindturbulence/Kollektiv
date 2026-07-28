import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  cosineSimilarity,
  putVector,
  getAllVectors,
  deleteVector,
  getIndexStats,
  clearVectors,
  backfillVectors,
  _setGetDb,
} from './semanticIndex';

// ── In-memory mock DB ─────────────────────────────────────────────────

/**
 * Create a minimal in-memory mock of the IndexedDB keyval store.
 * Only the operations used by semanticIndex are implemented.
 */
function createMockDb() {
  const store = new Map<string, any>();
  return {
    get: async (_store: string, key: string) => store.get(key),
    put: async (_store: string, val: any, key: string) => { store.set(key, val); },
    delete: async (_store: string, key: string) => { store.delete(key); },
  } as any;
}

let mockDb: ReturnType<typeof createMockDb>;

beforeEach(() => {
  mockDb = createMockDb();
  _setGetDb(() => Promise.resolve(mockDb));
});

afterEach(() => {
  _setGetDb(null);
  vi.restoreAllMocks();
});

// Mock embedding service for backfill tests
vi.mock('../services/embeddingService', () => ({
  embedText: vi.fn(async (t: string) =>
    t.includes('fail') ? null : [0.1, 0.2, 0.3],
  ),
}));

// ── Cosine similarity ─────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposed vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for a zero vector rather than NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('returns 0 for mismatched lengths rather than throwing', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
  });
});

// ── Vector store ───────────────────────────────────────────────────────

describe('vector store', () => {
  beforeEach(async () => {
    await clearVectors();
  });

  it('round-trips a vector', async () => {
    await putVector('a.md', [0.1, 0.2], 'h1');
    const all = await getAllVectors();
    expect(all).toHaveLength(1);
    expect(all[0].path).toBe('a.md');
    expect(all[0].contentHash).toBe('h1');
  });

  it('overwrites on the same path', async () => {
    await putVector('a.md', [0.1], 'h1');
    await putVector('a.md', [0.9], 'h2');
    const all = await getAllVectors();
    expect(all).toHaveLength(1);
    expect(all[0].contentHash).toBe('h2');
  });

  it('deletes a vector', async () => {
    await putVector('a.md', [0.1], 'h1');
    await deleteVector('a.md');
    expect(await getAllVectors()).toHaveLength(0);
  });

  it('reports count and approximate size', async () => {
    await putVector('a.md', [0.1, 0.2, 0.3], 'h1');
    const stats = await getIndexStats();
    expect(stats.count).toBe(1);
    expect(stats.approxBytes).toBeGreaterThan(0);
  });
});

// ── Backfill ───────────────────────────────────────────────────────────

const notes = [
  { path: 'a.md', title: 'A', content: 'alpha' },
  { path: 'b.md', title: 'B', content: 'beta' },
];

describe('backfillVectors', () => {
  beforeEach(async () => {
    await clearVectors();
  });

  it('embeds every note on a cold index', async () => {
    const r = await backfillVectors(notes, {} as any);
    expect(r.embedded).toBe(2);
    expect(r.skipped).toBe(0);
  });

  it('skips notes whose content has not changed', async () => {
    await backfillVectors(notes, {} as any);
    const second = await backfillVectors(notes, {} as any);
    expect(second.skipped).toBe(2);
    expect(second.embedded).toBe(0);
  });

  it('re-embeds a note whose content changed', async () => {
    await backfillVectors(notes, {} as any);
    const changed = [{ ...notes[0], content: 'alpha revised' }, notes[1]];
    const r = await backfillVectors(changed, {} as any);
    expect(r.embedded).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('counts a failed embedding without aborting', async () => {
    const r = await backfillVectors(
      [...notes, { path: 'c.md', title: 'C', content: 'fail me' }],
      {} as any,
    );
    expect(r.failed).toBe(1);
    expect(r.embedded).toBe(2);
  });

  it('stops early when shouldStop returns true and writes no duplicates', async () => {
    let calls = 0;
    await backfillVectors(notes, {} as any, undefined, () => ++calls > 1);
    const all = await getAllVectors();
    expect(all.length).toBeLessThan(2);
  });

  it('reports progress', async () => {
    const onProgress = vi.fn();
    await backfillVectors(notes, {} as any, onProgress);
    expect(onProgress).toHaveBeenCalled();
    const lastCall = onProgress.mock.calls.at(-1);
    expect(lastCall?.[1]).toBe(2);
  });
});
