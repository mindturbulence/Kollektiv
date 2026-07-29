# Mission Control Fork — Design

**Status:** Draft, pending user review
**Date:** 2026-07-29

## Summary

Fork [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control) (MIT licensed) into this repo as a second "department" — an agent-ops control plane for governing external coding-agent sessions (starting with Claude Code) — running alongside Kollektiv's existing creative studio. Both are reachable from one shell via a new `mission_control` tab, with Mission Control's screens reverse-proxied to the same origin and reskinned to follow Kollektiv's active theme.

This is scoped for **local, single-user use on your own machine** — not a hosted/public deployment.

## What Mission Control actually is (verified against the cloned source, not just the README)

- Next.js 16 + React 19 app, SQLite (`better-sqlite3`, WAL) for state, `.data/` directory for the DB file and auto-generated secrets.
- Real depth exists specifically for **Claude Code**: `src/app/api/claude/sessions/route.ts` (107 lines), `src/app/api/pty/attach/route.ts` (94 lines — spawns/attaches to an actual `claude` CLI process over a pseudo-terminal via `src/lib/pty-websocket.ts`), and `src/app/api/claude-tasks/route.ts`.
- Separately, `src/lib/adapters/` has a generic `FrameworkAdapter` interface (`register`/`heartbeat`/`reportTask`/`getAssignments`) with 6 near-identical ~53-line implementations (`claude-sdk`, `autogen`, `crewai`, `langgraph`, `openclaw`, `generic`). None contains protocol-specific logic — they're a shared webhook shape waiting for an external client that isn't in this repo. Real integration work only exists for Claude Code, via the PTY path, not this generic layer.
- Ships its own theming: Tailwind 4 `@theme` block in `src/app/globals.css` defining semantic CSS variables (`--color-primary`, `--color-background`, `--color-surface-0..3`, `--color-void-*`, etc.), the same variable-driven pattern Kollektiv already uses (`[data-theme="pipboy"]` etc. in `index.css`). 20 of 95 component files bypass these tokens with hardcoded Tailwind classes (`bg-gray-700`, `bg-zinc-500`, ...).
- `src/proxy.ts` sets `X-Frame-Options: DENY` unconditionally — refuses to be framed at all, by design (it expects to be reached directly, per its own hardening docs).
- Uses real WebSocket (PTY terminal I/O, `src/lib/websocket.ts`, `src/lib/pty-websocket.ts`) and SSE (`api/events/route.ts`, `api/v1/runs/stream/route.ts`) — not just request/response HTTP.
- Auth: session cookie + `AUTH_USER`/`AUTH_PASS` (env-seeded or via a first-run `/setup` wizard), plus an auto-generated `API_KEY` for headless access. `MC_ALLOWED_HOSTS` defaults to `localhost,127.0.0.1,::1`.
- Default dev port 3000 (`next dev --port ${PORT:-3000}`). No collision with Kollektiv's Express+Vite server, which defaults to port 7500 (`server.ts`).

**Important expectation-setter:** Mission Control's Claude Code integration launches/attaches to *separate* `claude` CLI sessions on your machine (e.g. for other repos or tasks) via PTY. It does not observe or control the session you're using to read this document — that's a different invocation path (this IDE/harness integration, not a bare CLI PTY spawn).

## Architecture

```
Kollektiv (Vite/Express, :7500)          Mission Control fork (Next.js, :3000 or configured port)
┌────────────────────────────┐            ┌───────────────────────────────┐
│ App.tsx tab switcher        │  proxy    │ Next.js app, SQLite (.data/)   │
│  ...existing tabs...        │ ───────►  │ Claude Code PTY sessions       │
│  'mission_control' (new) ───┼──iframe──►│ Task inbox / activity / cost   │
└────────────────────────────┘  same-     │ Generic FrameworkAdapter       │
                                  origin    │  (kept dormant, unused in v1) │
                                            └───────────────────────────────┘
```

- **Repo layout:** `mission-control/` subfolder at repo root — the forked app, its own `package.json`, own README noting it's a fork of builderz-labs/mission-control (MIT, upstream link kept for reference/manual re-diffing later).
- **Process model, local dev:** Kollektiv's `pnpm dev` continues to start the Express/Vite server on :7500. A second process runs Mission Control's Next.js dev server on its own port. `npm-run-all`/`concurrently` (already-available pattern, or a plain shell script) starts both from one `pnpm dev` invocation — exact mechanism decided in the implementation plan, not here.
- **Shell integration:** add `'mission_control'` to `types.ts`'s `ActiveTab` union, a nav entry, and a `MissionControlPage.tsx` that renders an `<iframe src="/mission-control">` pointing at the reverse-proxied path.
- **Reverse proxy:** Express gains a `/mission-control` route (alongside the existing `/proxy-remote` pattern in `vite.config.ts`) that forwards to the Next.js process. Because Mission Control uses real WebSocket and SSE, this proxy needs explicit `upgrade` event handling (not just HTTP request forwarding) and unbuffered SSE passthrough — this is real, scoped plumbing work, not a copy-paste of the existing HTTP-only proxy.
- **Subpath serving:** Mission Control's `next.config.js` needs `basePath: '/mission-control'` (and `assetPrefix`) so its own asset/API URLs resolve correctly when served from a subpath instead of the origin root.
- **Framing:** replace the blanket `X-Frame-Options: DENY` in `src/proxy.ts` with a CSP `frame-ancestors 'self'` (drop `X-Frame-Options` or set it to `SAMEORIGIN`) — since the proxy makes Kollektiv and Mission Control same-origin, this permits the iframe embed without opening framing to arbitrary sites.

## Theming — token bridge, not ported theme definitions

An earlier draft proposed hand-writing 4 theme blocks into Mission Control's CSS. **`tailwind.config.js` actually registers 43 DaisyUI themes** (`Kollektiv`, `Stellar`, `pipboy`, `abyss`, `Arc`, `sanrita`, `MindTurbulence`, `synthwave`, `cyberpunk`, `dracula`, `nord`, …), not the 4 the README highlights. Hand-porting 43 theme definitions into a second app is not viable and would drift on every change.

Instead, bridge the *computed tokens* at runtime — one mechanism that covers all 43 themes and any future one:

- Kollektiv is DaisyUI 4 (`daisyui@4.12.24` installed). DaisyUI 4 sets OKLCH component triplets on the themed element: `--p`, `--pc`, `--s`, `--sc`, `--a`, `--ac`, `--n`, `--nc`, `--b1`, `--b2`, `--b3`, `--bc`, `--in`, `--su`, `--wa`, `--er` (verified in `node_modules/daisyui/dist/themes.css`, e.g. `[data-theme=dark] { --p: 65.69% 0.196 275.75; ... }`).
- `hooks/useAppTheme.ts:13` already sets `data-theme` on `document.documentElement`. After it applies, Kollektiv reads those variables with `getComputedStyle` and `postMessage`s them to the Mission Control iframe.
- Mission Control is Tailwind 4, whose `@theme` block compiles to real CSS custom properties on `:root` (confirmed against current Tailwind docs: theme variables are emitted as `:root { --color-*: … }` and are intended to be read/overridden at runtime). A small client component in Mission Control receives the message and sets `--color-primary`, `--color-background`, `--color-foreground`, `--color-surface-0..3`, `--color-border`, `--color-destructive`, `--color-success`, `--color-warning`, `--color-info` on `document.documentElement` as `oklch(<triplet>)` values.
- No color-space conversion is needed: Mission Control's `@theme` maps `--color-primary: hsl(var(--primary))`, but overriding the final `--color-primary` token directly with an `oklch(...)` value supersedes it, and inline styles on `:root` outrank the stylesheet.
- The 20 component files using hardcoded Tailwind color classes (`bg-gray-700`, `bg-zinc-500`, …) don't respond to token overrides. Migrating them to semantic classes (`bg-background`, `text-foreground`, `border-border`) is the real bounded cost of dynamic theming, and is scoped as its own phase so the bridge can ship and be verified before the sweep.

## Agent scope (v1) — corrected for Windows

An earlier draft of this spec scoped v1 around Mission Control's PTY terminal integration. **That was wrong on this machine and has been corrected.** The correction:

- `src/lib/pty-manager.ts:106-109` builds its attach command as `tmux attach-session -t <id>`, and `createPtySession` throws `"tmux is not installed. Install it with: brew install tmux (macOS) or apt install tmux (Linux)"` when tmux is missing (`pty-manager.ts:252-259`). `api/pty/setup/route.ts` returns `installCommand: null` for any platform that isn't `darwin`/`linux`. tmux has no Windows build; this host is Windows 11.
- Crucially, **Mission Control never spawns agents itself.** `createPtySession` only *attaches* to a tmux session that already exists and errors if it doesn't. tmux therefore gates exactly one feature — the live terminal viewer for externally-created sessions — not the agent-session concept.
- Everything else is SQLite- and HTTP-driven and platform-neutral. Verified: `api/claude/sessions/route.ts` is a pure SQLite read over a `claude_sessions` table, and its POST calls `syncClaudeSessions()` in `src/lib/claude-sessions.ts`, which scans `~/.claude/projects/` with `readdirSync` + `path.join` — cross-platform. This host already has 21 project directories with `.jsonl` transcripts under `C:\Users\dwun2\.claude\projects`, so session discovery and token/cost stats populate with real data on first scan.

**v1 scope, therefore:**

- **Claude Code session observability (works on Windows now):** session discovery, per-project grouping, token counts, and estimated cost via `syncClaudeSessions()` — reading transcripts Claude Code already writes. Plus the platform-neutral surface: task inbox, `/api/agents` registration, activity SSE stream, memory, skills, cost tracking.
- **Live terminal viewer: platform-gated, excluded from v1.** Left in the codebase untouched; its UI entry point is hidden when `process.platform === 'win32'` so it fails visibly at the gate rather than throwing a tmux error mid-session.
- **Generic `FrameworkAdapter` and its 5 sibling files** (`autogen`, `crewai`, `langgraph`, `openclaw`, `claude-sdk`): left in place, untouched, unwired. Zero cost to keep; a documented seam if another runtime is ever used.

**Rejected: running Mission Control inside WSL2 to get tmux.** This repo lives on `D:\`, so WSL agents would reach it through `/mnt/d/` (poor filesystem performance, unreliable file watching), `better-sqlite3` would need rebuilding against the WSL Node, and "one command center" would then straddle two operating systems. Revisit only if the terminal viewer turns out to carry the majority of Mission Control's value.

## Tool sharing — Kollektiv's tools available to agents

Verified seam: Kollektiv already runs its own MCP server. `server.ts:1094-1105` calls `startKollektivMcp({ port: 3012 })` on every boot, and `services/kollektivMcp.ts` serves MCP over `StreamableHTTPServerTransport` on `http://127.0.0.1:3012` (the HTTP handler does no path routing, so any path on that port is the MCP endpoint). `mcp-config.json` declares **100 tools**.

Two constraints that shape what "whatever tools available" actually means:

- **62 of the 100 tools are `executionKind: "browser-context"`** — they execute inside Kollektiv's browser tab, so they only work while Kollektiv is open in a browser. The other 38 are `server-context` and work headlessly.
- **35 tools declare a `permissions` array**, gated by `CALLER_PERMISSIONS` in `services/kollektivMcp.ts:59-85`; `grantMcpPermissions()` must be called from the browser side before those tools will execute.

**Mechanism.** Mission Control has no MCP *client* — its MCP-related files (`src/lib/mcp-audit.ts`, `api/mcp-audit/verify/route.ts`, `src/lib/agent-evals.ts`) audit MCP configurations, and `scripts/mc-mcp-server.cjs` exposes Mission Control itself as an MCP server. Since Mission Control also never spawns agents, it has no hook point to inject MCP config into them. So tool sharing is **not** "Mission Control configures agents." It is: register Kollektiv's MCP endpoint with Claude Code in the projects agents work in, so any agent session — including ones Mission Control observes — can call Kollektiv's tools. That is a config registration plus documentation, not an integration layer.

## Framing and auth (verified specifics)

Three places block the embed, all of which the fork must change:

- `src/lib/csp.ts:8` — `frame-ancestors 'none'` → must become `'self'`.
- `src/proxy.ts:132` — `response.headers.set('X-Frame-Options', 'DENY')` → `SAMEORIGIN`.
- `next.config.js` `headers()` — a second `X-Frame-Options: DENY` → `SAMEORIGIN`.

`src/proxy.ts` redirects page routes to `/login` when no session cookie is present, so the iframe shows Mission Control's login screen on first load. With `AUTH_USER`/`AUTH_PASS` seeded in `.env` that is a one-time login, and the session cookie's `SameSite=strict` is fine because the reverse proxy makes both apps same-origin.

`src/lib/csp.ts:13` already permits `connect-src ... http://127.0.0.1:* http://localhost:*`, so no CSP change is needed for Mission Control's client code to reach local services.

## Auth

- Local-only, single-user: seed `AUTH_USER`/`AUTH_PASS` via `.env` so there's no manual `/setup` wizard step, matching Kollektiv's own low-friction local experience. `MC_ALLOWED_HOSTS` stays at its safe default (`localhost,127.0.0.1,::1`).
- No SSO/shared-session bridge with Kollektiv — Kollektiv has no auth layer of its own today, and adding one just to unify with Mission Control's is out of scope here.

## Data storage

- Mission Control keeps its own default `.data/` SQLite file, inside `mission-control/.data/` — not integrated into Kollektiv's local-first vault (different storage model: Kollektiv is File System Access API + IndexedDB in-browser, Mission Control is a server-side SQLite file). No attempt to unify these in v1.

## Explicitly out of scope for this version

- Hosted/public deployment (GitHub Pages can't run a persistent Node server or SQLite; this would need a separate always-on host and cross-origin auth — a materially bigger project).
- Real integration logic for CrewAI, AutoGen, LangGraph, OpenClaw, or any runtime beyond Claude Code.
- The live PTY terminal viewer (tmux, Unix-only — see "Agent scope" above).
- Building an MCP *client* inside Mission Control so its own backend can call Kollektiv tools. Tool sharing in v1 is agent-side MCP registration; a Mission Control-side client is a separate project with its own justification.
- Dispatching Kollektiv creative work as Mission Control tasks (i.e. the reverse direction). Mission Control observes external coding-agent sessions; Kollektiv's assistant loop stays its own system.

## Testing / verification

- `mission-control/` keeps its own existing test suite (`vitest`, its adapter compliance tests, etc.) — run as-is post-fork to confirm the fork didn't break anything upstream.
- New work (proxy route, iframe shell tab, theme cookie handoff, header change) gets manually verified in a running dev session: switch Kollektiv's theme and confirm Mission Control's embedded view re-themes; confirm WebSocket-backed PTY terminal and SSE activity stream both work through the proxy, not just static pages.
