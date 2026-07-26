import { reachFetch } from './reachHttp';

const REDDIT_UA = () => process.env.REDDIT_USER_AGENT || 'kollektiv-reach/1.0 (by /u/kollektiv-app)';

async function redditGet(url: string): Promise<any> {
  const res = await reachFetch(url, { headers: { 'User-Agent': REDDIT_UA() } });
  if (res.status === 429 || res.status === 403) {
    throw new Error('Reddit rate-limited or blocked this request — try again later.');
  }
  if (!res.ok) throw new Error(`Reddit returned ${res.status}`);
  return res.json();
}

export interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  author: string;
  score: number;
  numComments: number;
  selftext?: string;
  subreddit: string;
}

function mapPost(data: any): RedditPost {
  return {
    title: data.title,
    url: data.url,
    permalink: `https://www.reddit.com${data.permalink}`,
    author: data.author,
    score: data.score,
    numComments: data.num_comments,
    selftext: data.selftext,
    subreddit: data.subreddit,
  };
}

function mapListing(json: any): RedditPost[] {
  const children = json?.data?.children || [];
  return children.map((c: any) => mapPost(c.data));
}

export async function getListing(subreddit: string, sort: 'hot' | 'new' | 'top' = 'hot', limit = 10): Promise<RedditPost[]> {
  const json = await redditGet(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?limit=${Math.min(Math.max(1, limit), 25)}`);
  return mapListing(json);
}

export interface RedditComment {
  author: string;
  body: string;
  score: number;
}

export interface RedditThread {
  post: RedditPost;
  comments: RedditComment[];
}

export async function getThread(subreddit: string, postId: string): Promise<RedditThread> {
  const json = await redditGet(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(postId)}.json`);
  const [postListing, commentListing] = Array.isArray(json) ? json : [null, null];
  const postData = postListing?.data?.children?.[0]?.data;
  if (!postData) throw new Error('Reddit thread not found.');
  const comments: RedditComment[] = (commentListing?.data?.children || [])
    .filter((c: any) => c.kind === 't1')
    .map((c: any) => ({ author: c.data.author, body: c.data.body, score: c.data.score }));
  return { post: mapPost(postData), comments };
}

export async function search(query: string, limit = 10): Promise<RedditPost[]> {
  const json = await redditGet(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(Math.max(1, limit), 25)}`);
  return mapListing(json);
}
