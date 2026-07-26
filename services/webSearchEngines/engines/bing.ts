import { SearchEngine, WebSearchResult } from '../types';
import { JSDOM } from 'jsdom';

/** Resolve the search mode from env var (default: 'request'). */
function getSearchMode(): 'request' | 'auto' | 'playwright' {
  const mode = (process.env.SEARCH_MODE || 'request').toLowerCase();
  if (mode === 'auto') return 'auto';
  if (mode === 'playwright') return 'playwright';
  return 'request';
}

/**
 * Parse Bing's SERP HTML. Bing wraps results in <li class="b_algo"> elements.
 * Note: Bing's HTML endpoint often returns a JS shell with minimal markup,
 * so this parser may yield empty results for request-mode fetches.
 */
function parseResults(html: string, maxResults: number): WebSearchResult[] {
  const dom = new JSDOM(html);
  const items = Array.from(dom.window.document.querySelectorAll('li.b_algo'));
  const results: WebSearchResult[] = [];
  for (const item of items) {
    if (results.length >= maxResults) break;
    const link = item.querySelector('h2 a');
    const snippetEl = item.querySelector('.b_caption p, .b_lineclamp2');
    const href = link?.getAttribute('href');
    const title = link?.textContent?.trim();
    const snippet = snippetEl?.textContent?.trim() || '';
    if (href && title) {
      results.push({ title, url: href, snippet, source: 'bing' });
    }
  }
  return results;
}

/** Attempt a direct HTTP GET to Bing's search page. */
async function requestSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Bing returned ${res.status}`);
  const html = await res.text();
  return parseResults(html, maxResults);
}

/**
 * Use Playwright to navigate to Bing and extract fully-rendered results.
 * playwright-core is dynamically imported — it's already a transitive
 * dependency through @playwright/mcp.
 */
async function playwrightSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  let browser: any = null;
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    // Extract results via page.evaluate — the DOM is fully rendered.
    const results: WebSearchResult[] = await page.evaluate((max: number) => {
      const items = document.querySelectorAll('li.b_algo');
      const out: { title: string; url: string; snippet: string }[] = [];
      for (const item of items) {
        if (out.length >= max) break;
        const link = item.querySelector('h2 a');
        const snippetEl = item.querySelector('.b_caption p, .b_lineclamp2');
        const href = link?.getAttribute('href');
        const title = link?.textContent?.trim();
        const snippet = snippetEl?.textContent?.trim() || '';
        if (href && title) {
          out.push({ title, url: href, snippet });
        }
      }
      return out;
    }, maxResults);

    return results.map(r => ({ ...r, source: 'bing' }));
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

export const bingEngine: SearchEngine = {
  name: 'bing',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const mode = getSearchMode();

    // In playwright mode, skip the request attempt.
    if (mode === 'playwright') {
      return playwrightSearch(query, maxResults);
    }

    // In request mode, only try the HTTP fetch.
    if (mode === 'request') {
      return requestSearch(query, maxResults);
    }

    // In auto mode: try request first, fall back to Playwright.
    try {
      return await requestSearch(query, maxResults);
    } catch (requestErr) {
      // Request failed — try Playwright fallback.
      try {
        return await playwrightSearch(query, maxResults);
      } catch (pwErr: any) {
        // If Playwright also fails, throw the original request error
        // with a note that both paths failed.
        throw new Error(
          `Bing request failed (${requestErr instanceof Error ? requestErr.message : requestErr}); ` +
          `Playwright fallback also failed (${pwErr?.message || pwErr})`
        );
      }
    }
  },
};

export { parseResults as parseBingResults, requestSearch, playwrightSearch };
