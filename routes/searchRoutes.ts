import express from "express";
import { searchRateLimiter } from "../src/middleware/security";
import { validate } from "../src/middleware/validate";
import { WebSearchRequestSchema } from "../src/schemas/webSearch";
import { searchMulti } from "../services/webSearchEngines";
import { scrapeUrl, scrapeUrlPlaywright } from "../services/webScraper";

const router = express.Router();

// Multi-engine web search endpoint (free, no API key needed)
router.post("/api/web-search", searchRateLimiter, validate(WebSearchRequestSchema), async (req, res) => {
  const { query, engines, maxResults, fetchContent } = req.body as {
    query: string; engines?: string[]; maxResults?: number; fetchContent?: boolean;
  };
  try {
    const response = await searchMulti({
      query,
      engines,
      maxResults: maxResults ?? 8,
      fetchContent: fetchContent === true,
    });
    res.json(response);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Web search failed" });
  }
});

// Scrape a single URL and return clean Markdown content
router.post("/api/scrape-url", searchRateLimiter, async (req, res) => {
  const { url, mode } = req.body as { url: string; mode?: 'simple' | 'playwright' };
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" field' });
  }
  try {
    const result = mode === 'playwright'
      ? await scrapeUrlPlaywright(url)
      : await scrapeUrl(url);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Scraping failed" });
  }
});

// Scrape a URL using Playwright headless browser (for JS-rendered pages)
router.post("/api/scrape-url-playwright", searchRateLimiter, async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" field' });
  }
  try {
    const result = await scrapeUrlPlaywright(url);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Playwright scraping failed" });
  }
});

export default router;
