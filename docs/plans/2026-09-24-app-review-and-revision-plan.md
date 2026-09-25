# Kollektiv: Whole-App Review and Revision Plan

Date: 2026-09-24 · Branch: `development` · Base: `8393b5d`
Evidence (the full agent reports) is in [`review-2026-09-24/`](review-2026-09-24/): `image-editor.md`, `design-system.md`, `motion.md`, `techstack.md`, `visual.md` (live-browser walk of every route at 1440, 1024 and 390, reconciled against Phase 0).
Prioritisation: Jev (TypeSafe decision model) scored priority and effort per workstream using generic one-line descriptions. No source code, file paths or secrets were sent. Where Jev's confidence was below 0.6, the call below is mine and is marked **(C)**.

---

## 1. Summary

**Most of the "mis-design" is not a design problem.** Four mechanical defects in the build and the cascade made correct markup render wrong. They are all fixed in Phase 0:

1. **Tailwind never scanned `image-editor/`.** `tailwind.config.js` content covered only `components/` and `src/`, so every class used only by the editor (`h-11`, `w-11`, `tooltip-bottom`, `cursor-crosshair`, `radio-xs`, `input-sm`, …) was absent from the built CSS. The editor had never rendered the way it was written.
2. **A global `button:not(…)` rule with specificity (0,4,1)** beat every utility class on 522 of 574 buttons. It forced `position:relative`, `overflow:hidden` (which clipped every tooltip), 12px uppercase text and `transition: all 0.3s`. Result: the editor's swatches lost `absolute`, authored text sizes were ignored, and press feedback lagged.
3. **`.form-btn` was defined twice.** The second `:hover` set dark text while the first kept a dark background, so Cancel and Discard went unreadable on hover.
4. **The Image Editor could not open an image, for three separate reasons.** (a) `App.tsx` cleared the Gallery→EDIT payload whenever `activeTab !== 'image_editor'`, but the route director commits the tab only after `await overlay.cover()`, so the payload was wiped before the editor mounted. Reduced-motion (headless) commits synchronously, which is why no test caught it. (b) Even when delivered, gallery URLs are vault-relative paths and the editor called `fetch(path)`, which can never succeed. (c) Opening the editor directly offered only "New blank document", with no Open, no drop and no working Ctrl+O.

**Beyond those, what's real and still open:**

- **Image Editor:** it looks feature-rich, but the core editing loop is untrustworthy. Pixel tools ignore layer transforms, crop is not undoable, autosave destroys alpha, selections affect nothing, undo memory is unbounded, and brush strokes have no live preview. The engineering plan's own §11 re-cut said to ship crop, brush and marquee well and defer wand, lasso, gradient, type, masks and GPU blend modes. The opposite happened. **Verdict:** freeze new tools; M5 = make editing correct.
- **Design system:** 824 sub-12px text usages (548× `text-[10px]`), 852 `uppercase`, 36 hand-rolled modals (8 with `role="dialog"`, 9 with Escape), 34 z-index values up to `z-[99999]`, and a global rule that forces `font-mono` to Nunito. Of the 43 themes, 31 share one dark palette, and the only light theme isn't selectable.
- **Motion:** every route change costs about 1.5–1.8 s before the page is usable, and boot about 4.4 s. Two animation loops (IdleOverlay matrix, ChromaticText) run forever while invisible. RollingText duplicates each letter, so screen readers announce "HHoommee". `transition-all` appears 172×. There is no global reduced-motion handling for GSAP or `motion`.
- **Tech:** the entry chunk is 4.1 MB min (1.2 MB gzip), mostly the voice/assistant stack and a full Prism build loaded by always-mounted shell components. ESLint is never run (572 errors, 262 of them promise bugs). CI doesn't trigger on `development`. The GitHub Pages deploy has been broken since July. A failed IndexedDB open is cached until reload, and nothing calls `storage.persist()`.
- **Security (critical, now fixed in Phase 0):** the local server reflected any Origin with credentials, and the MCP server on :3012 sent `Access-Control-Allow-Origin: *`. Any website the user visited could drive the unauthenticated `/api/cdp/*` browser-control routes and MCP vault/browser tools. **Still open, user action:** a real Gemini API key is in public git history (an early commit; its id is withheld here until the key is rotated). Rotate it.

---

### 1.1 Design critique (impeccable, dual-agent, fixed build, 2026-09-25)

- **Method:** Assessment A (design review, isolated agent) and Assessment B (impeccable detector, isolated agent). The browser overlay was skipped because of a preview-port constraint, so B is CLI-only.
- **Nielsen: 17/40**, which independently matches the pre-fix visual walk's 17/40. The weakest heuristics are *match with real world* (1: jargon and status-bar codes), *recognition over recall* (1: 8 icon-only header buttons), *aesthetic and minimalist design* (1: decoration gets the most contrast and working content sits at 20–30% opacity) and *help* (1: empty states give no next step).
- **Specificity verdict:** authored, not templated. The acid-lime HUD, corner frames and chromatic wordmark belong to this product. But the look says "sci-fi terminal", not "image-creation tool". The editor's new *Open or Create* modal (clear sizes, one bright primary, a shortcut hint) was called the single screen that feels made for the work. **Use it as the reference for other pages.**
- **Detector:** 11 hits. 6 are intentional selected-row accents (`LlmStatusPanel`), 2 are real but low-severity (stock `animate-bounce` typing dots), and 3 are test-file or false positives. The problems are compositional, not pattern-level.
- **New findings folded in below:** the dashboard Integrations widget hard-codes Vault as connected (`IntegrationHealthWidget.tsx:17`), connection state is shown only through ✅/❌ emoji colour, and page content is blank for up to 1.5 s after navigation (the `TerminalText` reveal delays stack on top of the route transition).

## 2. Phase 0: done in this session (verified)

| # | Change | Files | Verification |
|---|---|---|---|
| 0.1 | One-shot payloads cleared on tab **exit**, not on mismatch | `components/App.tsx` | New e2e fails with the old code and passes with the new (proven by revert) |
| 0.2 | Vault paths resolved via `GalleryBridge.loadGalleryImage` (same resolver as ImageCard). `FileIO.importFromPayload` no longer touches gallery/vault | `image-editor/ui/GalleryBridge.ts`, `core/io/FileIO.ts`, `ui/ImageEditorPage.tsx` | e2e: Gallery IMPORT → EDIT opens the 321×123 image with its gallery title |
| 0.3 | Start modal became "Open or Create": **Open image…**, drop zone, Ctrl+O. Drop anywhere on the editor opens the image (no doc) or places it as an undoable layer (doc open). Errors are surfaced, including HEIC | `ui/NewDocumentModal.tsx`, `ui/ImageEditorPage.tsx` | e2e: Open image → 321×123 doc titled from the filename |
| 0.4 | Export/Save flatten **exactly what the viewport shows** (groups, masks, text, shape, WebGL2 blend modes) via the new shared `LayerPainter`. Export never bakes an unapplied adjustment preview. JPEG gets a white background as the UI promises | `core/renderer/LayerPainter.ts` (new), `CanvasRenderer.ts`, `core/io/FileIO.ts` | tsc; 140 tests |
| 0.5 | Loading a document clears undo history, so redo can no longer splice the old doc's layers in. The unsaved-changes "Save" proceeds only if the save succeeded. The gallery title carries through | `ui/ImageEditorPage.tsx`, `ui/GalleryBridge.ts` | tsc; e2e title assertion |
| 0.6 | Tailwind scans `image-editor/**` | `tailwind.config.js` | Built CSS now contains `.h-11`, `.tooltip-bottom`, `.cursor-crosshair` (previously 0) |
| 0.7 | Global button rule wrapped in `:where()` (zero specificity), with overflow, z-index and `transition: all` removed. Duplicate `.form-btn` block deleted | `index.css` | All snake-border buttons carry their own `overflow:hidden` (checked) |
| 0.8 | `sameOriginGuard`: rejects a cross-site Origin and non-loopback Host (DNS rebinding), unless a non-loopback `HOST` is explicitly bound | `src/middleware/security.ts`, `server.ts` | Unit test (3); live curl: evil-origin GET/POST → 403, rebinding → 403, same-origin → 200 |
| 0.9 | MCP :3012 rejects any browser-originated (Origin-bearing) or non-loopback-Host request. The app's `/api/mcp/proxy` path is unaffected | `services/kollektivMcp.ts` | Live: direct evil-origin → 403; proxy `initialize` → success |
| 0.10 | Recovery prompt no longer hidden under the start modal (z-1100, `role=dialog`). The JPG-conversion confirm text no longer contradicts its buttons | `ui/ImageEditorPage.tsx` | tsc |
| 0.12 | Snake-border selectors (`.btn-snake* span`) now target only the four empty decorative spans (`> span:empty`), so label spans stay in flow. Fixes ADD PROMPT rendering as "P✦OMPT" | `index.css` | 18 selectors rewritten; computed-style diff below |
| 0.13 | Collapsed header nav groups are `inert` (no invisible keyboard focus), and group buttons expose `aria-expanded` | `components/Header.tsx` | tsc |
| 0.14 | Button rule is `button:where(…)` (specificity 0,0,1), so it beats the preflight reset but loses to utilities. A computed-style diff of old vs new builds (every button on 5 pages) showed only authored classes newly applying (`text-[10px]`, `text-lg`, `absolute` on editor swatches, HUD `z-[99999]` contained by the header's `z-50` context), with no inheritance regressions | `index.css` | style diff plus screenshots |
| 0.11 | New e2e `e2e/image-editor.spec.ts`, run with **full motion** (patched matchMedia) so the animated-route path is exercised | `e2e/` | 2/2 pass |

---

## 3. Revision plan (ordered; each phase ships independently)

Priority is Jev's score (0 = P3 … 3 = P0) with its confidence; the effort bucket is also Jev's unless marked (C).

### Phase 1: Trust and data safety (next 1–2 weeks)

| ID | Work | Prio (conf) | Effort | Notes |
|---|---|---|---|---|
| E3 | Autosave: store layers as PNG (or lossless WebP), serialize masks, version the record and drop old JPEG records | 2.99 (0.99) | medium | Data loss inside the data-loss-prevention feature. `AutosaveService.ts:28,117` |
| T5 | `utils/db.ts`: reset `_dbPromise` on rejection, add `blocking(){db.close()}`, call `navigator.storage.persist()` after onboarding | 2.96 (0.96) | small **(C)** | Protects the vault handle, notes, memories and chats from eviction |
| E8 | Gallery round-trip: pass through the source's `generationId`/`prompt` (not the gallery id), add a **Update original / Save as new** choice, share one `shouldConvertToJpg()` helper, replace `window.confirm` with the app modal | 2.95 (0.95) | medium | Title passthrough already done (0.5) |
| E2 | Crop as a HistoryCommand that shifts every layer type recursively. Pending rect with Enter/Esc (the ToolHeader already promises this) | 2.88 (0.88) | medium | |
| E9 | Text/shape: drop the `type !== 'image'` gizmo guards, double-click to re-edit text, `measureText` bounds, default text colour = foreground | 2.84 (0.84) | medium **(C)** | |
| E1 | One `docToLayer(pt, transform, intrinsic)` at the CanvasViewport pointer step, used by brush, eraser, clone, mask and wand; scale the radius too | 2.82 (0.82) | medium | Unit-test the mapping (rotate/flip/scale/crop) |
| E5 | Selection clipping: `getSelectionClip()` → Path2D or mask, applied in `paintStamp`, gradient, fill and adjustment commit. Add fill selection / delete-in-selection | 2.79 (0.79) | medium | Turns 4 decorative tools into functional ones |
| E4 | Live stroke preview and spaced stamping (`max(1, r·0.25)`). Clone radius and pressure, fresh source per stroke, `disposeTools()` on doc change/unmount | 2.61 (0.61) | medium **(C)** | Jev said small at 0.42; it touches BrushEngine, CloneStamp and the renderer |
| — | Recovery prompt when opened with a payload: a non-blocking banner, confirm before replacing | **(C)** P1 | small | Review M11 |
| — | Ops: rotate the leaked Gemini key; decide whether to purge history with `git filter-repo` | P0 **(C)** | small | User action; destructive history rewrite needs explicit approval |

### Phase 2: Feel (weeks 2–4)

| ID | Work | Prio (conf) | Effort | Notes |
|---|---|---|---|---|
| E7 | Editor basics: new blank layer ("+" creates a transparent layer, "Place image…" moves to its own button), Image Size, Canvas Size, paste (Ctrl+V), merge down / flatten (reuse `LayerPainter`), export mask as B/W PNG, `[`/`]` brush size | 2.43 **(C)** P1 | large **(C)** | The upload/inpaint-prep workflow |
| E6 | History memory: byte cap (~512 MB) and `.close()` evicted bitmaps now; dirty-rect diffs next | 2.33 **(C)** P1 | medium | Blocks routine 4k/8k use |
| M1 | Route transition: cover 220 ms / hold 80 ms / reveal 320 ms `power3.out` (about 650 ms total). Full cinematic only on the first visit per module, then a 150 ms crossfade. Make it interruptible; wrap `run()` in try/finally | 2.23 (0.70) | small | Also fix the Header re-expanding the old group (motion #3) |
| M3 | RollingText: render the real label once (`aria-label` or an `sr-only` span), with the duplicate letters `aria-hidden` | 2.13 (0.74) | small | Also unblocks e2e selectors |
| D1 | Type scale: add Tailwind `fontSize` tokens (`2xs`=11px floor, `xs`=12px). Codemod `text-[9px]`/`[10px]` → tokens; cap `tracking` at 0.1em; drop `font-black` from body copy | 2.03 (0.89) | medium **(C)** | Biggest single legibility win |
| D2 | One modal: extend `ConfirmationModal` into `Modal` (labels, Escape, focus trap/restore, `role=dialog`, `aria-labelledby`, exit animation), then migrate the 36 overlays incrementally, starting with the image editor's three | 1.93 (0.85) | large **(C)** | |
| M2 | Stop the IdleOverlay rAF when hidden (depend on `isVisible`, cache the computed colour). ChromaticText: pause when disabled or hidden, drop the random flashes | 1.78 (0.74) | small | Constant CPU drain |
| D3 | z-index tokens (`base/raised/dropdown/overlay/modal/toast/system`) in the Tailwind config. Replace the 34 arbitrary values | 1.72 (0.72) | medium | |

### Phase 2b: Layout and legibility (from the visual walk and critique; Jev-scored)

| ID | Work | Prio (conf) | Effort | Notes |
|---|---|---|---|---|
| V2 | Local studios at 1024: `ExtraNetworksPanel` → `hidden 2xl:flex w-[22rem]` and not rendered for ComfyUI; centre column `min-w-[28rem]` | 2.67 (0.67) | small | The prompt column collapses to about 50px today |
| V3 | Gallery toolbar: `flex-wrap`, search on its own row below `xl`, IMPORT `shrink-0 ml-auto`; category sidebar collapsed below `xl` | 2.34 (0.60) | small | The primary action is off-screen at 1024 |
| V10 | Dashboard: compute Vault's integration state for real, replace the emoji with a text badge ("Connected / Not set up" plus a CTA), make **one** primary quick action, shrink the wordmark about 50% | 2.18 (0.79) | small | False reassurance plus inverted emphasis |
| V11 | Settings: auto-save with a toast, or dirty-only "Discard / Save changes" instead of Abort/Confirm; select `pr-10 truncate` with shorter option labels | 2.10 (0.77) | small | |
| V1 | Header: `grid grid-cols-[auto_minmax(0,1fr)_auto]`, `shrink-0` logo and icon cluster, submenus as an `absolute top-full` row (no inline width reflow, no 900 ms switch delay), icons collapse to `…` below `xl` | 2.01 (0.81) | small **(C: medium)** | Settings and Standby are clipped even at 1440 when Utilities is open |
| V8 | Copy pass: plain verbs ("Add two images to compare", "Clear", "Source image"); expand or tooltip the status-bar codes; sentence case for anything longer than 3 words | 1.98 (0.89) | **(C) medium** | Jev effort conf 0.48 |
| V4 | Contrast floor: readable text ≥ `/60` (5.98:1), decorative ≥ `/50`; replace the `opacity-10` empty-state wrappers | 1.96 (0.87) | **(C) medium** | About 440 usages; pairs with D1 |
| V9 | IA: Batch Runner into Workbench, `prompts` highlights Crafter, Composer and Compare join Image Editor under Studio, `aria-label` on `HUDNavItem`, surface the command palette | 1.93 (0.90) | medium | |
| V5 | One `<EmptyState icon title body action>` pattern: `/60` body, one sentence, one button (Gallery → Import, Library → Add prompt, Activity → "Craft your first prompt") | 1.85 (0.84) | small **(C)** | |
| V7 | Themes: rename or delete the ~30 dark clones with light names, ship `sanrita` or a real light theme, add a contrast unit test (primary/base ≥ 4.5, content/base ≥ 7) | 1.82 (0.81) | medium | Hard-coded `white/black` colours (≈200) must be tokenised before any light theme ships |
| V6 | Disabled state: `disabled:opacity-40 disabled:cursor-not-allowed disabled:border-dashed` plus a reason tooltip; enabled primary = filled `form-btn-primary` | 1.81 (0.79) | small | |
| — | Page content visible at t=0; `TerminalText` reveal ≤150 ms, or skipped after the first visit | **(C)** P1 | small | Pairs with M1 |
| V12 | Phone width (390px) | **(C) P3** | **(C) large** | Jev said P2/small at conf 0.60; the product is desktop-first by design, so defer |

### Phase 3: Foundations (month 2)

| ID | Work | Prio (conf) | Effort | Notes |
|---|---|---|---|---|
| T2 | `lint:eslint` script plus CI with today's count as a baseline; fix `no-floating-promises`/`no-misused-promises` first | 1.94 **(C)** P2 | medium | 262 real promise bugs |
| T1 | `PrismLight` with about 6 registered languages (MessageBubble and 4 loraEditor panels). `await import()` the ElevenLabs/VAD/live-assistant services on first voice use. Then `React.lazy` pages, starting the `import()` before `overlay.cover()` | 1.66 **(C)** P2 | medium | About 1.2 MB min saved (estimate) before any route splitting |
| T3 | CI on `development` (or `**`); add a Playwright job | 1.57 **(C)** P2 | small **(C)** | The new editor e2e would have caught 0.1 |
| M4 | ImageCard: remove the dead 1.8 s clip-path, reveal ≤300 ms, hover ≤200 ms, no `grid-template-rows` hover animation, drop blanket `will-change` | 1.27 **(C)** P2 | small | |
| — | Motion tokens: extend `index.css:2664` (press 120 ms, `--ease-in-out`, `--fx-hold` 80 ms), map them in the Tailwind config, `MotionConfig reducedMotion="user"`, gsap `matchMedia` guard, replace `transition-all` | P2 **(C)** | medium | Details in `motion.md` §2, §4 |
| — | Typed event bus (`AppEvents` map); wire `cycleTheme` (the palette's "Next Theme" does nothing) or delete it; remove 5 orphan emits | P2 **(C)** | small | |
| — | Dependency cleanup: remove `helmet`, `cors` (unused since 0.8), `vfile` and the deprecated `@types/helmet` / `@types/express-rate-limit`; move `@types/*` to devDeps; fix the 2 import cycles and the `memoryStorage` self-import | P3 **(C)** | small | |
| D4 | Remove the global `font-mono` → Nunito override (`index.css:330-337`) | 0.97 **(C)** P3 | small | |
| — | Themes: make the light theme selectable, or delete the 31 aliases that share one palette | P3 **(C)** | small | Decide product intent first |

### Decisions needed from the user (not engineering calls)

1. **GitHub Pages (T4, Jev 0.79 at conf 0.21, so my call):** kill it. The app needs `server.ts` for most features, and the Pages build has been broken since July without anyone noticing. Delete `deploy.yml`, `gh-pages`, the `deploy`/`predeploy` scripts and `homepage`, unless a static demo mode is wanted.
2. **Git history purge** of the leaked key: rotation is mandatory; the purge (`git filter-repo` plus force-push) is optional and destructive.
3. **Image Editor scope:** confirm the M5 freeze (no new tools until Phase 1's E-items land).

---

## 4. What this plan deliberately does not do

- **No gsap↔motion consolidation.** Both are heavily used in distinct roles (45 and 23 files), and the churn isn't worth it until T1 lands and the bundle diff is measurable.
- **No new design language.** The existing Kollektiv aesthetic (display type, sharp corners, glow) is coherent. The problem is execution (scale, contrast, cascade), not direction.
- **No adjustment layers, history panel or extra blend modes** in the editor until M5 is done.

## 5. Changes to existing plans

- `image-editor-engineering-plan.md`: §12 records the status and adopts M5.
- `image-editor-frontend-plan.md`: the "Blank canvas entry" section becomes "Open or Create", and the recovery and adjustment-entry UX are added.
- `2026-09-23-assets-manager-todo.md`: unchanged scope; a cross-link to this plan for the shared modal and type-scale work.
