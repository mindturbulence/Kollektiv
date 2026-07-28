import { describe, it, expect } from 'vitest';
import { hybridRank, cosineSimilarity } from './semanticIndex';

// ── Tests for hybridRank (pure function, no IO) ────────────────────────

describe('hybridRank', () => {
  const queryVec = [0.9, 0.8, 0.7];

  it('returns results unchanged when no vectors exist', () => {
    const results = hybridRank(
      [{ path: 'a.md', score: 10 }, { path: 'b.md', score: 5 }],
      queryVec,
      [],
    );
    expect(results).toHaveLength(2);
    expect(results[0].path).toBe('a.md');
    expect(results[1].path).toBe('b.md');
  });

  it('returns results unchanged when queryVec is empty', () => {
    const results = hybridRank(
      [{ path: 'a.md', score: 10 }],
      [],
      [{ path: 'a.md', vector: [0.1, 0.2, 0.3] }],
    );
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('a.md');
  });

  it('uses semantic similarity to break BM25 ties', () => {
    // Both have the same BM25 score — semantic similarity decides the winner
    const results = hybridRank(
      [
        { path: 'a.md', score: 10 },
        { path: 'b.md', score: 10 },
      ],
      queryVec,
      [
        { path: 'a.md', vector: [0.99, 0.88, 0.77] }, // close to query
        { path: 'b.md', vector: [0.1, -0.5, 0.3] },    // far from query (opposite direction)
      ],
    );
    // a.md has higher semantic similarity → should rank first
    expect(results[0].path).toBe('a.md');
    expect(results[0].hybridScore).toBeGreaterThan(results[1].hybridScore);
  });

  it('discovers a semantic neighbour not in the BM25 results', () => {
    const results = hybridRank(
      [{ path: 'a.md', score: 10 }],
      queryVec,
      [
        { path: 'a.md', vector: [0.1, 0.1, 0.1] },
        { path: 'b.md', vector: [0.95, 0.85, 0.75] }, // high semantic match
      ],
    );
    expect(results.some((r) => r.path === 'b.md')).toBe(true);
  });

  it('preserves exact-term BM25 winners above semantic-only results', () => {
    const results = hybridRank(
      [
        { path: 'exact.md', score: 50 },
        { path: 'low.md', score: 1 },
      ],
      queryVec,
      [
        { path: 'exact.md', vector: [0.1, 0.1, 0.1] },
        { path: 'low.md', vector: [0.95, 0.85, 0.75] },
        { path: 'semantic.md', vector: [0.9, 0.8, 0.7] },
      ],
    );
    // exact.md (BM25 winner) should rank above semantic-only semantic.md
    const exactIdx = results.findIndex((r) => r.path === 'exact.md');
    const semanticIdx = results.findIndex((r) => r.path === 'semantic.md');
    expect(exactIdx).toBeLessThan(semanticIdx);
  });

  it('returns empty for empty input', () => {
    const results = hybridRank([], queryVec, []);
    expect(results).toEqual([]);
  });
});

// ── Tests for cosineSimilarity (pure function) ─────────────────────────

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

  it('returns 0 for zero vector rather than NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
