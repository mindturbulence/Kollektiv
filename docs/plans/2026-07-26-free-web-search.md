# Free Multi-Engine Web Search (Default Tool) Implementation Plan

> ✅ **Completed.** All 4 tasks (DuckDuckGo engine, Brave/Exa engines, `/api/web-search` route, `web_search` tool rewrite) are implemented. Bing engine with Playwright fallback also implemented (beyond initial scope). See `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md` § Assistant Tool Catalog (Web tools) and `services/webSearchEngines/` for the current implementation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the assistant's `web_search` tool work by default with no API key, by scraping **multiple search engines** server-side (inspired by the [open-websearch](https://github.com/aas-ee/open-websearch) architecture), and only fall back to the existing Gemini-grounded search when the free path comes back empty and a Gemini key happens to be configured.

**Architecture:** A new directory `services/webSearchEngines/` implements a modular engine registry, where each supported search engine lives in its own file with a uniform `Engine` interface. The orchestrator runs requested engines in parallel, deduplicates by URL, and returns a merged result set. A new Express route (`POST /api/web-search` in `server.ts`) wraps the orchestrator behind request validation and a rate limiter. The assistant's `web_search` tool (`services/assistantTools.ts`) calls that same-origin route first (no CSP change needed — `connect-src 'self'` already covers it), and only reaches for `googleSearchGemini` if the free path returns zero results or throws.

**Tech Stack:** Node/Express (`server.ts`), `jsdom` (already in `devDependencies`), `zod` (existing validation pattern), `vitest` (existing test runner).

## Supported Engines (Initial & Planned)

| Engine     | HTTP Scrape? | Playwright Fallback? | Notes |
|-----------|-------------|---------------------|-------|
| DuckDuckGo | ✅ Yes      | ❌ N/A              | `html.duckduckgo.com/html/` — no-JS HTML endpoint works cleanly. |
| Brave      | ✅ Yes      | ❌ N/A              | `search.brave.com/search` — returns static HTML with results. |
| Exa        | ✅ Yes      | ❌ N/A              | `api.exa.ai/search` — needs free API key (has generous free tier). |
| Bing       | ❌ No       | ⏳ Planned          | `bing.com/search` returns JS-shell only; needs Playwright browser. |
| Baidu      | ❌ No       | ⏳ Planned          | Requires browser rendering and cookie management. |
| Startpage  | ⏳ TBD      | ⏳ TBD              | Static HTML endpoint to verify. |
| Sogou      | ⏳ TBD      | ⏳ TBD              | Needs investigation. |

**Initial scope:** DuckDuckGo (proven), Brave (verified scrapeable), Exa (free-tier API). These three provide wide coverage — US/Western (Brave), privacy-focused (DDG), and semantic/embedding-based (Exa). Bing and Baidu are documented as `ponytail:` upgrade paths when a Playwright-backed execution engine (already available via `kollektivMcp.ts`) is wired in.

## Global Constraints

- **New npm dependency:** `services/webSearchEngines/engines/brave.ts` uses `jsdom` which is already in `devDependencies` — Task 1 moves it to `dependencies`. Exa engine in Task 2 may add no new dependency (plain `fetch` against its REST API). Do **not** add `cheerio` or `@mozilla/readability` — `jsdom` suffices for SERP DOM parsing.
- Scraping search engine HTML endpoints directly (bypassing bot-facing restrictions) is the same trade-off the currently-failing tool already makes — not a new risk this plan introduces, just carried over consciously rather than silently.
- Do not add scraping targets to `DEFAULT_PROXY_ALLOWED_HOSTS` (`utils/proxyTargetValidation.ts`) or route this through `/proxy-remote` — that allowlist exists specifically to bound SSRF blast radius from model-controlled `x-target-url` values, and a generic search-engine passthrough would widen it for every other proxy-remote caller. The new route fetches only hardcoded engine URLs, authored server-side, never a caller-supplied host.
- Keep the tool name `web_search` unchanged — `services/intentRouter.ts:93,192,196` and `services/planner.ts:282` reference it by that exact string as a capability id.
- **Engine selection strategy:** When no explicit `engines` parameter is passed, the orchestrator defaults to a curated list of engines that work without API keys or browser fallback (initially DuckDuckGo + Brave). If an engine throws (network error, rate limit, parse failure), the orchestrator catches per-engine errors gracefully and continues with results from the remaining engines — one failing engine never sinks the whole search.
- **Rate limiting per engine partner:** The 60-req/15min limiter on the route is a global cap for the whole server, not per target engine. Individual engines (notably DuckDuckGo's HTML endpoint) may impose their own implicit rate limits. If an engine returns 4xx, the orchestrator skips it for that request and notes the failure. Future tuning may add per-engine cooldowns.
- **Exa API key:** Unlike the other engines (which are free-to-scrape), Exa's API requires a free-tier API key. If `EXA_API_KEY` is not set, the Exa engine is skipped at runtime. This is documented in the engine's implementation and in the configuration section below.
- **Environment variable configuration** (matching the open-websearch pattern):
  - `DEFAULT_SEARCH_ENGINES` — comma-separated list of engine names to use when no explicit selection is given (default: `duckduckgo,brave`)
  - `EXA_API_KEY` — API key for Exa (optional; Exa engine is skipped when absent)
  - `ALLOWED_SEARCH_ENGINES` — if set, restricts which engines can be activated at runtime

## File Structure

```
services/
  webSearchEngines/
    index.ts                  — orchestrator: parallel execution, dedup, merging
    types.ts                  — shared interfaces & the Engine interface
    engines/
      duckduckgo.ts           — DuckDuckGo HTML scraper
      duckduckgo.test.ts      — unit tests against static DDG fixture
      brave.ts                — Brave search scraper
      brave.test.ts           — unit tests against static Brave fixture
      exa.ts                  — Exa API client (optional, needs EXA_API_KEY)
      exa.test.ts             — unit tests for Exa client
src/
  schemas/
    webSearch.ts              — zod request schema
  middleware/
    security.ts               — + searchRateLimiter
server.ts                      — + POST /api/web-search route
services/assistantTools.ts     — + multi-engine tool wiring
docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md  — + updated docs
```

---

### Task 1: Core engine interface, DuckDuckGo engine, and orchestrator

**Files:**
- Create: `services/webSearchEngines/types.ts`
- Create: `services/webSearchEngines/index.ts`
- Create: `services/webSearchEngines/engines/duckduckgo.ts`
- Create: `services/webSearchEngines/engines/duckduckgo.test.ts`

**Interfaces (in `services/webSearchEngines/types.ts`):**

```ts
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Engine source identifier, e.g. "duckduckgo", "brave", "exa" */
  source: string;
}

/** Every search engine module implements this interface. */
export interface SearchEngine {
  readonly name: string;
  search(query: string, maxResults?: number): Promise<WebSearchResult[]>;
}

export interface SearchOptions {
  engines?: string[];        // engine names to use; defaults to env DEFAULT_SEARCH_ENGINES
  maxResults?: number;        // total max results across all engines (default 8)
  maxPerEngine?: number;      // max per engine before merging (default 5)
}

export interface SearchResponse {
  query: string;
  results: WebSearchResult[];
  enginesUsed: string[];
  engineFailures: { engine: string; error: string }[];
}
```

**Orchestrator (`services/webSearchEngines/index.ts`):**

```ts
// Registers engines into a Map<name, SearchEngine>. Orchestrator:
// 1. Resolves which engines to use (from options or env var DEFAULT_SEARCH_ENGINES)
// 2. Runs all selected engines in parallel via Promise.allSettled
// 3. Deduplicates results by URL (first source wins)
// 4. Caps total results to maxResults, interleaving from each engine
// 5. Returns SearchResponse with successes and tracked failures

import { SearchEngine, SearchOptions, SearchResponse } from './types';

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

  // Interleave results from all successful engines
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

  return {
    query: options.query,
    results,
    enginesUsed,
    engineFailures,
  };
}
```

**DuckDuckGo engine (`services/webSearchEngines/engines/duckduckgo.ts`):**

```ts
import { JSDOM } from 'jsdom';
import { SearchEngine, WebSearchResult } from '../types';

function unwrapDuckDuckGoUrl(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    return url.searchParams.get('uddg') || href;
  } catch {
    return href;
  }
}

function parseResults(html: string, maxResults: number): WebSearchResult[] {
  const dom = new JSDOM(html);
  const anchors = Array.from(dom.window.document.querySelectorAll('a.result__a'));
  const results: WebSearchResult[] = [];
  for (const a of anchors) {
    if (results.length >= maxResults) break;
    const row = a.closest('.result');
    if (row?.className.includes('result--ad')) continue;
    const href = a.getAttribute('href');
    const title = a.textContent?.trim();
    if (!href || !title) continue;
    const snippet = row?.querySelector('.result__snippet')?.textContent?.trim() || '';
    results.push({ title, url: unwrapDuckDuckGoUrl(href), snippet, source: 'duckduckgo' });
  }
  return results;
}

export const duckduckgoEngine: SearchEngine = {
  name: 'duckduckgo',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
    const html = await res.text();
    return parseResults(html, maxResults);
  },
};

// Export pure functions for unit-testing without network
export { parseResults as parseDuckDuckGoResults, unwrapDuckDuckGoUrl };
```

**Test (`services/webSearchEngines/engines/duckduckgo.test.ts`):**

```ts
import { describe, it, expect } from 'vitest';
import { parseDuckDuckGoResults, unwrapDuckDuckGoUrl } from './duckduckgo';

const FIXTURE_HTML = `
<div class="result results_links results_links_deep result--ad  ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com%2F&rut=abc">Sponsored Result</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com%2F&rut=abc">An ad snippet.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvitest.dev%2F&rut=xyz">Vitest | Next Generation testing framework</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvitest.dev%2F&rut=xyz"><b>Vitest</b> was created to make testing just work for Vite apps.</a>
  </div>
</div>
`;

describe('parseDuckDuckGoResults', () => {
  it('extracts title, url, snippet, and source from organic results', () => {
    const results = parseDuckDuckGoResults(FIXTURE_HTML, 8);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Vitest | Next Generation testing framework',
      url: 'https://vitest.dev/',
      snippet: 'Vitest was created to make testing just work for Vite apps.',
      source: 'duckduckgo',
    });
  });

  it('skips sponsored (result--ad) rows', () => {
    const results = parseDuckDuckGoResults(FIXTURE_HTML, 8);
    expect(results.some(r => r.url.includes('ads.example.com'))).toBe(false);
  });

  it('respects maxResults', () => {
    expect(parseDuckDuckGoResults(FIXTURE_HTML, 0)).toHaveLength(0);
  });
});

describe('unwrapDuckDuckGoUrl', () => {
  it('decodes the uddg-wrapped redirect param', () => {
    expect(unwrapDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fvitest.dev%2F&rut=x')).toBe('https://vitest.dev/');
  });

  it('returns the raw href when there is no uddg param', () => {
    expect(unwrapDuckDuckGoUrl('/some/internal/path')).toBe('/some/internal/path');
  });
});
```

- [ ] **Step 1: Create `services/webSearchEngines/types.ts`** with the interfaces above.
- [ ] **Step 2: Create `services/webSearchEngines/engines/duckduckgo.ts`** with the engine + pure exports.
- [ ] **Step 3: Create `services/webSearchEngines/engines/duckduckgo.test.ts`** with the failing test.
- [ ] **Step 4: Run tests to verify DuckDuckGo parsing works**: `npx vitest run services/webSearchEngines/engines/duckduckgo.test.ts` — Expected: PASS (4 tests).
- [ ] **Step 5: Create `services/webSearchEngines/index.ts`** with the orchestrator, engine registry, and `searchMulti`.
- [ ] **Step 6: Move `jsdom` from devDependencies to dependencies** in package.json (same as the original plan).
- [ ] **Step 7: Commit**

```bash
git add services/webSearchEngines/ package.json pnpm-lock.yaml
git commit -m "feat(search): add modular multi-engine search framework with DuckDuckGo engine"
```

---

### Task 2: Brave and Exa engines

**Files:**
- Create: `services/webSearchEngines/engines/brave.ts`
- Create: `services/webSearchEngines/engines/brave.test.ts`
- Create: `services/webSearchEngines/engines/exa.ts`
- Create: `services/webSearchEngines/engines/exa.test.ts`
- Modify: `services/webSearchEngines/index.ts` — register new engines

- [ ] **Step 1: Brave engine (`services/webSearchEngines/engines/brave.ts`)**

Brave Search returns static HTML at `https://search.brave.com/search?q=...` with a modern UA. Results live in a structured DOM that's easier to parse than DuckDuckGo's — no sponsored-filtering needed for the initial implementation (the `source` field lets consumers filter).

```ts
import { JSDOM } from 'jsdom';
import { SearchEngine, WebSearchResult } from '../types';

function parseResults(html: string, maxResults: number): WebSearchResult[] {
  const dom = new JSDOM(html);
  // Brave uses a data-view-id pattern: mainline results have
  // data-view-id="mainline_result_N" and a class="snippet" for the description.
  const items = Array.from(dom.window.document.querySelectorAll('[data-view-id^="mainline_result_"]'));
  const results: WebSearchResult[] = [];
  for (const item of items) {
    if (results.length >= maxResults) break;
    const link = item.querySelector('a[href]');
    const titleEl = item.querySelector('.title, .heading, h2, h3');
    const snippetEl = item.querySelector('.snippet, .description, p.snippet');
    const href = link?.getAttribute('href');
    const title = titleEl?.textContent?.trim();
    const snippet = snippetEl?.textContent?.trim() || '';
    if (href && title && href.startsWith('http')) {
      results.push({ title, url: href, snippet, source: 'brave' });
    }
  }
  return results;
}

export const braveEngine: SearchEngine = {
  name: 'brave',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const res = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`Brave returned ${res.status}`);
    const html = await res.text();
    return parseResults(html, maxResults);
  },
};

export { parseResults as parseBraveResults };
```

- [ ] **Step 2: Brave test (`services/webSearchEngines/engines/brave.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { parseBraveResults } from './brave';

// Captured from a real Brave search result snippet structure.
const FIXTURE_HTML = `
<div data-view-id="mainline_result_0">
  <a href="https://vitest.dev/" class="result-header">
    <span class="title">Vitest | Next Generation Testing Framework</span>
  </a>
  <p class="snippet">A Vite-native testing framework. It's fast.</p>
</div>
<div data-view-id="mainline_result_1">
  <a href="https://example.com/other" class="result-header">
    <span class="title">Other Result</span>
  </a>
  <p class="snippet">Another snippet here.</p>
</div>
`;

describe('parseBraveResults', () => {
  it('extracts title, url, snippet, and source from results', () => {
    const results = parseBraveResults(FIXTURE_HTML, 8);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Vitest | Next Generation Testing Framework',
      url: 'https://vitest.dev/',
      snippet: 'A Vite-native testing framework. It\'s fast.',
      source: 'brave',
    });
  });

  it('respects maxResults', () => {
    expect(parseBraveResults(FIXTURE_HTML, 1)).toHaveLength(1);
  });

  it('skips entries without http links', () => {
    const html = '<div data-view-id="mainline_result_0"><a href="/relative"><span class="title">Relative</span></a></div>';
    expect(parseBraveResults(html, 8)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Exa engine (`services/webSearchEngines/engines/exa.ts`)**

Exa (formerly Metaphor) provides a Python-like search API over embeddings. It has a free tier (1,000 queries/month) and returns clean JSON — no scraping needed. The engine is conditional on `EXA_API_KEY` being set.

```ts
import { SearchEngine, WebSearchResult } from '../types';

interface ExaResultItem {
  title: string;
  url: string;
  snippet?: string;
  // Exa also returns author, publishedDate, score — we keep it minimal.
}

interface ExaResponse {
  results: ExaResultItem[];
  // … pagination fields omitted
}

export const exaEngine: SearchEngine = {
  name: 'exa',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw new Error('EXA_API_KEY not configured — Exa engine unavailable');
    }
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        useAutoprompt: true,  // Exa rewrites the query for better embedding matches
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Exa returned ${res.status}: ${body.slice(0, 200)}`);
    }
    const data: ExaResponse = await res.json();
    return (data.results || []).map(r => ({
      title: r.title || '(no title)',
      url: r.url,
      snippet: r.snippet || '',
      source: 'exa',
    }));
  },
};
```

- [ ] **Step 4: Exa test (`services/webSearchEngines/engines/exa.test.ts`)**

```ts
import { describe, it, expect, vi } from 'vitest';

// We unit-test the fetch wrapper by controlling env. The actual network call
// integration is verified via the manual curl test in Task 3.

describe('exaEngine', () => {
  it('throws when EXA_API_KEY is not set', async () => {
    const prev = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    const { exaEngine } = await import('./exa');
    await expect(exaEngine.search('test')).rejects.toThrow('EXA_API_KEY not configured');
    if (prev) process.env.EXA_API_KEY = prev;
  });
});
```

- [ ] **Step 5: Register engines in orchestrator**

In `services/webSearchEngines/index.ts`, add engine registrations at the module level:

```ts
import { duckduckgoEngine } from './engines/duckduckgo';
import { braveEngine } from './engines/brave';
import { exaEngine } from './engines/exa';

// Default engine registrations (idempotent — safe to call multiple times)
export function registerDefaultEngines(): void {
  registerEngine(duckduckgoEngine);
  registerEngine(braveEngine);
  registerEngine(exaEngine);
}

// Auto-register on import
registerDefaultEngines();
```

- [ ] **Step 6: Run all engine tests**

```bash
npx vitest run services/webSearchEngines/
```

Expected: PASS — DuckDuckGo tests (4), Brave tests (3), Exa test (1) = 8 tests.

- [ ] **Step 7: Commit**

```bash
git add services/webSearchEngines/engines/brave.ts services/webSearchEngines/engines/brave.test.ts services/webSearchEngines/engines/exa.ts services/webSearchEngines/engines/exa.test.ts services/webSearchEngines/index.ts
git commit -m "feat(search): add Brave scraper and Exa API engines to multi-engine registry"
```

---

### Task 3: `/api/web-search` route (validation + rate limit + wiring)

**Files:**
- Create: `src/schemas/webSearch.ts`
- Modify: `src/middleware/security.ts`
- Modify: `server.ts`

**Interfaces:**
- Consumes: `searchMulti({ query, engines?, maxResults?, maxPerEngine? })` and `SearchResponse` from Task 1 (`services/webSearchEngines/index.ts`).
- Produces: `POST /api/web-search` — request body `{ query, engines?, maxResults? }`, response `SearchResponse` on 2xx, `{ error: string }` on failure.

- [ ] **Step 1: Add the request schema**

Create `src/schemas/webSearch.ts`:

```ts
import { z } from 'zod';

// Schema for the payload sent to the free multi-engine web-search endpoint.
export const WebSearchRequestSchema = z.object({
  query: z.string().min(1).max(400),
  engines: z.array(z.string().min(1).max(32)).max(8).optional(),
  maxResults: z.number().int().min(1).max(30).optional(),
});
```

- [ ] **Step 2: Add a dedicated rate limiter**

In `src/middleware/security.ts`, after the existing `authRateLimiter` block, add:

```ts

// Multi-engine web-search endpoint. A generous but real cap keeps normal
// chat use unaffected while avoiding hammering search engines hard enough
// to get this deployment's IP blocked.
export const searchRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
```

- [ ] **Step 3: Add the route**

In `server.ts`, add the schema/limiter imports:

```ts
import { securityHeaders, authRateLimiter, searchRateLimiter, corsOptions } from "./src/middleware/security";
import { WebSearchRequestSchema } from "./src/schemas/webSearch";
import { searchMulti } from "./services/webSearchEngines";
```

Then add the route right after the `/api/health` handler:

```ts

  app.post("/api/web-search", searchRateLimiter, validate(WebSearchRequestSchema), async (req, res) => {
    const { query, engines, maxResults } = req.body as { query: string; engines?: string[]; maxResults?: number };
    try {
      const response = await searchMulti({
        query,
        engines,
        maxResults: maxResults ?? 8,
      });
      res.json(response);
    } catch (e: any) {
      res.status(502).json({ error: e?.message || "Web search failed" });
    }
  });
```

## Environment variable summary

| Variable | Default | Purpose |
|---|---|---|
| `DEFAULT_SEARCH_ENGINES` | `duckduckgo,brave` | Default engine set when no explicit `engines` param is passed |
| `ALLOWED_SEARCH_ENGINES` | (all) | Restrict which engines can be invoked |
| `EXA_API_KEY` | (unset) | Exa search API key; Exa engine is skipped when absent |

- [ ] **Step 4: Verify typing**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Manual integration test**

```bash
# Start the dev server
npm run dev

# Default multi-engine search (DuckDuckGo + Brave)
curl -s -X POST http://127.0.0.1:7501/api/web-search \
  -H "Content-Type: application/json" \
  -d '{"query":"vitest testing library"}'

# Single engine
curl -s -X POST http://127.0.0.1:7501/api/web-search \
  -H "Content-Type: application/json" \
  -d '{"query":"vitest","engines":["duckduckgo"]}'

# Bad request
curl -s -X POST http://127.0.0.1:7501/api/web-search \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: First two return HTTP 200 with `{ query, results, enginesUsed, engineFailures }`. Third returns HTTP 422.

- [ ] **Step 6: Commit**

```bash
git add src/schemas/webSearch.ts src/middleware/security.ts server.ts
git commit -m "feat(search): add /api/web-search route backed by multi-engine orchestrator"
```

---

### Task 4: Make the assistant's `web_search` tool use the multi-engine free path

**Files:**
- Modify: `services/assistantTools.ts:303-318`
- Modify: `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md:125`

**Interfaces:**
- Consumes: `POST /api/web-search` from Task 3 (same-origin `fetch`, no new CSP entry needed). Existing `googleSearchGemini(query, settings)` as the fallback path.
- Produces: `web_search` tool keeps its exact name/signature (`{ query: string }` → `Promise<string>`).

- [ ] **Step 1: Rewrite the tool**

In `services/assistantTools.ts`, replace the existing `web_search` entry (lines 303-318):

```ts
    {
        name: 'web_search',
        description: 'Search the live web for current, real-world information. Free, no API key needed by default (scrapes multiple engines: DuckDuckGo, Brave, Exa if configured). Returns a JSON object with {results: [{title, url, snippet, source}], enginesUsed: string[], engineFailures: [...]} for you to read and summarize yourself. Falls back to Google Search grounding (needs a Gemini API key) only if the free search comes back empty. Offer open_web_page when the user wants to SEE a result page.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for.' },
                engines: { type: 'array', items: { type: 'string', enum: ['duckduckgo', 'brave', 'exa'] }, description: 'Optional: specific search engines to use. Defaults to duckduckgo and brave.' },
            },
            required: ['query'],
        },
        execute: async ({ query, engines }, ctx) => {
            try {
                const body: any = { query: String(query) };
                if (Array.isArray(engines) && engines.length > 0) {
                    body.engines = engines;
                }
                const res = await fetch('/api/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.results) && data.results.length > 0) {
                        return JSON.stringify(data);
                    }
                }
            } catch {
                // Network/server error on the free path — fall through to Gemini below.
            }
            if (ctx.settings.geminiApiKey || process.env.GEMINI_API_KEY) {
                const { googleSearchGemini } = await import('./geminiService');
                return googleSearchGemini(String(query), ctx.settings);
            }
            return 'Error: web search returned no results and no Gemini API key is configured for the Google fallback (Settings > Integrations > Gemini).';
        },
    },
```

- [ ] **Step 2: Update the handbook capability table**

In `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`, after the capability table, add a note:

```markdown

`web_search` is free by default (multi-engine scrape via `/api/web-search`: DuckDuckGo + Brave, optionally Exa with `EXA_API_KEY`, no API key required) and only falls back to Gemini Google Search grounding when the free search returns nothing and a Gemini key is configured. The assistant can also specify which engines to use by passing an `engines` array.
```

- [ ] **Step 3: Commit**

```bash
git add services/assistantTools.ts docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md
git commit -m "feat(search): make multi-engine free search the default web_search path, Gemini as fallback"
```

---

### Task 5 (Future / ponytail): Playwright-fallback for Bing, Baidu, and other JS-heavy engines

This task is **out of scope** for the initial implementation but documented here as the upgrade path, matching the open-websearch `SEARCH_MODE=auto` pattern.

**When to implement:** If users report insufficient result coverage from DuckDuckGo + Brave, or if a search engine described below starts working via simpler scraping.

**Implementation sketch:**

1. Install `@playwright/mcp` (already present in the project — `kollektivMcp.ts` uses it) or `playwright` as a direct dependency.
2. Create `services/webSearchEngines/engines/bing.ts` with a `searchMode` option:
   - `'request'`: direct HTTP fetch (likely fails, documented as such).
   - `'auto'`: try request first, fall back to Playwright navigation + `page.evaluate` to scrape the fully-loaded SERP.
   - `'playwright'`: force Playwright.
3. Add `SEARCH_MODE` env var following open-websearch's convention.
4. Register the Bing engine conditionally (only when Playwright is available).
5. Same pattern for Baidu, Sogou, etc.

---

## Self-Review (updated for multi-engine)

**Spec coverage:** "replicate the open-websearch repo that uses multiple search engines" — the revised plan replaces the single DuckDuckGo module with a modular engine registry (`services/webSearchEngines/`) where each engine implements a uniform `SearchEngine` interface, exactly mirroring open-websearch's `src/engines/` directory pattern. Three engines are implemented: DuckDuckGo (proven HTML scraper), Brave (verified scrapeable static HTML), and Exa (free-tier API, conditional on `EXA_API_KEY`). The orchestrator runs them in parallel, deduplicates by URL, interleaves results, and reports per-engine failures without sinking the whole request.

**open-websearch patterns replicated:**
- ✅ Modular engine directory (`engines/` with one file per engine)
- ✅ Uniform `SearchEngine` interface (`name` + `search(query, maxResults)`)
- ✅ Engine registry (`Map<name, engine>`)
- ✅ Configurable default and allowed engines via env vars (`DEFAULT_SEARCH_ENGINES`, `ALLOWED_SEARCH_ENGINES`)
- ✅ Parallel execution with graceful per-engine error handling
- ✅ Result deduplication and interleaving (open-websearch normalizes results)
- ✅ Documented Playwright-fallback path for JS-heavy engines (Bing etc.)
- ⏳ Proxy support (`USE_PROXY`/`PROXY_URL`) — deferred; existing `kollektivMcp.ts` already has proxy capabilities if needed

**Type consistency:** `WebSearchResult` gains a `source` field (matching open-websearch's normalized output). `SearchResponse` includes `enginesUsed` and `engineFailures` arrays. All engine signatures conform to `SearchEngine`.

**Cleanup from old plan:** The single-file `services/webSearchEngines.ts` is replaced by the `webSearchEngines/` directory. All DuckDuckGo-specific code moves into `engines/duckduckgo.ts`. The orchestrator in `index.ts` handles multi-engine orchestration. The old plan's Global Constraint on Bing ("Do not implement Bing scraping") is replaced by a documented ponytail upgrade path in Task 5.

**Post-write re-verification (2026-07-26):** Confirmed `jsdom` remains in `devDependencies` only — Task 1 still moves it to `dependencies`. `server.ts:407` (after `/api/health`) and `security.ts:60` (after `authRateLimiter`) are confirmed as valid insertion points. The `web_search` tool block is still at `assistantTools.ts:303-318`.
