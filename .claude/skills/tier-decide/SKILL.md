---
name: tier-decide
description: Jev-compatible decisions with failover (OpenRouter Jev -> beatapi.io Jev -> Claude as last resort) plus a task router that picks the model tier, working role and thinking effort. Use for any sort/classify/score/yes-no decision over text, and to choose which tier agent (tier-haiku / tier-sonnet / tier-opus) and role should do a coding task. The decision backend decides; Claude writes.
---

# tier-decide — Jev-style decisions with failover, plus tier / role / thinking routing

**Jev decides, Claude writes.** Send `state` plus typed `questions`, get typed answers with a confidence. The request
and response shape is the same as `~/.claude/skills/jev/jev.mjs`, so either can be swapped in.

## Backend chain (first that works wins)

| # | Backend | Needs | Notes |
|---|---|---|---|
| 1 | **OpenRouter Jev** (`typesafe/jev-1.13`, via the global jev skill) | `OPENROUTER_API_KEY` or `~/.jev/openrouter.key` | Read-only import of `~/.claude/skills/jev/jev.mjs`. **Status 2026-10-06: HTTP 402 "Insufficient credits" — dead until credits are added.** |
| 2 | **beatapi.io Jev** (`jev-1.13-free`, `POST https://api.beatapi.io/v1/systemone`) | `BEATAPI_API_KEY` or `~/.jev/beatapi.key` | Documented at huggingface.co/blog/karmen-beatapi/how-to-use-a-free-jev-api. `state` is sent as text. |
| 3 | **Claude** (Haiku via `claude -p`) | nothing | Last resort. Confidence is self-reported, not calibrated; ~10 s and ~$0.006 per call. |

Fail-over triggers: missing key (skipped, no penalty), HTTP/network error, timeout, or an answer that fails validation
(wrong type, out of range, unknown choice — the chain **fails closed**, a bad answer never routes anything). A backend that
returns 401/402/403 is skipped for 10 minutes, any other failure for 60 s (`test-results/tier/backend-state.json`,
git-ignored), so a dead endpoint costs one call, not one per decision. A 429 with `Retry-After` ≤ 2 s is retried once.
Output adds `backend` and `attempts` (what was tried and why it failed). Keys never appear in output or logs (scrubbed).

```bash
node .claude/skills/tier-decide/decide.mjs request.json [--backend openrouter,beatapi,claude]
node .claude/skills/tier-decide/decide.mjs --status      # which backends have keys / are cooling down (no keys shown)
node .claude/skills/tier-decide/decide.mjs --selfcheck   # offline tests with fake backends, no network, no spend
```
`TIER_DECIDE_BACKENDS=beatapi,claude` reorders or limits the chain. Scratch request files go under `test-results/tier/`.

### Privacy (mandatory)
Backends 1 and 2 send the text **off this machine** (OpenRouter→TypeSafe, beatapi.io). Repo CLAUDE.md: ask the user
before sending private text — this repo's source code, user data, credentials, client content. For anything like that set
`"private": true` in the request (or `--private` on the router): the chain then uses **Claude only** and text never leaves
Anthropic. Made-up or generic text (task titles, tickets, categories) is fine for the full chain. Never send secrets or keys.

### Setting the beatapi key (the owner does this; agents are blocked from persisting credentials)
Either `setenv BEATAPI_API_KEY` for the shell that runs Claude Code, or write the key to `~/.jev/beatapi.key`
(user-only file, same place as `openrouter.key`). Do it in **your own terminal, not inside Claude Code** (anything typed in
a session lands in its transcript), e.g. PowerShell: `Set-Content "$HOME\.jev\beatapi.key" '<key>'`. Then check
`node .claude/skills/tier-decide/decide.mjs --status` shows `beatapi: key: true`.

## Request shapes

`{ "tag", "state": {...}, "questions": { name: { "type", "instructions", "criteria" } }, "private"?, "timeout_ms"?, "claude_timeout_ms"? }`
- **choice**: `criteria` is `{ key: description }`; returns `choice`, `probabilities`, `confidence`.
- **score**: `criteria` is an ordered list (index 0 = lowest); returns `score`, `probabilities`, `confidence`.
- **noul**: `criteria` is `{ "true": ..., "false": ... }`; returns `noul` = probability of yes (no confidence field).

`timeout_ms` (≤ 10 s used) is for the fast Jev APIs; the Claude fallback has its own floor of 60 s (`claude_timeout_ms`).
Thresholds when unsure (Claude's call): choice/score `confidence < 0.6`, noul between `0.3` and `0.7`.
Batch every question about the same text into one request.

## Task router: tier + role + thinking (`route.mjs`)

```bash
node .claude/skills/tier-decide/route.mjs "task text" [--private]     # JSON: route, tier, agent, role, effort, cliFlags, preamble, why
node .claude/skills/tier-decide/route.mjs --selfcheck
```
One decision request asks four things (role, tier, thinking, follow-up). **Evidence can only raise the answer**:
ticket tag in `docs/plans/TASKS.md` (`· Haiku|Sonnet|Opus`) and risky keywords (sync, proxy, schema, auth, migration,
security, data loss, …) set a floor; the role's own tier also counts; answers under 0.6 confidence are ignored; no
confident evidence or a follow-up reply → `route: "self"` (handle it yourself). If every backend is down it falls back to
the keyword heuristic (`decidedBy: "heuristic"`).

| Role | Tier | Default thinking | Use for |
|---|---|---|---|
| scribe | Haiku | low | docs, renames, mechanical one-file edits |
| implementer | Sonnet | medium | a feature/component on an existing pattern, with tests |
| researcher | Sonnet | medium | find facts, compare options, no edits |
| debugger | Opus | high | a failing flow, cause unknown |
| reviewer | Opus | high | adversarial review of a diff or plan |
| architect | Opus | xhigh | cross-module design, shared code, security/data-loss risk |

Thinking = `low | medium | high | xhigh` (maps to `claude --effort`; Opus never below medium, Haiku never above medium,
risky work at least high). To delegate: `Agent` tool with `subagent_type` = `route.agent` and a **self-contained** prompt
starting with `route.preamble` (the role and thinking line), then plan path, ticket text verbatim, files and checks (agents cannot see
this conversation). To spawn a CLI worker: `claude -p ${route.cliFlags} ...` (`--effort` is accepted on every tier; whether it changes
Haiku's behavior is not verified). Always run `pnpm lint` and `pnpm test` yourself on the result.

Models: `tier-haiku` Haiku 4.5, `tier-sonnet` Sonnet 5.5, `tier-opus` Opus 5.5 (no Fable tier: it ran out of credits when tried).
Measured: Haiku **under-tiers shared code** (Drive-sync rewrite got `sonnet` 0.70, council said Opus) — hence the floors.

## Automatic use

The three `tier-*` agents carry "use proactively" descriptions, so Claude can pick them without a hook. `.claude/hooks/tier-router.mjs`
is a heuristic suggester (no network) that is **not registered** anywhere; the global Jev router hook is registered and ON but its
route has been returning 402 since credits ran out, so it currently routes nothing (it fails silently by design).
