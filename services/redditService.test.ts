import { describe, it, expect, vi, afterEach } from 'vitest';
import { getListing, getThread, search } from './redditService';

function jsonResponse(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const FIXTURE_POST = {
  title: 'Show HN: my project',
  url: 'https://example.com/project',
  permalink: '/r/programming/comments/abc123/show_hn_my_project/',
  author: 'someuser',
  score: 42,
  num_comments: 7,
  selftext: 'Details about the project.',
  subreddit: 'programming',
};

const FIXTURE_LISTING = { data: { children: [{ data: FIXTURE_POST }] } };

describe('redditService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getListing always sends a descriptive User-Agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, FIXTURE_LISTING));
    vi.stubGlobal('fetch', fetchMock);

    const posts = await getListing('programming', 'hot', 10);
    expect(posts).toEqual([{
      title: 'Show HN: my project',
      url: 'https://example.com/project',
      permalink: 'https://www.reddit.com/r/programming/comments/abc123/show_hn_my_project/',
      author: 'someuser',
      score: 42,
      numComments: 7,
      selftext: 'Details about the project.',
      subreddit: 'programming',
    }]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['User-Agent']).toBeTruthy();
  });

  it('getThread parses post + comment tree', async () => {
    const fixture = [
      { data: { children: [{ data: FIXTURE_POST }] } },
      { data: { children: [
        { kind: 't1', data: { author: 'commenter1', body: 'Nice work!', score: 10 } },
        { kind: 'more', data: {} },
      ] } },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, fixture)));

    const thread = await getThread('programming', 'abc123');
    expect(thread.post.title).toBe('Show HN: my project');
    expect(thread.comments).toEqual([{ author: 'commenter1', body: 'Nice work!', score: 10 }]);
  });

  it('search maps a listing response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, FIXTURE_LISTING)));
    const results = await search('typescript', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Show HN: my project');
  });

  it('maps 429 to a clean rate-limit error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, {})));
    await expect(getListing('programming')).rejects.toThrow(/rate-limited or blocked/);
  });

  it('maps 403 to the same clean rate-limit error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, {})));
    await expect(search('x')).rejects.toThrow(/rate-limited or blocked/);
  });
});
