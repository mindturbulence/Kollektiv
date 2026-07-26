/** Shared HTTP helper for the reach-channel services (RSS, GitHub, Reddit, YouTube, Twitter). */

// Matches the browser UA convention already used in services/webSearchEngines/engines/*.ts —
// several reach targets (RSS CDNs, Reddit, etc.) 403 non-browser-looking UAs outright.
export const REACH_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * fetch() with a descriptive default User-Agent and a single retry-with-backoff
 * on 429 or network failure. Most reach targets (Reddit especially) 429
 * aggressively on a missing/generic UA, so this is applied unconditionally
 * rather than left to each caller to remember.
 */
export async function reachFetch(url: string, init: RequestInit = {}, retries = 1): Promise<Response> {
  const headers = { 'User-Agent': REACH_USER_AGENT, ...(init.headers as Record<string, string> || {}) };
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}
