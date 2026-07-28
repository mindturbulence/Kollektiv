import express from "express";
import { reachRateLimiter, twitterReachRateLimiter } from "../src/middleware/security";
import { validate } from "../src/middleware/validate";
import { RssRequestSchema, GithubRequestSchema, ExaSearchRequestSchema, RedditRequestSchema, YoutubeTranscriptRequestSchema, TwitterRequestSchema } from "../src/schemas/reach";
import { fetchFeed } from "../services/rssService";
import { getRepoInfo, search as githubSearch, getFile as getGithubFile } from "../services/githubService";
import { exaSearchRich } from "../services/exaService";
import { getListing as getRedditListing, getThread as getRedditThread, search as redditSearch } from "../services/redditService";
import { getTranscript } from "../services/reachChannels/youtube";
import { getTweet } from "../services/reachChannels/twitter";

const router = express.Router();

// Fetch and parse an RSS/Atom feed
router.post("/api/reach/rss", reachRateLimiter, validate(RssRequestSchema), async (req, res) => {
  const { url, maxItems } = req.body as { url: string; maxItems?: number };
  try {
    const result = await fetchFeed(url, maxItems ?? 10);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "RSS fetch failed" });
  }
});

// GitHub REST API — repo metadata, search (repos/code/issues), file/README content
router.post("/api/reach/github", reachRateLimiter, validate(GithubRequestSchema), async (req, res) => {
  const body = req.body as
    | { op: "repo_info"; owner: string; repo: string }
    | { op: "search"; type: "repos" | "code" | "issues"; query: string; maxResults?: number }
    | { op: "file"; owner: string; repo: string; path?: string; ref?: string };
  try {
    if (body.op === "repo_info") {
      res.json(await getRepoInfo(body.owner, body.repo));
    } else if (body.op === "search") {
      res.json(await githubSearch(body.type, body.query, body.maxResults ?? 10));
    } else {
      res.json(await getGithubFile(body.owner, body.repo, body.path, body.ref));
    }
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "GitHub request failed" });
  }
});

// Exa semantic search — richer filters than web_search's Exa engine (category, date range, domains, contents)
router.post("/api/reach/exa", reachRateLimiter, validate(ExaSearchRequestSchema), async (req, res) => {
  try {
    const result = await exaSearchRich(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Exa search failed" });
  }
});

// Reddit public JSON API — subreddit listing, thread + comments, or keyword search
router.post("/api/reach/reddit", reachRateLimiter, validate(RedditRequestSchema), async (req, res) => {
  const body = req.body as
    | { op: "listing"; subreddit: string; sort?: "hot" | "new" | "top"; limit?: number }
    | { op: "thread"; subreddit: string; postId: string }
    | { op: "search"; query: string; limit?: number };
  try {
    if (body.op === "listing") {
      res.json(await getRedditListing(body.subreddit, body.sort ?? "hot", body.limit ?? 10));
    } else if (body.op === "thread") {
      res.json(await getRedditThread(body.subreddit, body.postId));
    } else {
      res.json(await redditSearch(body.query, body.limit ?? 10));
    }
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Reddit request failed" });
  }
});

// YouTube transcript — ordered fallback (watch-page scrape, then InnerTube)
router.post("/api/reach/youtube-transcript", reachRateLimiter, validate(YoutubeTranscriptRequestSchema), async (req, res) => {
  const { videoId, lang } = req.body as { videoId: string; lang?: string };
  try {
    const result = await getTranscript(videoId, lang);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Transcript fetch failed" });
  }
});

// Twitter/X — ordered fallback (syndication CDN, then oEmbed). Stricter rate
// limiter: this is the reach dependency most likely to get this deployment's
// shared IP flagged if hammered.
router.post("/api/reach/twitter", twitterReachRateLimiter, validate(TwitterRequestSchema), async (req, res) => {
  const { tweetId } = req.body as { tweetId: string };
  try {
    const result = await getTweet(tweetId);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Tweet fetch failed" });
  }
});

export default router;
