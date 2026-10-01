import { describe, it, expect } from 'vitest';
import { isAiProviderConfigured } from './homeResume';
import { defaultLLMSettings } from './settingsStorage';

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
