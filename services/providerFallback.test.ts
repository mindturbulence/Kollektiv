import { describe, it, expect, vi } from 'vitest';
import { isRetriableProviderError, withProviderFallback } from './providerFallback';
import { ProviderUnsupportedError } from './llmService';
import type { LLMSettings } from '../types';

describe('isRetriableProviderError', () => {
  it('retries a network failure', () => {
    expect(isRetriableProviderError(new Error('Failed to fetch'))).toBe(true);
  });

  it('retries a timeout', () => {
    expect(isRetriableProviderError(new Error('request timed out'))).toBe(true);
  });

  it('retries a 500', () => {
    expect(isRetriableProviderError(new Error('HTTP 500 Internal Server Error'))).toBe(true);
  });

  it('retries a 429 rate limit', () => {
    expect(isRetriableProviderError(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('does NOT retry ProviderUnsupportedError', () => {
    const err = new ProviderUnsupportedError('Image abstraction', 'anthropic', ['gemini', 'ollama']);
    expect(isRetriableProviderError(err)).toBe(false);
  });

  it('does NOT retry a 401', () => {
    expect(isRetriableProviderError(new Error('HTTP 401 Unauthorized'))).toBe(false);
  });

  it('does NOT retry a 403', () => {
    expect(isRetriableProviderError(new Error('403 Forbidden — invalid API key'))).toBe(false);
  });

  it('does NOT retry a 400', () => {
    expect(isRetriableProviderError(new Error('400 Bad Request'))).toBe(false);
  });

  it('does not retry a non-Error value', () => {
    expect(isRetriableProviderError('some string')).toBe(false);
    expect(isRetriableProviderError(null)).toBe(false);
  });
});

const settingsWith = (chain: string[], enabled = true): LLMSettings => ({
  activeLLM: 'gemini',
  providerFallbackEnabled: enabled,
  providerFallbackChain: chain,
} as unknown as LLMSettings);

describe('withProviderFallback', () => {
  it('returns the active provider result without touching the chain', async () => {
    const run = vi.fn(async () => 'ok');
    const result = await withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run);
    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('gemini');
  });

  it('falls back to the next chain entry on a network error', async () => {
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return 'from-ollama';
    });
    const result = await withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run);
    expect(result).toBe('from-ollama');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on a 401', async () => {
    const run = vi.fn(async () => { throw new Error('HTTP 401 Unauthorized'); });
    await expect(withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run))
      .rejects.toThrow(/401/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not fall back when disabled', async () => {
    const run = vi.fn(async () => { throw new Error('Failed to fetch'); });
    await expect(withProviderFallback('Chat', settingsWith(['ollama'], false), ['gemini', 'ollama'], run))
      .rejects.toThrow(/Failed to fetch/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips chain entries the feature does not support', async () => {
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return `from-${p}`;
    });
    // 'anthropic' is in the chain but not in supported — must be skipped.
    const result = await withProviderFallback('Vision', settingsWith(['anthropic', 'ollama']), ['gemini', 'ollama'], run);
    expect(result).toBe('from-ollama');
    expect(run).not.toHaveBeenCalledWith('anthropic');
  });

  it('throws the ORIGINAL error when the chain is exhausted', async () => {
    const run = vi.fn(async (p: string) => {
      throw new Error(p === 'gemini' ? 'original failure' : 'secondary failure');
    });
    await expect(withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run))
      .rejects.toThrow(/original failure/);
  });

  it('notifies the caller on each fallback', async () => {
    const onFallback = vi.fn();
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return 'ok';
    });
    await withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run, onFallback);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0][0]).toBe('gemini');
    expect(onFallback.mock.calls[0][1]).toBe('ollama');
  });

  it('does not retry the provider that already failed even if it is in the chain', async () => {
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return 'ok';
    });
    await withProviderFallback('Chat', settingsWith(['gemini', 'ollama']), ['gemini', 'ollama'], run);
    expect(run.mock.calls.filter((c: any) => c[0] === 'gemini')).toHaveLength(1);
  });
});
