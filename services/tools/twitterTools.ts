import type { AssistantTool } from './types';
import type { WebResult } from '../../types';
import { appEventBus } from '../../utils/eventBus';

/** Accepts a bare tweet ID or a full status URL and returns just the ID. */
function extractTweetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/status\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

export const twitterTools: AssistantTool[] = [
  {
    name: 'twitter_get_tweet',
    description: 'Fetch the text, author, and (if available) metrics/media of a single tweet/X post by ID or URL. Uses public embed endpoints — no login/API key. This is the LEAST RELIABLE reach channel: Twitter/X actively restricts third-party access, so expect occasional failures; returns a clear error rather than crashing when that happens.',
    parameters: {
      type: 'object',
      properties: {
        tweetId: { type: 'string', description: 'Tweet/status ID, or a full twitter.com/x.com status URL.' },
      },
      required: ['tweetId'],
    },
    execute: async ({ tweetId }) => {
      try {
        const id = extractTweetId(String(tweetId));
        const res = await fetch('/api/reach/twitter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tweetId: id }),
        });
        const data = await res.json();
        if (!res.ok) {
          return `Error: could not fetch this tweet (Twitter/X restricts third-party access, so this can happen even for valid, public tweets). (${data?.error || 'unknown error'})`;
        }
        const tweet = data.tweet;
        appEventBus.emit('webSearchResults', [{
          title: `Tweet by ${tweet.author}`,
          url: tweet.url,
          markdown: tweet.text,
          source: 'fetch',
          engine: 'twitter',
          author: tweet.author,
          timestamp: Date.now(),
        } as WebResult]);
        return JSON.stringify(tweet);
      } catch (e: any) {
        return `Error: could not fetch this tweet (${e?.message || e}).`;
      }
    },
  },
];
