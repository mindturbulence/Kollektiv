import type { AssistantTool } from './types';
import type { WebResult } from '../../types';
import { appEventBus } from '../../utils/eventBus';

export const redditTools: AssistantTool[] = [
  {
    name: 'reddit_fetch',
    description: 'Fetch data from Reddit\'s public JSON API (no login required): a subreddit listing, a specific post thread with top comments, or a keyword search across Reddit. Use `op` to pick which.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['listing', 'thread', 'search'], description: '"listing" (subreddit posts), "thread" (a post + comments), or "search" (keyword search across Reddit).' },
        subreddit: { type: 'string', description: 'Subreddit name without "r/", required for listing and thread.' },
        sort: { type: 'string', enum: ['hot', 'new', 'top'], description: 'Listing sort order (default hot).' },
        postId: { type: 'string', description: 'Post ID, required for thread.' },
        query: { type: 'string', description: 'Search query, required for search.' },
        limit: { type: 'integer', description: 'Max results (default 10, max 25).' },
      },
      required: ['op'],
    },
    execute: async (args) => {
      try {
        const res = await fetch('/api/reach/reddit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return `Error: ${data?.error || 'Reddit request failed'}`;

        if (args.op === 'thread' && data.post) {
          appEventBus.emit('webSearchResults', [{
            title: data.post.title,
            url: data.post.permalink,
            markdown: data.post.selftext || `(link post) ${data.post.url}`,
            source: 'fetch',
            engine: 'reddit',
            author: data.post.author,
            timestamp: Date.now(),
          } as WebResult]);
        } else if (Array.isArray(data) && data.length > 0) {
          appEventBus.emit('webSearchResults', data.slice(0, 3).map((p: any): WebResult => ({
            title: p.title, url: p.permalink, markdown: p.selftext || '', source: 'fetch', engine: 'reddit', author: p.author, timestamp: Date.now(),
          })));
        }
        return JSON.stringify(data);
      } catch (e: any) {
        return `Error fetching from Reddit: ${e?.message || e}`;
      }
    },
  },
];
