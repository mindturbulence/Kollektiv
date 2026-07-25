import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graphTools } from './graphTools';

const mockLoadMemories = vi.fn();
const mockLoadGalleryItems = vi.fn();
const mockLoadSavedPrompts = vi.fn();

vi.mock('../../utils/memoryStorage', () => ({
  loadMemories: () => mockLoadMemories(),
}));
vi.mock('../../utils/galleryStorage', () => ({
  loadGalleryItems: () => mockLoadGalleryItems(),
}));
vi.mock('../../utils/promptStorage', () => ({
  loadSavedPrompts: () => mockLoadSavedPrompts(),
}));

const tool = graphTools.find((t) => t.name === 'find_related_knowledge')!;

describe('find_related_knowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMemories.mockResolvedValue([]);
    mockLoadGalleryItems.mockResolvedValue([]);
    mockLoadSavedPrompts.mockResolvedValue([]);
  });

  it('is registered with the right parameter contract', () => {
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toEqual(['kind', 'id']);
  });

  it('rejects an unsupported kind', async () => {
    const result = await tool.execute({ kind: 'note', id: 'x' }, {} as any);
    expect(result).toContain('Error: kind must be one of');
  });

  it('errors when the item does not exist in any store', async () => {
    const result = await tool.execute({ kind: 'memory', id: 'missing' }, {} as any);
    expect(result).toContain('Error: no memory item with id "missing"');
  });

  it('reports no related items when nothing shares tags', async () => {
    mockLoadMemories.mockResolvedValue([
      { id: 'm1', fact: 'likes cats', category: 'general', tags: ['pets'], createdAt: 0 },
    ]);
    const result = await tool.execute({ kind: 'memory', id: 'm1' }, {} as any);
    expect(result).toBe('No related items found (no shared tags).');
  });

  it('finds related items across memory, gallery, and prompt stores by shared tags', async () => {
    mockLoadMemories.mockResolvedValue([
      { id: 'm1', fact: 'likes cyberpunk aesthetics', category: 'style_pattern', tags: ['cyberpunk', 'neon'], createdAt: 0 },
    ]);
    mockLoadGalleryItems.mockResolvedValue([
      { id: 'g1', createdAt: 0, type: 'image', urls: [], sources: [], title: 'Neon City', tags: ['cyberpunk', 'city'] },
    ]);
    mockLoadSavedPrompts.mockResolvedValue([
      { id: 'p1', text: 'a neon-lit street', createdAt: 0, tags: ['cyberpunk'] },
    ]);

    const result = await tool.execute({ kind: 'memory', id: 'm1' }, {} as any);
    const parsed = JSON.parse(result as string);

    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'gallery_item', id: 'g1' }),
        expect.objectContaining({ kind: 'prompt', id: 'p1' }),
      ])
    );
  });

  it('respects max_results', async () => {
    mockLoadMemories.mockResolvedValue([
      { id: 'm1', fact: 'seed', category: 'general', tags: ['x'], createdAt: 0 },
      { id: 'm2', fact: 'a', category: 'general', tags: ['x'], createdAt: 0 },
      { id: 'm3', fact: 'b', category: 'general', tags: ['x'], createdAt: 0 },
    ]);

    const result = await tool.execute({ kind: 'memory', id: 'm1', max_results: 1 }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveLength(1);
  });
});
