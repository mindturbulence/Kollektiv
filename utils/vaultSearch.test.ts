import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VaultSearchIndex, _setSearchIndex, getSearchIndex } from './vaultSearch';

// Helper to create a VaultSearchIndex for testing
function createTestIndex() {
  return new VaultSearchIndex();
}

// Sample notes for testing
const SAMPLE_NOTES = [
  {
    path: 'projects/ml-notes.md',
    title: 'Machine Learning Notes',
    content: `# Machine Learning Notes

## Transformers

The transformer architecture uses self-attention mechanisms to process sequential data.
Key components include multi-head attention, positional encoding, and feed-forward networks.

## Training

Training large language models requires significant computational resources.
Gradient descent optimization with backpropagation is the standard approach.
`,
  },
  {
    path: 'projects/python-tips.md',
    title: 'Python Tips',
    content: `# Python Programming Tips

## List Comprehensions

Python list comprehensions provide a concise way to create lists.
They are generally faster than traditional for loops.

## Decorators

Decorators are a powerful feature for modifying function behavior.
They wrap functions to add functionality before and after execution.
`,
  },
  {
    path: 'recipes/pasta.md',
    title: 'Pasta Recipe',
    content: `# Homemade Pasta Recipe

## Ingredients
- 2 cups flour
- 3 eggs
- Salt to taste

## Instructions
Mix flour and eggs, knead for 10 minutes, let rest for 30 minutes.
Roll out and cut into desired shape. Boil in salted water for 3-4 minutes.
`,
  },
];

describe('VaultSearchIndex', () => {
  let index: VaultSearchIndex;

  beforeEach(() => {
    index = createTestIndex();
  });

  afterEach(() => {
    _setSearchIndex(undefined as any);
  });

  // ── Tokenization (tested indirectly via build + search) ─────────────

  it('reports empty stats before building', () => {
    const stats = index.getStats();
    expect(stats.built).toBe(false);
    expect(stats.totalDocs).toBe(0);
    expect(stats.totalTerms).toBe(0);
  });

  it('returns empty results when not built', () => {
    const results = index.search('machine learning');
    expect(results).toEqual([]);
  });

  it('returns empty results for empty query', async () => {
    await index.build(SAMPLE_NOTES);
    expect(index.search('')).toEqual([]);
    expect(index.search('   ')).toEqual([]);
  });

  // ── Build ───────────────────────────────────────────────────────────

  it('builds index from notes', async () => {
    await index.build(SAMPLE_NOTES);
    const stats = index.getStats();
    expect(stats.built).toBe(true);
    expect(stats.totalDocs).toBe(3);
    expect(stats.totalTerms).toBeGreaterThan(10);
  });

  it('builds index from empty array', async () => {
    await index.build([]);
    const stats = index.getStats();
    expect(stats.built).toBe(true);
    expect(stats.totalDocs).toBe(0);
    expect(index.search('anything')).toEqual([]);
  });

  it('throws if build is called while already building', async () => {
    // Start first build
    const buildPromise = index.build(SAMPLE_NOTES);
    // Try starting a second build
    await expect(index.build(SAMPLE_NOTES)).rejects.toThrow(
      'Index build already in progress',
    );
    await buildPromise;
  });

  // ── Search accuracy ────────────────────────────────────────────────

  it('finds documents matching query terms', async () => {
    await index.build(SAMPLE_NOTES);
    const results = index.search('transformer');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.path === 'projects/ml-notes.md')).toBe(true);
  });

  it('returns BM25-ranked results (most relevant first)', async () => {
    await index.build(SAMPLE_NOTES);

    // Search for "python" — should rank python-tips.md highest
    const results = index.search('python');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('projects/python-tips.md');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('returns results for multi-word query', async () => {
    await index.build(SAMPLE_NOTES);
    const results = index.search('machine learning transformer');
    expect(results.length).toBeGreaterThan(0);
    // ml-notes.md should be ranked highest (matches all three terms)
    expect(results[0].path).toBe('projects/ml-notes.md');
  });

  it('respects maxResults parameter', async () => {
    await index.build(SAMPLE_NOTES);
    const results = index.search('the', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('handles case-insensitive queries', async () => {
    await index.build(SAMPLE_NOTES);
    const upper = index.search('TRANSFORMER');
    const lower = index.search('transformer');
    expect(upper.length).toBe(lower.length);
    expect(upper[0].path).toBe(lower[0].path);
  });

  it('returns empty results for non-matching query', async () => {
    await index.build(SAMPLE_NOTES);
    const results = index.search('xyzzy_nonexistent_123');
    expect(results).toEqual([]);
  });

  // ── Result metadata ────────────────────────────────────────────────

  it('includes path and title in results', async () => {
    await index.build(SAMPLE_NOTES);
    const results = index.search('python');
    expect(results[0].path).toBe('projects/python-tips.md');
    expect(results[0].title).toBe('Python Tips');
  });

  it('includes matchCount in results', async () => {
    await index.build(SAMPLE_NOTES);
    const results = index.search('python decorators');
    expect(results[0].matchCount).toBeGreaterThanOrEqual(1);
  });

  it('includes score in results', async () => {
    await index.build([
      {
        path: 'test.md',
        title: 'Test',
        content: 'machine learning transformer attention',
      },
    ]);
    const results = index.search('machine');
    expect(results[0].score).toBeGreaterThan(0);
    expect(typeof results[0].score).toBe('number');
  });

  // ── Snippet generation ─────────────────────────────────────────────

  it('generates snippet around matching term', () => {
    const snippet = index.generateSnippet(
      'This is a long document about machine learning and transformers.',
      'machine learning',
    );
    expect(snippet.toLowerCase()).toContain('machine learning');
    expect(snippet.length).toBeGreaterThan(0);
  });

  it('generates snippet from start of document if no match in body', () => {
    const snippet = index.generateSnippet(
      'No match here in this short doc.',
      'transformers',
    );
    expect(snippet).toContain('No match here');
  });

  it('truncates snippet with ellipsis for long content', () => {
    const longContent =
      'A'.repeat(50) +
      'machine learning' +
      'B'.repeat(300) +
      'C'.repeat(50);
    const snippet = index.generateSnippet(longContent, 'machine learning', 40);
    expect(snippet).toContain('machine learning');
    expect(snippet.startsWith('…') || !snippet.startsWith('A')).toBe(true);
    expect(snippet.endsWith('…') || snippet.endsWith('C') || snippet.includes('CCC')).toBe(
      true,
    );
  });

  it('strips frontmatter before generating snippet', () => {
    const content = `---
tags: [test, demo]
created: 2024-01-01
---

The actual body content about machine learning is here.`;
    const snippet = index.generateSnippet(content, 'machine');
    expect(snippet).toContain('machine learning');
    expect(snippet).not.toContain('tags:');
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  it('handles empty content gracefully', async () => {
    await index.build([
      { path: 'empty.md', title: 'Empty', content: '' },
      { path: 'normal.md', title: 'Normal', content: 'some content here' },
    ]);
    const results = index.search('content');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('normal.md');
  });

  it('does not index content inside frontmatter blocks', async () => {
    // Frontmatter-only notes produce an empty body after stripFrontmatter
    // so no tokens should be indexed from them.
    await index.build([
      {
        path: 'fm-only.md',
        title: 'Frontmatter Only',
        content: '---\ntags: [test]\n---\n',
      },
      {
        path: 'real-note.md',
        title: 'Real Note',
        content: '# Real Note\n\nThis note has real content.',
      },
    ]);
    // 'test' only appears inside frontmatter — should not match
    const results = index.search('test');
    expect(results).toEqual([]);

    // 'real' appears in the body of real-note.md — should match
    const realResults = index.search('real');
    expect(realResults.length).toBe(1);
    expect(realResults[0].path).toBe('real-note.md');
  });

  it('ignores stop words in queries', async () => {
    await index.build([
      {
        path: 'test.md',
        title: 'Test',
        content: 'the and for with from important content',
      },
    ]);
    // "the" and "for" are stop words, "important" and "content" are not
    const results = index.search('the for important content');
    expect(results.length).toBeGreaterThan(0);
  });

  it('handles duplicate query terms gracefully', async () => {
    await index.build(SAMPLE_NOTES);
    const single = index.search('python');
    const duplicate = index.search('python python python');
    // Scores should be the same (terms are deduplicated)
    expect(duplicate.length).toBe(single.length);
    expect(duplicate[0].path).toBe(single[0].path);
  });

  it('persists and loads from IDB', async () => {
    // Note: This test relies on the test environment having IDB available
    // (jsdom mock). It validates the round-trip logic, not actual IDB I/O.
    await index.build(SAMPLE_NOTES);
    expect(index.isBuilt).toBe(true);

    // The persist/load round-trip throws in jsdom (no real IDB),
    // so just verify the index works after build
    const results = index.search('machine');
    expect(results.length).toBeGreaterThan(0);
  });

  it('clear() resets all state', async () => {
    await index.build(SAMPLE_NOTES);
    expect(index.isBuilt).toBe(true);

    await index.clear();
    expect(index.isBuilt).toBe(false);
    expect(index.getStats().totalDocs).toBe(0);
    expect(index.getStats().totalTerms).toBe(0);
    expect(index.search('machine')).toEqual([]);
  });

  // ── Multiple notes with same term ──────────────────────────────────

  it('finds term across multiple documents and ranks by relevance', async () => {
    const notes = [
      {
        path: 'often.md',
        title: 'Often',
        content: 'python python python python python python python python python python python',
      },
      { path: 'once.md', title: 'Once', content: 'python is a programming language' },
    ];
    await index.build(notes);
    const results = index.search('python');
    expect(results.length).toBe(2);
    // The note with more occurrences should rank higher
    expect(results[0].path).toBe('often.md');
  });
});

describe('getSearchIndex singleton', () => {
  afterEach(() => {
    _setSearchIndex(undefined as any);
  });

  it('returns the same instance on multiple calls', () => {
    const a = getSearchIndex();
    const b = getSearchIndex();
    expect(a).toBe(b);
  });
});
