// Registers engines into a Map<name, SearchEngine>. Orchestrator:
// 1. Resolves which engines to use (from options or env var DEFAULT_SEARCH_ENGINES)
// 2. Runs all selected engines in parallel via Promise.allSettled
// 3. Deduplicates results by URL (first source wins)
// 4. Caps total results to maxResults, interleaving from each engine
// 5. Returns SearchResponse with successes and tracked failures

import { SearchEngine, SearchOptions, SearchResponse, WebSearchResult, FetchedContent } from './types';
import { duckduckgoEngine } from './engines/duckduckgo';
import { braveEngine } from './engines/brave';
import { exaEngine } from './engines/exa';
import { bingEngine } from './engines/bing';
import { scrapeUrls } from '../webScraper';

const registry = new Map<string, SearchEngine>();

export function registerEngine(engine: SearchEngine): void {
  registry.set(engine.name, engine);
}

// Resolve which engines to use from options or defaults
function resolveEngines(options?: SearchOptions): SearchEngine[] {
  const allowedRaw = process.env.ALLOWED_SEARCH_ENGINES;
  const allowed = allowedRaw ? allowedRaw.split(',').map(s => s.trim()) : null;

  let names = options?.engines;
  if (!names || names.length === 0) {
    const defaultRaw = process.env.DEFAULT_SEARCH_ENGINES || 'duckduckgo,brave';
    names = defaultRaw.split(',').map(s => s.trim());
  }

  return names
    .filter(n => !allowed || allowed.includes(n))
    .map(n => registry.get(n))
    .filter((e): e is SearchEngine => e !== undefined);
}

export async function searchMulti(options: SearchOptions & { query: string }): Promise<SearchResponse> {
  const engines = resolveEngines(options);
  const maxResults = options.maxResults ?? 8;
  const maxPerEngine = options.maxPerEngine ?? 5;

  const settled = await Promise.allSettled(
    engines.map(e => e.search(options.query, maxPerEngine))
  );

  const results: WebSearchResult[] = [];
  const seenUrls = new Set<string>();
  const engineFailures: { engine: string; error: string }[] = [];
  const enginesUsed: string[] = [];

  // Collect results from all successful engines
  const engineResults: WebSearchResult[][] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      enginesUsed.push(engines[i].name);
      engineResults.push(r.value);
    } else {
      engineFailures.push({ engine: engines[i].name, error: r.reason?.message || String(r.reason) });
    }
  }

  // Round-robin interleave until maxResults is reached
  let idx = 0;
  let anyRemaining = true;
  while (results.length < maxResults && anyRemaining) {
    anyRemaining = false;
    for (const er of engineResults) {
      if (idx < er.length) {
        anyRemaining = true;
        const r = er[idx];
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          results.push(r);
          if (results.length >= maxResults) break;
        }
      }
    }
    idx++;
  }

  // Optionally fetch content for top results
  let fetchedContent: FetchedContent[] | undefined;
  if (options.fetchContent && results.length > 0) {
    const urls = results.slice(0, 3).map(r => r.url);
    fetchedContent = await scrapeUrls(urls, { maxUrls: 3, concurrency: 3 });
  }

  return {
    query: options.query,
    results,
    enginesUsed,
    engineFailures,
    fetchedContent,
  };
}

// Default engine registrations (idempotent — safe to call multiple times)
export function registerDefaultEngines(): void {
  registerEngine(duckduckgoEngine);
  registerEngine(braveEngine);
  registerEngine(exaEngine);
  // Bing engine is registered conditionally based on SEARCH_MODE env var.
  // Only include it when SEARCH_MODE is 'auto' or 'playwright', since
  // request-mode Bing (plain HTTP fetch) returns empty results for
  // JS-rendered SERPs and wastes a parallel slot in the orchestrator.
  const searchMode = (process.env.SEARCH_MODE || 'request').toLowerCase();
  if (searchMode === 'auto' || searchMode === 'playwright') {
    registerEngine(bingEngine);
  }
}

// Auto-register on import
registerDefaultEngines();
