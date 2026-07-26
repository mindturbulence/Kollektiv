import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { getRepoInfo, search, getFile } from './githubService';

function jsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('githubService', () => {
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  });

  it('getRepoInfo maps fields and omits Authorization header without GITHUB_TOKEN', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      full_name: 'facebook/react',
      description: 'A JS library',
      stargazers_count: 100,
      forks_count: 20,
      open_issues_count: 5,
      license: { spdx_id: 'MIT' },
      default_branch: 'main',
      topics: ['javascript', 'ui'],
      html_url: 'https://github.com/facebook/react',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const info = await getRepoInfo('facebook', 'react');
    expect(info).toEqual({
      fullName: 'facebook/react',
      description: 'A JS library',
      stars: 100,
      forks: 20,
      openIssues: 5,
      license: 'MIT',
      defaultBranch: 'main',
      topics: ['javascript', 'ui'],
      url: 'https://github.com/facebook/react',
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers.Accept).toBe('application/vnd.github+json');
  });

  it('includes Authorization header when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      full_name: 'a/b', description: null, stargazers_count: 0, forks_count: 0,
      open_issues_count: 0, license: null, default_branch: 'main', topics: [], html_url: 'https://github.com/a/b',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await getRepoInfo('a', 'b');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('search(repos) maps items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      items: [{ full_name: 'foo/bar', html_url: 'https://github.com/foo/bar', description: 'desc' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await search('repos', 'llm agent', 5);
    expect(results).toEqual([{ title: 'foo/bar', url: 'https://github.com/foo/bar', description: 'desc' }]);
  });

  it('getFile decodes base64 content and defaults to README', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      path: 'README.md',
      content: Buffer.from('# Hello').toString('base64'),
      encoding: 'base64',
      html_url: 'https://github.com/a/b/blob/main/README.md',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = await getFile('a', 'b');
    expect(file).toEqual({
      path: 'README.md',
      content: '# Hello',
      truncated: false,
      url: 'https://github.com/a/b/blob/main/README.md',
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/repos/a/b/readme');
  });

  it('maps 404 to a clear error, not a raw throw of the fetch error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getRepoInfo('nope', 'nope')).rejects.toThrow(/Not found/);
  });

  it('maps 403 to a rate-limit message mentioning GITHUB_TOKEN', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getRepoInfo('a', 'b')).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it('rejects code search without GITHUB_TOKEN before making a network call (GitHub code search has no unauthenticated tier)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(search('code', 'foo', 5)).rejects.toThrow(/GITHUB_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows code search when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      items: [{ repository: { full_name: 'foo/bar' }, path: 'src/index.ts', html_url: 'https://github.com/foo/bar/blob/main/src/index.ts' }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await search('code', 'foo', 5);
    expect(results).toEqual([{ title: 'foo/bar: src/index.ts', url: 'https://github.com/foo/bar/blob/main/src/index.ts' }]);
  });
});
