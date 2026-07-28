import type { LLMSettings, GalleryItem, SavedPrompt } from '../types';
import { refineSinglePrompt, abstractImage } from './llmService';
import { suggestTagsForItem } from './autoTagService';
import { getActiveFileManager, fileToBase64 } from '../utils/fileUtils';

export interface BatchOperation {
  id: string;
  label: string;
  inputKind: 'prompt' | 'gallery_item';
  run: (item: any, settings: LLMSettings) => Promise<any>;
}

export const BATCH_OPERATIONS: BatchOperation[] = [
  {
    id: 'refine_prompt',
    label: 'Refine prompt',
    inputKind: 'prompt',
    run: async (item: SavedPrompt, settings: LLMSettings) => {
      const text = item.text || (item as any).content || '';
      if (!text) throw new Error('Prompt has no text content.');
      return refineSinglePrompt(text, 'Flux', settings);
    },
  },
  {
    id: 'suggest_tags',
    label: 'Suggest gallery tags',
    inputKind: 'gallery_item',
    run: async (item: GalleryItem, settings: LLMSettings) => {
      if (!settings.autoTagEnabled) {
        throw new Error('Auto-tagging is disabled. Enable it in Settings > Integrations > Assistant.');
      }
      return suggestTagsForItem(item, settings);
    },
  },
  {
    id: 'abstract_image',
    label: 'Describe image as prompt',
    inputKind: 'gallery_item',
    run: async (item: GalleryItem, settings: LLMSettings) => {
      const path = item.urls?.[0];
      if (!path) throw new Error('This item has no image file to analyse.');
      const blob = await getActiveFileManager().getFileAsBlob(path);
      if (!blob) throw new Error(`Image file not found in the vault: ${path}`);
      const base64 = await fileToBase64(blob, true);
      const result = await abstractImage(base64, 'MEDIUM', 'Flux', settings);
      return result.suggestions?.[0] || JSON.stringify(result);
    },
  },
];

export function getOperation(id: string): BatchOperation | undefined {
  return BATCH_OPERATIONS.find(o => o.id === id);
}
