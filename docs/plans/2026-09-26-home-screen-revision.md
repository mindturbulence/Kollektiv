# Home Screen Revision Plan

**Date:** 2026-09-26 · **Status:** proposed, awaiting the user's call on the decisions at the end
**Inputs:** three report-only gstack reviews run in parallel on the built app (1440×900 and 1024×768), each claim below re-checked against the code.
- `/design-review` — screenshots in `test-results/home-review/design/`
- `/qa-only` — every Home control clicked; screenshots in `test-results/home-review/qa/`
- `/plan-ceo-review` — premise and scope, SCOPE REDUCTION mode

## 1. What the reviews found

**The page has no job the header and `Ctrl+K` don't already do.**

| Home element | What it actually does | Verdict |
|---|---|---|
| Quick Actions (6 buttons) | 4 open pages already in the header nav. "New Note" opens the Clipboard panel (mislabelled). "Toggle Live" starts voice; with no key it covers the screen with no close button | duplicate |
| "Craft your first prompt" | Same as "+ New Prompt" | duplicate |
| Integrations (5 rows) | Every row opens Settings → Application → General, not Integrations (`IntegrationHealthWidget.tsx:44-47`). Same info as the footer's `INT VLT … MCP` codes | duplicate, wrong target |
| Vault Stats (4 tiles) | Gallery tile works. Notes, Memories and Files are buttons that do nothing (`VaultStatsWidget.tsx:40-42`, `page: null`) | 3 of 4 inert |
| Recent Activity | Clipped ideas only; rows can't be clicked. Stale: Home keeps its own `useLocalStorage('clippedIdeas')` copy (`Dashboard.tsx:29`), so a new clip only shows after leaving and re-entering Home | dead end, stale |
| Centre wordmark + tagline | Decoration. About 45% of the width at 1440 | decoration |
| Background montage (`DashboardGallery`) | Deliberate design (user decision, 2026-09-26): with fewer than 15 vault images it fills the remaining tiles with stock photos so an empty vault still shows the signature montage. **Keep.** The one real problem is the source: fill photos come from `picsum.photos` (`DashboardGallery.tsx:175`), so every Home open makes ~30 third-party requests, and offline those tiles render as broken images (no `onError` fallback) | keep; fix the photo source |
| `LiveAssistantMiniWidget` | Not imported anywhere | dead code |

At 1024×768: quick-action labels wrap, the Integrations list overflows and hides the MCP row with no scroll cue, and panels at `bg-base-100/40` let photos show through the text.

**Why the user keeps landing on Home anyway.** The app already reopens the last-used page on boot (`activeTab` in localStorage, `App.tsx:146`; `'dashboard'` is only the first-run default). Home is reached from:
- **the assistant, automatically:** `AssistantPage.tsx:457` sends the user to `'dashboard'` 0.8 s after every live session ends (4 s after an error). This is the one path the user never chose, and the likeliest source of "I keep ending up there".
- the logo, the Home nav item, `⌘1` and the palette
- first run, or cleared storage

**Bugs found outside Home's content (fix whatever Home becomes):**
1. The Vault Map's close ✕ can't be clicked: the header's Standby button paints over it, because the panel is mounted inside the `z-10` content container (`App.tsx:634`). Escape doesn't close it either.
2. The closed Vault Map is still focusable: Tab lands on its invisible "Close vault map" button on every page (the always-mounted overlay isn't `inert`).
3. `CustomCursor.tsx:134` calls `coords.x.toString()`. A `mousemove` without coordinates (synthetic events) crashes the whole app into "CRITICAL ERROR". Real mice always send coordinates, so this is low-likelihood but has a large blast radius.
4. After a no-key "Toggle Live" the footer keeps showing "ERROR".

## 2. Pressure test

1. **Main concern:** a rebuilt Home may be a nicer page nobody opens, because the persisted tab already skips it.
2. **Weakest assumption:** "I never use its features" is being read as "a landing screen has no job". It shows these *widgets* have no job, and that "unusable" is partly "I keep being sent there" (the assistant redirect).
3. **Strongest counterargument for deleting Home:** the header plus `Ctrl+K` reach everything, and boot already resumes the last page.
4. **What to verify:** how often Home is entered on purpose (logo, `⌘1`) versus the assistant redirect. A throwaway local counter for a week decides it.
5. **Better version:** stop sending the user to Home, remove the duplicates, and give Home the one job nothing else does: **pick up recent work in one click**, plus a single warning when setup is actually broken.
6. **Recommendation:** Option B below (confidence about 0.7; the design and product reviews independently landed on the same answer). Fall back to Option A if the counter shows Home is never opened on purpose.

## 3. Options

| | What | Cost | Risk |
|---|---|---|---|
| **A. Remove Home** | Boot and the logo go to the last-used page; a one-time first-run welcome card replaces Home | small (mostly deletion) | loses the only place to see recent work; VISION's "reach a working dashboard" metric needs rewording |
| **B. Rebuild as "Resume"** (recommended) | Recent media grid + recent prompts + recently used tools + one setup warning when broken | medium: 1 page + 2–3 small components + a small tab-history store | a useful page the user still rarely sees |
| C. Polish current page | Fix clipping, contrast, dead tiles | small | keeps the wrong content; all three reviews rejected it |

## 4. Plan (Option B)

### Phase 0 — fixes needed regardless (small, ship first)

1. **Assistant stops redirecting to Home.** On session end, return to the tab the user was on before the assistant (keep a `previousTab` in the page-transition layer), or stay on the assistant page if there's none. `AssistantPage.tsx:457`.
2. **Vault Map:** mount it outside the `z-10` content container at the `z-overlay` token, add `inert` / `aria-hidden` while closed, and close it on Escape (it's a dialog — use `components/Modal.tsx`).
3. **Custom cursor:** ignore `mousemove` events without numeric `clientX`/`clientY`.
4. **Footer "ERROR" after a failed Live session** clears when the session ends.
5. Delete `LiveAssistantMiniWidget.tsx` (dead code).

Verify: unit tests for the cursor guard and the redirect target; e2e that ends a live session and asserts the previous tab is restored; e2e that opens the Vault Map from `Ctrl+K` and closes it with ✕ and with Escape.

### Phase 1 — new Home: "Resume"

Layout: **the montage stays as the background**, exactly as today (the user's own images first, stock fill up to 15). The Resume content sits on top of it in readable panels (raise panel opacity from `bg-base-100/40` so photos don't show through text — the design review's legibility finding). A small wordmark in a corner; the Resume content uses the space the centre column used to waste.

0. **Bundle the fill photos locally.** Download ~15 picsum photos once (free to reuse), ship them in `public/dashboard-fill/` (~1–2 MB, compressed WebP), and point the `urls.length < 15` fill in `DashboardGallery.tsx` at them instead of `picsum.photos`. Same look, works offline, no third-party requests. Add an `onError` that hides a tile which fails to load, as a safety net.

1. **Recent media** — the latest ~12 `GalleryItem`s by `createdAt` (`types.ts:417`, a number) as a thumbnail grid from the user's own vault. Click opens the item's detail view; a secondary action opens it in the Image Editor (existing `openInEditor` event). With an empty vault this list shows one `EmptyState` with an Import action; the montage behind it still fills with the bundled photos.
2. **Recent prompts** — the latest ~8 `SavedPrompt`s by `createdAt` (`types.ts:380`, a number). Click opens the prompt in the library. `SavedPrompt` has no `updatedAt`, so this is "recently added", not "recently edited".
3. **Recently used tools** — the last ~6 distinct tabs visited, as large one-click tiles. **New data:** record tab visits in a small localStorage list, written from the one place navigation commits (`usePageTransitions`' `commit`). This is the only new tracking in the plan.
4. **Setup warning, only when broken** — one banner when the vault is disconnected or no AI provider is configured, linking straight to the right **Integrations** sub-tab (not Application → General). When everything works, nothing shows.
5. **Delete** Quick Actions, Integrations, Vault Stats and Recent Activity. Clipped ideas already live in the Clipboard panel. `DashboardGallery` stays.

Verify: 1024×768 and 1440×900 screenshots in Kollektiv and `sanrita`, with an empty vault (all fill photos) and with a few items; an offline check that the montage still fills (no request to `picsum.photos` in the network log); an e2e that imports an image and a prompt, returns Home, and opens each from the Resume lists; unit tests for the tab-history store (dedupe, cap, ignores `dashboard`).

### Phase 2 — decide with data (optional)

A local-only counter of Home entries by source (boot, logo, `⌘1`, palette) for a week. If purposeful entries are near zero, switch to Option A: the logo goes to the last-used page and Home becomes a first-run welcome only.

## 5. Decisions needed from the user

1. **B (Resume page) or A (remove Home)?** Recommended: B.
2. ~~Keep the brand moment?~~ **Decided 2026-09-26:** the montage stays, including the stock fill for an empty or thin vault; the fill photos move from `picsum.photos` to bundled local files.
3. **"Recent" means recently added (available today) or recently opened/edited (needs new tracking per item)?** The plan uses recently added, plus recently used tools.

## Out of scope, noted

- The old video trimmer (Dec 2025 "Video Editor": thumbnail timeline, trim handles, ffmpeg stream-copy trim) was replaced by frame extraction in `9f14f42` (2025-12-30). It is recoverable from `git show 9edb6ac:components/VideoToFrames.tsx` if a trim mode on the Video page is wanted — a separate plan.
