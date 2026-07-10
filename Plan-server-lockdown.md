# Local Server Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `server.ts` currently runs as an open proxy: wide-open CORS (`app.use(cors())`, `server.ts:14`), an arbitrary-URL forward proxy that relays the caller's `Authorization` header (`/proxy-remote`, `server.ts:308-330`), an arbitrary-URL MCP proxy (`/api/mcp/proxy`, `server.ts:511-533`), an unauthenticated broadcast channel that remote-controls every connected frontend (`/api/hermes/control`, `server.ts:589-604`), request-body logging that can capture tokens (`server.ts:53`), and it binds `0.0.0.0` whenever `PORT` is set (`server.ts:11-12`). While the user runs `pnpm dev` and browses the web, any malicious page can drive these endpoints. Lock it down without breaking any feature.

**Architecture:** The Express server serves the app itself (Vite middleware in dev, `dist/` in prod — `server.ts:606-620`), so the frontend and API are **same-origin**; every client call to `/ollama-local`, `/proxy-remote`, `/api/...` uses relative paths. That means CORS headers are not needed at all for the app's own traffic — removing them is what re-arms the browser's same-origin protection. Requests with custom headers (`x-target-url`) or `Content-Type: application/json` trigger CORS preflight, which fails once the server stops answering it — killing the cross-site attack vector for all three dangerous endpoints in one move.

**Tech Stack:** Express 5, Node. Removes the `cors` dependency.

## Global Constraints

- Zero feature regressions: local Ollama/LlamaCpp proxying, Google Drive proxy, remote-engine access via `/proxy-remote`, MCP tools, Anthropic chat, Hermes SSE control — all must still work from the app itself.
- The deployed GitHub Pages build (static, no server) is unaffected by this file; don't touch `.github/workflows/deploy.yml`.
- `pnpm lint` green after every task.

---

### Task 1: Confirm same-origin assumption, then remove CORS

**Files:**
- Modify: `server.ts` (line 3 import, line 14 `app.use(cors())`)
- Modify: `package.json` (remove `cors`, `@types/cors`)

- [ ] **Step 1: Verify no client code calls the server cross-origin.** Run:
  `grep -rn "localhost:7500\|127.0.0.1:7500" components services utils contexts index.html vite.config.ts index.tsx`
  Expected: no hits (all API paths are relative). If there IS a hit, stop and record it — that origin must be allowlisted instead of removing CORS entirely (use `cors({ origin: [<that origin>] })`), and the rest of the plan still applies.
- [ ] **Step 2:** Delete `import cors from "cors";` (`server.ts:3`) and `app.use(cors());` (`server.ts:14`).
- [ ] **Step 3:** `pnpm remove cors @types/cors`
- [ ] **Step 4: Verify nothing else imports cors:** `grep -rn "from \"cors\"\|from 'cors'" --include="*.ts" --include="*.tsx" --include="*.js" . --exclude-dir=node_modules` → no hits.
- [ ] **Step 5:** `pnpm lint` green, then `pnpm dev` and click through: gallery loads, Ollama connection test in Settings works, chat streams. Commit: `git commit -am "security: remove wide-open CORS - server and app are same-origin"`

---

### Task 2: Stop binding all interfaces implicitly

**Files:**
- Modify: `server.ts:11-12`

Today `PORT` being set flips the bind address to `0.0.0.0` — setting a custom port silently exposes the open proxy to the LAN.

- [ ] **Step 1:** Replace:

```typescript
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7500;
const HOST = process.env.PORT ? "0.0.0.0" : "127.0.0.1";
```

with:

```typescript
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7500;
// Explicit opt-in only: HOST=0.0.0.0 for containerized/cloud runs. Never inferred from PORT.
const HOST = process.env.HOST || "127.0.0.1";
```

- [ ] **Step 2:** `pnpm lint` green. Start `pnpm dev`; in another terminal run `netstat -ano | findstr :7500` → the listener shows `127.0.0.1:7500`, not `0.0.0.0:7500`. Commit: `git commit -am "security: bind 127.0.0.1 unless HOST explicitly set"`

---

### Task 3: Stop logging request bodies

**Files:**
- Modify: `server.ts:53` (Google proxy body preview)

The Google proxy logs a 500-char body preview — Drive uploads and OAuth-adjacent payloads can contain tokens and personal content.

- [ ] **Step 1:** Replace the line

```typescript
console.log(`[Google-API Proxy] Request body size: ${bodyBuffer.length} bytes. Body preview: ${bodyStr.substring(0, 500)}`);
```

with

```typescript
console.log(`[Google-API Proxy] Request body size: ${bodyBuffer.length} bytes.`);
```

  and delete the now-unused `const bodyStr = bodyBuffer.toString('utf8');` line above it.
- [ ] **Step 2: Sweep for other body/secret logging:** `grep -n "console.log\|console.warn" server.ts` and read each hit. Anything printing request bodies, `Authorization`, or API keys gets the same treatment (URL + status + size are fine). The Anthropic route (`server.ts:473`) logs URL+model only — leave it.
- [ ] **Step 3:** `pnpm lint` green. Commit: `git commit -am "security: never log proxied request bodies"`

---

### Task 4: Validate proxy targets

**Files:**
- Modify: `server.ts` (`/proxy-remote` handler at `:308`, `/api/mcp/proxy` handler at `:511`)

Both endpoints fetch caller-supplied URLs. They must stay (users configure remote engines and MCP servers in Settings), but garbage and non-HTTP schemes should be rejected before `fetch`.

- [ ] **Step 1:** Add one helper above the `/proxy-remote` route:

```typescript
const isValidProxyTarget = (raw: string): boolean => {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
};
```

- [ ] **Step 2:** In `/proxy-remote`, after the existing missing-header check (`server.ts:311-313`), add:

```typescript
if (!isValidProxyTarget(target)) {
    return res.status(400).json({ error: 'x-target-url must be a valid http(s) URL' });
}
```

- [ ] **Step 3:** In `/api/mcp/proxy`, after the missing-url check (`server.ts:513-515`), add the same guard for `url`.
  `// ponytail: scheme check only; private-range/DNS-rebinding SSRF guard is the upgrade if this server ever runs non-locally.` — with CORS removed and the bind on loopback, the caller is the local user's own app, so the target URL is the user's own configuration.
- [ ] **Step 4:** `pnpm lint` green. Commit: `git commit -am "security: proxy endpoints reject non-http(s) targets"`

---

### Task 5: Optional token gate for the Hermes control channel

**Files:**
- Modify: `server.ts` (`/api/hermes/control` at `:589`)

Any local process can broadcast UI-control commands (`navigate`, etc.) to all connected frontends. Local processes are semi-trusted, but a shared secret costs five lines.

- [ ] **Step 1:** At the top of the handler add:

```typescript
const expected = process.env.HERMES_TOKEN;
if (expected && req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Invalid or missing Hermes token" });
}
```

  Unset token = current behavior (open on loopback); set token = enforced. Do not make the token mandatory — that would break existing Hermes setups on update.
- [ ] **Step 2:** `pnpm lint` green. Test: `curl -X POST http://127.0.0.1:7500/api/hermes/control -H "Content-Type: application/json" -d "{\"action\":\"navigate\",\"payload\":\"prompts\"}"` → succeeds without env var; after restarting with `HERMES_TOKEN=abc`, the same curl returns 401 and adding `-H "Authorization: Bearer abc"` succeeds.
- [ ] **Step 3:** Commit: `git commit -am "security: optional HERMES_TOKEN gate on control channel"`

---

### Task 6: Bind the MCP bridge to loopback

**Files:**
- Modify: `mcp-bridge.js` (listens on `0.0.0.0` with `Access-Control-Allow-Origin: *`)

- [ ] **Step 1:** Read `mcp-bridge.js` and find its `listen(...)` call. Change the bind address to `127.0.0.1` (or `process.env.HOST || '127.0.0.1'` to match Task 2).
- [ ] **Step 2: Leave its `Access-Control-Allow-Origin: *` headers alone** — the app at `http://localhost:7500` calls the bridge cross-origin (different port), so removing them breaks the feature. Loopback binding is the actual protection.
- [ ] **Step 3:** Commit: `git commit -am "security: mcp-bridge binds loopback only"`

---

## Edge cases a weaker model would miss

1. **Removing CORS ≠ adding a security header.** The protection comes from the browser refusing cross-origin reads/preflights once the server stops opting out. Don't replace `cors()` with `cors({origin: '*'})` "to be safe" — that's the same hole.
2. The bridge (Task 6) genuinely needs `Access-Control-Allow-Origin: *` (cross-port = cross-origin); the main server genuinely doesn't (same origin). Opposite answers, both correct.
3. `HOST` from `PORT` inference (Task 2): a cloud deploy that only sets `PORT` will now bind loopback and appear "down". That's the explicit opt-in working as intended — such deploys must set `HOST=0.0.0.0`. Note it in the commit message, don't revert it.
4. `/proxy-remote` reads the header case-variants (`x-target-url` / `X-Target-Url`, `server.ts:310`) — put the validation after the existing extraction so both spellings stay covered.
5. Express 5's `req.body` is undefined on unparsed content types; don't add JSON body checks that assume it exists.
6. Don't try to make `/api/hermes/control` same-origin-only via an `Origin` header check — non-browser local callers (the actual Hermes agent) send no Origin header.

## Acceptance criteria

1. `pnpm lint` and `pnpm build` green; `pnpm dev` serves the app.
2. Full feature walk in the app: gallery CRUD, Settings→AI Engine Ollama connection test, chat streaming, Google Drive flow (if configured), MCP tool listing (if configured) — all work.
3. `netstat -ano | findstr :7500` → listener on `127.0.0.1`.
4. Cross-origin probe: from any other page's DevTools console run
   `fetch('http://127.0.0.1:7500/api/mcp/proxy', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"url":"http://example.com"}'}).then(r=>r.json()).then(console.log).catch(e=>console.log('BLOCKED', e))`
   → prints `BLOCKED` (CORS failure). The same fetch from the Kollektiv app's own console succeeds.
5. `/proxy-remote` with `x-target-url: ftp://x` or `not-a-url` → 400.
6. Server logs during a Drive upload contain byte sizes but no body content.

## Out of scope

- Full SSRF hardening (private-IP blocklists, DNS-rebinding defenses) — unnecessary while the server is loopback-only.
- Auth for the whole server.
- Restricting which localhost ports `/ollama-local` etc. target (fixed upstream constants already).
