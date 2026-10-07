/**
 * Web scraper service — fetches URLs, extracts readable content,
 * converts to Markdown. Supports both simple HTTP and Playwright
 * headless-browser modes.
 *
 * Used by:
 *  - web_search auto-fetch (Option B)
 *  - scrape_url / scrape_url_playwright tools
 */

import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import dns from "dns";
import { BlockedHostError, resolvePublicAddress, type LookupAll } from "../utils/captureUrlValidation";
import { startFilteringProxy, type FilteringProxy } from "./siteCapture";

const systemLookup: LookupAll = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** SSRF guard: http(s) only, no credentials, host must resolve only to public addresses. Throws otherwise. */
export async function assertPublicHttpUrl(raw: string, lookup: LookupAll = systemLookup): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs can be scraped");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  await resolvePublicAddress(url.hostname, lookup);
  return url;
}

const MAX_REDIRECTS = 5;

// ─── User-Agent rotation ─────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Types ───────────────────────────────────────────────────────────

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;         // Markdown
  textContent: string;      // Plain text (first 8000 chars)
  excerpt: string;          // ~200 char excerpt
  author?: string;
  published?: string;
  site?: string;
  image?: string;
  success: boolean;
  error?: string;
}

// ─── HTTP fetch with retry ──────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  retries = 2,
): Promise<{ html: string; finalUrl: string }> {
  let lastErr: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      // Redirects are followed by hand so every hop passes the SSRF guard.
      // ponytail: fetch re-resolves DNS after the check, so a rebinding host can still race it;
      // route through startFilteringProxy (needs an undici ProxyAgent) if that matters.
      let current = url;
      let response: Response;
      for (let hop = 0; ; hop++) {
        await assertPublicHttpUrl(current);
        response = await fetch(current, {
          signal: controller.signal,
          headers: {
            "User-Agent": randomUA(),
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          redirect: "manual",
        });
        const location = response.headers.get("location");
        if (response.status < 300 || response.status >= 400 || !location) break;
        if (hop >= MAX_REDIRECTS) throw new Error("Too many redirects");
        current = new URL(location, current).href;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return { html, finalUrl: current };
    } catch (err: any) {
      if (err instanceof BlockedHostError) throw err; // policy refusal: retrying cannot help
      lastErr = err;
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      }
    }
  }

  throw lastErr || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

// ─── Content extraction ─────────────────────────────────────────────

/** Exported for unit testing. */
export async function extractContent(
  html: string,
  sourceUrl: string,
): Promise<{
  content: string;
  textContent: string;
  excerpt: string;
  title: string;
  author?: string;
  published?: string;
  site?: string;
  image?: string;
}> {
  const dom = new JSDOM(html, { url: sourceUrl });
  const document = dom.window.document;

  const result = await Defuddle(document, sourceUrl, { markdown: true });

  const content = result.content || "";
  const textContent = content.replace(/\s+/g, " ").trim();
  const excerpt = textContent.slice(0, 200).trim();

  return {
    content,
    textContent: textContent.slice(0, 8000),
    excerpt,
    title: result.title || "",
    author: result.author || undefined,
    published: result.published || undefined,
    site: result.site || undefined,
    image: result.image || undefined,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Scrape a URL using HTTP fetch + JSDOM + Defuddle.
 * Returns clean Markdown content.
 */
export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  try {
    // Validate URL
    new URL(url);
  } catch {
    return { url, title: "", content: "", textContent: "", excerpt: "", success: false, error: "Invalid URL" };
  }

  try {
    const { html, finalUrl } = await fetchWithRetry(url);
    const { content, textContent, excerpt, title, author, published, site, image } = await extractContent(html, finalUrl);

    if (!content.trim()) {
      return {
        url: finalUrl,
        title,
        content: "",
        textContent,
        excerpt,
        success: true,
        error: "No readable content found on the page",
      };
    }

    return {
      url: finalUrl,
      title,
      content: content.slice(0, 50_000), // cap at 50k chars
      textContent: textContent.slice(0, 8000),
      excerpt,
      author,
      published,
      site,
      image,
      success: true,
    };
  } catch (err: any) {
    return {
      url,
      title: "",
      content: "",
      textContent: "",
      excerpt: "",
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Scrape a URL using Playwright headless browser (for JS-rendered pages).
 * Returns clean Markdown content.
 */
export async function scrapeUrlPlaywright(url: string): Promise<ScrapedContent> {
  try {
    new URL(url);
  } catch {
    return { url, title: "", content: "", textContent: "", excerpt: "", success: false, error: "Invalid URL" };
  }

  let proxy: FilteringProxy | undefined;
  try {
    await assertPublicHttpUrl(url);
    // Every request the page makes (redirects, sub-resources) goes through the SSRF-filtering proxy.
    proxy = await startFilteringProxy((hostname) => resolvePublicAddress(hostname, systemLookup));
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      headless: true,
      proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "<-loopback>" },
      args: ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    });
    try {
      const context = await browser.newContext({
        userAgent: randomUA(),
        locale: "en-US",
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const html = await page.content();
      const finalUrl = page.url();
      await browser.close();

      const { content, textContent, excerpt, title, author, published, site, image } = await extractContent(html, finalUrl);

      if (!content.trim()) {
        return {
          url: finalUrl,
          title,
          content: "",
          textContent,
          excerpt,
          success: true,
          error: "No readable content found on the page",
        };
      }

      return {
        url: finalUrl,
        title,
        content: content.slice(0, 50_000),
        textContent: textContent.slice(0, 8000),
        excerpt,
        author,
        published,
        site,
        image,
        success: true,
      };
    } finally {
      // Ensure browser is always closed
      try { await browser.close(); } catch { /* ignore */ }
    }
  } catch (err: any) {
    return {
      url,
      title: "",
      content: "",
      textContent: "",
      excerpt: "",
      success: false,
      error: err?.message || String(err),
    };
  } finally {
    await proxy?.close();
  }
}

/**
 * Scrape multiple URLs concurrently with a configurable concurrency limit.
 */
export async function scrapeUrls(
  urls: string[],
  options?: { concurrency?: number; maxUrls?: number },
): Promise<ScrapedContent[]> {
  const maxUrls = options?.maxUrls ?? 5;
  const concurrency = options?.concurrency ?? 3;
  const targets = urls.slice(0, maxUrls);
  const results: ScrapedContent[] = [];

  // Process in batches
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((u) => scrapeUrl(u).catch((e) => ({
        url: u,
        title: "",
        content: "",
        textContent: "",
        excerpt: "",
        success: false,
        error: e?.message || String(e),
      }))),
    );
    results.push(...batchResults);
  }

  return results;
}
