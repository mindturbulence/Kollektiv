import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TagSuggestionRow } from './ItemDetailView';
import type { GalleryItem, LLMSettings } from '../types';

vi.mock('../services/autoTagService', () => ({
  suggestTagsForItem: vi.fn(async () => ['sunset', 'landscape']),
  applyTagsToItem: vi.fn(async () => ['sunset']),
}));

const item: GalleryItem = {
  id: 'item-1', createdAt: 0, type: 'image',
  urls: ['gallery/test.png'], sources: [], title: 'Test',
};
const settings = { autoTagEnabled: true, activeLLM: 'gemini' } as LLMSettings;

beforeEach(() => cleanup());

describe('TagSuggestionRow', () => {
  it('renders the suggest button when the feature is enabled', () => {
    render(<TagSuggestionRow item={item} settings={settings} onTagsChanged={() => {}} />);
    expect(screen.getByText(/suggest tags/i)).toBeTruthy();
  });

  it('renders nothing when the feature is disabled', () => {
    const off = { ...settings, autoTagEnabled: false };
    const { container } = render(<TagSuggestionRow item={item} settings={off} onTagsChanged={() => {}} />);
    expect(container.textContent).not.toMatch(/suggest tags/i);
  });
});
