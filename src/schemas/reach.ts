import { z } from 'zod';

// RSS/Atom feed fetch — arbitrary caller-supplied URL, same risk class as scrape_url.
export const RssRequestSchema = z.object({
  url: z.string().url(),
  maxItems: z.number().int().min(1).max(20).optional(),
});

export const GithubRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('repo_info'), owner: z.string().min(1), repo: z.string().min(1) }),
  z.object({
    op: z.literal('search'),
    type: z.enum(['repos', 'code', 'issues']),
    query: z.string().min(1).max(256),
    maxResults: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    op: z.literal('file'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    path: z.string().min(1).optional(),
    ref: z.string().optional(),
  }),
]);

export const RedditRequestSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('listing'),
    subreddit: z.string().min(1),
    sort: z.enum(['hot', 'new', 'top']).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  z.object({ op: z.literal('thread'), subreddit: z.string().min(1), postId: z.string().min(1) }),
  z.object({
    op: z.literal('search'),
    query: z.string().min(1).max(256),
    limit: z.number().int().min(1).max(25).optional(),
  }),
]);

export const YoutubeTranscriptRequestSchema = z.object({
  videoId: z.string().min(1).max(200),
  lang: z.string().min(2).max(10).optional(),
});

export const TwitterRequestSchema = z.object({
  tweetId: z.string().min(1).max(200),
});

export const ExaSearchRequestSchema = z.object({
  query: z.string().min(1).max(400),
  category: z.string().optional(),
  startPublishedDate: z.string().optional(),
  endPublishedDate: z.string().optional(),
  includeDomains: z.array(z.string()).max(10).optional(),
  excludeDomains: z.array(z.string()).max(10).optional(),
  numResults: z.number().int().min(1).max(25).optional(),
  getContents: z.boolean().optional(),
});
