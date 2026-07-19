# Contributing to Kollektiv

Kollektiv is a local-first, single-page web app (React 19 + TypeScript + Vite,
with a thin Express dev/proxy server). This guide covers setup, the local
workflow, and the definition of done. Read alongside
[docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [ISSUES.md](ISSUES.md).

---

## Prerequisites

- **Node** 20+ (`@types/node` is pinned to 20).
- **pnpm 11.5.3** — this is the declared package manager (`packageManager` field).
  Use it, not npm/yarn, so the lockfile stays consistent.
- A **Chromium browser** for running the app — it depends on the File System
  Access API and other Chromium-only web APIs.

## Setup

```bash
pnpm install
pnpm run dev          # starts Vite (middleware mode) inside Express via tsx
```

`pnpm run dev:https` runs the app behind ngrok (needed for OAuth flows that
require HTTPS redirects, e.g. Spotify).

## Everyday scripts

| Command | What it does |
|---|---|
| `pnpm run dev` | Dev server (`npx tsx server.ts`) |
| `pnpm run dev:https` | Dev server behind ngrok (HTTPS) |
| `pnpm run lint` | **`tsc --noEmit`** — the type gate; must pass |
| `pnpm test` | Vitest unit tests (`vitest run`) |
| `pnpm run test:e2e` | Playwright E2E tests |
| `pnpm run build` | Production bundle (`vite build`) |
| `pnpm run preview` | Serve the built bundle |
| `pnpm run deploy` | `predeploy` builds, then `gh-pages -d dist` |

## Branching & commits

- Branch off `main`. Don't commit directly to `main`.
- **Conventional Commits.** The history uses `type(scope): summary`, e.g.
  `fix(google-auth): …`, `feat(footer): …`, `refactor(settings): …`. Match it.
  Common types here: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`.
- Reference an issue when one exists: `Fixes ISSUE-1` (see [ISSUES.md](ISSUES.md)).
- Keep commits scoped to one logical change. A feature removal and its import
  cleanup belong in the **same** commit.

## Definition of done

A change is done when **all** of these hold:

1. **`pnpm run lint` passes** (`tsc --noEmit`, clean). This catches unused
   imports/params and switch fallthrough — fix them, don't suppress them.
2. **You ran it.** Tests for logic you touched (`pnpm test`), or the app itself
   for UI/flows. Report failing tests as failing.
3. **No scratch files staged.** No `*.bak`, no throwaway `*.py`/scripts, no
   editor cruft. Check `git status` before committing (see
   [Housekeeping](#housekeeping)).
4. **Persistence verified** if you added/changed a setting — confirm it survives
   a reload (settings persist only if the field is in `SetupPage`'s
   `handleSettingsChange` allow-list; see CODING_STANDARDS §4).
5. **Clean-build safe.** If your change references a static asset or new file,
   confirm it's committed and appears in `dist/` after `pnpm run build` — not
   just present in your working tree.

## Security & secrets

- **Never commit secrets** — API keys, OAuth client secrets, tokens — in source,
  in `package.json` scripts, or in committed HTML. Use environment variables or
  the in-app settings UI.
- **Local dev secrets go in `.env`** (gitignored). Copy `.env.example` to `.env`
  and fill in real values — e.g. `OBSIDIAN_API_KEY` for the optional Obsidian MCP
  bridge (`pnpm run obsidian:mcp`, or the auto-started bridge in `server.ts` —
  both are skipped entirely if the var is unset). Adding a new local-only secret?
  Add its placeholder to `.env.example` in the same change.
- Gmail/Drive assistant tools have real, irreversible power (send/delete email).
  Keep them behind the existing `confirmSensitiveAction` confirmation.
- Don't widen the `server.ts` `/proxy-remote` forwarder (see CODING_STANDARDS §6).

## Housekeeping

The repo has picked up scratch artifacts from scripted edits. Before you push:

- Delete any `components/*.bak*` copies.
- Delete throwaway migration scripts (`remove_*.py`, `fix_*.py`) once their edit
  is committed — they don't belong in version control.
- Ensure `.gitignore` covers `*.bak` and local-only scripts (tracked as ISSUE-3).

## Filing work

Track tasks in [ISSUES.md](ISSUES.md) using the checkbox format already there.
Give each issue an ID (`ISSUE-N`), a severity, acceptance criteria, and check off
sub-tasks as you complete them. This markdown file *is* the issue tracker — there
is no external one.

## Reviews

Changes get a two-axis review (see `docs/` review tooling): **Standards** (does it
follow CODING_STANDARDS.md) and **Spec** (does it do what the issue/commit asked).
Both must pass. Reviewers skip anything tooling already enforces and focus on
correctness, the documented standards, and spec fidelity.
