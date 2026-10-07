import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamChatOpenRouter } from './openrouterService';
import type { LLMSettings } from '../types';

const settings = { openrouterApiKey: 'k', openrouterModel: 'vendor/vision' } as unknown as LLMSettings;
const messages = [{ role: 'user' as const, content: 'hi' }];

async function sentBody(options?: { maxTokens?: number }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: null });
  vi.stubGlobal('fetch', fetchMock);
  for await (const _ of streamChatOpenRouter(messages, settings, options)) { /* drain */ }
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe('streamChatOpenRouter maxTokens', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('omits max_tokens when not provided', async () => {
    expect('max_tokens' in (await sentBody())).toBe(false);
    expect('max_tokens' in (await sentBody({}))).toBe(false);
  });
  it('sends max_tokens when provided', async () => {
    expect((await sentBody({ maxTokens: 8192 })).max_tokens).toBe(8192);
  });
});
