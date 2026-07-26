import { describe, it, expect, vi, afterEach } from 'vitest';
import { exaSearchRich, exaSearchSimple } from './exaService';

function jsonResponse(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('exaService', () => {
  const originalKey = process.env.EXA_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = originalKey;
  });

  it('exaSearchRich throws when EXA_API_KEY is unset', async () => {
    delete process.env.EXA_API_KEY;
    await expect(exaSearchRich({ query: 'test' })).rejects.toThrow('EXA_API_KEY not configured');
  });

  it('exaSearchSimple throws when EXA_API_KEY is unset (preserves engine contract)', async () => {
    delete process.env.EXA_API_KEY;
    await expect(exaSearchSimple('test')).rejects.toThrow('EXA_API_KEY not configured');
  });

  it('exaSearchRich builds a request body with rich params', async () => {
    process.env.EXA_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await exaSearchRich({
      query: 'agent frameworks',
      category: 'github',
      startPublishedDate: '2026-01-01',
      includeDomains: ['github.com'],
      numResults: 10,
      getContents: true,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.exa.ai/search');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      query: 'agent frameworks',
      category: 'github',
      startPublishedDate: '2026-01-01',
      includeDomains: ['github.com'],
      numResults: 10,
      contents: { text: true },
    });
  });

  it('exaSearchSimple maps rich results to the narrow SearchEngine shape', async () => {
    process.env.EXA_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      results: [{ title: 'Vitest', url: 'https://vitest.dev', text: 'A Vite-native testing framework.' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await exaSearchSimple('vitest', 3);
    expect(results).toEqual([{ title: 'Vitest', url: 'https://vitest.dev', snippet: 'A Vite-native testing framework.', source: 'exa' }]);
  });

  it('surfaces non-ok responses as a clear error', async () => {
    process.env.EXA_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { message: 'boom' })));
    await expect(exaSearchRich({ query: 'x' })).rejects.toThrow(/Exa returned 500/);
  });
});
