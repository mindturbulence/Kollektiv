import type { TweetBackend, TweetResult } from '../types';
import { reachFetch } from '../../../reachHttp';

const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result';

/**
 * Computes the `token` query param the syndication CDN requires — the same
 * derivation used by the react-tweet (Vercel) library. Undocumented and
 * unversioned; if this endpoint starts rejecting valid tweet IDs, re-derive
 * this against a fresh capture before assuming the whole channel is dead.
 */
export function computeSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

/** Maps a tweet-result JSON payload into our narrow TweetResult shape. Exported for fixture testing. */
export function parseSyndicationResult(data: any): TweetResult {
  const user = data.user || {};
  const author = user.name && user.screen_name ? `${user.name} (@${user.screen_name})` : user.screen_name || 'unknown';
  const media: string[] = [];
  if (Array.isArray(data.photos)) media.push(...data.photos.map((p: any) => p.url).filter(Boolean));
  if (data.video?.variants?.length) {
    const best = data.video.variants.find((v: any) => v.type === 'video/mp4') || data.video.variants[0];
    if (best?.src) media.push(best.src);
  }
  return {
    text: data.text || '',
    author,
    url: `https://twitter.com/${user.screen_name || 'i'}/status/${data.id_str || ''}`,
    metrics: {
      likes: data.favorite_count ?? 0,
      retweets: data.retweet_count ?? 0,
      replies: data.conversation_count ?? 0,
    },
    media: media.length > 0 ? media : undefined,
  };
}

export const syndicationCdnBackend: TweetBackend = {
  name: 'syndicationCdn',
  async fetch(tweetId: string): Promise<TweetResult> {
    const token = computeSyndicationToken(tweetId);
    const res = await reachFetch(`${SYNDICATION_URL}?id=${encodeURIComponent(tweetId)}&lang=en&token=${token}`);
    if (!res.ok) throw new Error(`Syndication CDN returned ${res.status}`);
    const data = await res.json();
    if (!data || data.__typename === 'TweetTombstone') throw new Error('Tweet not found or unavailable (deleted, protected, or suspended).');
    return parseSyndicationResult(data);
  },
};
