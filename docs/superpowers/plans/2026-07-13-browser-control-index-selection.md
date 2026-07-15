# Browser Control: DOM-Native Selection (steal the browser-use idea)

**Date:** 2026-07-13
**Branch:** Dev-Assist
**Status:** Phase 1 + Phase 2 implemented

## Deviation from plan (recorded per advisor review)

Decision 5 (snapshot-scoped fallback indices + click-time validation) was **cut entirely**.
`clickElement(id)` does a live `document.querySelector('[data-ai-id="..."]')` at click time —
there is no cache to go stale, so the whole re-match/validation apparatus had nothing to
solve. `data-ai-id` is the primary (only, for now) selection path; the numeric-index fallback
described below was not built. If a genuinely un-taggable dynamic target shows up later
(e.g. clicking a specific generated image in a gallery), prefer giving it a data-derived
`data-ai-id` (`gallery-img-${id}`) over reintroducing index machinery.

## Problem

Browser control is "absolutely not working." The assistant is meant to click/type/scroll
inside the Kollektiv app on the user's behalf, but clicks land in the wrong place or do
nothing. The last five commits are all coordinate-mapping band-aids (pixel-vs-fraction
auto-detect, DPR, capture-size vs viewport-size). We are fixing symptoms.

## Context (verified)

- Kollektiv is a **client-side React SPA with no backend**. Browser control is **in-page
  JS acting on the app's OWN same-origin DOM** — no Playwright, no CDP, no extension.
  `browserControlService` dispatches **synthetic** DOM events (`dispatchEvent`) into
  `document`. It can only ever control the Kollektiv tab itself (same origin), not
  arbitrary websites.
- Flow today (`liveAssistantService.ts:242-272`): user screen-shares via `getDisplayMedia`
  (ideally "This Tab"); a `<canvas>` grabs frames at **1 fps**, scales to max 1024px, sends
  JPEG to **Gemini Live** as realtime video. The model returns pixel coordinates via
  `browser_click(nx, ny)`; `captureToViewport` (`browserControlService.ts:78`) maps scaled
  pixels → viewport, then `elementAt` runs `document.elementFromPoint` and dispatches a
  synthetic pointer+mouse+click sequence.

### Two confirmed defects (not just "vision is fuzzy")

1. **Incompatible coordinate spaces on the documented happy path.** `readPageStructure`
   emits element positions in **real viewport CSS pixels** —
   `at (${Math.round(rect.left)}, ${Math.round(rect.top)})` (`browserControlService.ts:397`)
   — and its tool description says *"Use BEFORE browser_click so you know the exact
   positions"* (`assistantTools.ts:546`). But `browser_click` interprets its args as
   **capture-frame pixels (0–1024)** and divides by `captureW` (`assistantTools.ts:466`,
   `browserControlService.ts:81`). So "read positions, then click them" feeds viewport
   pixels into a tool that expects capture pixels — at DPR 1.25 / 1536px viewport an element
   at x=1200 normalizes to 1.17 → clamped to 1.0 → click lands on the right edge. **Every
   structure read actively poisons the next click.** This makes it broken, not merely flaky.
2. **Ambiguous coordinate contract.** `nx > 1 ? pixel : fraction` (`browserControlService.ts:81`)
   guesses the space per-call; small pixel values (e.g. `0`, `1`) get misread as fractions.

### Root cause

The design is load-bearing on a capability the model doesn't reliably have — **pixel-accurate
coordinate estimation** — and then compounds it with a lossy model-space↔DOM-space
translation we keep getting wrong. **We own the DOM; the coordinates are a round-trip through
a JPEG for information we already hold exactly.** The `browser-use` insight applies: stop
making the model estimate what the runtime knows. But its *mechanics* (numeric indices,
set-of-marks overlay) are cargo weight from a cross-process context we don't live in.

### Assets already in the repo

- **`selectAndClick(cssSelector)` (`browserControlService.ts:300`) is written but NOT
  exposed as a tool.** It already does element-center clicking with the correct
  pointer+mouse+click sequence and native-setter awareness. The fix is ~80% written and
  unwired.
- `readPageStructure` (`browserControlService.ts:382`) already enumerates viewport-visible
  interactive elements — the registry is a small extension of it.
- The native-value-setter typing path (`browserControlService.ts:240`) already makes React
  controlled inputs detect changes.

## Design decisions

**1. Stable string IDs over numeric indices.** We own the app, so tag the ~20–30 controls
that matter with `data-ai-id="generate-btn"`. These are stable across every React re-render,
scan, and frame — which dissolves the index-instability problem that forces `browser-use`
into snapshot bookkeeping. Numeric indices remain only as a *fallback* for un-tagged dynamic
elements (generated images, history lists).

**2. Reuse `selectAndClick`; add one selection tool.** New tool `browser_click_element`
takes a `data-ai-id` (or a fallback snapshot index) and clicks the cached element at its
**real measured center** — exact, no mapping, no estimation.

**3. No visual overlay.** Set-of-marks earns its cost in coordinate-grounding systems; we
remove coordinate grounding, so it is decoration. And it can't work here: the model gets the
tool response (text list) over the Live API **immediately**, but a rendered badge only
reaches it in the next capture frame ~1–2s later — *after* it has already acted. The frame's
remaining job (qualitative state: "the image looks washed out") does not need badges.

**4. Tool results are the feedback channel, not the 1 fps video.** Every action tool returns
what changed — e.g. `Clicked [generate-btn]; new panel "Export" now visible` — via a cheap
before/after structure snapshot. Tool responses are fast and reliable; the video loop is slow
and lossy. This compensates for frame staleness better than any capture-rate work.

**5. Snapshot-scoped fallback indices + click-time validation.** For un-tagged elements,
`browser_read_structure` returns a fresh indexed list each call; indices are valid only
against the latest snapshot. At click time, validate the cached element is `isConnected`, has
a non-empty rect, and `elementFromPoint(center)` hits it or a descendant. If stale →
auto re-scan, re-match by (tag, label, ordinal); if unambiguous, click; else return "page
changed, here is the fresh list" as the tool result. No MutationObserver.

**6. Delete pixel positions from `readPageStructure` output.** As long as coordinates appear
in that text, the model will feed them back into `browser_click`. Replace `at (x, y)` with
the id/index.

**7. Coordinates survive only for the canvas.** The image editor has a `<canvas>` with no DOM
elements to select. Keep `browser_click(nx, ny)` but scope its description to *"only for
clicking inside the image canvas"*, and fix the contract to a single space (capture pixels).

## Implementation phases

### Phase 1 — DOM-native clicking (the actual fix)
- Add `data-ai-id` to the top ~20–30 controls across the workspace pages (generate, prompt
  fields, primary nav, panel toggles, save/copy/download). Grep `onClick=`/`<button` per page
  to enumerate; prioritize the flows the assistant is asked to drive.
- `browserControlService`: add `clickElement(idOrIndex)` backed by the existing
  `selectAndClick` center-click path; add a private `buildRegistry()` that scans interactive
  elements, prefers `data-ai-id`, assigns fallback snapshot indices, and caches
  `{ ref, rect, label }`. Add click-time validation (decision 5).
- Rewrite `readPageStructure` → labeled id/index list, **no pixel positions**, with section
  context to disambiguate (`[prompt-editor] button "Copy"` vs `[history] button "Copy"`).
- `assistantTools`: add `browser_click_element(target)`; rewrite `browser_read_structure`
  description to "read → click_element" as the primary path.
- Return before/after state in tool results (decision 4).

### Phase 2 — Demote coordinates + fix synthetic-event ceilings
- Rewrite `browser_click`/`browser_double_click` descriptions: canvas-only; single coordinate
  space; drop the `nx>1` auto-detect ambiguity. Update the assistant **system prompt** so DOM
  targets always route through `read_structure` → `click_element`.
- Synthetic-event fixes (independent, real bugs):
  - **Enter does not submit forms** via synthetic events → where submit matters, call
    `form.requestSubmit()` on the focused element's form.
  - **`<select>` cannot be opened** by any synthetic sequence → add `browser_select_option`
    (set `.value` via the native setter + dispatch `change`).
  - `:hover`-only menus never trigger from synthetic `mousemove` — note the limitation; do
    not pretend hover-reveal works.

### Phase 3 (later, not now) — Semantic tools for top journeys
DOM puppeteering into React always has an untrusted-event ceiling (occasional silent
no-ops). The durable endgame is per-workflow tools calling our own state layer directly
(`set_prompt(text)`, `trigger_generate()`) — strictly more reliable than simulating input.
Migrate the top 5 user journeys there over time; keep DOM control as the long tail.

## What we cut and why
- **Visual set-of-marks overlay** — arrives after the decision it informs; decoration once
  coordinates are gone (decision 3).
- **Durable cross-scan indices / MutationObserver** — click-time validation catches the same
  staleness with none of the machinery (decision 5).
- **The pixel/fraction auto-detect** — collapses to a single canvas-only space (decision 7).

## Verification (repo has no test suite — tsc + manual walk)
- `tsc --noEmit` clean.
- Manual: start a Live session, share "This Tab", ask the assistant to (a) type a prompt and
  generate, (b) open a panel, (c) pick a `<select>` option, (d) click a generated image
  (fallback index path). Confirm each tool result reports the correct target and the action
  visibly happens. Then re-run after a re-render to exercise stale-index recovery.
- One runnable self-check: assert `clickElement` on a known `data-ai-id` dispatches a `click`
  whose `target` is that element (jsdom-level, no framework).

## Sources
- `browser-use` core idea only (indexed DOM selection, not coordinates). We do **not** port
  its Python/Playwright/CDP stack — none of it fits an in-page, same-origin, backend-less SPA.
- Design critique by Fable 5 (2026-07-13): confirmed the coordinate-space defect, argued for
  stable IDs over indices, and for cutting the overlay.
