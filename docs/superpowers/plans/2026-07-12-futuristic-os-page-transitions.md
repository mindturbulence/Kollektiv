# Futuristic-OS Page Transition System ("Context Shift Engine")

**Date:** 2026-07-12
**Branch:** Dev-Assist
**Status:** Implemented & verified (P1–P4, P6–P7 complete; P5 route matrix shipped as `routeFx.ts`)

**Verification record (2026-07-12):** `tsc --noEmit` clean; `vite build` clean. Runtime-verified against the production bundle in a driven browser: full theatrical path traced programmatically (derez attr → overlay cover → commit behind cover → hold → reveal → enter flash → clean idle); reduced-motion bypass confirmed (headless Chrome defaults to `prefers-reduced-motion: reduce` — the director correctly skipped the overlay and committed instantly); 5-tab rapid-click spam settled on the final destination with zero attribute/transform/filter residue; the app's pre-existing idle-standby system (which emits `navigate` on the event bus) exercised the programmatic-navigation path through the director repeatedly without a wedge. Adversarial review performed inline (subagent hit session limits): fixed a fragile `this` in the overlay reveal path, a conflicting transform in the light sweep, and unstable director callbacks that re-subscribed the event bus every render.
**Hard constraint:** zero layout modification — every effect is transform / opacity / clip-path / filter / overlay based. The DOM at rest is byte-identical to today.

## 1. Verified current state

- Pages switch via `activeTab` state in `components/App.tsx`; the active page renders inside `<AnimatePresence mode="wait">` (App.tsx:1103) with a single global `pageVariants` (bottom-up clip wipe + blur + scale, 1.2s in / 0.8s out) from `components/AnimatedPanels.tsx:108`.
- Crafter / Refiner / Prompt Analyzer / Media Analyzer / Prompts all share **one** AnimatePresence key (`prompts_group`, App.tsx:1105) and one mounted `PromptsPage` with a `forcedView` prop — sibling switches (crafter ↔ refiner) currently have **no transition at all** (plain conditional render, PromptsPage.tsx:129–182).
- Pages are already wired with shared motion children: `panelVariants` (11 files), `sectionWipeVariants` (10), `contentVariants` (9), `TerminalText` typing component (11), `PanelLine` (10), `ScanLine` (12). `staggerChildren` propagates from `pageVariants` — upgrading the shared variants upgrades every page with no layout edits.
- **GSAP 3.12 is installed** and already drives the boot sequence (blinds aperture, frame scale-in, App.tsx:632–724). **Framer Motion 12** (`motion/react`) drives page mount/unmount.
- A **dormant "Cinematic Transition Overlay (Tesoro Style)"** exists in App.tsx:1076–1100 — top/bottom cover panels + centered logo, refs declared (467–470) but never animated. We revive and generalize it.
- `audioService` exposes a full SFX vocabulary: `playTransition`, `playPanelSlideIn/Out`, `playSlide`, `playType`, `playClick`, `playModalOpen/Close` — `handleNavigate` (App.tsx:727) already fires `playTransition`.
- Gap: `appEventBus.on('navigate')` (App.tsx:764) calls `setActiveTab` directly, **bypassing** `handleNavigate` — programmatic navigations skip both SFX and any transition orchestration.
- Gap: only **one** `prefers-reduced-motion` guard exists in index.css (2,619 lines); framer/GSAP sequences have none.
- Existing CSS FX we can harmonize with: `@keyframes crt-flicker` (index.css:1320), `shine-sweep` (510), `grid-move-anim` (1500); theme is DaisyUI `data-theme` with oklch vars (`--p` primary).
- Vestigial `isExiting={false}` props are passed to every page (App.tsx:831–848) — dead API from an older system; harmless, leave in place.

## 2. Design concept — the app is an OS shell, pages are modules

The frame, header, and footer persist (they are the "shell"). Navigating is not "changing page" — it is the OS **unloading one module and mounting another**. Every transition therefore has three acts:

1. **DE-REZ (exit, 250–380ms):** the old module loses power — chromatic de-saturation, micro glitch-jitter, blur, slight recession in Z — while an overlay geometry (shutters / iris / shards / scan slam) closes over it.
2. **HOLD (120–450ms, route-dependent):** the overlay is fully covering; React swaps the tree behind it (no dead frame, no visible mount jank). The overlay is a living HUD during the hold: module glyph, decrypt-scrambling module name, hex address ticker, thin progress strip.
3. **MATERIALIZE (enter, 400–900ms):** overlay opens with the inverse geometry while the new module's panels boot in staggered choreography — clip-wipe + primary-colored edge flash + blur settle — and page titles scramble-decrypt.

Audio phases: cover-start → `playPanelSlideIn`; swap tick → `playType`; reveal → `playPanelSlideOut`; (existing `playTransition` stays as the navigate trigger sound).

## 3. Architecture — three cooperating layers + one sub-view switcher

### Layer 1 — `TransitionDirector` (new: `components/transitions/TransitionDirector.ts`)
A framework-light state machine owned by App.tsx:

- `transition(from, to, commit)` — resolves the signature kind from the route pair, builds the GSAP timeline on the overlay, applies `data-fx="derez"` to the content wrapper, calls `commit()` (i.e. `setActiveTab`) at the covered midpoint, then runs reveal and cleans up (`will-change` removed, data attrs cleared).
- **State machine:** `idle → covering → holding → revealing → idle`.
  - Navigate while `covering`/`holding`: retarget — update the pending destination; the swap hasn't happened yet, so the latest wins. No queue buildup.
  - Navigate while `revealing`: kill the reveal timeline at current progress, jump the overlay back to covered (fast, 120ms), retarget, resume from HOLD. The old page never re-de-rezzes (it's already fresh).
- **Reduced motion:** `matchMedia('(prefers-reduced-motion: reduce)')` short-circuits to a 150ms crossfade, no overlay, no HUD, and framer variants collapse to opacity-only (var-driven).
- Exposes phase callbacks for audio hooks.
- `handleNavigate` routes through the director; the `appEventBus` 'navigate' listener is fixed to call `handleNavigate` (closes the bypass gap).

### Layer 2 — `TransitionOverlay` (new: `components/transitions/TransitionOverlay.tsx`)
Replaces the dormant Tesoro overlay in-place (same absolute inset-0 slot inside `<main>`, z-[1000], pointer-events-none — zero layout impact). Contains, always mounted and hidden:

- **Shutter strips:** 10 vertical + 6 horizontal strip divs (`bg-base-100/98`) for slam geometries.
- **Iris disc:** one div animated via `clip-path: circle()` for radial wipes.
- **Shard planes:** 4 diagonal-clip divs for the tool-mount geometry.
- **HUD group:** module glyph slot (icon per route), scramble-decrypt module name, hex ticker line (`0x3F2A…`), 1px progress bar, four corner brackets. All absolutely centered; driven by GSAP.

GSAP timeline presets exported per geometry: `shutterV`, `shutterH`, `iris`, `shards`, `scanSlam` — each with `.cover()` and `.reveal()` segments so the director can compose them.

### Layer 3 — Shared choreography upgrade (`AnimatedPanels.tsx` + `index.css`)
- `pageVariants` becomes **route-kind aware** via framer's `custom` prop (passed on both `AnimatePresence` and the page `motion.div`, so exit variants read it after the key change). Enter/exit geometry (wipe direction, blur amount, scale, Z-recession) selected per signature kind.
- `panelVariants` / `sectionWipeVariants` / `contentVariants` upgraded to the "materialize" language: clip-path inset wipe with per-mount alternating direction, blur 4px → 0 settle, 6px Y drift. Stagger tokens moved to CSS vars.
- **Edge-flash cascade (pure CSS, no page edits):** under `[data-fx="enter"]`, panel hook classes get an animated 1px inset box-shadow flash in primary color, delayed by `:nth-child` steps (capped at 12; later siblings share the last delay). GPU-cheap: box-shadow on composited layers only during entry, class removed after.
- **De-rez exit (pure CSS):** `[data-fx="derez"]` applies `fx-derez` keyframes to the content wrapper: 300ms of `filter: saturate(0.4) hue-rotate + blur(6px)`, 2-step translate jitter (±2px), `scale(0.985)`. Transform/filter only.
- `TerminalText` gains a `scramble` mode (random glyph cycling that resolves left-to-right) — upgrading page titles across the 11 consumer files automatically via a default-on prop tied to entry.
- **Motion tokens** added to `:root` in index.css, adopting the transitions.dev scale (`--duration-quick: 150ms`, `--duration-fast: 250ms`, `--duration-medium: 350ms`, `--duration-slow: 400ms`, `--ease-smooth-out: cubic-bezier(0.22,1,0.36,1)`, `--duration-stagger: 40ms`) extended with OS tokens (`--fx-hold: 260ms`, `--fx-derez: 300ms`, `--fx-strip-stagger: 28ms`).
- **Global reduced-motion block** in index.css collapsing all `fx-*` animations and shrinking token durations to near-zero.

### Sub-view switcher — `PromptsPage` internal transitions
Wrap the four conditional views (PromptsPage.tsx:129–182) in `<AnimatePresence mode="wait">` keyed on `activeView` with a light **CONTEXT-SWITCH** variant: 12px lateral slide + 3px blur + opacity, 250ms out / 350ms in, `playSlide` SFX. Same container, zero layout change. This gives crafter ↔ refiner ↔ analyzer transitions where today there are none.

## 4. Signature transition matrix (route-pair semantics)

| Signature | Route pairs | Cover geometry | Hold | HUD dressing | Enter choreography |
|---|---|---|---|---|---|
| **MODULE-BOOT** | dashboard → crafter/refiner/analyzers/composer | Vertical shutters slam edges→center | 400ms | Glyph + name decrypt + hex ticker + progress strip | Shutters split center→edges; panels materialize top-to-bottom stagger |
| **CONTEXT-SWITCH** | crafter ↔ refiner ↔ analyzers (siblings) | none (internal swap) | — | — | Lateral data-slide + blur, sub-tab panels re-stagger |
| **SHELL-RETURN** | any → dashboard | Iris closes to center | 180ms | Kollektiv wordmark pulse (reuses Tesoro logo slot) | Iris opens from center; dashboard cards stagger radially (center-out) |
| **VAULT-DECOMPRESS** | any → gallery / library | Horizontal scan-slam top+bottom | 320ms | "DECRYPTING ARCHIVE" decrypt + progress | Rows materialize with row-stagger; children capped at 12, rest instant |
| **SYSTEM-ACCESS** | any → settings | Blast doors: top+bottom strips close | 380ms | "ROOT ACCESS GRANTED" + scanline sweep | Doors part; settings nav rail flashes edge cascade first, then body |
| **UPLINK** | any → assistant | Iris wipe biased toward header (origin top) + pulse rings | 260ms | Radar ring ping (Samaritan style) | Assistant surface fades through blur with ring echo |
| **TOOL-MOUNT** | any → image tools (compare/palette/resizer/video/lora) | 4 diagonal shards close | 220ms | Glyph + name decrypt only (compact) | Shards retract; tool panels materialize left-to-right |
| **REDUCED** | all, when prefers-reduced-motion | none | — | — | 150ms opacity crossfade |

Default for unlisted pairs: MODULE-BOOT with a 260ms hold. Direction table is data (`components/transitions/routeFx.ts`), not code — one map from `(from-group, to-group)` to signature.

## 5. Per-page panel choreography

Panel inventory (from codebase research) and the entry order each page plays during MATERIALIZE. No page's JSX structure changes; choreography rides on existing variant hooks and nth-child CSS. *(Enriched from the research agent's inventory — see Addendum A.)*

- **Dashboard:** header strip → stat/action cards (radial center-out stagger on SHELL-RETURN, linear on first boot) → activity/feed panels → footer ticker. `ScanLine` stays as ambient.
- **Refiner (PromptsPage/refine):** page header decrypt → left control column (sub-tab rail flashes first, then active tab's controls cascade top-down, 40ms steps) → main output panel wipes left→right → action bar rises.
- **Crafter (PromptsPage/composer):** header decrypt → wildcard/library rail → editor surface (largest panel; wipes with edge flash) → preview/output column.
- **Analyzers (prompt/media):** header → input/dropzone panel → results panel (skeleton shimmer until content) → breakdown cards stagger.
- **Discovery:** header → filter rail → card grid (row stagger, capped) → detail drawer stays untouched (it has its own open animation).
- **Library (SavedPrompts) / Vault (Gallery):** header → toolbar → grid rows (capped stagger; images beyond fold enter instantly to protect perf).
- **Composer:** header → track/timeline panels top-down → transport bar.
- **Settings:** section nav rail (edge-flash cascade) → active section body (contentVariants) → footer status.
- **Assistant:** full-surface fade-through-blur with ring echo (its internal Samaritan animations own the rest).
- **Image tools:** header → primary canvas/dropzone → side controls → status bar.

Panel interactivity polish (same pass, all zero-layout):
- Panels get a `fx-panel-live` hover treatment only where a panel class already exists: 1px primary border-glow ramp (box-shadow, 150ms) + existing hover sounds. No new DOM.
- `PanelLine` edges re-draw on sub-tab changes inside Refiner/Crafter (they already re-mount with the tab content — free).

## 5b. Cinematic grade bar (premium / large-budget feel)

Every transition follows film-language rules, not UI-animation defaults:

- **Anticipation → action → settle.** The de-rez opens with a 12% "inhale" beat (brightness +7%, scale +0.4%) before the collapse — the trailer-cut rhythm that makes the power-down feel intentional rather than abrupt.
- **Weight.** Reveals are deliberately heavier than covers (0.52–0.6s expo.inOut vs 0.3–0.42s covers). Big doors move like they have mass; nothing snaps.
- **Light leads the curtain.** As the cover opens, a specular light sweep (115° gradient, `mix-blend-mode: screen`, primary-tinted white core) crosses the incoming module — the "hero shot" lighting pass. Pure transform + blend, zero layout.
- **Materials.** Overlay strips carry a machined edge light (inset 1px primary line + 24px ambient glow) so shutters read as physical blades, not flat divs.
- **Depth.** A radial vignette sits behind the HUD during the hold — the eye is pulled to the module name decrypting at center frame.
- **Restraint.** One signature move per transition. The HUD is quiet (thin type, wide tracking, one blinking glyph); no competing motion during the hold.
- **Sound is scored to picture:** transition whoosh on cover start, type-tick at the swap, panel-slide on reveal — three beats, never overlapping.

## 6. Interruption, correctness, and performance rules

- `mode="wait"` retained — never two pages mounted mid-flight; overlay hides the wait gap so perceived latency *drops* versus today's 2.0s sequential wipe.
- Total budgets: MODULE-BOOT ≤ 1.15s, TOOL-MOUNT ≤ 0.85s, CONTEXT-SWITCH ≤ 0.6s, SHELL-RETURN ≤ 0.9s. All faster than the current 2.0s.
- Rapid-click policy per the director state machine (§3); the final destination always wins; no transition queue.
- Animate **only** transform / opacity / clip-path / filter / box-shadow-on-composited. `will-change` applied by the director at cover-start, removed at idle.
- Stagger caps: any container with >12 animated children gets `--stagger-cap` behavior (children 13+ share the final delay).
- Overlay strips are opaque (`/98`) — React tree swap, data loading flashes, and layout shifts during mount are invisible.
- GSAP contexts (`gsap.context`) with full `revert()` on unmount — same discipline as the existing boot sequence.
- Audio calls are fire-and-forget and already no-op when audio is disabled.

## 7. Execution phases & subagent orchestration

- **P1 — Research (subagent: Explore, running):** exhaustive page/panel/animation/constraint inventory. Feeds Addendum A and the choreography matrix.
- **P2 — Plan (this document).**
- **P3 — Core engine (main agent):** motion tokens + reduced-motion CSS; `TransitionDirector`; `TransitionOverlay` (replacing the dormant Tesoro block); App.tsx rewiring (`handleNavigate`, event-bus fix, `custom` prop on AnimatePresence); de-rez/enter data-attr FX.
- **P4 — FX library & shared choreography (main agent):** geometry presets (shutters/iris/shards/scan); upgraded shared variants; `TerminalText` scramble; edge-flash cascade CSS; PromptsPage CONTEXT-SWITCH.
- **P5 — Route matrix & polish (implementation subagent, precise spec):** `routeFx.ts` map, per-signature HUD dressing strings/glyphs, audio phase hooks, per-page stagger-origin tuning.
- **P6 — Adversarial verification (fresh subagent):** attack brief — find layout mutations (forbidden), reduced-motion violations, interrupt-state bugs (rapid nav spam), z-index conflicts with modals/toasts/panels, perf hazards (layout-property animation, unremoved will-change, uncapped staggers), broken pages, GSAP leak on unmount. Main agent fixes all confirmed findings.
- **P7 — Verification (main agent):** `tsc --noEmit`, `vite build`, live preview: navigate every route pair class, screenshot enter states, test reduced-motion emulation and rapid-click spam. Report with evidence.

## 8. Risks

- **Framer `custom` propagation on exit:** exit variants read `custom` from `AnimatePresence`, not the element — must set it on both. Covered in P3; verifier attacks it.
- **prompts_group shared key:** direct nav dashboard→refiner mounts PromptsPage fresh (full MODULE-BOOT) while crafter→refiner is internal (CONTEXT-SWITCH) — intended asymmetry, documented here.
- **Overlay vs. floating panels:** ClippingPanel/Notes/Chat panels are siblings inside contentRef (z below overlay's 1000) — they get covered during transitions, which is correct OS-shell behavior; verifier confirms they re-emerge untouched.
- **GSAP + framer both touching the page container:** they never animate the same element — framer owns the page `motion.div`, GSAP owns overlay + data-attr CSS classes own the wrapper. Enforced by convention in code review.

---

## Addendum A — Research inventory (P1 agent, condensed)

**Corrections/additions to §1 from deep research:**

- **`animate-fade-in` is a dead class** — used 66× across 33 files but defined nowhere (not index.css, not tailwind.config.js, not a Tailwind core utility). Ditto `animate-slide-in-from-right` (ComposerPage.tsx:523). P3 defines both — instant app-wide entrance-animation fix at zero layout risk.
- **PromptsPage already has a nested `AnimatePresence mode="wait"`** (PromptsPage.tsx:128–196) swapping PromptCrafter/RefinerPage/MediaAnalyzer/PromptAnalyzer — CONTEXT-SWITCH upgrades its variants rather than adding new structure.
- **Double-wrap:** most page roots wrap themselves in `motion.div variants={pageVariants} animate="visible"` *inside* the App-level motion.div using the same variants (Dashboard.tsx:43, PromptsPage.tsx:119, DiscoveryPage.tsx:447, SavedPrompts.tsx:271, ImageGallery.tsx:318, ComposerPage.tsx:406; SetupPage uses a local clip variant). Therefore the App-level wrapper switches to new light `shellVariants` (opacity/filter coordination only) and the inner roots keep `pageVariants` for the visible page wipe — no double-blur, no page edits.
- `activeTab` persists via `useLocalStorage('activeTab', 'dashboard')` (App.tsx:427). No router.
- `type ActiveTab` = 17 literals (types.ts:3–21): dashboard, assistant, discovery, prompts, crafter, refiner, prompt_analyzer, media_analyzer, prompt, gallery, resizer, video_to_frames, image_compare, color_palette_extractor, composer, lora_editor, settings.
- Header/footer/background/PageFrame/CustomCursor persist outside AnimatePresence; only contentRef swaps. `<main>` has overflow-hidden (clips everything).
- **z-map:** contentRef z-10; dormant overlay z-[1000]; PageFrame fixed z-[1000]; aperture z-[900]; loader z-[500]/[1000]; theme scanline pseudo-elements z-10001 (sit above the transition overlay — ambient, correct); header controls z-[9999].
- Floating panels (Clipping/Notes/LlmStatus/Chat/WebViewer) mount **inside contentRef** → they de-rez with the workspace (intended OS behavior) and sit under the overlay.
- **Heavy pages:** ImageGallery masonry (hundreds of ImageCards + a GSAP scroll ticker at ImageGallery.tsx:123) and DiscoveryPage unbounded load-more list — stagger caps mandatory there. Dashboard is *minimal* (logo hero + DashboardGallery background) — SHELL-RETURN choreography targets the hero + background reveal, not a card grid.
- **audioService buffers:** click, transition (`/sfx/page_transition.wav`), hover, slide, info, type, error, app_start, panel_slide_in, panel_slide_out. `handleNavigate` already plays `transition`; Header nav also plays click+slide.
- **Reduced-motion today:** one CSS block scoped to `[data-theme="Kollektiv"]` only (index.css:1831–1839); it does not touch framer/GSAP. P3 adds a global CSS block + JS matchMedia guard in the director.
- **Stack:** React 19.1 (with @types/react 18 mismatch, pre-existing), `motion` 12.38 imported as `motion/react` everywhere, gsap 3.12.5, Tailwind 3.4 + DaisyUI 4.12 (~40 themes; several apply crt-flicker/text-shadow that layer over transitions), Vite 5. View Transitions API unused.
- Existing keyframes to harmonize with: shine-sweep (510), crt-flicker (1320), grid-move-anim (1500), marquee, moveBox5631-1..9 (loader). `.corner-frame` (index.css:1900) is the universal panel wrapper hook for the edge-flash cascade.
