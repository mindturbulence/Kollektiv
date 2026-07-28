import { describe, it, expect, vi } from 'vitest';
import type { LLMSettings } from '../types';

vi.mock('./geminiService', () => ({
  suggestTagsRawGemini: vi.fn(async () => 'gemini-output'),
}));
vi.mock('./ollamaService', () => ({
  suggestTagsRawOllama: vi.fn(async () => 'ollama-output'),
}));

const makeSettings = (activeLLM: LLMSettings['activeLLM']): LLMSettings =>
  ({ activeLLM } as LLMSettings);

describe('suggestTagsRaw', () => {
  it('routes to Gemini when Gemini is active', async () => {
    const { suggestTagsRaw } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('gemini'))).resolves.toBe('gemini-output');
  });

  it('routes to Ollama when Ollama is active', async () => {
    const { suggestTagsRaw } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('ollama'))).resolves.toBe('ollama-output');
  });

  it('routes to Ollama when ollama_cloud is active', async () => {
    const { suggestTagsRaw } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('ollama_cloud'))).resolves.toBe('ollama-output');
  });

  it('throws ProviderUnsupportedError for a provider without vision', async () => {
    const { suggestTagsRaw, ProviderUnsupportedError } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('anthropic')))
      .rejects.toBeInstanceOf(ProviderUnsupportedError);
  });

  it('throws ProviderUnsupportedError for llamacpp', async () => {
    const { suggestTagsRaw, ProviderUnsupportedError } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('llamacpp')))
      .rejects.toBeInstanceOf(ProviderUnsupportedError);
  });
});
