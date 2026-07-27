# Reach Channels Implementation Plan (RSS, GitHub, Exa, Reddit, YouTube Transcript, Twitter/X)

> Full architecture rationale, scope decisions, and per-channel fragility notes live in the approved plan this doc executes — see the session record. This file is the task checklist, mirroring `docs/plans/2026-07-26-free-web-search.md`'s format. Don't re-derive the "why" here; just the "what/how" per step.

## Verification status (read before trusting the checkmarks below)

Every step was implemented, typechecked (`tsc --noEmit`), covered by fixture-based unit tests (no live network), and `npm run build` was run once at the end with no errors. That's real and green: 692 tests, 54 files, clean build.

**What live verification actually covered, and what it didn't:**
- This sandbox's network egress policy blocks most external hosts. Only `api.github.com` (and npm/pypi/etc.) is reachable; `reddit.com`, `youtube.com`, `cdn.syndication.twimg.com`, `publish.twitter.com`, and arbitrary RSS feed hosts are **not** reachable from this session.
- **GitHub** is the only channel with a genuine live success: `github_search({type:'repos'})` returned real GitHub data. `repo_info`/`file` hit GitHub's real unauthenticated rate limit (already exhausted on this shared sandbox IP) and returned the intended clean error — that path is verified, not the happy path for those two ops.
- **RSS, Reddit, YouTube transcript, Twitter/X**: every live attempt against the real upstream was rejected by the sandbox's own egress proxy (403 at the CONNECT layer), before ever reaching Reddit/YouTube/Twitter/the feed host. What *was* verified live: request validation (422s) and that a 403 maps to each channel's intended clean, non-crashing error message. That is evidence the error-handling path doesn't crash — it is **not** evidence those channels work against their real upstreams, or that the specific 403→message mapping is correct for the real-world failure modes (Reddit rate-limit, YouTube caption-disabled, etc.) rather than just "some 403 happened."
- Two specific assumptions are untested against reality: whether `rss-parser`'s `headers` option is actually forwarded to the underlying request (the fix applied for the initial 403s), and the hardcoded InnerTube `clientVersion: '2.20240101.00.00'` string (a stale-looking version string is a common cause of that undocumented endpoint rejecting requests).
- The "in-app test via the assistant chat UI" step below was **not** performed — verification was via direct `curl` calls to the `/api/reach/*` routes, not by driving the actual chat UI in a browser and having the model call the tools.

**Bottom line:** treat GitHub as verified end-to-end. Treat RSS, Reddit, YouTube transcript, and Twitter/X as "typechecked, unit-tested, and provably non-crashing on failure" but **not yet proven against their real upstreams or the actual chat UI** — that needs to happen in an environment with normal internet access before calling those four channels done.

**Goal:** Add six assistant-facing content-reach capabilities (`rss_fetch`, `github_get_repo`/`github_search`/`github_get_file`, `exa_search`, `reddit_fetch`, `youtube_get_transcript`, `twitter_get_tweet`) as `AssistantTool` entries, each backed by a new `POST /api/reach/<channel>` server route, following the `services/webSearchEngines/` (multi-backend) or `services/tools/tensorArtTools.ts` (single-backend) precedent as appropriate.

**Build order:** groundwork → RSS → GitHub → Exa → Reddit → YouTube transcript → Twitter/X (see approved plan for why).

---

## Task 0: Shared groundwork

**Files:**
- Modify: `src/middleware/security.ts`
- Create: `src/schemas/reach.ts`
- Create: `services/reachHttp.ts`
- Modify: `utils/proxyTargetValidation.ts` (export the existing private/loopback predicate for reuse)
- Modify: `server.ts` (route mount point + imports)
- Modify: `package.json` (new deps: `rss-parser`)

- [x] **Step 1:** In `src/middleware/security.ts`, after `searchRateLimiter`, add:
  ```ts
  export const reachRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  });
  export const twitterReachRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  });
  ```
- [x] **Step 2:** In `utils/proxyTargetValidation.ts`, change `const isDisallowedAddress` to `export const isDisallowedAddress` — this is the pure private/loopback/link-local IP predicate (not the allowlist), safe and correct to reuse for the RSS route's SSRF check without touching `DEFAULT_PROXY_ALLOWED_HOSTS`.
- [x] **Step 3:** Create `src/schemas/reach.ts`:
  ```ts
  import { z } from 'zod';

  export const RssRequestSchema = z.object({
    url: z.string().url(),
    maxItems: z.number().int().min(1).max(20).optional(),
  });

  export const GithubRequestSchema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('repo_info'), owner: z.string().min(1), repo: z.string().min(1) }),
    z.object({ op: z.literal('search'), type: z.enum(['repos', 'code', 'issues']), query: z.string().min(1).max(256), maxResults: z.number().int().min(1).max(20).optional() }),
    z.object({ op: z.literal('file'), owner: z.string().min(1), repo: z.string().min(1), path: z.string().min(1).optional(), ref: z.string().optional() }),
  ]);

  export const RedditRequestSchema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('listing'), subreddit: z.string().min(1), sort: z.enum(['hot', 'new', 'top']).optional(), limit: z.number().int().min(1).max(25).optional() }),
    z.object({ op: z.literal('thread'), subreddit: z.string().min(1), postId: z.string().min(1) }),
    z.object({ op: z.literal('search'), query: z.string().min(1).max(256), limit: z.number().int().min(1).max(25).optional() }),
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
  ```
- [x] **Step 4:** Create `services/reachHttp.ts`:
  ```ts
  const REACH_USER_AGENT = 'Mozilla/5.0 (compatible; kollektiv-reach/1.0)';

  export async function reachFetch(url: string, init: RequestInit = {}, retries = 1): Promise<Response> {
    const headers = { 'User-Agent': REACH_USER_AGENT, ...(init.headers || {}) };
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { ...init, headers });
        if (res.status === 429 && attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e;
        if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  export { REACH_USER_AGENT };
  ```
- [x] **Step 5:** Add `rss-parser` to `package.json` dependencies, run `pnpm install`.
- [x] **Step 6:** In `server.ts`, add imports for the new schemas/limiters near the existing `WebSearchRequestSchema`/`searchRateLimiter` imports, and add a `// --- Reach channel routes ---` comment block after the `/api/scrape-url-playwright` route as the mount point for Tasks 1-6 below.
- [x] **Step 7:** `npx tsc --noEmit` — expect no new errors (routes not yet added, just plumbing).
- [x] **Step 8: Commit**
  ```bash
  git add src/middleware/security.ts src/schemas/reach.ts services/reachHttp.ts utils/proxyTargetValidation.ts package.json pnpm-lock.yaml
  git commit -m "feat(reach): add shared groundwork for reach-channel routes (limiters, schemas, http helper)"
  ```

---

## Task 1: RSS channel

**Files:** Create `services/rssService.ts`, `services/tools/rssTools.ts`; modify `server.ts`, `services/assistantTools.ts`, `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`.

- [x] **Step 1:** `services/rssService.ts` — wrap `rss-parser`, export `fetchFeed(url: string, maxItems = 10)` returning `{ feedTitle, feedLink, items: [{title, link, pubDate, contentSnippet, author}] }`. Apply the SSRF check from Task 0 Step 2 (`isDisallowedAddress` on the parsed hostname) before calling the parser; throw a plain `Error` with a clear message if blocked.
- [x] **Step 2:** `services/tools/rssTools.ts` — `rss_fetch` tool. `execute()` posts to `/api/reach/rss`, on success emits `appEventBus.emit('webSearchResults', [...])` (top 3 items, `engine: 'rss'`, `source: 'fetch'`), returns `JSON.stringify(data)`. On failure, return a clear error string, never throw.
- [x] **Step 3:** `server.ts` — `app.post('/api/reach/rss', reachRateLimiter, validate(RssRequestSchema), async (req, res) => {...})` calling `fetchFeed`, catch → `res.status(502).json({error})`.
- [x] **Step 4:** Register `rss_fetch` in `ASSISTANT_TOOLS` (`services/assistantTools.ts`).
- [x] **Step 5:** Tests: `services/rssService.test.ts` — feed a static RSS 2.0 XML fixture through `Parser.prototype.parseString` (mocked or real, no network), assert item shape, `maxItems` truncation, and the SSRF check rejecting a `127.0.0.1` URL.
- [x] **Step 6:** Update `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md` — add `rss_fetch` row to the Web tools table (~line 125) and one clause in the auto-save paragraph (~line 132).
- [x] **Step 7:** `npx tsc --noEmit`; `npx vitest run services/rssService.test.ts`.
- [~] **Step 8:** Manual smoke test — **partially done**: the SSRF-block case (`http://127.0.0.1/x`) was verified live and correctly rejected. The real-feed success case was never verified live — every attempt (hnrss.org, BBC, HN, NASA) was rejected by this sandbox's own egress proxy before reaching the feed host. Needs a real run in an environment with normal internet access.
  ```bash
  npm run dev
  curl -s -X POST http://127.0.0.1:7501/api/reach/rss -H "Content-Type: application/json" -d '{"url":"https://hnrss.org/frontpage"}'
  curl -s -X POST http://127.0.0.1:7501/api/reach/rss -H "Content-Type: application/json" -d '{"url":"http://127.0.0.1/x"}'   # expect blocked
  ```
- [x] **Step 9: Commit**

---

## Task 2: GitHub channel

**Files:** Create `services/githubService.ts`, `services/tools/githubTools.ts`; modify `server.ts`, `services/assistantTools.ts`, `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`, `.env.example`.

- [x] **Step 1:** `services/githubService.ts` — `getRepoInfo(owner, repo)`, `search(type, query, maxResults)`, `getFile(owner, repo, path?, ref?)` (defaults to README via `GET /repos/{owner}/{repo}/readme` when `path` omitted). All requests via `reachFetch` with headers `{ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(process.env.GITHUB_TOKEN ? {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`} : {}) }`. Decode base64 `content` field for file/readme responses; truncate to a reasonable length (e.g. 20,000 chars) with a note if truncated.
- [x] **Step 2:** `services/tools/githubTools.ts` — three tools: `github_get_repo`, `github_search` (params: `type: 'repos'|'code'|'issues'`, `query`, `maxResults?`), `github_get_file` (params: `owner`, `repo`, `path?`, `ref?`). Each posts to `/api/reach/github` with `{op: ...}`.
- [x] **Step 3:** `server.ts` — `POST /api/reach/github` with `reachRateLimiter` + `validate(GithubRequestSchema)`, dispatch on `req.body.op`.
- [x] **Step 4:** Register the three tools in `ASSISTANT_TOOLS`.
- [x] **Step 5:** Tests: `services/githubService.test.ts` — mock global `fetch` with fixture JSON per op (repo metadata, search results, file content base64), assert header construction and that `Authorization` is present only when `GITHUB_TOKEN` is set (toggle via `process.env` in the test), assert 404 → clean error string not a throw where the tool surfaces it.
- [x] **Step 6:** Update `AI_ENGINE.md` tool table + env var summary table (`GITHUB_TOKEN`, optional, raises unauth 60/hr → 5000/hr).
- [x] **Step 7:** Add `GITHUB_TOKEN=` line with a comment to `.env.example`.
- [x] **Step 8:** `npx tsc --noEmit`; `npx vitest run services/githubService.test.ts`.
- [x] **Step 9:** Manual smoke test against `/api/reach/github` for all three ops — **verified live**: `search` returned real GitHub data; `repo_info`/`file` hit GitHub's real unauthenticated rate limit (already exhausted on this shared sandbox IP) and returned the intended clean error, confirming that path rather than the happy path for those two ops.
- [x] **Step 10: Commit**

**Post-implementation fix:** GitHub's `/search/code` endpoint has no unauthenticated tier (unlike `/search/repositories` and `/search/issues`) — confirmed this only after the fact, since it wasn't caught by the mocked unit tests or the repos-only live smoke test. `search()` in `services/githubService.ts` now throws a clear "requires GITHUB_TOKEN" error before making the request when `type: 'code'` is requested without a token, and the `github_search` tool description says so. Covered by two new tests in `services/githubService.test.ts`.

---

## Task 3: Exa upgrade (`exa_search`)

**Files:** Create `services/exaService.ts`, `services/tools/exaTools.ts`; modify `services/webSearchEngines/engines/exa.ts`, `server.ts`, `services/assistantTools.ts`, `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`.

- [x] **Step 1:** Create `services/exaService.ts` exporting `exaSearchRich(params: {query, category?, startPublishedDate?, endPublishedDate?, includeDomains?, excludeDomains?, numResults?, getContents?})` — full-featured Exa `/search` POST client. Also export a narrow `exaSearchSimple(query, maxResults)` matching the existing `SearchEngine.search` signature, calling `exaSearchRich` under the hood, **throwing** when `EXA_API_KEY` is unset (preserve the existing contract exactly).
- [x] **Step 2:** Update `services/webSearchEngines/engines/exa.ts` to delegate to `exaSearchSimple` instead of its own inline fetch, keeping `exaEngine.search()`'s signature and throw-on-missing-key behavior identical. Run `npx vitest run services/webSearchEngines/engines/exa.test.ts` immediately after this step — it must still pass unmodified (asserts the throw).
- [x] **Step 3:** `services/tools/exaTools.ts` — `exa_search` tool calling `/api/reach/exa`. `execute()` catches all errors and returns `'Error: Exa API key not configured...'` or the underlying message as a string — never throws.
- [x] **Step 4:** `server.ts` — `POST /api/reach/exa` with `reachRateLimiter` + `validate(ExaSearchRequestSchema)`, calls `exaSearchRich`, catch → 502 with error message (including the "key not configured" case surfaced as a 4xx-ish clean message, not a crash).
- [x] **Step 5:** Register `exa_search` in `ASSISTANT_TOOLS`.
- [x] **Step 6:** Tests: `services/exaService.test.ts` — mock `fetch`, assert rich-params request body construction, assert `exaSearchSimple` still throws with no key. Re-run `exa.test.ts` to confirm it's untouched behaviorally.
- [x] **Step 7:** Update `AI_ENGINE.md` — add `exa_search` row, note it's distinct from `web_search`'s Exa engine (richer filters, own tool).
- [x] **Step 8:** `npx tsc --noEmit`; `npx vitest run services/exaService.test.ts services/webSearchEngines/engines/exa.test.ts`.
- [x] **Step 9: Commit**

---

## Task 4: Reddit channel

**Files:** Create `services/redditService.ts`, `services/tools/redditTools.ts`; modify `server.ts`, `services/assistantTools.ts`, `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`.

- [x] **Step 1:** `services/redditService.ts` — `getListing(subreddit, sort, limit)` → `GET https://www.reddit.com/r/{sub}/{sort}.json?limit=N`; `getThread(subreddit, postId)` → `GET https://www.reddit.com/r/{sub}/comments/{postId}.json`; `search(query, limit)` → `GET https://www.reddit.com/search.json?q=...&limit=N`. All via `reachFetch` with `User-Agent: process.env.REDDIT_USER_AGENT || 'kollektiv-reach/1.0 (by /u/kollektiv-app)'`. Parse the `{kind, data: {children: [{data: {...}}]}}` shape; on 429/403 throw a specific `Error('Reddit rate-limited or blocked this request')`.
- [x] **Step 2:** `services/tools/redditTools.ts` — single `reddit_fetch` tool with `op` param (`listing`|`thread`|`search`). Catches the specific rate-limit error and returns it as a clean string.
- [x] **Step 3:** `server.ts` — `POST /api/reach/reddit` with `reachRateLimiter` + `validate(RedditRequestSchema)`.
- [x] **Step 4:** Register `reddit_fetch` in `ASSISTANT_TOOLS`.
- [x] **Step 5:** Tests: `services/redditService.test.ts` — mock `fetch` with fixture listing/comment-tree JSON, assert the `User-Agent` header is always sent, assert 429 maps to the specific clean-error path.
- [x] **Step 6:** Update `AI_ENGINE.md` (tool table + fragility note: moderate rate-limit risk).
- [x] **Step 7:** `npx tsc --noEmit`; `npx vitest run services/redditService.test.ts`.
- [~] **Step 8:** Manual smoke test — **partially done**: validation (422) and the graceful-error path were verified live (a sandbox-proxy 403 correctly mapped to the "rate-limited or blocked" message, never a crash). None of the three ops was verified against real Reddit data — reddit.com is unreachable from this sandbox's egress policy.
- [x] **Step 9: Commit**

---

## Task 5: YouTube transcript channel

**Files:** Create `services/reachChannels/youtube/types.ts`, `index.ts`, `backends/watchPage.ts` (+`.test.ts`), `backends/innertube.ts` (+`.test.ts`); create `services/tools/youtubeTranscriptTools.ts`; modify `server.ts`, `services/assistantTools.ts`, `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`.

- [x] **Step 1:** `services/reachChannels/youtube/types.ts`:
  ```ts
  export interface TranscriptSegment { text: string; start: number; duration: number; }
  export interface TranscriptBackend {
    readonly name: string;
    fetch(videoId: string, lang?: string): Promise<TranscriptSegment[]>;
  }
  ```
- [x] **Step 2:** `backends/watchPage.ts` — fetch `https://www.youtube.com/watch?v={id}` via `reachFetch`, regex-extract the `ytInitialPlayerResponse = {...};` JSON blob, read `.captions.playerCaptionsTracklistRenderer.captionTracks`, pick the track matching `lang` (else first), fetch `track.baseUrl + '&fmt=json3'`, parse `events[].segs[].utf8` into segments. Export the extraction/parsing as pure functions for the test file (fixture HTML + fixture json3 response, no network).
- [x] **Step 3:** `backends/innertube.ts` — `POST https://www.youtube.com/youtubei/v1/player?key={PUBLIC_INNERTUBE_KEY}` with body `{ context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } }, videoId }`; extract captions the same way as watchPage from the JSON response body (no HTML parsing needed). **Verify the exact current request/response shape against a real call before trusting the fixture** — this endpoint's client-version string and response shape drift over time; this is the known-fragile part of this channel, treat the first real test against it as exploratory, not a rubber stamp.
- [x] **Step 4:** `index.ts` — `getTranscript(videoId, lang?)`: try `watchPage` backend, on throw try `innertube`, on both throw return a joined error. Same ordered-fallback shape as `webSearchEngines/index.ts`.
- [x] **Step 5:** `services/tools/youtubeTranscriptTools.ts` — `youtube_get_transcript` tool (accepts full URL or bare ID — extract ID via regex if a URL is passed). Calls `/api/reach/youtube-transcript`. On success, joins segments into plain text, emits `webSearchResults` (`engine: 'youtube'`). On failure, returns: `'Error: transcript unavailable for this video (captions disabled, or fetch blocked). Try scrape_url on the video page instead.'`
- [x] **Step 6:** `server.ts` — `POST /api/reach/youtube-transcript` with `reachRateLimiter` + `validate(YoutubeTranscriptRequestSchema)`.
- [x] **Step 7:** Register `youtube_get_transcript` in `ASSISTANT_TOOLS`.
- [x] **Step 8:** Tests: `backends/watchPage.test.ts`, `backends/innertube.test.ts` (fixture-based, pure-function parsing), `index.test.ts` (mock both backends, assert fallback-on-throw and both-fail → clean joined error, no throw escaping `getTranscript`).
- [x] **Step 9:** Update `AI_ENGINE.md` — new row next to `youtube_search`, explicit "elevated fragility" note matching the approved plan's language.
- [x] **Step 10:** `npx tsc --noEmit`; `npx vitest run services/reachChannels/youtube/`.
- [~] **Step 11:** Manual smoke test — **not achieved**: youtube.com is unreachable from this sandbox's egress policy. Both backends were exercised live only in the sense that they both failed with a real proxy-403 and the fallback + clean-joined-error path worked correctly; neither backend has been proven against a real video. This is exactly the step most likely to reveal a problem (stale `clientVersion`, drifted response shape) and it has not been run yet.
- [x] **Step 12: Commit**

---

## Task 6: Twitter/X channel

**Files:** Create `services/reachChannels/twitter/types.ts`, `index.ts`, `backends/syndicationCdn.ts` (+`.test.ts`), `backends/oembed.ts` (+`.test.ts`); create `services/tools/twitterTools.ts`; modify `server.ts`, `services/assistantTools.ts`, `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md`.

- [x] **Step 1:** `services/reachChannels/twitter/types.ts`:
  ```ts
  export interface TweetResult { text: string; author: string; url: string; metrics?: Record<string, number>; media?: string[]; }
  export interface TweetBackend { readonly name: string; fetch(tweetId: string): Promise<TweetResult>; }
  ```
- [x] **Step 2:** `backends/syndicationCdn.ts` — compute `token = ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')`, `GET https://cdn.syndication.twimg.com/tweet-result?id={tweetId}&lang=en&token={token}`, parse into `TweetResult`. Export the token function separately for a dedicated unit test.
- [x] **Step 3:** `backends/oembed.ts` — `GET https://publish.twitter.com/oembed?url=https://twitter.com/i/status/{tweetId}`, parse `{author_name, html}` into a minimal `TweetResult` (strip HTML from `html` for `text`).
- [x] **Step 4:** `index.ts` — ordered fallback: `syndicationCdn` → `oembed`, same shape as YouTube's `index.ts`.
- [x] **Step 5:** `services/tools/twitterTools.ts` — `twitter_get_tweet` tool, description explicitly states this is the least reliable reach channel. Calls `/api/reach/twitter`. On both-backends-fail, returns a clear error string.
- [x] **Step 6:** `server.ts` — `POST /api/reach/twitter` with **`twitterReachRateLimiter`** (not the shared `reachRateLimiter`) + `validate(TwitterRequestSchema)`.
- [x] **Step 7:** Register `twitter_get_tweet` in `ASSISTANT_TOOLS`.
- [x] **Step 8:** Tests: `backends/syndicationCdn.test.ts` (token-algorithm unit test with known id/token pairs + fixture JSON parse), `backends/oembed.test.ts` (fixture parse), `index.test.ts` (fallback-on-throw, both-fail → clean error).
- [x] **Step 9:** Update `AI_ENGINE.md` — new row with the reliability caveat stated in the table itself, not just the tool description.
- [x] **Step 10:** `npx tsc --noEmit`; `npx vitest run services/reachChannels/twitter/`.
- [~] **Step 11:** Manual smoke test — **not achieved**: twitter.com/x.com is unreachable from this sandbox's egress policy. What was verified live: validation (422), the stricter rate-limit headers, and the both-backends-failed clean-error path (both backends genuinely failed, against the sandbox proxy rather than Twitter). Neither backend has been proven against a real tweet.
- [x] **Step 12: Commit**

---

## Final verification

- [x] `npx tsc --noEmit` — clean across the whole tree.
- [x] `npm run build` — clean Vite production build, no errors (only pre-existing chunk-size warnings unrelated to reach channels).
- [x] `npx vitest run` — full suite green: 692 tests, 54 files, including all new `services/**/*.test.ts` files.
- [~] `curl` smoke test against all six `/api/reach/*` routes — **done, but only GitHub reached its real upstream** (search succeeded live; repo_info/file hit the real rate limit). RSS/Reddit/YouTube/Twitter validation (422) and error-mapping paths were exercised live, but every call to the actual upstream (feed hosts, reddit.com, youtube.com, twitter.com) was blocked by this sandbox's own egress policy before leaving the container. See "Verification status" at the top of this file.
- [ ] In-app test via `npm run dev`: ask the assistant one question per new tool, confirm each fires, returns a sane result or a clean error (never a crash), and the Assistant Notes panel receives a card. **Not performed** — verification here was via direct `curl` calls to the `/api/reach/*` routes, not by driving the chat UI in a browser.
- [x] Final `AI_ENGINE.md` read-through to confirm all six tools are documented consistently with the existing table format.

## Follow-up needed before shipping

Run in an environment with normal internet access (not this sandbox):
1. RSS: confirm `rss-parser`'s `headers` option actually reaches the underlying HTTP request against a real feed (the fix applied for the initial 403s here was never confirmed against a live feed).
2. Reddit: confirm all three `reddit_fetch` ops against real subreddits.
3. YouTube: confirm `youtube_get_transcript` against a real video with known captions — check whether the InnerTube `clientVersion: '2.20240101.00.00'` string needs updating (it's a 2024 value and this class of endpoint is known to reject stale client versions).
4. Twitter/X: confirm `twitter_get_tweet` against a real public tweet, and separately confirm the oEmbed fallback by forcing the primary backend to fail.
5. Drive the actual assistant chat UI (not just the raw `/api/reach/*` routes) for all six tools, to confirm the model calls them correctly and the Assistant Notes panel renders the results.
