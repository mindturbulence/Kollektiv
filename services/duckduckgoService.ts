/**
 * DuckDuckGo search service (server-side).
 * Wraps @phukon/duckduckgo-search for use in the Express server.
 * Provides rate-limited, API-key-free web search.
 */

import { DDGS } from '@phukon/duckduckgo-search';

// ─── Rate limiting ────────────────────────────────────────────────────────────
// The DuckDuckGo HTML endpoint is fragile — stay well below 1 req/s.
const RATE_LIMIT_MS = 1_500; // 1.5s between requests
let lastSearchAt = 0;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastSearchAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastSearchAt = Date.now();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DuckDuckGoSearchParams {
  keywords: string;
  region?: string;
  safesearch?: 'on' | 'moderate' | 'off';
  timelimit?: 'd' | 'w' | 'm' | 'y' | null;
  maxResults?: number;
}

export interface DuckDuckGoSearchResult {
  title: string;
  href: string;
  description: string;
  body?: string;
}

/**
 * Search DuckDuckGo for the given keywords.
 * Returns an array of results with title, href, and description.
 * No API key needed — uses DuckDuckGo's public HTML/Lite endpoints.
 */
export async function searchDuckDuckGo(params: DuckDuckGoSearchParams): Promise<{
  results: DuckDuckGoSearchResult[];
  error?: string;
}> {
  await waitForRateLimit();

  const ddgs = new DDGS({
    timeout: 15_000,
    // Rotate User-Agent to avoid blocking
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  try {
    const raw = await ddgs.text({
      keywords: params.keywords,
      region: params.region || 'wt-wt',
      safesearch: params.safesearch || 'moderate',
      timelimit: params.timelimit ?? null,
      maxResults: params.maxResults ?? 10,
      backend: 'auto',
    });

    const results: DuckDuckGoSearchResult[] = (raw as any[] || []).map(r => ({
      title: r.title || '',
      href: r.href || r.url || '',
      description: r.description || r.body || '',
      body: r.body || '',
    }));

    return { results };
  } catch (err: any) {
    const message = err?.message || String(err);
    // Rate-limit or CAPTCHA
    if (message.includes('Ratelimit') || message.includes('captcha') || message.includes('202')) {
      return {
        results: [],
        error: 'DuckDuckGo is rate-limiting this request. Try a different query or wait a moment.',
      };
    }
    return { results: [], error: `DuckDuckGo search failed: ${message}` };
  }
}
