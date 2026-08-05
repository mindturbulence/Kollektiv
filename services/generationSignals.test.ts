import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Generation, GalleryItem } from '../types';

const loadGenerationsMock = vi.fn(async () => [] as Generation[]);
const saveGenerationMock = vi.fn(async (_g: Generation) => {});
vi.mock('../utils/generationStorage', () => ({
  loadGenerations: () => loadGenerationsMock(),
  saveGeneration: (g: Generation) => saveGenerationMock(g),
}));

const loadGalleryItemsMock = vi.fn(async () => [] as GalleryItem[]);
const loadPinnedItemIdsMock = vi.fn(async () => [] as string[]);
vi.mock('../utils/galleryStorage', () => ({
  loadGalleryItems: () => loadGalleryItemsMock(),
  loadPinnedItemIds: () => loadPinnedItemIdsMock(),
}));

import { scoreAllGenerations, scoreGeneration, getTopGenerations } from './generationSignals';

const item = (overrides: Partial<GalleryItem> = {}): GalleryItem => ({
  id: 'item1', createdAt: 1, type: 'image', urls: ['x'], sources: ['x'],
  title: 'Untitled Group (1 image)', prompt: '', tags: [], isNsfw: false,
  ...overrides,
} as GalleryItem);

const gen = (overrides: Partial<Generation> = {}): Generation => ({
  id: 'gen1', createdAt: 1, promptText: 'a fox', backendId: 'a1111',
  params: { prompt: 'a fox', width: 512, height: 512, steps: 20, cfgScale: 7 },
  resultItemIds: ['item1'], status: 'ok',
  ...overrides,
} as Generation);

beforeEach(() => {
  vi.clearAllMocks();
  loadGenerationsMock.mockResolvedValue([]);
  loadGalleryItemsMock.mockResolvedValue([]);
  loadPinnedItemIdsMock.mockResolvedValue([]);
});

describe('generationSignals scoring', () => {
  it('scores a pinned item higher via pinnedIds — not a nonexistent isPinned field', async () => {
    const g1 = gen({ id: 'unpinned' });
    const g2 = gen({ id: 'pinned', resultItemIds: ['item2'] });
    loadGenerationsMock.mockResolvedValue([g1, g2]);
    loadGalleryItemsMock.mockResolvedValue([item({ id: 'item1' }), item({ id: 'item2' })]);
    loadPinnedItemIdsMock.mockResolvedValue(['item2']);

    await scoreAllGenerations();

    const scoredUnpinned = saveGenerationMock.mock.calls.find((c) => c[0].id === 'unpinned')![0];
    const scoredPinned = saveGenerationMock.mock.calls.find((c) => c[0].id === 'pinned')![0];
    expect(scoredPinned.score).toBeGreaterThan(scoredUnpinned.score ?? 0);
  });

  it('awards the paramReuse weight when two generations share backendId + resolvedSeed', async () => {
    const original = gen({ id: 'g1', backendId: 'a1111', resolvedSeed: 42, resultItemIds: ['item1'] });
    const reused = gen({ id: 'g2', backendId: 'a1111', resolvedSeed: 42, resultItemIds: ['item2'] });
    const uniqueSeed = gen({ id: 'g3', backendId: 'a1111', resolvedSeed: 99, resultItemIds: ['item3'] });
    loadGenerationsMock.mockResolvedValue([original, reused, uniqueSeed]);
    loadGalleryItemsMock.mockResolvedValue([item({ id: 'item1' }), item({ id: 'item2' }), item({ id: 'item3' })]);

    await scoreAllGenerations();

    const scoredReused = saveGenerationMock.mock.calls.find((c) => c[0].id === 'g1')![0];
    const scoredUnique = saveGenerationMock.mock.calls.find((c) => c[0].id === 'g3')![0];
    expect(scoredReused.score).toBeGreaterThan(scoredUnique.score ?? 0);
  });

  it('scores a dangling resultItemId (deleted item) low', async () => {
    const g = gen({ resultItemIds: ['gone'] });
    loadGenerationsMock.mockResolvedValue([g]);
    loadGalleryItemsMock.mockResolvedValue([]); // item never existed / was deleted

    const score = await scoreGeneration('gen1');
    expect(score).toBeLessThan(0.2);
  });

  it('getTopGenerations sorts by score descending and excludes unscored', async () => {
    loadGenerationsMock.mockResolvedValue([
      { ...gen({ id: 'low' }), score: 0.2 },
      { ...gen({ id: 'high' }), score: 0.9 },
      { ...gen({ id: 'unscored' }), score: undefined },
    ]);

    const top = await getTopGenerations(10);
    expect(top.map((g) => g.id)).toEqual(['high', 'low']);
  });
});
