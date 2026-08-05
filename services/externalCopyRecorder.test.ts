import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory manifest store, mirrors generationStorage.test.ts's pattern.
let _manifestJson: string | null = null;

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: {
    readFile: vi.fn().mockImplementation(() => Promise.resolve(_manifestJson)),
    fileExists: vi.fn().mockImplementation(() => Promise.resolve(_manifestJson !== null)),
    saveFile: vi.fn().mockImplementation((_path: string, blob: Blob) => {
      return blob.text().then((text) => { _manifestJson = text; });
    }),
  },
}));

import { recordExternalCopy } from './externalCopyRecorder';
import { loadGenerations } from '../utils/generationStorage';

beforeEach(() => {
  _manifestJson = null;
  vi.clearAllMocks();
});

describe('recordExternalCopy', () => {
  it('persists a Generation with backendId external:<service>, empty resultItemIds, and status ok', async () => {
    const id = await recordExternalCopy({
      serviceName: 'midjourney',
      promptText: 'a neon rooftop at night',
      negativePromptText: 'blurry',
      targetModel: 'Midjourney v6',
      modifiers: { lighting: 'neon' },
    });

    const generations = await loadGenerations();
    expect(generations).toHaveLength(1);
    expect(generations[0]).toMatchObject({
      id,
      backendId: 'external:midjourney',
      promptText: 'a neon rooftop at night',
      negativePromptText: 'blurry',
      status: 'ok',
      resultItemIds: [],
      modifiers: { lighting: 'neon' },
    });
    expect(generations[0].params.model).toBe('Midjourney v6');
  });
});
