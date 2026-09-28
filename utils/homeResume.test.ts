import { describe, it, expect } from 'vitest';
import { latestByCreatedAt, resolveRecentTools, isAiProviderConfigured } from './homeResume';
import { defaultLLMSettings } from './settingsStorage';

describe('latestByCreatedAt', () => {
  it('returns newest first, capped, without mutating the input', () => {
    const items = [{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 3 }, { id: 'c', createdAt: 2 }];
    expect(latestByCreatedAt(items, 2).map(i => i.id)).toEqual(['b', 'c']);
    expect(items.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty input and limits larger than the list', () => {
    expect(latestByCreatedAt([], 12)).toEqual([]);
    expect(latestByCreatedAt([{ createdAt: 5 }], 12)).toHaveLength(1);
  });
});

describe('resolveRecentTools', () => {
  it('labels tabs from the nav, collapses prompts into Crafter, drops unknown tabs', () => {
    expect(resolveRecentTools(['prompts', 'crafter', 'converter', 'discovery', 'settings'])).toEqual([
      { tab: 'crafter', label: 'Crafter', group: 'Workbench' },
      { tab: 'converter', label: 'Converter', group: 'Utilities' },
      { tab: 'discovery', label: 'Discovery', group: 'Workbench' },
    ]);
  });
});

describe('isAiProviderConfigured', () => {
  const base = { ...defaultLLMSettings, geminiApiKey: '' };

  it('gemini needs a saved or env key', () => {
    expect(isAiProviderConfigured({ ...base, activeLLM: 'gemini' }, '')).toBe(false);
    expect(isAiProviderConfigured({ ...base, activeLLM: 'gemini' }, 'env-key')).toBe(true);
    expect(isAiProviderConfigured({ ...base, activeLLM: 'gemini', geminiApiKey: 'k' }, '')).toBe(true);
  });

  it('checks only the selected provider', () => {
    expect(isAiProviderConfigured({ ...base, activeLLM: 'openrouter', geminiApiKey: 'k' }, '')).toBe(false);
    expect(isAiProviderConfigured({ ...base, activeLLM: 'ollama', ollamaBaseUrl: 'http://localhost:11434' }, '')).toBe(true);
    expect(isAiProviderConfigured({ ...base, activeLLM: 'llamacpp', llamacppBaseUrl: '' }, '')).toBe(false);
  });
});
