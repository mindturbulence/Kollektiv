export interface TweetResult {
  text: string;
  author: string;
  url: string;
  metrics?: Record<string, number>;
  media?: string[];
}

/** One backend for fetching a single tweet, tried in order until one succeeds. */
export interface TweetBackend {
  readonly name: string;
  fetch(tweetId: string): Promise<TweetResult>;
}
