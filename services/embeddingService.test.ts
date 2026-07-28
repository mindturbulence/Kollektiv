import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedText, isEmbeddingAvailable } from './embeddingService';
import type { LLMSettings } from '../types';

const settings = {
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  embeddingModel: 'all-minilm:33m',
} as unknown as LLMSettings;

describe('embedText', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the vector from a successful response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    });
    await expect(embedText('sunset', settings)).resolves.toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null when Ollama is unreachable', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Failed to fetch'));
    await expect(embedText('sunset', settings)).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    await expect(embedText('sunset', settings)).resolves.toBeNull();
  });

  it('returns null for empty text without calling the network', async () => {
    await expect(embedText('   ', settings)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when the response has no vector', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(embedText('sunset', settings)).resolves.toBeNull();
  });
});

describe('isEmbeddingAvailable', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when Ollama responds', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    await expect(isEmbeddingAvailable(settings)).resolves.toBe(true);
  });

  it('returns false when Ollama is unreachable', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Failed to fetch'));
    await expect(isEmbeddingAvailable(settings)).resolves.toBe(false);
  });

  it('returns false on non-ok response', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 503 });
    await expect(isEmbeddingAvailable(settings)).resolves.toBe(false);
  });
});
