import { describe, it, expect } from 'vitest';
import { computeGalleryStats } from './galleryAnalytics';
import type { GalleryItem, GalleryCategory } from '../types';

const makeItem = (overrides: Partial<GalleryItem> = {}): GalleryItem => ({
  id: 'item-1',
  createdAt: Date.parse('2026-07-15T12:00:00Z'),
  type: 'image',
  urls: ['gallery/test.png'],
  sources: ['AI Generation'],
  title: 'Test Image',
  prompt: 'A beautiful sunset over mountains with cinematic lighting',
  tags: ['sunset', 'landscape', 'cinematic'],
  categoryId: 'cat-1',
  isNsfw: false,
  ...overrides,
});

const categories: GalleryCategory[] = [
  { id: 'cat-1', name: 'Landscapes', order: 0 },
  { id: 'cat-2', name: 'Portraits', order: 1 },
];

describe('computeGalleryStats', () => {
  it('returns empty stats for an empty gallery', () => {
    const stats = computeGalleryStats([], [], []);
    expect(stats.totalItems).toBe(0);
    expect(stats.imageCount).toBe(0);
    expect(stats.videoCount).toBe(0);
    expect(stats.pinnedCount).toBe(0);
    expect(stats.tagFrequency).toEqual([]);
    expect(stats.categoryDistribution).toEqual([]);
    expect(stats.sourceDistribution).toEqual([]);
    expect(stats.modelUsage).toEqual([]);
    expect(stats.timeline).toEqual([]);
    expect(stats.promptWordFrequency).toEqual([]);
  });

  it('counts images and videos correctly', () => {
    const items = [
      makeItem({ id: '1', type: 'image' }),
      makeItem({ id: '2', type: 'image' }),
      makeItem({ id: '3', type: 'video' }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.totalItems).toBe(3);
    expect(stats.imageCount).toBe(2);
    expect(stats.videoCount).toBe(1);
  });

  it('counts pinned items', () => {
    const items = [makeItem({ id: '1' }), makeItem({ id: '2' })];
    const stats = computeGalleryStats(items, categories, ['1']);
    expect(stats.pinnedCount).toBe(1);
  });

  it('computes tag frequency sorted descending', () => {
    const items = [
      makeItem({ id: '1', tags: ['sunset', 'landscape'] }),
      makeItem({ id: '2', tags: ['sunset', 'ocean'] }),
      makeItem({ id: '3', tags: ['portrait'] }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.tagFrequency).toHaveLength(4);
    expect(stats.tagFrequency[0]).toEqual({ tag: 'sunset', count: 2 });
    expect(stats.tagFrequency[1]).toEqual({ tag: 'landscape', count: 1 });
  });

  it('handles items with no tags', () => {
    const items = [makeItem({ id: '1', tags: undefined })];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.tagFrequency).toEqual([]);
  });

  it('computes category distribution with names', () => {
    const items = [
      makeItem({ id: '1', categoryId: 'cat-1' }),
      makeItem({ id: '2', categoryId: 'cat-1' }),
      makeItem({ id: '3', categoryId: 'cat-2' }),
      makeItem({ id: '4', categoryId: undefined }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.categoryDistribution).toHaveLength(3);
    expect(stats.categoryDistribution[0]).toMatchObject({
      categoryName: 'Landscapes',
      count: 2,
    });
    expect(stats.categoryDistribution[2]).toMatchObject({
      categoryId: 'uncategorized',
      categoryName: 'Uncategorized',
      count: 1,
    });
  });

  it('computes source distribution', () => {
    const items = [
      makeItem({ id: '1', sources: ['AI Generation'] }),
      makeItem({ id: '2', sources: ['AI Generation'] }),
      makeItem({ id: '3', sources: ['Manual Upload'] }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.sourceDistribution[0]).toEqual({
      source: 'AI Generation',
      count: 2,
    });
  });

  it('extracts model names from prompt and sources', () => {
    const items = [
      makeItem({ id: '1', prompt: 'midjourney style portrait', sources: ['AI Generation'] }),
      makeItem({ id: '2', prompt: 'flux generation with sdxl', sources: ['AI Generation'] }),
      makeItem({ id: '3', prompt: 'a normal prompt', sources: ['Imagen Generate'] }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.modelUsage.length).toBeGreaterThanOrEqual(2);
    const midjourney = stats.modelUsage.find((m) => m.model === 'midjourney');
    const flux = stats.modelUsage.find((m) => m.model === 'flux');
    expect(midjourney?.count).toBe(1);
    expect(flux?.count).toBe(1);
  });

  it('builds monthly timeline buckets', () => {
    const items = [
      makeItem({ id: '1', createdAt: Date.parse('2026-06-01T00:00:00Z') }),
      makeItem({ id: '2', createdAt: Date.parse('2026-06-15T00:00:00Z') }),
      makeItem({ id: '3', createdAt: Date.parse('2026-07-01T00:00:00Z') }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.timeline).toHaveLength(2);
    expect(stats.timeline[0]).toEqual({ period: '2026-06', count: 2 });
    expect(stats.timeline[1]).toEqual({ period: '2026-07', count: 1 });
  });

  it('computes prompt word frequency', () => {
    const items = [
      makeItem({ id: '1', prompt: 'beautiful sunset landscape cinematic lighting' }),
      makeItem({ id: '2', prompt: 'beautiful portrait studio lighting' }),
    ];
    const stats = computeGalleryStats(items, categories, []);
    const beautiful = stats.promptWordFrequency.find((w) => w.word === 'beautiful');
    const lighting = stats.promptWordFrequency.find((w) => w.word === 'lighting');
    expect(beautiful?.count).toBe(2);
    expect(lighting?.count).toBe(2);
    // Stopwords like 'with', 'the', 'over' should be excluded
    expect(stats.promptWordFrequency.some((w) => w.word === 'with')).toBe(false);
  });

  it('handles items with no prompt gracefully', () => {
    const items = [makeItem({ id: '1', prompt: undefined })];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.promptWordFrequency).toEqual([]);
  });

  it('limits tag frequency to top 50', () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      makeItem({ id: `item-${i}`, tags: [`tag-${i}`] }),
    );
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.tagFrequency.length).toBeLessThanOrEqual(50);
  });

  it('limits prompt word frequency to top 30', () => {
    const items = [makeItem({
      id: '1',
      prompt: Array.from({ length: 40 }, (_, i) => `keyword${i}`).join(' '),
    })];
    const stats = computeGalleryStats(items, categories, []);
    expect(stats.promptWordFrequency.length).toBeLessThanOrEqual(30);
  });
});
