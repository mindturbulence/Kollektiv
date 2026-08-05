import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory manifest store for testing
let _manifestJson: string | null = null;

vi.mock('./fileUtils', () => ({
  fileSystemManager: {
    readFile: vi.fn().mockImplementation(() => Promise.resolve(_manifestJson)),
    fileExists: vi.fn().mockImplementation(() => Promise.resolve(_manifestJson !== null)),
    saveFile: vi.fn().mockImplementation((_path: string, blob: Blob) => {
      return blob.text().then((text) => { _manifestJson = text; });
    }),
  },
}));

import {
  loadGenerations,
  getGeneration,
  getGenerationsForItem,
  saveGeneration,
  deleteGeneration,
  createGeneration,
} from './generationStorage';

beforeEach(() => {
  _manifestJson = null;
  vi.clearAllMocks();
});

describe('generationStorage', () => {
  const mkGen = (overrides?: Partial<ReturnType<typeof createGeneration>>) =>
    createGeneration({
      promptText: 'test prompt',
      backendId: 'local:a1111',
      params: { prompt: 'test', width: 512, height: 512, steps: 20, cfgScale: 7 },
      ...overrides,
    });

  it('creates a generation with correct shape', () => {
    const gen = mkGen();
    expect(gen.id).toMatch(/^gen_/);
    expect(gen.createdAt).toBeGreaterThan(0);
    expect(gen.promptText).toBe('test prompt');
    expect(gen.backendId).toBe('local:a1111');
    expect(gen.status).toBe('ok');
    expect(gen.resultItemIds).toEqual([]);
  });

  it('saves and loads a generation', async () => {
    const gen = mkGen();
    await saveGeneration(gen);

    const loaded = await getGeneration(gen.id);
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(gen.id);
    expect(loaded!.promptText).toBe('test prompt');
  });

  it('loads all generations', async () => {
    await saveGeneration(mkGen({ promptText: 'first' }));
    await saveGeneration(mkGen({ promptText: 'second' }));

    const all = await loadGenerations();
    expect(all.length).toBe(2);
  });

  it('replaces existing generation with same id', async () => {
    const gen = mkGen();
    await saveGeneration(gen);
    await saveGeneration({ ...gen, promptText: 'updated' });

    const loaded = await getGeneration(gen.id);
    expect(loaded!.promptText).toBe('updated');

    const all = await loadGenerations();
    expect(all.length).toBe(1);
  });

  it('deletes a generation', async () => {
    const gen = mkGen();
    await saveGeneration(gen);
    const deleted = await deleteGeneration(gen.id);
    expect(deleted).toBe(true);

    const loaded = await getGeneration(gen.id);
    expect(loaded).toBeUndefined();
  });

  it('returns false when deleting non-existent generation', async () => {
    const deleted = await deleteGeneration('gen_nonexistent');
    expect(deleted).toBe(false);
  });

  it('finds generations for a gallery item', async () => {
    const gen = mkGen();
    gen.resultItemIds = ['item_1', 'item_2'];
    await saveGeneration(gen);

    const found = await getGenerationsForItem('item_1');
    expect(found.length).toBe(1);
    expect(found[0].id).toBe(gen.id);

    const notFound = await getGenerationsForItem('item_999');
    expect(notFound.length).toBe(0);
  });
});
