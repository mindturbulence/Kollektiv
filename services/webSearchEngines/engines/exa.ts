import { SearchEngine, WebSearchResult } from '../types';

interface ExaResultItem {
  title: string;
  url: string;
  snippet?: string;
}

interface ExaResponse {
  results: ExaResultItem[];
}

export const exaEngine: SearchEngine = {
  name: 'exa',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw new Error('EXA_API_KEY not configured — Exa engine unavailable');
    }
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        useAutoprompt: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Exa returned ${res.status}: ${body.slice(0, 200)}`);
    }
    const data: ExaResponse = await res.json();
    return (data.results || []).map(r => ({
      title: r.title || '(no title)',
      url: r.url,
      snippet: r.snippet || '',
      source: 'exa',
    }));
  },
};
