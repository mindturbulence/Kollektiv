# Security Review Action Plan (Commit ca389c8)

*Generated on 2026‑07‑25*  

This document translates the **five‑axis code review** findings for the `development` branch (commit `ca389c8`) into concrete, ordered, testable tasks.  The plan follows the **incremental‑implementation** mindset – each task is a small, self‑contained change that can be committed, linted, and tested before moving on.

---

## 🎯 High‑Level Goals
1. **Add essential security hardening** (headers, rate‑limiting, input validation, secret redaction).
2. **Refactor the monolithic `server.ts` into focused modules** (routing, CDP service, proxy helpers, Topaz service).
3. **Introduce a unified response‑piping utility** to eliminate duplicated streaming code.
4. **Improve logging hygiene** (redact sensitive headers, limit noisy output).
5. **Add comprehensive tests** for the new middleware, schemas, and helper functions.
6. **Document configuration and usage** (README updates, new docs).

---

## 📋 Actionable Tasks (ordered by dependency)

### 1️⃣ Dependency & Tool Setup (must be done first)
| # | Action | File / Command | Notes |
|---|--------|----------------|-------|
| 1 | Upgrade vulnerable runtime deps & add pnpm overrides (`fast-uri >=3.1.4`, `@hono/node-server 2.0.5`). | `pnpm up uuid protobufjs body-parser`  <br> add `"pnpm": { "overrides": { "fast-uri": ">=3.1.4", "@hono/node-server": "2.0.5" } }` to `package.json` | Verify with `pnpm audit --prod` (no high/moderate). |
| 2 | Install security‑related libs (`helmet`, `cors`, `express-rate-limit`, `zod`). | `pnpm add -D helmet cors express-rate-limit zod` | Add types as needed (`@types/helmet`). |
| 3 | Set up Husky pre‑commit hook (lint + test + audit). | `pnpm add -D husky lint-staged` <br> add `"prepare":"husky install"` to `scripts` <br> `npx husky add .husky/pre-commit "pnpm lint && pnpm test && pnpm audit --prod"` | Guarantees no vulnerable code lands. |

---

### 2️⃣ Security Middleware (Core Hardening)
| # | Action | File | Export / Description |
|---|--------|------|-----------------------|
| 4 | Create `src/middleware/security.ts` – applies `helmet()`, custom CSP, and global `express-rate-limit` (200 req/15 min). | New file | `securityHeaders`, `globalRateLimiter`, `authRateLimiter` (10 req/15 min). |
| 5 | Wire middleware into `server.ts` (top of `startServer()`). | Edit `server.ts` | `app.use(helmet()); app.use(cors({origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173', credentials:true})); app.use(securityHeaders); app.use(globalRateLimiter);` |
| 6 | Add CSP header inside `securityHeaders` (default: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`). | Same file | Ensure browsers enforce content policy. |
| 7 | Apply `authRateLimiter` to high‑cost endpoints (`/api/openai/token`, `/api/anthropic/chat`, `/api/topaz-upscale`). | Edit `server.ts` route definitions | `app.get('/api/openai/token', authRateLimiter, handler)`, etc. |
| 8 | Unit test middleware (use `supertest` to assert security headers and 429 response). | `src/middleware/security.test.ts` | Simple GET `/api/health` → check headers. |

---

### 3️⃣ Input Validation (Zod Schemas)
| # | Action | File | Export |
|---|--------|------|--------|
| 9 | Create `src/schemas/anthropic.ts` – validates `messages`, `settings`, `stream`. | New file | `AnthropicRequestSchema` |
|10| Create `src/schemas/topaz.ts` – validates `scale` (numeric string) and `model`. | New file | `TopazUpscaleSchema` |
|11| Create `src/schemas/proxy.ts` – validates `target`, `method`, `params`, optional headers. | New file | `ProxyRequestSchema` |
|12| Create `src/schemas/mcp.ts` – validates MCP proxy payload (`url`, `method`, `params`, `headers`). | New file | `McpProxySchema` |
|13| Implement generic `validate(schema)` middleware (`src/middleware/validate.ts`). | New file | `validate(schema)` returns `(req,res,next)` that rejects with 422 on failure. |
|14| Patch route handlers to use validation (e.g., `app.post('/api/anthropic/chat', validate(AnthropicRequestSchema), handler)`). | Edit `server.ts` | Ensure early 422 on malformed payloads. |
|15| Add unit tests for each schema (`*.test.ts`). | `src/schemas/*.test.ts` | Test happy path + various invalid cases. |
|16| Integration tests for the protected endpoints (valid + invalid payloads). | `test/validation.test.ts` | Use `supertest` with the server. |

---

### 4️⃣ Refactor `server.ts` – Split Concerns
| # | Action | New File(s) | Purpose |
|---|--------|-------------|---------|
|17| Create `src/routes/health.ts` – `/api/health` only. | New file | Small, isolated route. |
|18| Create `src/routes/openai.ts` – token endpoint and rate‑limit wrapper. |
|19| Create `src/routes/anthropic.ts` – full chat proxy, uses validation. |
|20| Create `src/routes/topaz.ts` – status + upscale, uses `topazService`. |
|21| Create `src/routes/proxy.ts` – `/proxy-remote`, `/ollama-local`, `/llamacpp-local` – each uses the generic `proxyRequest` helper. |
|22| Create `src/routes/cdp/*` – separate files for connection (`connect.ts`), navigation (`navigate.ts`), actions (`click.ts`, `type.ts`, `drag.ts`, etc.). |
|23| Extract **CDP service** (`src/services/cdp.ts`) – contains all low‑level CDP functions (`cdpSend`, `cdpGet`, `cdpListTargets`, `cdpConnectToTarget`, `cdpMapCoords`, etc.). |
|24| Extract **Topaz service** (`src/services/topaz.ts`) – resolves exe, builds command args, runs child process, cleans up temp files. |
|25| Extract **proxy helper** (`src/services/proxy.ts`) – `async function proxyRequest(targetUrl, req, res, extraHeaders?)` that sets status, filters unsafe headers, streams body. |
|26| Replace duplicated streaming loops in the original file with calls to `proxyRequest`. |
|27| Delete the large monolithic `server.ts` (after all imports are wired). |
|28| Add **index barrel files** (`src/routes/index.ts`, `src/services/index.ts`) for clean imports. |
|29| Write unit tests for CDP service (mock `fetch`/`WebSocket`). |
|30| Write integration tests that hit a few CDP endpoints (mock Chrome with a simple WebSocket server). |

---

### 5️⃣ Logging Hygiene
| # | Action | File | Details |
|---|--------|------|---------|
|31| Redact sensitive headers (`authorization`, `cookie`, `set‑cookie`) in the MCP proxy log. | Edit `src/routes/mcp.ts` (or the proxy helper). |
|32| Remove noisy `console.log` statements that dump *all* request headers (keep only debug‑level logs behind a `process.env.DEBUG` flag). |
|33| Ensure error logs never include stack traces in HTTP responses – always return a generic message. |
|34| Unit test that a request with an `Authorization` header does **not** appear in the server log (use a mock logger). |

---

### 6️⃣ Security‑Specific Fixes (Critical)
| # | Action | File | Reason |
|---|--------|------|--------|
|35| Return **generic error messages** for `/api/openai/token` and `/api/anthropic/chat` (strip any extra fields from OpenAI/Anthropic responses). |
|36| Ensure **`/api/topaz-upscale`** sets correct MIME type (`image/${ext.replace('.','')}`). |
|37| After each fallback attempt in `/ollama-local` and `/llamacpp-local`, verify `response` is defined before accessing `response.status`. Return 502 with a clear message if all fallbacks fail. |
|38| In `/api/mcp/proxy`, normalise the target URL to avoid double slashes (`url.replace(/\/+$|^\/+/, '')`). |
|39| In `parseSseBody`, log JSON‑parse failures (debug level) and return a structured error (`{error:'Invalid SSE payload'}`). |
|40| Add **rate limiting** (already covered in step 2) – treat it as a security blocker. |
|41| Add **header filtering** (`content‑encoding`, `transfer‑encoding`, `content‑length`) for all proxied responses (already done, just ensure consistency). |

---

### 7️⃣ Performance & Edge Cases
| # | Action | File | Note |
|---|--------|------|------|
|42| Verify that all **list endpoints** (`/api/cdp/targets`, `/api/mcp/proxy` when using REST fallback) implement **pagination** if the result could become large (currently they return the whole list). Add optional `?limit=` query param. |
|43| Ensure **no blocking synchronous `fs` calls** in request handlers (e.g., `fs.readFileSync`). Replace with async equivalents where possible. |
|44| Add **timeout** handling for all external `fetch` calls (already present, but centralise via a `fetchWithTimeout` helper). |
|45| Write performance tests that simulate a burst of 200 requests to `/api/openai/token` and verify the rate‑limit kicks in. |

---

## ✅ Verification Checklist (run after each grouped set of tasks)
1. **`pnpm lint && pnpm test && pnpm audit --prod`** passes.  
2. **Security headers** (`helmet`, CSP) are present on a GET to `/api/health`.  
3. **Rate limiting** returns HTTP 429 after exceeding limits.  
4. **Invalid payloads** on validated routes return **422** with a clear error shape.  
5. **All unit & integration tests** for new modules pass with coverage ≥ 80 %.  
6. **Manual smoke test** – start the server, hit each major endpoint, ensure no crashes and correct responses.  
7. **Code‑size audit** – no file exceeds 1 000 LOC after refactor.  

---

## 📚 Documentation Updates
- Update `README.md` → **Security Hardening** section (list required env vars, how to run the audit, pre‑commit hook).  
- Add a new `SECURITY_CHECKLIST.md` that mirrors the checklist above for future contributors.  
- Document the new module layout in `docs/handbook/ARCHITECTURE_CONSTITUTION.md` (add a small diagram of the server‑router → services → utils).  

---

## 📅 Milestones (suggested sprint cadence)
| Milestone | Tasks Included |
|-----------|----------------|
| **M1 – Dependency & Guardrails** | 1‑3, 35‑41 (critical security fixes) |
| **M2 – Middleware & Validation**   | 4‑8, 9‑16 |
| **M3 – Refactor Core Server**      | 17‑30 |
| **M4 – Logging & Performance**     | 31‑34, 42‑45 |
| **M5 – Documentation & Final QA**   | 36‑38, Documentation updates, full test suite run |

Each milestone should be committed and CI‑validated before moving on.

---

*End of Plan*