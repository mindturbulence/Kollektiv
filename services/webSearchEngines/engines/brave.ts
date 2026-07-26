import { JSDOM } from 'jsdom';
import { SearchEngine, WebSearchResult } from '../types';

function parseResults(html: string, maxResults: number): WebSearchResult[] {
  const dom = new JSDOM(html);
  // Brave uses a data-view-id pattern: mainline results have
  // data-view-id="mainline_result_N" and a class="snippet" for the description.
  const items = Array.from(dom.window.document.querySelectorAll('[data-view-id^="mainline_result_"]')) as HTMLElement[];
  const results: WebSearchResult[] = [];
  for (const item of items) {
    if (results.length >= maxResults) break;
    const link = item.querySelector('a[href]');
    const titleEl = item.querySelector('.title, .heading, h2, h3');
    const snippetEl = item.querySelector('.snippet, .description, p.snippet');
    const href = link?.getAttribute('href');
    const title = titleEl?.textContent?.trim();
    const snippet = snippetEl?.textContent?.trim() || '';
    if (href && title && href.startsWith('http')) {
      results.push({ title, url: href, snippet, source: 'brave' });
    }
  }
  return results;
}

export const braveEngine: SearchEngine = {
  name: 'brave',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const res = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`Brave returned ${res.status}`);
    const html = await res.text();
    return parseResults(html, maxResults);
  },
};

export { parseResults as parseBraveResults };
