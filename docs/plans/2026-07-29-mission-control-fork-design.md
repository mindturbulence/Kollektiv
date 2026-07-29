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

## Theming

- Kollektiv's active theme name gets written to a cookie (e.g. `kollektiv_theme=pipboy`) on theme switch, readable by Mission Control since they're same-origin behind the proxy.
- Mission Control's root layout reads that cookie server-side (Next.js Server Component) and sets `data-theme` on `<html>` at render time — avoids a flash of the wrong theme.
- `globals.css` gets 4 additional `[data-theme="..."]` blocks (`mindturbulence`, `pipboy`, `abyss`, `explorer`) defining the same CSS variable names (`--color-primary`, `--color-background`, `--color-surface-*`, etc.) already declared in its `@theme` block, mapped to Kollektiv's existing palette values for each theme.
- The 20 component files using hardcoded Tailwind color classes get migrated to the semantic token classes (`bg-background`, `text-foreground`, etc.) so they actually respond to the swap — this is the real, bounded cost of "dynamic" over "fixed" theming.

## Agent scope (v1)

- **Claude Code**: adapt the existing PTY session-attach mechanism (`api/pty/attach`, `api/claude/sessions`, `api/claude-tasks`) to run against your machine — this is real, already-built functionality, not new protocol work.
- **Generic `FrameworkAdapter` interface and its 5 stub files**: left in place, untouched, not wired to anything. Zero-cost to keep; gives a documented seam for a real integration later if you ever run CrewAI/AutoGen/LangGraph/OpenClaw yourself. No work is done to "support" these runtimes in v1 beyond what already exists upstream.

## Auth

- Local-only, single-user: seed `AUTH_USER`/`AUTH_PASS` via `.env` so there's no manual `/setup` wizard step, matching Kollektiv's own low-friction local experience. `MC_ALLOWED_HOSTS` stays at its safe default (`localhost,127.0.0.1,::1`).
- No SSO/shared-session bridge with Kollektiv — Kollektiv has no auth layer of its own today, and adding one just to unify with Mission Control's is out of scope here.

## Data storage

- Mission Control keeps its own default `.data/` SQLite file, inside `mission-control/.data/` — not integrated into Kollektiv's local-first vault (different storage model: Kollektiv is File System Access API + IndexedDB in-browser, Mission Control is a server-side SQLite file). No attempt to unify these in v1.

## Explicitly out of scope for this version

- Hosted/public deployment (GitHub Pages can't run a persistent Node server or SQLite; this would need a separate always-on host and cross-origin auth — a materially bigger project).
- Real integration logic for CrewAI, AutoGen, LangGraph, OpenClaw, or any runtime beyond Claude Code.
- Deep interop between Mission Control's task registry and Kollektiv's own capability/assistant-tool platform (e.g. dispatching creative-mode work as Mission Control tasks) — the two agent systems stay separate; Mission Control governs external coding-agent sessions only.

## Testing / verification

- `mission-control/` keeps its own existing test suite (`vitest`, its adapter compliance tests, etc.) — run as-is post-fork to confirm the fork didn't break anything upstream.
- New work (proxy route, iframe shell tab, theme cookie handoff, header change) gets manually verified in a running dev session: switch Kollektiv's theme and confirm Mission Control's embedded view re-themes; confirm WebSocket-backed PTY terminal and SSE activity stream both work through the proxy, not just static pages.
