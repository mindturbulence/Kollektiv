import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KnowledgeRef } from './knowledgeService';

vi.mock('./knowledgeService', () => ({
  knowledgeService: {
    touchAccess: vi.fn((ref: KnowledgeRef): KnowledgeRef => {
      const updated = { ...ref, accessCount: ref.accessCount + 1, lastAccessedAt: Date.now() };
      return updated;
    }),
    promote: vi.fn(),
    list: vi.fn(),
    capture: vi.fn(),
    search: vi.fn(),
    recall: vi.fn(),
  },
}));

import { knowledgeService } from './knowledgeService';
import { memoryTierService } from './memoryTierService';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default config
  memoryTierService.configure({
    working: { minAccessCount: 3, autoPromote: true },
    longTerm: { minAccessCount: 10, autoPromote: true },
  });
});

describe('memoryTierService.trackAccess', () => {
  it('promotes from working to long-term when ref crosses minAccessCount', async () => {
    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_1',
      title: 'Test Memory',
      tier: 'working',
      accessCount: 3,
      lastAccessedAt: 1000,
      tags: ['test'],
    };

    vi.mocked(knowledgeService.promote).mockResolvedValue({ ...ref, tier: 'long-term', accessCount: 4 });

    await memoryTierService.trackAccess(ref);

    expect(knowledgeService.promote).toHaveBeenCalledTimes(1);
    expect(knowledgeService.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        ref,
        targetTier: 'long-term',
      }),
    );
    // Should not also touch — trackAccess is a pure check
    expect(knowledgeService.touchAccess).not.toHaveBeenCalled();
  });

  it('promotes from long-term to knowledge when ref crosses minAccessCount', async () => {
    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_2',
      title: 'Test Long-Term',
      tier: 'long-term',
      accessCount: 10,
      lastAccessedAt: 1000,
      tags: ['test'],
    };

    vi.mocked(knowledgeService.promote).mockResolvedValue({ ...ref, tier: 'knowledge', accessCount: 11 });

    await memoryTierService.trackAccess(ref);

    expect(knowledgeService.promote).toHaveBeenCalledTimes(1);
    expect(knowledgeService.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        ref,
        targetTier: 'knowledge',
      }),
    );
  });

  it('does not promote a ref that has not crossed minAccessCount', async () => {
    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_3',
      title: 'New Memory',
      tier: 'working',
      accessCount: 1,
      lastAccessedAt: 1000,
      tags: [],
    };

    await memoryTierService.trackAccess(ref);

    expect(knowledgeService.promote).not.toHaveBeenCalled();
  });

  it('does not re-promote an already promoted ref', async () => {
    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_4',
      title: 'Already Long-Term',
      tier: 'long-term',
      accessCount: 10,
      lastAccessedAt: 1000,
      tags: ['test'],
    };

    vi.mocked(knowledgeService.promote).mockResolvedValue({ ...ref, tier: 'knowledge', accessCount: 11 });

    // First call promotes
    await memoryTierService.trackAccess(ref);
    expect(knowledgeService.promote).toHaveBeenCalledTimes(1);

    // Second call with the promoted ref should not re-promote
    const promotedRef: KnowledgeRef = { ...ref, tier: 'knowledge', accessCount: 11 };
    await memoryTierService.trackAccess(promotedRef);
    // promote should have been called only once total
    expect(knowledgeService.promote).toHaveBeenCalledTimes(1);
  });

  it('does not increment access count (pure policy check)', async () => {
    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_5',
      title: 'Check No Increment',
      tier: 'working',
      accessCount: 1,
      lastAccessedAt: 1000,
      tags: [],
    };

    const originalCount = ref.accessCount;
    await memoryTierService.trackAccess(ref);

    // trackAccess should not call touchAccess (no increment)
    expect(knowledgeService.touchAccess).not.toHaveBeenCalled();
    // The original ref object should not be mutated
    expect(ref.accessCount).toBe(originalCount);
  });

  it('respects custom minAccessCount thresholds', async () => {
    memoryTierService.configure({
      working: { minAccessCount: 5, autoPromote: true },
      longTerm: { minAccessCount: 20, autoPromote: true },
    });

    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_6',
      title: 'Custom Threshold',
      tier: 'working',
      accessCount: 3,
      lastAccessedAt: 1000,
      tags: [],
    };

    // With minAccessCount=5, a count of 3 should not promote
    await memoryTierService.trackAccess(ref);
    expect(knowledgeService.promote).not.toHaveBeenCalled();
  });

  it('does not promote when autoPromote is disabled', async () => {
    memoryTierService.configure({
      working: { minAccessCount: 3, autoPromote: false },
    });

    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_7',
      title: 'Auto-Promote Disabled',
      tier: 'working',
      accessCount: 10,
      lastAccessedAt: 1000,
      tags: [],
    };

    await memoryTierService.trackAccess(ref);
    expect(knowledgeService.promote).not.toHaveBeenCalled();
  });

  it('only counts access once when trackAccess + recall both fire (regression guard)', async () => {
    // Simulate the wire pattern: trackAccess then recall
    const ref: KnowledgeRef = {
      kind: 'memory',
      id: 'test_8',
      title: 'Double-Count Guard',
      tier: 'working',
      accessCount: 2,
      lastAccessedAt: 1000,
      tags: [],
    };

    // trackAccess is a pure check — no increment
    await memoryTierService.trackAccess(ref);
    expect(knowledgeService.touchAccess).not.toHaveBeenCalled();

    // recall() calls touchAccess internally — that's the only increment
    const { knowledgeService: ks } = await import('./knowledgeService');
    const recalled = (ks as any).touchAccess(ref);
    expect(recalled.accessCount).toBe(3);
    // touchAccess was called exactly once (by recall, not by trackAccess)
    expect(ks.touchAccess).toHaveBeenCalledTimes(1);
  });
});
