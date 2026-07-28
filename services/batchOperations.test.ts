import { describe, it, expect, vi } from 'vitest';

vi.mock('./llmService', () => ({
  refineSinglePrompt: vi.fn(async () => 'refined text'),
  abstractImage: vi.fn(async () => ({ prompt: 'described' })),
}));
vi.mock('./autoTagService', () => ({
  suggestTagsForItem: vi.fn(async () => ['sunset']),
}));

import { BATCH_OPERATIONS, getOperation } from './batchOperations';

describe('BATCH_OPERATIONS', () => {
  it('exposes operations with unique ids', () => {
    const ids = BATCH_OPERATIONS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares an input kind for every operation', () => {
    for (const op of BATCH_OPERATIONS) {
      expect(['prompt', 'gallery_item']).toContain(op.inputKind);
    }
  });

  it('looks up an operation by id', () => {
    expect(getOperation('refine_prompt')?.label).toBeTruthy();
  });

  it('returns undefined for an unknown id', () => {
    expect(getOperation('nope')).toBeUndefined();
  });

  it('runs the tag operation against a gallery item', async () => {
    const op = getOperation('suggest_tags')!;
    await expect(op.run({ id: 'g1', type: 'image', urls: ['x'] }, { autoTagEnabled: true } as any)).resolves.toEqual(['sunset']);
  });

  it('propagates an operation failure rather than swallowing it', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    (suggestTagsForItem as any).mockRejectedValueOnce(new Error('vision unavailable'));
    const op = getOperation('suggest_tags')!;
    await expect(op.run({ id: 'g1' }, { autoTagEnabled: true } as any)).rejects.toThrow(/vision unavailable/);
  });
});
