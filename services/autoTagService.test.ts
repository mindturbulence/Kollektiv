import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseTagResponse, normalizeTags } from './autoTagService';
import type { GalleryItem, LLMSettings } from '../types';

vi.mock('./llmService', () => ({ suggestTagsRaw: vi.fn(async () => 'sunset, landscape') }));
vi.mock('../utils/fileUtils', () => ({
  getActiveFileManager: () => ({ getFileAsBlob: vi.fn(async () => new Blob(['x'])) }),
  fileToBase64: vi.fn(async () => 'ZmFrZQ=='),
}));

const { updateItemInGallery } = vi.hoisted(() => ({
  updateItemInGallery: vi.fn(async () => {}),
}));
vi.mock('../utils/galleryStorage', () => ({ updateItemInGallery }));

const makeItem = (overrides: Partial<GalleryItem> = {}): GalleryItem => ({
  id: 'item-1',
  createdAt: 0,
  type: 'image',
  urls: ['gallery/test.png'],
  sources: ['AI Generation'],
  title: 'Test',
  ...overrides,
});

const enabled = { autoTagEnabled: true, activeLLM: 'gemini' } as LLMSettings;

describe('parseTagResponse', () => {
  it('splits a comma-separated line', () => {
    expect(parseTagResponse('sunset, landscape, cinematic')).toEqual(['sunset', 'landscape', 'cinematic']);
  });

  it('splits newline-separated output', () => {
    expect(parseTagResponse('sunset\nlandscape\ncinematic')).toEqual(['sunset', 'landscape', 'cinematic']);
  });

  it('strips list numbering', () => {
    expect(parseTagResponse('1. sunset\n2) landscape')).toEqual(['sunset', 'landscape']);
  });

  it('strips bullet markers', () => {
    expect(parseTagResponse('- sunset\n* landscape\n• cinematic')).toEqual(['sunset', 'landscape', 'cinematic']);
  });

  it('strips surrounding quotes', () => {
    expect(parseTagResponse('"sunset", \'landscape\'')).toEqual(['sunset', 'landscape']);
  });

  it('drops a preamble line ending in a colon', () => {
    expect(parseTagResponse('Here are the tags:\nsunset, landscape')).toEqual(['sunset', 'landscape']);
  });

  it('drops entries longer than three words', () => {
    expect(parseTagResponse('sunset, this is a long descriptive sentence, landscape')).toEqual(['sunset', 'landscape']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTagResponse('')).toEqual([]);
    expect(parseTagResponse('   \n  ')).toEqual([]);
  });
});

describe('normalizeTags', () => {
  it('lowercases and trims', () => {
    expect(normalizeTags(['  Sunset ', 'LANDSCAPE'])).toEqual(['sunset', 'landscape']);
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTags(['golden   hour'])).toEqual(['golden hour']);
  });

  it('deduplicates within the candidate list', () => {
    expect(normalizeTags(['sunset', 'Sunset', 'SUNSET'])).toEqual(['sunset']);
  });

  it('excludes tags already on the item, case-insensitively', () => {
    expect(normalizeTags(['sunset', 'landscape'], ['SUNSET'])).toEqual(['landscape']);
  });

  it('caps the result at twelve suggestions', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    expect(normalizeTags(many)).toHaveLength(12);
  });

  it('returns an empty array when every candidate is already present', () => {
    expect(normalizeTags(['sunset'], ['sunset'])).toEqual([]);
  });

  it('handles an empty candidate list', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe('suggestTagsForItem', () => {
  it('returns normalized suggestions for an image', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    await expect(suggestTagsForItem(makeItem(), enabled)).resolves.toEqual(['sunset', 'landscape']);
  });

  it('excludes tags the item already has', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['Sunset'] });
    await expect(suggestTagsForItem(item, enabled)).resolves.toEqual(['landscape']);
  });

  it('rejects when the feature is disabled', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    const off = { autoTagEnabled: false, activeLLM: 'gemini' } as LLMSettings;
    await expect(suggestTagsForItem(makeItem(), off)).rejects.toThrow(/disabled/i);
  });

  it('rejects for a video item', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    await expect(suggestTagsForItem(makeItem({ type: 'video' }), enabled)).rejects.toThrow(/image/i);
  });

  it('rejects when the item has no file path', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    await expect(suggestTagsForItem(makeItem({ urls: [] }), enabled)).rejects.toThrow(/no image file/i);
  });
});

describe('applyTagsToItem', () => {
  beforeEach(() => updateItemInGallery.mockClear());

  it('appends accepted tags to the existing list', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['existing'] });
    await expect(applyTagsToItem(item, ['sunset'])).resolves.toEqual(['existing', 'sunset']);
    expect(updateItemInGallery).toHaveBeenCalledWith('item-1', { tags: ['existing', 'sunset'] });
  });

  it('writes nothing when nothing is accepted', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['existing'] });
    await expect(applyTagsToItem(item, [])).resolves.toEqual(['existing']);
    expect(updateItemInGallery).not.toHaveBeenCalled();
  });

  it('writes nothing when every accepted tag is already present', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['sunset'] });
    await expect(applyTagsToItem(item, ['Sunset'])).resolves.toEqual(['sunset']);
    expect(updateItemInGallery).not.toHaveBeenCalled();
  });

  it('works on an item with no tags yet', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    await expect(applyTagsToItem(makeItem(), ['sunset'])).resolves.toEqual(['sunset']);
  });
});
