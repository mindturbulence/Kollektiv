/**
 * Exa (exa.ai) semantic search client. Two entry points:
 * - `exaSearchSimple` — narrow signature matching `SearchEngine.search(query, maxResults)`
 *   from `services/webSearchEngines/types.ts`, used by the `exa` engine inside `web_search`.
 *   Throws when EXA_API_KEY is unset — that contract is relied on by
 *   `services/webSearchEngines/engines/exa.test.ts` and the orchestrator's
 *   Promise.allSettled, and must not change.
 * - `exaSearchRich` — the full-featured client backing the standalone `exa_search`
 *   assistant tool (category/date/domain filters, optional full content).
 */

const EXA_API_URL = 'https://api.exa.ai/search';

export interface ExaSearchParams {
  query: string;
  category?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  numResults?: number;
  getContents?: boolean;
}

export interface ExaRichResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
}

export interface ExaSearchResponse {
  results: ExaRichResult[];
}

export async function exaSearchRich(params: ExaSearchParams): Promise<ExaSearchResponse> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error('EXA_API_KEY not configured — Exa search unavailable');
  }

  const body: Record<string, any> = {
    query: params.query,
    numResults: params.numResults ?? 5,
    useAutoprompt: true,
  };
  if (params.category) body.category = params.category;
  if (params.startPublishedDate) body.startPublishedDate = params.startPublishedDate;
  if (params.endPublishedDate) body.endPublishedDate = params.endPublishedDate;
  if (params.includeDomains?.length) body.includeDomains = params.includeDomains;
  if (params.excludeDomains?.length) body.excludeDomains = params.excludeDomains;
  if (params.getContents) body.contents = { text: true };

  const res = await fetch(EXA_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Exa returned ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    results: (data.results || []).map((r: any) => ({
      title: r.title || '(no title)',
      url: r.url,
      publishedDate: r.publishedDate,
      author: r.author,
      text: r.text,
    })),
  };
}

/** Narrow signature matching `SearchEngine.search(query, maxResults)`. Throws with no key — preserve this. */
export async function exaSearchSimple(query: string, maxResults = 5): Promise<{ title: string; url: string; snippet: string; source: string }[]> {
  const { results } = await exaSearchRich({ query, numResults: maxResults });
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.text?.slice(0, 300) || '',
    source: 'exa',
  }));
}
