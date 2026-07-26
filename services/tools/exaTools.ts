import type { AssistantTool } from './types';
import type { WebResult } from '../../types';
import { appEventBus } from '../../utils/eventBus';

export const exaTools: AssistantTool[] = [
  {
    name: 'exa_search',
    description: 'Semantic (meaning-based, not keyword) web search via Exa, with filters web_search doesn\'t support: category, published-date range, domain include/exclude, and optional full-text retrieval. Needs an EXA_API_KEY configured server-side; use web_search instead if that\'s not set.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
        category: { type: 'string', description: 'Optional Exa category filter, e.g. "company", "research paper", "news", "pdf", "github", "tweet", "personal site".' },
        startPublishedDate: { type: 'string', description: 'ISO date; only include results published on/after this date.' },
        endPublishedDate: { type: 'string', description: 'ISO date; only include results published on/before this date.' },
        includeDomains: { type: 'array', items: { type: 'string' }, description: 'Restrict results to these domains.' },
        excludeDomains: { type: 'array', items: { type: 'string' }, description: 'Exclude results from these domains.' },
        numResults: { type: 'integer', description: 'Max results to return (default 5, max 25).' },
        getContents: { type: 'boolean', description: 'If true, also fetch full text content for each result (slower).' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      try {
        const res = await fetch('/api/reach/exa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return `Error: ${data?.error || 'Exa search failed'}`;

        const results = data.results || [];
        if (results.length > 0) {
          appEventBus.emit('webSearchResults', results.slice(0, 3).map((r: any): WebResult => ({
            title: r.title,
            url: r.url,
            markdown: r.text || '',
            source: 'fetch',
            engine: 'exa',
            published: r.publishedDate,
            author: r.author,
            timestamp: Date.now(),
          })));
        }
        return JSON.stringify(data);
      } catch (e: any) {
        return `Error: Exa search failed (${e?.message || e}).`;
      }
    },
  },
];
