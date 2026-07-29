# Mission Control Fork — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork builderz-labs/mission-control into `mission-control/` and surface it as a second "department" inside Kollektiv's shell — one command center with a Creative mode and an agent-ops Mission Control mode.

**Architecture:** Mission Control keeps its own Next.js process, SQLite database, and lifecycle. Kollektiv's Express server reverse-proxies `/mission-control/*` to it (including WebSocket upgrade and unbuffered SSE), so both apps share one origin. A new `mission_control` tab renders it in a same-origin iframe. Kollektiv pushes its live DaisyUI theme tokens across the boundary by `postMessage`, and Mission Control applies them to its Tailwind 4 theme variables.

**Tech Stack:** Kollektiv side — React 19, Vite 7, Express 5, TypeScript, Vitest. Mission Control side — Next.js 16, React 19, Tailwind CSS 4, better-sqlite3, Vitest.

**Companion spec:** `docs/plans/2026-07-29-mission-control-fork-design.md`. Read it before starting; it records why several obvious-looking approaches were rejected.

## Global Constraints

- **Platform is Windows 11.** Every verification step must pass on Windows. Do not add a step whose command is `brew`, `apt`, or `tmux`.
- **Local-only.** No hosted deployment, no public exposure. Mission Control binds `127.0.0.1`.
- **Package manager is `pnpm`** (`pnpm@11.5.3` in the root `package.json`). Never invoke `npm install` or `yarn`.
- **Kollektiv's dev server port is 7500** (`server.ts:72`, `PORT` env override). **Kollektiv's MCP server port is 3012** (`server.ts:1098`, hardcoded). **Mission Control's port is 3100** (chosen by this plan to avoid its 3000 default colliding with other local tooling; set via `PORT` in `mission-control/.env`).
- **Kollektiv has no test framework conventions beyond Vitest** (`pnpm test` → `vitest run`). Kollektiv-side tests go next to the file under test, matching the existing `services/*.test.ts` and `components/*.test.tsx` pattern.
- **`pnpm lint` in the Kollektiv root is `tsc --noEmit`** — a typecheck, not ESLint. It must stay clean.
- **The upstream fork is MIT licensed.** Keep `mission-control/LICENSE` and the upstream attribution intact.
- **Do not reformat upstream files.** Touch only the lines a task names, so future upstream diffs stay readable.

## Reference: verified facts this plan depends on

These were confirmed by reading the cloned upstream source and this repo. Do not re-derive them; do not assume anything beyond them.

| Fact | Location |
|---|---|
| Kollektiv Express/Vite server port 7500 | `server.ts:72` |
| Kollektiv MCP server starts on 3012 every boot, 100 tools | `server.ts:1094-1105`, `mcp-config.json` |
| 62 of 100 MCP tools are `browser-context` (need the Kollektiv tab open); 38 are `server-context` | `mcp-config.json` |
| 35 MCP tools declare `permissions`, gated by `CALLER_PERMISSIONS` | `services/kollektivMcp.ts:59-85` |
| Kollektiv MCP HTTP handler does no path routing — any path on :3012 is the endpoint | `services/kollektivMcp.ts:666-746` |
| `ActiveTab` union lists every tab id | `types.ts:61-82` |
| Tab → component switch | `components/App.tsx:358-375` |
| `activeTab` persisted via `useLocalStorage` | `components/App.tsx:137` |
| Theme applied as `data-theme` on `documentElement` | `hooks/useAppTheme.ts:13` |
| 43 DaisyUI themes registered | `tailwind.config.js:21-140` |
| DaisyUI 4.12.24 emits OKLCH triplets `--p --s --a --n --b1 --b2 --b3 --bc --in --su --wa --er` | `node_modules/daisyui/dist/themes.css` |
| MC blocks framing in three places | `mission-control/src/lib/csp.ts:8`, `src/proxy.ts:132`, `next.config.js` `headers()` |
| MC redirects page routes to `/login` without a session cookie | `mission-control/src/proxy.ts` (end of `proxy()`) |
| MC's PTY attach shells out to `tmux attach-session` — Unix only | `mission-control/src/lib/pty-manager.ts:106-109`, `:252-259` |
| MC never spawns agents; it only attaches to pre-existing tmux sessions | `mission-control/src/lib/pty-manager.ts:245-266` |
| MC Claude session discovery is cross-platform (`readdirSync` + `path.join` over `~/.claude/projects`) | `mission-control/src/lib/claude-sessions.ts:245-284` |
| This host already has 21 Claude project dirs with `.jsonl` transcripts | `C:\Users\dwun2\.claude\projects` |

## File structure

**New files (Kollektiv side):**

| File | Responsibility |
|---|---|
| `routes/missionControlRoutes.ts` | Express reverse proxy for `/mission-control/*`, including SSE passthrough. One export: `createMissionControlProxy()`. |
| `routes/missionControlRoutes.test.ts` | Unit tests for the proxy's path/target computation. |
| `components/MissionControlPage.tsx` | The tab's React component: renders the iframe, publishes theme tokens to it. |
| `utils/daisyThemeTokens.ts` | Reads DaisyUI OKLCH triplets off an element. Pure, testable, no React. |
| `utils/daisyThemeTokens.test.ts` | Unit tests for token extraction. |

**New files (Mission Control side):**

| File | Responsibility |
|---|---|
| `mission-control/src/components/kollektiv-theme-bridge.tsx` | Client component: listens for theme messages, applies Tailwind 4 token overrides. |
| `mission-control/src/lib/__tests__/kollektiv-theme-bridge.test.ts` | Unit tests for the DaisyUI → Mission Control token mapping. |
| `mission-control/src/lib/kollektiv-theme-map.ts` | Pure mapping function from DaisyUI token names to Mission Control CSS variable names. Split from the component so it is testable without a DOM harness. |

**Modified files:**

| File | Change |
|---|---|
| `types.ts:61-82` | Add `'mission_control'` to `ActiveTab`. |
| `components/App.tsx:358-375` | Add the `mission_control` case to the render switch. |
| `server.ts` | Mount the Mission Control proxy; add WebSocket upgrade forwarding. |
| `package.json` | Add `dev:mc` and `dev:all` scripts. |
| `mission-control/src/lib/csp.ts:8` | `frame-ancestors 'none'` → `'self'`. |
| `mission-control/src/proxy.ts:132` | `X-Frame-Options: DENY` → `SAMEORIGIN`. |
| `mission-control/next.config.js` | `X-Frame-Options: DENY` → `SAMEORIGIN`; add `basePath`/`assetPrefix`. |
| `mission-control/src/app/layout.tsx` | Mount `<KollektivThemeBridge />`. |

---

## Phase 0 — Fork and baseline

Goal: Mission Control exists in-repo and runs standalone on Windows, with its own tests green, before anything is wired together. Nothing in this phase touches Kollektiv.

### Task 0.1: Vendor the fork

**Files:**
- Create: `mission-control/` (entire upstream tree)
- Create: `mission-control/FORK.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: the `mission-control/` directory containing upstream's `package.json`, `src/`, `next.config.js`, `LICENSE`.

- [ ] **Step 1: Clone upstream into the repo without its git history**

Run from the repo root (`D:\AI-Dev\Kollektiv-Dev`):

```bash
git clone --depth 1 https://github.com/builderz-labs/mission-control mission-control
rm -rf mission-control/.git
```

- [ ] **Step 2: Confirm the license came across**

Run: `head -3 mission-control/LICENSE`
Expected: `MIT License` on line 1 and `Copyright (c) 2026 Builderz Labs` on line 3. If this file is absent, stop — vendoring an unlicensed tree is not permitted.

- [ ] **Step 3: Record the fork point**

Upstream's HEAD commit is needed later to diff against new upstream releases. Capture it:

```bash
git ls-remote https://github.com/builderz-labs/mission-control HEAD
```

Create `mission-control/FORK.md` with the hash from that command substituted for `<HASH>`:

```markdown
# Fork notice

This directory is a fork of [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control),
MIT licensed, Copyright (c) 2026 Builderz Labs. The upstream LICENSE is retained in this directory.

**Forked at upstream commit:** `<HASH>`

## Why this fork diverges

- Framing headers relaxed so the app can be embedded same-origin inside Kollektiv's shell
  (`src/lib/csp.ts`, `src/proxy.ts`, `next.config.js`).
- Served from the `/mission-control` subpath rather than the origin root (`next.config.js`).
- A Kollektiv theme bridge component applies Kollektiv's active DaisyUI theme to this app's
  Tailwind 4 tokens (`src/components/kollektiv-theme-bridge.tsx`).

## Re-syncing with upstream

Diff upstream's new tree against the recorded fork point, then reapply the changes above by hand.
There is no git remote link, so this is a manual merge.
```

- [ ] **Step 4: Ignore Mission Control's runtime state**

Append to the repo root `.gitignore`:

```gitignore
# Mission Control runtime state (SQLite DB, auto-generated secrets, build output)
mission-control/.data/
mission-control/.next/
mission-control/node_modules/
```

- [ ] **Step 5: Verify the ignore rules actually match**

Run: `git status --porcelain mission-control/ | head -20`
Expected: `mission-control/` files listed as untracked, with **no** entries under `.data/`, `.next/`, or `node_modules/`. If any appear, the ignore rules are wrong — fix before committing.

- [ ] **Step 6: Commit**

```bash
git add .gitignore mission-control/
git commit -m "feat(mission-control): vendor builderz-labs/mission-control fork"
```

### Task 0.2: Boot Mission Control standalone on Windows

**Files:**
- Create: `mission-control/.env`

**Interfaces:**
- Consumes: `mission-control/` from Task 0.1.
- Produces: a Mission Control instance reachable at `http://127.0.0.1:3100`, seeded admin credentials.

- [ ] **Step 1: Install dependencies**

```bash
cd mission-control
pnpm install
```

`better-sqlite3` and `node-pty` are native modules and compile on install. If `better-sqlite3` fails with `NODE_MODULE_VERSION`, run `pnpm rebuild better-sqlite3` — upstream's own `postinstall` hook prints this same instruction.

- [ ] **Step 2: Write the environment file**

Create `mission-control/.env`. `PORT=3100` avoids upstream's 3000 default; the credentials seed an admin so the first-run `/setup` wizard is skipped.

```env
PORT=3100
AUTH_USER=kollektiv
AUTH_PASS=change-me-to-a-real-password
MC_ALLOWED_HOSTS=localhost,127.0.0.1,::1
MC_COOKIE_SECURE=
MC_COOKIE_SAMESITE=strict
```

- [ ] **Step 3: Confirm the env file is not tracked**

Run: `git check-ignore -v mission-control/.env`
Expected: a line naming the `.gitignore` rule that matches it. If the command exits non-zero the file is **not** ignored — add `mission-control/.env` to `.gitignore` before continuing. This file contains a password.

- [ ] **Step 4: Start the dev server**

```bash
cd mission-control
pnpm dev
```

Expected: Next.js reports listening on `http://127.0.0.1:3100`.

- [ ] **Step 5: Verify it serves and requires auth**

In a second shell:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://127.0.0.1:3100/
```

Expected: `307` with a redirect URL ending in `/login` — this confirms both that the server is up and that `src/proxy.ts`'s session gate is active.

- [ ] **Step 6: Log in through a browser**

Open `http://127.0.0.1:3100/`, log in with the `AUTH_USER`/`AUTH_PASS` values from Step 2. Confirm the dashboard renders.

- [ ] **Step 7: Verify Claude session discovery works on Windows**

This is the load-bearing check for the whole v1 scope — it proves the cross-platform path actually reads this machine's transcripts. In the browser (so the session cookie is sent), open the devtools console on the Mission Control tab and run:

```js
await (await fetch('/api/claude/sessions', { method: 'POST' })).json()
```

Expected: a JSON result reporting a non-zero count of discovered sessions. This host has 21 project directories under `C:\Users\dwun2\.claude\projects`. If the count is `0`, stop and investigate `src/lib/claude-sessions.ts` `config.claudeHome` resolution before proceeding — the rest of the plan assumes this works.

- [ ] **Step 8: Confirm the terminal feature is correctly unavailable**

```js
await (await fetch('/api/pty/setup')).json()
```

Expected: `{ tmux: { installed: false, installCommand: null, ... }, platform: "win32", ready: false }`. This is the expected, documented state on Windows — not a defect. Task 4.1 hides the UI entry point.

- [ ] **Step 9: Run upstream's test suite as a baseline**

```bash
cd mission-control
pnpm test
```

Record the pass/fail counts in the commit message. Some upstream tests may assume a Unix environment; a test that fails **before** any of our edits is a pre-existing upstream condition, not a regression. Knowing the baseline is what makes later runs meaningful.

- [ ] **Step 10: Commit**

```bash
git add mission-control/FORK.md
git commit -m "chore(mission-control): verify standalone boot on Windows

Baseline upstream test run: <PASS> passed, <FAIL> failed (pre-existing).
Claude session discovery verified: <N> sessions found.
tmux unavailable as expected on win32; terminal viewer gated in Phase 4."
```

---

## Phase 1 — Reverse proxy

Goal: Mission Control is reachable at `http://localhost:7500/mission-control` — same origin as Kollektiv — with SSE and WebSocket intact.

### Task 1.1: Serve Mission Control from the `/mission-control` subpath

**Files:**
- Modify: `mission-control/next.config.js`

**Interfaces:**
- Produces: Mission Control serving all routes and assets under `/mission-control`.

- [ ] **Step 1: Add basePath and assetPrefix**

In `mission-control/next.config.js`, inside the `nextConfig` object, add these two keys immediately after `outputFileTracingRoot: __dirname,`:

```js
  // Served behind Kollektiv's Express reverse proxy at /mission-control so both
  // apps share one origin. Without basePath, Next.js emits root-absolute asset
  // and API URLs that escape the proxy prefix and 404.
  basePath: '/mission-control',
  assetPrefix: '/mission-control',
```

- [ ] **Step 2: Restart and verify the subpath serves**

Restart `pnpm dev` in `mission-control/`, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/mission-control/login
```

Expected: `200`.

- [ ] **Step 3: Verify the old root path no longer serves**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/login
```

Expected: `404`. This confirms `basePath` took effect rather than silently being ignored.

- [ ] **Step 4: Commit**

```bash
git add mission-control/next.config.js
git commit -m "feat(mission-control): serve under /mission-control basePath"
```

### Task 1.2: Relax the framing headers

**Files:**
- Modify: `mission-control/src/lib/csp.ts:8`
- Modify: `mission-control/src/proxy.ts:132`
- Modify: `mission-control/next.config.js`

**Interfaces:**
- Produces: Mission Control embeddable in a same-origin iframe; still blocked from cross-origin framing.

- [ ] **Step 1: Allow same-origin frame ancestors in the CSP**

In `mission-control/src/lib/csp.ts`, change line 8 from:

```js
    `frame-ancestors 'none'`,
```

to:

```js
    // 'self' (not 'none') so Kollektiv's shell can embed this app in a
    // same-origin iframe behind its reverse proxy. Cross-origin framing
    // stays blocked.
    `frame-ancestors 'self'`,
```

- [ ] **Step 2: Relax X-Frame-Options in the proxy**

In `mission-control/src/proxy.ts`, change line 132 from:

```js
  response.headers.set('X-Frame-Options', 'DENY')
```

to:

```js
  // SAMEORIGIN so Kollektiv's shell can embed this app; see frame-ancestors in lib/csp.ts.
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
```

- [ ] **Step 3: Relax the duplicate X-Frame-Options in next.config.js**

`next.config.js` sets the same header a second time in its `headers()` function. Change:

```js
          { key: 'X-Frame-Options', value: 'DENY' },
```

to:

```js
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
```

- [ ] **Step 4: Verify both headers changed on a real response**

Restart the dev server, then:

```bash
curl -sI http://127.0.0.1:3100/mission-control/login | grep -i "x-frame-options\|content-security-policy"
```

Expected: `X-Frame-Options: SAMEORIGIN`, and a `Content-Security-Policy` containing `frame-ancestors 'self'`. Both must be present — missing either one means the embed will fail at runtime with a console error that is easy to misdiagnose.

- [ ] **Step 5: Commit**

```bash
git add mission-control/src/lib/csp.ts mission-control/src/proxy.ts mission-control/next.config.js
git commit -m "feat(mission-control): allow same-origin framing for Kollektiv shell"
```

### Task 1.3: Express reverse proxy with SSE and WebSocket support

**Files:**
- Create: `routes/missionControlRoutes.ts`
- Create: `routes/missionControlRoutes.test.ts`
- Modify: `server.ts`

**Interfaces:**
- Produces:
  - `MISSION_CONTROL_TARGET: string` — the upstream origin, e.g. `'http://127.0.0.1:3100'`.
  - `createMissionControlProxy(): RequestHandler` — Express middleware proxying `/mission-control/*`.
  - `attachMissionControlUpgrade(server: http.Server): void` — forwards WebSocket upgrades.

- [ ] **Step 1: Confirm the proxy dependency is already present**

`http-proxy-middleware` is the standard choice and may already be installed transitively. Check:

```bash
node -e "console.log(require('http-proxy-middleware/package.json').version)"
```

If that prints a version, use it and skip Step 2. If it throws `MODULE_NOT_FOUND`, do Step 2.

- [ ] **Step 2: Install the proxy middleware (only if Step 1 failed)**

```bash
pnpm add http-proxy-middleware
```

- [ ] **Step 3: Write the failing test**

Create `routes/missionControlRoutes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MISSION_CONTROL_TARGET, missionControlTargetFromEnv } from './missionControlRoutes';

describe('missionControlTargetFromEnv', () => {
  it('defaults to port 3100 on loopback', () => {
    expect(missionControlTargetFromEnv({})).toBe('http://127.0.0.1:3100');
  });

  it('honours MISSION_CONTROL_PORT', () => {
    expect(missionControlTargetFromEnv({ MISSION_CONTROL_PORT: '4321' }))
      .toBe('http://127.0.0.1:4321');
  });

  it('ignores a non-numeric port rather than building a broken URL', () => {
    expect(missionControlTargetFromEnv({ MISSION_CONTROL_PORT: 'not-a-port' }))
      .toBe('http://127.0.0.1:3100');
  });

  it('exports a default target matching the no-env case', () => {
    expect(MISSION_CONTROL_TARGET).toBe(missionControlTargetFromEnv({}));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run routes/missionControlRoutes.test.ts`
Expected: FAIL — `Failed to resolve import "./missionControlRoutes"`.

- [ ] **Step 5: Implement the proxy module**

Create `routes/missionControlRoutes.ts`:

```ts
import type http from 'http';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';

const DEFAULT_MISSION_CONTROL_PORT = 3100;

/**
 * Resolve the Mission Control origin from environment variables.
 * Exported separately from MISSION_CONTROL_TARGET so it can be tested
 * without mutating process.env.
 */
export function missionControlTargetFromEnv(env: Record<string, string | undefined>): string {
  const raw = env.MISSION_CONTROL_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const port = Number.isInteger(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : DEFAULT_MISSION_CONTROL_PORT;
  return `http://127.0.0.1:${port}`;
}

export const MISSION_CONTROL_TARGET = missionControlTargetFromEnv(process.env);

/**
 * Reverse proxy for the embedded Mission Control app.
 *
 * The path is NOT rewritten: Mission Control runs with basePath '/mission-control',
 * so it expects to receive that prefix.
 */
export function createMissionControlProxy(): RequestHandler {
  return createProxyMiddleware({
    target: MISSION_CONTROL_TARGET,
    changeOrigin: true,
    ws: true,
    // Mission Control streams activity over SSE. Compression buffers those
    // responses and the stream appears to hang, so it is disabled per-response.
    selfHandleResponse: false,
    on: {
      proxyReq: (proxyReq, req) => {
        const accept = (req.headers as Record<string, string | undefined>).accept;
        if (accept && accept.includes('text/event-stream')) {
          proxyReq.setHeader('accept-encoding', 'identity');
        }
      },
      proxyRes: (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        if (contentType.includes('text/event-stream')) {
          proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          delete proxyRes.headers['content-encoding'];
        }
      },
      error: (err, _req, res) => {
        const anyRes = res as http.ServerResponse;
        if (anyRes && 'writeHead' in anyRes && !anyRes.writableEnded) {
          anyRes.writeHead(502, { 'Content-Type': 'application/json' });
          anyRes.end(JSON.stringify({
            error: 'Mission Control is not running',
            code: 'MISSION_CONTROL_UNREACHABLE',
            hint: `Start it with: pnpm dev:mc (expected at ${MISSION_CONTROL_TARGET})`,
          }));
        }
      },
    },
  });
}

/**
 * Forward WebSocket upgrades for /mission-control to the Next.js process.
 * Express middleware never sees 'upgrade' events, so this must be wired
 * onto the HTTP server directly.
 */
export function attachMissionControlUpgrade(server: http.Server): void {
  const proxy = createMissionControlProxy();
  server.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/mission-control')) {
      (proxy as unknown as {
        upgrade: (r: typeof req, s: typeof socket, h: typeof head) => void;
      }).upgrade(req, socket, head);
    }
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run routes/missionControlRoutes.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Mount the proxy in server.ts**

`server.ts` already imports sibling route modules at lines 18-22. Add alongside them:

```ts
import { createMissionControlProxy, attachMissionControlUpgrade } from "./routes/missionControlRoutes";
```

Then mount it. Order matters: this must come **before** Vite's catch-all middleware, or Vite will try to serve `/mission-control` as an app route. Mount it next to the other `app.use` route registrations near `app.use(mcpRoutes);` (line 441):

```ts
app.use('/mission-control', createMissionControlProxy());
```

Finally, wire the upgrade handler where `httpServer` is available (the same `httpServer` passed to Vite's HMR config around line 1076):

```ts
attachMissionControlUpgrade(httpServer);
```

- [ ] **Step 8: Verify the typecheck is clean**

Run: `pnpm lint`
Expected: no output, exit 0. (`pnpm lint` is `tsc --noEmit`.)

- [ ] **Step 9: Verify the proxy end-to-end**

With Mission Control running (`pnpm dev` in `mission-control/`) and Kollektiv running (`pnpm dev` in the root), in a third shell:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7500/mission-control/login
```

Expected: `200` — Mission Control's login page served through Kollektiv's origin.

- [ ] **Step 10: Verify the failure path gives a useful error**

Stop the Mission Control process, then repeat:

```bash
curl -s http://localhost:7500/mission-control/login
```

Expected: the JSON body with `"code":"MISSION_CONTROL_UNREACHABLE"` and the `pnpm dev:mc` hint. A blank socket hang-up here means the `error` handler is not wired. Restart Mission Control afterwards.

- [ ] **Step 11: Commit**

```bash
git add routes/missionControlRoutes.ts routes/missionControlRoutes.test.ts server.ts package.json pnpm-lock.yaml
git commit -m "feat(shell): reverse-proxy Mission Control at /mission-control

Handles SSE (disables buffering/compression) and WebSocket upgrades, which
plain HTTP proxying drops. Returns a 502 with a start hint when the
Mission Control process is down."
```

### Task 1.4: One-command dev startup

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm dev:all` starting both processes; `pnpm dev:mc` starting Mission Control alone.

- [ ] **Step 1: Confirm a process runner is available**

```bash
node -e "console.log(require('concurrently/package.json').version)"
```

If that throws `MODULE_NOT_FOUND`, install it: `pnpm add -D concurrently`.

- [ ] **Step 2: Add the scripts**

In the root `package.json` `scripts` block, alongside the existing `"dev"` entry:

```json
    "dev:mc": "pnpm --dir mission-control dev",
    "dev:all": "concurrently -n kollektiv,mission-control -c green,cyan \"pnpm dev\" \"pnpm dev:mc\"",
```

Leave the existing `"dev"` script unchanged — Creative mode must still start on its own without requiring Mission Control.

- [ ] **Step 3: Verify both start together**

Run: `pnpm dev:all`
Expected: interleaved prefixed output; Kollektiv on 7500, Mission Control on 3100. Confirm with:

```bash
curl -s -o /dev/null -w "kollektiv:%{http_code}\n" http://localhost:7500/
curl -s -o /dev/null -w "mission-control:%{http_code}\n" http://localhost:7500/mission-control/login
```

Expected: `kollektiv:200` and `mission-control:200`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(dev): add dev:mc and dev:all scripts"
```

---

## Phase 2 — Shell integration

Goal: a `mission_control` tab in Kollektiv renders the embedded app.

### Task 2.1: Add the tab

**Files:**
- Modify: `types.ts:61-82`
- Create: `components/MissionControlPage.tsx`
- Modify: `components/App.tsx:358-375`

**Interfaces:**
- Consumes: the `/mission-control` proxy route from Task 1.3.
- Produces: `<MissionControlPage />`, a default-exported React component taking no props; `'mission_control'` as a valid `ActiveTab`.

- [ ] **Step 1: Extend the ActiveTab union**

In `types.ts`, add `'mission_control'` to the `ActiveTab` union immediately before `| 'settings';` so the ops tab sits last among feature tabs:

```ts
  | 'a1111_studio'
  | 'mission_control'
  | 'settings';
```

- [ ] **Step 2: Create the page component**

Create `components/MissionControlPage.tsx`. The `title` attribute is required for accessibility; without it screen readers announce an unlabeled frame.

```tsx
import React from 'react';

/**
 * Mission Control — the agent-ops department.
 *
 * Rendered in a same-origin iframe: Mission Control is a separate Next.js
 * process reverse-proxied at /mission-control (see routes/missionControlRoutes.ts).
 * Two React apps on different frameworks cannot share one tree, so an iframe
 * is the boundary even though the origin is shared.
 */
const MissionControlPage: React.FC = () => {
    return (
        <div className="w-full h-full flex flex-col">
            <iframe
                src="/mission-control"
                title="Mission Control"
                className="w-full h-full border-0 flex-1"
            />
        </div>
    );
};

export default MissionControlPage;
```

- [ ] **Step 3: Import and render it**

In `components/App.tsx`, add the import next to the other page imports:

```tsx
import MissionControlPage from './MissionControlPage';
```

Then add a case to the `renderContent` switch (the block at lines 358-375), directly before the `case 'settings':` line:

```tsx
            case 'mission_control': return <MissionControlPage key="mission_control" />;
```

- [ ] **Step 4: Add the document title case**

`components/App.tsx:142` sets a per-tab document title. Add a matching entry alongside `case 'dashboard': return \`DASHBOARD | ${base}\`;`:

```tsx
            case 'mission_control': return `MISSION CONTROL | ${base}`;
```

- [ ] **Step 5: Verify the typecheck is clean**

Run: `pnpm lint`
Expected: exit 0. A non-exhaustive-switch error here means Step 3 was missed.

- [ ] **Step 6: Verify in the browser**

With `pnpm dev:all` running, open `http://localhost:7500`, navigate to the Mission Control tab. Expected: Mission Control's login page renders inside the Kollektiv shell. Log in once; the session cookie persists thereafter.

- [ ] **Step 7: Confirm framing is not blocked**

Open the browser devtools console while on the tab. Expected: **no** `Refused to display ... in a frame because an ancestor violates the following Content Security Policy directive: frame-ancestors` error. If that error appears, Task 1.2 did not take effect — recheck with the `curl -sI` command from Task 1.2 Step 4.

- [ ] **Step 8: Commit**

```bash
git add types.ts components/App.tsx components/MissionControlPage.tsx
git commit -m "feat(shell): add Mission Control tab"
```

---

## Phase 3 — Theme bridge

Goal: switching Kollektiv's theme re-themes the embedded Mission Control live, across all 43 DaisyUI themes.

### Task 3.1: Extract DaisyUI theme tokens

**Files:**
- Create: `utils/daisyThemeTokens.ts`
- Create: `utils/daisyThemeTokens.test.ts`

**Interfaces:**
- Produces:
  - `DAISY_TOKEN_NAMES: readonly string[]` — the DaisyUI variable names read, without leading dashes: `['p','pc','s','sc','a','ac','n','nc','b1','b2','b3','bc','in','su','wa','er']`.
  - `type DaisyTokens = Record<string, string>` — maps a token name to an OKLCH triplet, e.g. `{ p: '65.69% 0.196 275.75' }`.
  - `readDaisyTokens(el: Element): DaisyTokens`.

- [ ] **Step 1: Write the failing test**

Create `utils/daisyThemeTokens.test.ts`. `getComputedStyle` in jsdom does not resolve custom properties set via a stylesheet, so the test sets them as inline styles, which jsdom does report.

```ts
import { describe, it, expect } from 'vitest';
import { readDaisyTokens, DAISY_TOKEN_NAMES } from './daisyThemeTokens';

describe('readDaisyTokens', () => {
  it('reads DaisyUI OKLCH triplets off an element', () => {
    const el = document.createElement('div');
    el.style.setProperty('--p', '65.69% 0.196 275.75');
    el.style.setProperty('--b1', '100% 0 0');
    document.body.appendChild(el);

    const tokens = readDaisyTokens(el);

    expect(tokens.p).toBe('65.69% 0.196 275.75');
    expect(tokens.b1).toBe('100% 0 0');
  });

  it('omits tokens the active theme does not define', () => {
    const el = document.createElement('div');
    el.style.setProperty('--p', '50% 0.1 200');
    document.body.appendChild(el);

    const tokens = readDaisyTokens(el);

    expect(tokens.p).toBe('50% 0.1 200');
    expect('wa' in tokens).toBe(false);
  });

  it('covers every DaisyUI semantic slot the bridge maps', () => {
    expect(DAISY_TOKEN_NAMES).toContain('bc');
    expect(DAISY_TOKEN_NAMES).toContain('er');
    expect(DAISY_TOKEN_NAMES).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run utils/daisyThemeTokens.test.ts`
Expected: FAIL — `Failed to resolve import "./daisyThemeTokens"`.

- [ ] **Step 3: Implement the extractor**

Create `utils/daisyThemeTokens.ts`:

```ts
/**
 * DaisyUI 4 exposes each theme's palette as OKLCH component triplets
 * (e.g. `--p: 65.69% 0.196 275.75`), consumed in CSS as `oklch(var(--p))`.
 * Reading the computed values lets any theme — all 43 registered in
 * tailwind.config.js — be forwarded without hand-porting definitions.
 */
export const DAISY_TOKEN_NAMES = [
  'p', 'pc',    // primary, primary-content
  's', 'sc',    // secondary, secondary-content
  'a', 'ac',    // accent, accent-content
  'n', 'nc',    // neutral, neutral-content
  'b1', 'b2', 'b3', // base surfaces, lightest to darkest
  'bc',         // base-content (body text)
  'in', 'su', 'wa', 'er', // info, success, warning, error
] as const;

export type DaisyTokens = Record<string, string>;

/**
 * Read the DaisyUI palette currently in effect on `el`.
 * Tokens the active theme leaves undefined are omitted rather than
 * emitted as empty strings, so consumers can fall back to their own defaults.
 */
export function readDaisyTokens(el: Element): DaisyTokens {
  const computed = getComputedStyle(el);
  const tokens: DaisyTokens = {};
  for (const name of DAISY_TOKEN_NAMES) {
    const value = computed.getPropertyValue(`--${name}`).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run utils/daisyThemeTokens.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/daisyThemeTokens.ts utils/daisyThemeTokens.test.ts
git commit -m "feat(theme): read DaisyUI OKLCH tokens from the document"
```

### Task 3.2: Map DaisyUI tokens to Mission Control's Tailwind variables

**Files:**
- Create: `mission-control/src/lib/kollektiv-theme-map.ts`
- Create: `mission-control/src/lib/__tests__/kollektiv-theme-bridge.test.ts`

**Interfaces:**
- Produces:
  - `type KollektivThemeMessage = { type: 'kollektiv:theme'; theme: string; tokens: Record<string, string> }`
  - `KOLLEKTIV_THEME_MESSAGE_TYPE = 'kollektiv:theme'`
  - `mapDaisyTokensToMcVars(tokens: Record<string, string>): Record<string, string>` — returns Mission Control CSS variable names (with leading dashes) mapped to `oklch(...)` values.
  - `isKollektivThemeMessage(data: unknown): data is KollektivThemeMessage`

- [ ] **Step 1: Write the failing test**

Create `mission-control/src/lib/__tests__/kollektiv-theme-bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  mapDaisyTokensToMcVars,
  isKollektivThemeMessage,
  KOLLEKTIV_THEME_MESSAGE_TYPE,
} from '../kollektiv-theme-map'

describe('mapDaisyTokensToMcVars', () => {
  it('wraps DaisyUI triplets in oklch() under Mission Control token names', () => {
    const vars = mapDaisyTokensToMcVars({ p: '65.69% 0.196 275.75' })
    expect(vars['--color-primary']).toBe('oklch(65.69% 0.196 275.75)')
  })

  it('maps the base surfaces to background, card and surface tokens', () => {
    const vars = mapDaisyTokensToMcVars({ b1: '100% 0 0', b2: '96% 0 0', b3: '92% 0 0' })
    expect(vars['--color-background']).toBe('oklch(100% 0 0)')
    expect(vars['--color-surface-0']).toBe('oklch(100% 0 0)')
    expect(vars['--color-surface-1']).toBe('oklch(96% 0 0)')
    expect(vars['--color-card']).toBe('oklch(96% 0 0)')
    expect(vars['--color-border']).toBe('oklch(92% 0 0)')
  })

  it('maps base-content to foreground', () => {
    const vars = mapDaisyTokensToMcVars({ bc: '27% 0.02 256' })
    expect(vars['--color-foreground']).toBe('oklch(27% 0.02 256)')
  })

  it('maps status colours', () => {
    const vars = mapDaisyTokensToMcVars({ er: '71% 0.22 22', su: '64% 0.15 160', wa: '84% 0.19 83', in: '72% 0.19 231' })
    expect(vars['--color-destructive']).toBe('oklch(71% 0.22 22)')
    expect(vars['--color-success']).toBe('oklch(64% 0.15 160)')
    expect(vars['--color-warning']).toBe('oklch(84% 0.19 83)')
    expect(vars['--color-info']).toBe('oklch(72% 0.19 231)')
  })

  it('emits nothing for tokens the theme did not define', () => {
    const vars = mapDaisyTokensToMcVars({ p: '50% 0.1 200' })
    expect(vars['--color-background']).toBeUndefined()
    expect(Object.keys(vars)).toEqual(['--color-primary'])
  })

  it('rejects values containing CSS injection characters', () => {
    const vars = mapDaisyTokensToMcVars({ p: '50% 0.1 200; background: url(evil)' })
    expect(vars['--color-primary']).toBeUndefined()
  })
})

describe('isKollektivThemeMessage', () => {
  it('accepts a well-formed message', () => {
    expect(isKollektivThemeMessage({
      type: KOLLEKTIV_THEME_MESSAGE_TYPE,
      theme: 'pipboy',
      tokens: { p: '50% 0.1 200' },
    })).toBe(true)
  })

  it('rejects other message shapes', () => {
    expect(isKollektivThemeMessage({ type: 'something-else' })).toBe(false)
    expect(isKollektivThemeMessage(null)).toBe(false)
    expect(isKollektivThemeMessage({ type: KOLLEKTIV_THEME_MESSAGE_TYPE, tokens: 'nope' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mission-control && pnpm vitest run src/lib/__tests__/kollektiv-theme-bridge.test.ts`
Expected: FAIL — cannot resolve `../kollektiv-theme-map`.

- [ ] **Step 3: Implement the mapping**

Create `mission-control/src/lib/kollektiv-theme-map.ts`:

```ts
/**
 * Maps Kollektiv's DaisyUI 4 palette onto this app's Tailwind 4 theme tokens.
 *
 * Kollektiv publishes OKLCH component triplets (`65.69% 0.196 275.75`).
 * Tailwind 4 compiles the `@theme` block in app/globals.css to real custom
 * properties on :root, so overriding `--color-*` at runtime restyles every
 * utility that references them. Wrapping the triplet in `oklch()` avoids any
 * colour-space conversion — the values are used exactly as DaisyUI computed them.
 */

export const KOLLEKTIV_THEME_MESSAGE_TYPE = 'kollektiv:theme'

export type KollektivThemeMessage = {
  type: typeof KOLLEKTIV_THEME_MESSAGE_TYPE
  theme: string
  tokens: Record<string, string>
}

/** DaisyUI token name -> Mission Control CSS variable names it feeds. */
const TOKEN_MAP: Record<string, string[]> = {
  p: ['--color-primary'],
  pc: ['--color-primary-foreground'],
  s: ['--color-secondary'],
  sc: ['--color-secondary-foreground'],
  a: ['--color-accent'],
  ac: ['--color-accent-foreground'],
  n: ['--color-muted'],
  nc: ['--color-muted-foreground'],
  b1: ['--color-background', '--color-surface-0'],
  b2: ['--color-card', '--color-popover', '--color-surface-1'],
  b3: ['--color-border', '--color-input', '--color-surface-2'],
  bc: ['--color-foreground', '--color-card-foreground', '--color-popover-foreground'],
  in: ['--color-info'],
  su: ['--color-success'],
  wa: ['--color-warning'],
  er: ['--color-destructive'],
}

/**
 * An OKLCH triplet: three space-separated numbers, the first a percentage,
 * optionally with a trailing alpha. Anything else is discarded rather than
 * interpolated into a style declaration.
 */
const SAFE_TRIPLET = /^-?[\d.]+%?\s+-?[\d.]+\s+-?[\d.]+(\s*\/\s*[\d.]+%?)?$/

export function mapDaisyTokensToMcVars(tokens: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [daisyName, cssVarNames] of Object.entries(TOKEN_MAP)) {
    const value = tokens[daisyName]
    if (!value || !SAFE_TRIPLET.test(value.trim())) continue
    for (const cssVar of cssVarNames) {
      vars[cssVar] = `oklch(${value.trim()})`
    }
  }
  return vars
}

export function isKollektivThemeMessage(data: unknown): data is KollektivThemeMessage {
  if (typeof data !== 'object' || data === null) return false
  const msg = data as Record<string, unknown>
  return (
    msg.type === KOLLEKTIV_THEME_MESSAGE_TYPE &&
    typeof msg.theme === 'string' &&
    typeof msg.tokens === 'object' &&
    msg.tokens !== null &&
    !Array.isArray(msg.tokens)
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mission-control && pnpm vitest run src/lib/__tests__/kollektiv-theme-bridge.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add mission-control/src/lib/kollektiv-theme-map.ts mission-control/src/lib/__tests__/kollektiv-theme-bridge.test.ts
git commit -m "feat(mission-control): map Kollektiv DaisyUI tokens to Tailwind theme vars"
```

### Task 3.3: Wire the bridge on both sides

**Files:**
- Create: `mission-control/src/components/kollektiv-theme-bridge.tsx`
- Modify: `mission-control/src/app/layout.tsx`
- Modify: `components/MissionControlPage.tsx`

**Interfaces:**
- Consumes: `readDaisyTokens` (Task 3.1); `mapDaisyTokensToMcVars`, `isKollektivThemeMessage`, `KOLLEKTIV_THEME_MESSAGE_TYPE` (Task 3.2).
- Produces: live theme propagation from Kollektiv to the embedded app.

- [ ] **Step 1: Create the receiving component**

Create `mission-control/src/components/kollektiv-theme-bridge.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import {
  isKollektivThemeMessage,
  mapDaisyTokensToMcVars,
} from '@/lib/kollektiv-theme-map'

/**
 * Applies Kollektiv's active theme to this app when embedded in its shell.
 *
 * Renders nothing. When this app is opened directly (not framed), no messages
 * arrive and the app keeps its own default theme.
 */
export function KollektivThemeBridge() {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Kollektiv proxies this app at /mission-control on its own origin, so a
      // legitimate theme message is always same-origin. Reject anything else.
      if (event.origin !== window.location.origin) return
      if (!isKollektivThemeMessage(event.data)) return

      const vars = mapDaisyTokensToMcVars(event.data.tokens)
      const root = document.documentElement
      for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value)
      }
      root.setAttribute('data-kollektiv-theme', event.data.theme)
    }

    window.addEventListener('message', onMessage)
    // Tell the parent we are ready. The iframe usually mounts after the parent
    // has already published its theme, so without this the first paint keeps
    // Mission Control's default palette until the next theme change.
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'kollektiv:theme-request' }, window.location.origin)
    }
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return null
}
```

- [ ] **Step 2: Mount it in the root layout**

In `mission-control/src/app/layout.tsx`, add the import with the other component imports:

```tsx
import { KollektivThemeBridge } from '@/components/kollektiv-theme-bridge'
```

Then render it as the first child inside `<body>`:

```tsx
        <KollektivThemeBridge />
```

- [ ] **Step 3: Publish tokens from the Kollektiv side**

Replace the whole body of `components/MissionControlPage.tsx` with the version below. It publishes on mount, on the child's ready signal, and whenever `data-theme` changes.

```tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { readDaisyTokens } from '../utils/daisyThemeTokens';

/**
 * Mission Control — the agent-ops department.
 *
 * Rendered in a same-origin iframe: Mission Control is a separate Next.js
 * process reverse-proxied at /mission-control (see routes/missionControlRoutes.ts).
 * Two React apps on different frameworks cannot share one tree, so an iframe
 * is the boundary even though the origin is shared.
 *
 * Kollektiv's active DaisyUI theme is forwarded across that boundary as OKLCH
 * tokens; Mission Control maps them onto its own Tailwind 4 theme variables.
 */
const MissionControlPage: React.FC = () => {
    const frameRef = useRef<HTMLIFrameElement>(null);

    const publishTheme = useCallback(() => {
        const frame = frameRef.current;
        if (!frame?.contentWindow) return;
        frame.contentWindow.postMessage(
            {
                type: 'kollektiv:theme',
                theme: document.documentElement.getAttribute('data-theme') || '',
                tokens: readDaisyTokens(document.documentElement),
            },
            window.location.origin,
        );
    }, []);

    useEffect(() => {
        // The iframe asks for the theme once its bridge has mounted, which is
        // normally after this component's first render.
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if ((event.data as { type?: string })?.type === 'kollektiv:theme-request') {
                publishTheme();
            }
        };
        window.addEventListener('message', onMessage);

        // useAppTheme sets data-theme on documentElement; re-publish when it changes.
        const observer = new MutationObserver(publishTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        return () => {
            window.removeEventListener('message', onMessage);
            observer.disconnect();
        };
    }, [publishTheme]);

    return (
        <div className="w-full h-full flex flex-col">
            <iframe
                ref={frameRef}
                src="/mission-control"
                title="Mission Control"
                className="w-full h-full border-0 flex-1"
                onLoad={publishTheme}
            />
        </div>
    );
};

export default MissionControlPage;
```

- [ ] **Step 4: Verify both typechecks are clean**

```bash
pnpm lint
cd mission-control && pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 5: Verify the bridge live**

With `pnpm dev:all` running and logged into Mission Control, open the Mission Control tab. In the devtools console, select the Mission Control iframe context and run:

```js
getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
```

Expected: an `oklch(...)` value, not the upstream `hsl(var(--primary))` default.

- [ ] **Step 6: Verify it tracks a theme change**

Switch Kollektiv's theme in Settings → Appearance (e.g. to `pipboy`, whose primary is a distinctive green). Expected: Mission Control's colours change without a reload, and re-running the Step 5 command returns a different value. Confirm `document.documentElement.dataset.kollektivTheme` in the iframe now reads the new theme name.

- [ ] **Step 7: Commit**

```bash
git add mission-control/src/components/kollektiv-theme-bridge.tsx mission-control/src/app/layout.tsx components/MissionControlPage.tsx
git commit -m "feat(theme): propagate Kollektiv's active theme into Mission Control"
```

### Task 3.4: Migrate hardcoded colour classes

20 of Mission Control's 95 component files use literal Tailwind palette classes (`bg-gray-700`, `bg-zinc-500`, `bg-slate-400`, …). Those ignore the token overrides, so they stay fixed while everything around them re-themes. This task makes them respond.

**Files:**
- Modify: the files reported by Step 1 (expected: 20 under `mission-control/src`)

**Interfaces:**
- Consumes: the token overrides applied in Task 3.3.

- [ ] **Step 1: List the offending files**

```bash
cd mission-control
grep -rlE "(bg|text|border)-(slate|zinc|gray|neutral|stone)-[0-9]+" src --include="*.tsx" | grep -v __tests__
```

Expected: ~20 paths. Work through them in the order listed.

- [ ] **Step 2: See the exact occurrences for the file you are on**

```bash
grep -nE "(bg|text|border)-(slate|zinc|gray|neutral|stone)-[0-9]+" src/<path>.tsx
```

- [ ] **Step 3: Replace literals with semantic tokens**

Apply this mapping. It follows Mission Control's existing `@theme` token names (`src/app/globals.css`), so no new tokens are introduced:

| Literal class family | Replacement |
|---|---|
| `bg-gray-900`, `bg-slate-900`, `bg-zinc-900` (page backdrop) | `bg-background` |
| `bg-gray-800`, `bg-zinc-800`, `bg-gray-750` (panel/card) | `bg-card` |
| `bg-gray-700`, `bg-zinc-700` (raised surface) | `bg-surface-2` |
| `bg-gray-500`, `bg-zinc-500`, `bg-slate-500` (muted fill) | `bg-muted` |
| `bg-gray-50`, `bg-gray-100` (light surface) | `bg-surface-1` |
| `text-gray-900`, `text-slate-900` (body text) | `text-foreground` |
| `text-gray-500`, `text-gray-400`, `text-zinc-400` (secondary text) | `text-muted-foreground` |
| `border-gray-700`, `border-zinc-700`, `border-slate-700` | `border-border` |

Where a literal is a **status** colour rather than a neutral (a red error chip, a green success dot), map it to `bg-destructive` / `bg-success` / `bg-warning` / `bg-info` instead — those tokens are also fed by the bridge.

- [ ] **Step 4: Confirm no literals remain**

```bash
cd mission-control
grep -rnE "(bg|text|border)-(slate|zinc|gray|neutral|stone)-[0-9]+" src --include="*.tsx" | grep -v __tests__
```

Expected: no output.

- [ ] **Step 5: Verify the app still typechecks and renders**

```bash
cd mission-control && pnpm typecheck
```

Expected: exit 0. Then reload the Mission Control tab and switch Kollektiv's theme twice. Expected: no element keeps a stale grey while its neighbours change.

- [ ] **Step 6: Commit**

```bash
git add mission-control/src
git commit -m "refactor(mission-control): use semantic colour tokens so all surfaces re-theme"
```

---

## Phase 4 — Platform gating and tool access

### Task 4.1: Hide the terminal viewer on Windows

The PTY terminal attaches via `tmux attach-session` (`src/lib/pty-manager.ts:106-109`) and throws a `brew install tmux` / `apt install tmux` error on any host without tmux. On Windows it can never succeed. Hiding the entry point turns a confusing mid-session error into an absent feature.

**Files:**
- Create: `mission-control/src/lib/terminal-availability.ts`
- Create: `mission-control/src/lib/__tests__/terminal-availability.test.ts`
- Modify: the component rendering the terminal entry point (located in Step 4)

**Interfaces:**
- Produces: `isTerminalSupported(platform: string): boolean` — `false` for `'win32'`, `true` for `'darwin'` and `'linux'`.

- [ ] **Step 1: Write the failing test**

Create `mission-control/src/lib/__tests__/terminal-availability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isTerminalSupported } from '../terminal-availability'

describe('isTerminalSupported', () => {
  it('is false on Windows, where tmux does not exist', () => {
    expect(isTerminalSupported('win32')).toBe(false)
  })

  it('is true on platforms where tmux can be installed', () => {
    expect(isTerminalSupported('darwin')).toBe(true)
    expect(isTerminalSupported('linux')).toBe(true)
  })

  it('is false for unknown platforms rather than optimistically true', () => {
    expect(isTerminalSupported('haiku')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mission-control && pnpm vitest run src/lib/__tests__/terminal-availability.test.ts`
Expected: FAIL — cannot resolve `../terminal-availability`.

- [ ] **Step 3: Implement it**

Create `mission-control/src/lib/terminal-availability.ts`:

```ts
/**
 * The terminal viewer attaches to agent sessions with `tmux attach-session`
 * (see lib/pty-manager.ts). tmux has no Windows build, so the feature can
 * never succeed there and its entry point is hidden rather than left to fail
 * with an install hint that names brew and apt.
 */
const TMUX_CAPABLE_PLATFORMS = new Set(['darwin', 'linux'])

export function isTerminalSupported(platform: string): boolean {
  return TMUX_CAPABLE_PLATFORMS.has(platform)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mission-control && pnpm vitest run src/lib/__tests__/terminal-availability.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Find the terminal entry point**

```bash
cd mission-control
grep -rln "terminal-view\|TerminalView\|/pty/attach" src --include="*.tsx" | grep -v __tests__
```

This lists the components that mount or link to the terminal. `src/components/terminal/terminal-view.tsx` is the view itself; the entry point is whichever component renders or routes to it.

- [ ] **Step 6: Gate the entry point**

`isTerminalSupported` needs the server's platform, not the browser's — the tmux process would run on the server. Mission Control already exposes it: `GET /api/pty/setup` returns `{ platform, ready }`. In the component found in Step 5, fetch that once and skip rendering the terminal control when unsupported:

```tsx
const [terminalSupported, setTerminalSupported] = useState<boolean | null>(null)

useEffect(() => {
  let cancelled = false
  fetch('/mission-control/api/pty/setup')
    .then((r) => r.json())
    .then((d: { platform?: string }) => {
      if (!cancelled) setTerminalSupported(isTerminalSupported(d.platform ?? ''))
    })
    .catch(() => { if (!cancelled) setTerminalSupported(false) })
  return () => { cancelled = true }
}, [])
```

Then wrap the terminal entry point in `{terminalSupported && ( ... )}`. Import `isTerminalSupported` from `@/lib/terminal-availability`. The `null` initial state means "unknown" and renders nothing, so the control never flashes in and out.

- [ ] **Step 7: Verify**

```bash
cd mission-control && pnpm typecheck
```

Expected: exit 0. Then reload the Mission Control tab: the terminal entry point must be absent, with no console error about tmux.

- [ ] **Step 8: Commit**

```bash
git add mission-control/src
git commit -m "feat(mission-control): hide terminal viewer where tmux is unavailable"
```

### Task 4.2: Give agents access to Kollektiv's tools

Mission Control has no MCP client and never spawns agents, so it cannot inject tool config into them. What it *can* do is observe agents that already have Kollektiv's tools registered. This task registers Kollektiv's MCP server with Claude Code and documents the two real constraints.

**Files:**
- Create: `docs/handbook/docs/05_MCP/KOLLEKTIV_TOOLS_FOR_AGENTS.md`
- Modify: `docs/handbook/docs/05_MCP/MCP_SPEC.md`

**Interfaces:**
- Consumes: Kollektiv's MCP server on `http://127.0.0.1:3012` (`server.ts:1094-1105`).

- [ ] **Step 1: Confirm the MCP endpoint responds**

With Kollektiv running (`pnpm dev`), initialize an MCP session:

```bash
curl -s -X POST http://127.0.0.1:3012/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  -i | head -30
```

Expected: HTTP 200 with an `mcp-session-id` response header and a JSON-RPC result naming the server. If this fails, Kollektiv is not running or `startKollektivMcp` errored — check its console output for `[Kollektiv MCP]`.

- [ ] **Step 2: Register the server with Claude Code**

Run in whichever project directory the agents work in:

```bash
claude mcp add --transport http kollektiv http://127.0.0.1:3012/
```

- [ ] **Step 3: Verify the tools are visible to an agent**

```bash
claude mcp list
```

Expected: `kollektiv` listed as connected. Kollektiv declares 100 tools in `mcp-config.json`.

- [ ] **Step 4: Write the documentation**

Create `docs/handbook/docs/05_MCP/KOLLEKTIV_TOOLS_FOR_AGENTS.md`:

```markdown
# Kollektiv tools for Mission Control agents

Kollektiv runs its own MCP server on every boot — `startKollektivMcp({ port: 3012 })`
in `server.ts` — serving the 100 tools declared in `mcp-config.json` over
StreamableHTTP. The HTTP handler does no path routing, so any path on port 3012
is the MCP endpoint.

## Registering

Run in the project directory the agent works in:

    claude mcp add --transport http kollektiv http://127.0.0.1:3012/

Kollektiv must be running (`pnpm dev`) for the endpoint to answer.

## Two constraints worth knowing before relying on this

**62 of the 100 tools are `browser-context`.** They execute inside Kollektiv's
browser tab, so they only work while Kollektiv is open in a browser. The
remaining 38 are `server-context` and work headlessly. Check a tool's
`executionKind` in `mcp-config.json` before depending on it from an unattended
agent.

**35 tools declare a `permissions` array.** These are gated by
`CALLER_PERMISSIONS` in `services/kollektivMcp.ts`; `grantMcpPermissions()`
must have been called from the browser side or the call is refused with
`Missing required permissions: ...`.

## What Mission Control does and does not do here

Mission Control observes agent sessions — it does not spawn them and has no MCP
client of its own. Registering this server is therefore an agent-side
configuration step, not a Mission Control feature. Mission Control's value is
that the sessions it reports on are the same sessions that have these tools.
```

- [ ] **Step 5: Link it from the MCP spec**

Append to the end of `docs/handbook/docs/05_MCP/MCP_SPEC.md`:

```markdown

## Related

- [KOLLEKTIV_TOOLS_FOR_AGENTS.md](KOLLEKTIV_TOOLS_FOR_AGENTS.md) — registering Kollektiv's MCP server with external coding agents, and the browser-context / permission constraints that apply.
```

- [ ] **Step 6: Commit**

```bash
git add docs/handbook/docs/05_MCP/
git commit -m "docs(mcp): document registering Kollektiv's tools with agents"
```

---

## Phase 5 — Verification and documentation

### Task 5.1: End-to-end verification

**Files:** none modified — this task only runs checks.

- [ ] **Step 1: Full typecheck, both apps**

```bash
pnpm lint
cd mission-control && pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 2: Full test run, both apps**

```bash
pnpm test
cd mission-control && pnpm test
```

Expected: Kollektiv green. Mission Control must match the Task 0.2 Step 9 baseline — any *new* failure is a regression from this work and must be fixed, not accepted.

- [ ] **Step 3: Validate the MCP config gate**

Kollektiv has a CI gate on `mcp-config.json`:

```bash
pnpm validate-config
```

Expected: `PASSED — 0 errors`. (This runs automatically on commit via husky; running it explicitly here catches problems before the final commit.)

- [ ] **Step 4: Walk the integrated app**

With `pnpm dev:all` running, confirm each of these:

1. `http://localhost:7500` loads Creative mode as before.
2. The Mission Control tab renders the embedded app with no `frame-ancestors` console error.
3. Switching Kollektiv's theme re-themes Mission Control without a reload.
4. Mission Control's Claude sessions view lists real sessions from this machine.
5. The activity view streams (SSE through the proxy) rather than hanging — leave it open and confirm updates arrive.
6. No terminal entry point appears.
7. Stopping the Mission Control process shows the `MISSION_CONTROL_UNREACHABLE` JSON rather than a hang; restarting it recovers.

- [ ] **Step 5: Confirm Creative mode is unaffected when Mission Control is down**

Stop Mission Control, reload `http://localhost:7500`, and use a Creative tab (Gallery or Prompts). Expected: fully functional. The two departments must be independent — a Mission Control outage must not degrade Creative mode.

### Task 5.2: Document the new mode

**Files:**
- Modify: `README.md`
- Modify: `docs/handbook/README.md`

- [ ] **Step 1: Add a Mission Control section to the root README**

Insert after the "Creative Utilities" section in `README.md`:

```markdown
### 4. Mission Control (Agent Ops)

A second department alongside the creative suite: a self-hosted control plane for
observing and governing external coding-agent sessions. Forked from
[builderz-labs/mission-control](https://github.com/builderz-labs/mission-control) (MIT)
and embedded in the Kollektiv shell at the Mission Control tab.

*   **Claude Code session observability**: discovers local sessions by scanning
    `~/.claude/projects`, with per-project grouping, token counts, and estimated cost.
*   **Task inbox & agent registry**: assignment, quality gates, and completion tracking
    for registered agents.
*   **Activity, schedules, and alerts**: live event stream over SSE, cron-style schedules,
    webhooks, and audit logs.
*   **Themed with Kollektiv**: follows whichever of Kollektiv's themes is active.

Run both departments together with `pnpm dev:all` (Kollektiv on :7500,
Mission Control on :3100 behind `/mission-control`). `pnpm dev` still starts
Creative mode alone.

> **Platform note:** Mission Control's live terminal viewer requires tmux and is
> therefore unavailable on Windows; its entry point is hidden. Everything else —
> session discovery, tasks, activity, cost — is cross-platform.
```

- [ ] **Step 2: Add the handbook pointer**

In `docs/handbook/README.md`, add to the Architecture Handbook list:

```markdown
- [../plans/2026-07-29-mission-control-fork-design.md](../plans/2026-07-29-mission-control-fork-design.md) — the Mission Control fork: integration model, platform constraints, and rejected alternatives
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/handbook/README.md
git commit -m "docs: document Mission Control mode"
```

---

## Self-review notes

Checked against `docs/plans/2026-07-29-mission-control-fork-design.md`:

- **Spec coverage.** Repo layout → 0.1. Process model → 0.2, 1.4. Reverse proxy incl. WS/SSE → 1.3. Subpath serving → 1.1. Framing headers (all three sites) → 1.2. Shell tab/iframe → 2.1. Theme bridge → 3.1–3.3. Hardcoded-class migration → 3.4. Terminal gating → 4.1. Tool sharing → 4.2. Auth seeding → 0.2 Step 2. SQLite location → left at upstream default under `mission-control/.data/`, ignored in 0.1 Step 4.
- **Deliberately not covered**, matching the spec's out-of-scope list: hosted deployment, non-Claude runtime integrations, a Mission Control-side MCP client, reverse-direction task dispatch.
- **Known soft spot.** Task 4.1 Step 5 locates the terminal entry point by grep rather than naming a file, because which component renders it was not verified during planning. The grep is exact and the gating pattern is fully specified, but the implementer should expect to read one or two components before editing.
- **Type consistency.** `readDaisyTokens`/`DaisyTokens`/`DAISY_TOKEN_NAMES` (3.1) are consumed only in 3.3. `mapDaisyTokensToMcVars`/`isKollektivThemeMessage`/`KOLLEKTIV_THEME_MESSAGE_TYPE` (3.2) are consumed in 3.3. `isTerminalSupported` (4.1) is consumed in 4.1 Step 6. The `'kollektiv:theme'` message shape is defined once in 3.2 and produced in 3.3 Step 3; the `'kollektiv:theme-request'` reply is defined in 3.3 Step 1 and handled in 3.3 Step 3. `MISSION_CONTROL_TARGET`/`createMissionControlProxy`/`attachMissionControlUpgrade` (1.3) are consumed in 1.3 Step 7.
