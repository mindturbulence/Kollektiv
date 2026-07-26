import Parser from 'rss-parser';
import { isDisallowedAddress } from '../utils/proxyTargetValidation';
import { REACH_USER_AGENT } from './reachHttp';

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  contentSnippet?: string;
  author?: string;
}

export interface RssFeedResult {
  feedTitle: string;
  feedLink?: string;
  items: RssItem[];
}

const parser = new Parser({ headers: { 'User-Agent': REACH_USER_AGENT } });

/** Fetches and parses an RSS/Atom feed. Rejects private/loopback URLs (SSRF guard). */
export async function fetchFeed(url: string, maxItems = 10): Promise<RssFeedResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid feed URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) feed URLs are supported.');
  }
  if (isDisallowedAddress(parsed.hostname)) {
    throw new Error('This feed URL points at a private, loopback, or link-local address and was blocked.');
  }

  const feed = await parser.parseURL(url);
  const items: RssItem[] = (feed.items || []).slice(0, maxItems).map((item) => ({
    title: item.title || '(untitled)',
    link: item.link || '',
    pubDate: item.pubDate,
    contentSnippet: item.contentSnippet,
    author: item.creator || item.author,
  }));

  return {
    feedTitle: feed.title || parsed.hostname,
    feedLink: feed.link,
    items,
  };
}
