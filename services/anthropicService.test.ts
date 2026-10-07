import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamChatAnthropic } from './anthropicService';
import type { LLMSettings } from '../types';

const settings = { anthropicConnectionMode: 'api', anthropicApiKey: 'k' } as unknown as LLMSettings;
const messages = [{ role: 'user' as const, content: 'hi' }];

async function sentBody(options?: { maxTokens?: number }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: null });
  vi.stubGlobal('fetch', fetchMock);
  for await (const _ of streamChatAnthropic(messages, settings, options)) { /* drain */ }
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe('streamChatAnthropic maxTokens', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('omits maxTokens when not provided', async () => {
    expect('maxTokens' in (await sentBody())).toBe(false);
    expect('maxTokens' in (await sentBody({}))).toBe(false);
  });
  it('forwards maxTokens when provided', async () => {
    expect((await sentBody({ maxTokens: 8192 })).maxTokens).toBe(8192);
  });
});
