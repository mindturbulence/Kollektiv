import { describe, it, expect, vi, beforeEach } from 'vitest';

const syndicationFetch = vi.fn();
const oembedFetch = vi.fn();

vi.mock('./backends/syndicationCdn', () => ({
  syndicationCdnBackend: { name: 'syndicationCdn', fetch: (...args: any[]) => syndicationFetch(...args) },
}));
vi.mock('./backends/oembed', () => ({
  oembedBackend: { name: 'oembed', fetch: (...args: any[]) => oembedFetch(...args) },
}));

describe('getTweet (ordered fallback)', () => {
  beforeEach(() => {
    syndicationFetch.mockReset();
    oembedFetch.mockReset();
  });

  it('returns the primary backend result when it succeeds', async () => {
    syndicationFetch.mockResolvedValue({ text: 'hi', author: 'a', url: 'https://x.com/a/status/1' });
    const { getTweet } = await import('./index');
    const result = await getTweet('1');
    expect(result.backendUsed).toBe('syndicationCdn');
    expect(oembedFetch).not.toHaveBeenCalled();
  });

  it('falls back to oEmbed when the syndication CDN throws', async () => {
    syndicationFetch.mockRejectedValue(new Error('blocked'));
    oembedFetch.mockResolvedValue({ text: 'fallback text', author: 'a', url: 'https://x.com/a/status/1' });
    const { getTweet } = await import('./index');
    const result = await getTweet('1');
    expect(result.backendUsed).toBe('oembed');
    expect(result.tweet.text).toBe('fallback text');
  });

  it('throws a clean joined error when both backends fail, never an uncaught crash', async () => {
    syndicationFetch.mockRejectedValue(new Error('blocked'));
    oembedFetch.mockRejectedValue(new Error('also blocked'));
    const { getTweet } = await import('./index');
    await expect(getTweet('1')).rejects.toThrow(/syndicationCdn: blocked.*oembed: also blocked/s);
  });
});
