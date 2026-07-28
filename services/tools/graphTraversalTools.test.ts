import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadMemories, loadGalleryItems, loadSavedPrompts } = vi.hoisted(() => ({
  loadMemories: vi.fn(async () => [] as any[]),
  loadGalleryItems: vi.fn(async () => [] as any[]),
  loadSavedPrompts: vi.fn(async () => [] as any[]),
}));
vi.mock('../../utils/memoryStorage', () => ({ loadMemories }));
vi.mock('../../utils/galleryStorage', () => ({ loadGalleryItems }));
vi.mock('../../utils/promptStorage', () => ({ loadSavedPrompts }));

import { graphTraversalTools } from './graphTraversalTools';

const tool = (name: string) => graphTraversalTools.find(t => t.name === name)!;
const mockCtx = {} as any;

describe('traverse_knowledge', () => {
  beforeEach(() => {
    loadMemories.mockResolvedValue([]);
    loadSavedPrompts.mockResolvedValue([]);
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic', 'portrait'] },
      { id: 'g3', title: 'C', tags: ['portrait'] },
    ]);
  });

  it('returns the multi-hop neighbourhood', async () => {
    const out = await tool('traverse_knowledge').execute({ kind: 'gallery_item', id: 'g1', max_depth: 2 }, mockCtx);
    expect(out).toContain('g2');
    expect(out).toContain('g3');
  });

  it('rejects an unknown kind', async () => {
    const out = await tool('traverse_knowledge').execute({ kind: 'nonsense', id: 'g1' }, mockCtx);
    expect(out).toMatch(/kind must be one of/i);
  });

  it('reports a missing id clearly', async () => {
    const out = await tool('traverse_knowledge').execute({ kind: 'gallery_item', id: 'missing' }, mockCtx);
    expect(out).toMatch(/no gallery_item item with id/i);
  });
});

describe('find_knowledge_path', () => {
  beforeEach(() => {
    loadMemories.mockResolvedValue([]);
    loadSavedPrompts.mockResolvedValue([]);
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic', 'portrait'] },
      { id: 'g3', title: 'C', tags: ['portrait'] },
    ]);
  });

  it('finds a path through a shared intermediate tag', async () => {
    const out = await tool('find_knowledge_path').execute({
      from_kind: 'gallery_item', from_id: 'g1',
      to_kind: 'gallery_item', to_id: 'g3',
    }, mockCtx);
    expect(out).toContain('g2');
  });

  it('reports when no path exists', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g9', title: 'Z', tags: ['unrelated'] },
    ]);
    const out = await tool('find_knowledge_path').execute({
      from_kind: 'gallery_item', from_id: 'g1',
      to_kind: 'gallery_item', to_id: 'g9',
    }, mockCtx);
    expect(out).toMatch(/no path/i);
  });
});
