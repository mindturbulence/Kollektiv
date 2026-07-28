import { describe, it, expect, vi, beforeEach } from 'vitest';
import { relationshipGraph } from '../relationshipGraph';

const { loadMemories, loadGalleryItems, loadSavedPrompts } = vi.hoisted(() => ({
  loadMemories: vi.fn(async () => [] as any[]),
  loadGalleryItems: vi.fn(async () => [] as any[]),
  loadSavedPrompts: vi.fn(async () => [] as any[]),
}));
vi.mock('../../utils/memoryStorage', () => ({ loadMemories }));
vi.mock('../../utils/galleryStorage', () => ({ loadGalleryItems }));
vi.mock('../../utils/promptStorage', () => ({ loadSavedPrompts }));

import { hydrateKnowledgeGraph } from './graphHydration';

describe('hydrateKnowledgeGraph', () => {
  beforeEach(() => {
    loadMemories.mockResolvedValue([]);
    loadGalleryItems.mockResolvedValue([]);
    loadSavedPrompts.mockResolvedValue([]);
  });

  it('adds entities from all three stores', async () => {
    loadMemories.mockResolvedValue([{ id: 'm1', fact: 'likes cinematic light', tags: ['cinematic'] }]);
    loadGalleryItems.mockResolvedValue([{ id: 'g1', title: 'Sunset', tags: ['cinematic'] }]);
    loadSavedPrompts.mockResolvedValue([{ id: 'p1', title: 'Golden', text: 'x', tags: ['cinematic'] }]);
    const stats = await hydrateKnowledgeGraph();
    expect(stats.entities).toBe(3);
  });

  it('creates a relation between two entities sharing a tag', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic'] },
    ]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g2').length).toBeGreaterThan(0);
  });

  it('creates NO relation between entities with no shared tag', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['portrait'] },
    ]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g2')).toEqual([]);
  });

  it('relates entities across different stores', async () => {
    loadMemories.mockResolvedValue([{ id: 'm1', fact: 'f', tags: ['cinematic'] }]);
    loadSavedPrompts.mockResolvedValue([{ id: 'p1', title: 'P', text: 'x', tags: ['cinematic'] }]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.getRelationsBetween('memory', 'm1', 'prompt', 'p1').length).toBeGreaterThan(0);
  });

  it('makes traverse return more than the start node once edges exist', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic'] },
    ]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.traverse('gallery_item', 'g1', 2).length).toBeGreaterThan(1);
  });

  it('ignores entities with no tags', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: [] },
      { id: 'g2', title: 'B' },
    ]);
    const stats = await hydrateKnowledgeGraph();
    expect(stats.entities).toBe(2);
    expect(stats.relations).toBe(0);
  });

describe('hydration cost', () => {
  it('builds a 500-entity graph in under 500ms', async () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `g${i}`,
      title: `Item ${i}`,
      // ~8 tags drawn from a 40-tag vocabulary — realistic overlap density.
      tags: [`t${i % 40}`, `t${(i * 7) % 40}`, `t${(i * 13) % 40}`],
    }));
    loadGalleryItems.mockResolvedValue(items);
    const stats = await hydrateKnowledgeGraph();
    expect(stats.entities).toBe(500);
    expect(stats.relations).toBeGreaterThan(0);
    expect(stats.ms).toBeLessThan(500);
  });
});

  it('weights a fully-overlapping pair above a barely-overlapping one', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['x', 'y'] },
      { id: 'g2', title: 'B', tags: ['x', 'y'] },
      { id: 'g3', title: 'C', tags: ['x', 'a', 'b', 'c', 'd'] },
    ]);
    await hydrateKnowledgeGraph();
    const strong = relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g2')[0];
    const weak = relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g3')[0];
    expect(strong.weight).toBeGreaterThan(weak.weight);
  });
});
