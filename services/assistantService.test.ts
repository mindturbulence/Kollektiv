import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KnowledgeSearchResult } from './knowledgeService';

vi.mock('./knowledgeService', () => ({
  knowledgeService: {
    search: vi.fn(),
  },
}));
vi.mock('./memoryTierService', () => ({
  memoryTierService: {
    trackAccess: vi.fn(async (ref: any) => ref),
    searchAll: vi.fn(async () => []),
  },
}));

import { knowledgeService } from './knowledgeService';
import { memoryTierService } from './memoryTierService';
import { buildKnowledgeContextBlock } from './assistantService';

const makeResult = (id: string): KnowledgeSearchResult => ({
  ref: { kind: 'memory', id, title: `Item ${id}`, tier: 'long-term', tags: [] } as any,
  snippet: `snippet for ${id}`,
  score: 0.9,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Task 1: parallel access tracking ─────────────────────────────────

describe('buildKnowledgeContextBlock — access tracking is parallel, not sequential', () => {
  it('calls trackAccess for every result without waiting for the previous call to resolve first', async () => {
    const results = [makeResult('a'), makeResult('b'), makeResult('c')];
    vi.mocked(knowledgeService.search).mockResolvedValue(results);

    const order: string[] = [];
    vi.mocked(memoryTierService.trackAccess).mockImplementation(async (ref) => {
      order.push(`start:${ref.id}`);
      // Resolve 'a' last on purpose — if the loop were sequential
      // (await-in-a-for-loop), 'a' starting would block 'b' and 'c'
      // from starting at all until 'a' finished.
      await new Promise((r) => setTimeout(r, ref.id === 'a' ? 20 : 0));
      order.push(`end:${ref.id}`);
      return ref;
    });

    await buildKnowledgeContextBlock('some query');

    // All three must have STARTED before any of them ENDED — proof
    // they ran concurrently, not one-at-a-time.
    const firstEndIndex = order.findIndex((e) => e.startsWith('end:'));
    const startsBeforeFirstEnd = order.slice(0, firstEndIndex).filter((e) => e.startsWith('start:'));
    expect(startsBeforeFirstEnd).toHaveLength(3);
  });

  it('still includes all results in the output even if one trackAccess call rejects', async () => {
    const results = [makeResult('a'), makeResult('b')];
    vi.mocked(knowledgeService.search).mockResolvedValue(results);
    vi.mocked(memoryTierService.trackAccess).mockImplementation(async (ref) => {
      if (ref.id === 'a') throw new Error('boom');
      return ref;
    });

    const out = await buildKnowledgeContextBlock('some query');
    expect(out).toContain('Item a');
    expect(out).toContain('Item b');
  });
});

// ─── Task 2: concurrent search sections ──────────────────────────────

describe('buildKnowledgeContextBlock — the two search sections run concurrently', () => {
  it('starts the working-memory search before the vault-knowledge search resolves', async () => {
    const order: string[] = [];
    vi.mocked(knowledgeService.search).mockImplementation(async () => {
      order.push('vault:start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('vault:end');
      return [];
    });
    vi.mocked(memoryTierService.searchAll).mockImplementation(async () => {
      order.push('working:start');
      return [];
    });

    await buildKnowledgeContextBlock('some query');

    // If the two sections ran sequentially, 'working:start' could only
    // appear after 'vault:end' (since the vault section is awaited to
    // completion first). Concurrent execution means it appears before.
    expect(order.indexOf('working:start')).toBeLessThan(order.indexOf('vault:end'));
  });
});
