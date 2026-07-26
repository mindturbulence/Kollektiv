import { describe, it, expect, vi, afterEach } from 'vitest';
import Parser from 'rss-parser';
import { fetchFeed } from './rssService';

const FIXTURE_ITEMS = [
  { title: 'First Post', link: 'https://example.com/1', pubDate: '2026-07-01', contentSnippet: 'Snippet one', creator: 'Alice' },
  { title: 'Second Post', link: 'https://example.com/2', pubDate: '2026-07-02', contentSnippet: 'Snippet two', author: 'Bob' },
  { title: 'Third Post', link: 'https://example.com/3', pubDate: '2026-07-03', contentSnippet: 'Snippet three' },
];

describe('fetchFeed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses feed title, link, and items', async () => {
    vi.spyOn(Parser.prototype, 'parseURL').mockResolvedValue({
      title: 'Example Blog',
      link: 'https://example.com',
      items: FIXTURE_ITEMS,
    } as any);

    const result = await fetchFeed('https://example.com/feed.xml');
    expect(result.feedTitle).toBe('Example Blog');
    expect(result.feedLink).toBe('https://example.com');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({
      title: 'First Post',
      link: 'https://example.com/1',
      pubDate: '2026-07-01',
      contentSnippet: 'Snippet one',
      author: 'Alice',
    });
    expect(result.items[1].author).toBe('Bob');
  });

  it('truncates to maxItems', async () => {
    vi.spyOn(Parser.prototype, 'parseURL').mockResolvedValue({
      title: 'Example Blog',
      items: FIXTURE_ITEMS,
    } as any);

    const result = await fetchFeed('https://example.com/feed.xml', 2);
    expect(result.items).toHaveLength(2);
  });

  it('rejects loopback/private feed URLs without making a network call', async () => {
    const spy = vi.spyOn(Parser.prototype, 'parseURL');
    await expect(fetchFeed('http://127.0.0.1/feed.xml')).rejects.toThrow(/private, loopback/);
    await expect(fetchFeed('http://169.254.169.254/feed.xml')).rejects.toThrow(/private, loopback/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) protocols', async () => {
    await expect(fetchFeed('ftp://example.com/feed.xml')).rejects.toThrow(/http\(s\)/);
  });

  it('rejects invalid URLs', async () => {
    await expect(fetchFeed('not a url')).rejects.toThrow(/Invalid feed URL/);
  });
});
