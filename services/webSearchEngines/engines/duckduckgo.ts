import { JSDOM } from 'jsdom';
import { SearchEngine, WebSearchResult } from '../types';

function unwrapDuckDuckGoUrl(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

function parseResults(html: string, maxResults: number): WebSearchResult[] {
  const dom = new JSDOM(html);
  const anchors = Array.from(dom.window.document.querySelectorAll('a.result__a')) as HTMLAnchorElement[];
  const results: WebSearchResult[] = [];
  for (const a of anchors) {
    if (results.length >= maxResults) break;
    const row = a.closest('.result');
    if (row?.className.includes('result--ad')) continue;
    const href = a.getAttribute('href');
    const title = a.textContent?.trim();
    if (!href || !title) continue;
    const snippet = row?.querySelector('.result__snippet')?.textContent?.trim() || '';
    results.push({ title, url: unwrapDuckDuckGoUrl(href), snippet, source: 'duckduckgo' });
  }
  return results;
}

export const duckduckgoEngine: SearchEngine = {
  name: 'duckduckgo',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
    const html = await res.text();
    return parseResults(html, maxResults);
  },
};

// Export pure functions for unit-testing without network
export { parseResults as parseDuckDuckGoResults, unwrapDuckDuckGoUrl };
