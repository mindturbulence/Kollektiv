import type { TweetBackend, TweetResult } from '../types';
import { reachFetch } from '../../../reachHttp';

const OEMBED_URL = 'https://publish.twitter.com/oembed';

/** Strips the oEmbed `html` blockquote down to plain text. Exported for fixture testing. */
export function stripOembedHtml(html: string): string {
  return html
    .replace(/<a[^>]*>.*?<\/a>/g, '') // drop trailing "— Author (@handle) date" link
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOembedResult(data: any, tweetId: string): TweetResult {
  return {
    text: stripOembedHtml(data.html || ''),
    author: data.author_name || 'unknown',
    url: data.url || `https://twitter.com/i/status/${tweetId}`,
    // oEmbed carries no engagement metrics or media — only the primary
    // syndication backend can provide those.
  };
}

export const oembedBackend: TweetBackend = {
  name: 'oembed',
  async fetch(tweetId: string): Promise<TweetResult> {
    const res = await reachFetch(`${OEMBED_URL}?url=${encodeURIComponent(`https://twitter.com/i/status/${tweetId}`)}`);
    if (!res.ok) throw new Error(`oEmbed returned ${res.status}`);
    const data = await res.json();
    return parseOembedResult(data, tweetId);
  },
};
