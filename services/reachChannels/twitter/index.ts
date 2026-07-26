import type { TweetBackend, TweetResult } from './types';
import { syndicationCdnBackend } from './backends/syndicationCdn';
import { oembedBackend } from './backends/oembed';

const backends: TweetBackend[] = [syndicationCdnBackend, oembedBackend];

export interface TweetFetchResult {
  tweet: TweetResult;
  backendUsed: string;
}

/**
 * Tries each backend in order, falling back on throw. This is the most
 * fragile reach channel in the app — Twitter/X has actively restricted
 * third-party read access since 2023, and both backends are undocumented
 * or limited (oEmbed has no metrics/media). If both fail, the caller gets
 * a clean joined error, never an uncaught crash or a stale promise of
 * uptime this channel can't actually guarantee.
 */
export async function getTweet(tweetId: string): Promise<TweetFetchResult> {
  const failures: string[] = [];
  for (const backend of backends) {
    try {
      const tweet = await backend.fetch(tweetId);
      return { tweet, backendUsed: backend.name };
    } catch (e: any) {
      failures.push(`${backend.name}: ${e?.message || e}`);
    }
  }
  throw new Error(`All tweet backends failed — ${failures.join('; ')}`);
}

export { syndicationCdnBackend, oembedBackend };
