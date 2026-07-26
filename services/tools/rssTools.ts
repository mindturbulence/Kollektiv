import type { AssistantTool } from './types';
import type { WebResult } from '../../types';
import { appEventBus } from '../../utils/eventBus';

export const rssTools: AssistantTool[] = [
  {
    name: 'rss_fetch',
    description: 'Fetch and parse an RSS/Atom feed URL, returning the feed title and recent items (title, link, published date, snippet, author). Use when the user gives a feed URL or asks to check a blog/site\'s latest posts via RSS/Atom.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL of the RSS/Atom feed.' },
        maxItems: { type: 'integer', description: 'Maximum number of items to return (default 10, max 20).' },
      },
      required: ['url'],
    },
    execute: async ({ url, maxItems }) => {
      try {
        const res = await fetch('/api/reach/rss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: String(url), maxItems: maxItems ? Number(maxItems) : undefined }),
        });
        const data = await res.json();
        if (!res.ok) return `Error: ${data?.error || `RSS fetch failed (${res.status})`}`;

        const panelResults: WebResult[] = (data.items || []).slice(0, 3).map((item: any) => ({
          title: item.title || data.feedTitle,
          url: item.link || data.feedLink || url,
          markdown: item.contentSnippet || '',
          source: 'fetch',
          engine: 'rss',
          author: item.author,
          published: item.pubDate,
          site: data.feedTitle,
          timestamp: Date.now(),
        }));
        if (panelResults.length > 0) appEventBus.emit('webSearchResults', panelResults);

        return JSON.stringify(data);
      } catch (e: any) {
        return `Error fetching RSS feed: ${e?.message || e}`;
      }
    },
  },
];
