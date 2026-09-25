# Kollektiv — Motion / Animation Review

Read-only code review (no browser). Commit `8393b5d`, branch `development`.
Rubrics applied: emil-design-eng, improve-animations (audit categories), transitions-dev `review`, find-animation-opportunities.
Legend: **VERIFIED** = confirmed by reading the cited line(s). **SUSPECTED** = inferred, needs a runtime check.

Product personality: a dense creative tool used many times a minute, dressed in a cinematic sci-fi skin. The skin is the brand, but it currently charges its cost on the most frequent actions (navigation, hover, press). The rule this review applies throughout: keep the theatre for rare moments (boot, idle, first visit), and make the frequent paths fast.

---

## 1. Top 10 issues (ranked by leverage = impact / effort)

### #1 HIGH — Every route change costs about 1.5–1.75 s before the page is usable — VERIFIED
`components/transitions/TransitionOverlay.tsx:111-214`, `components/transitions/routeFx.ts:55-62`, `components/App.tsx:569-581`, `components/AnimatedPanels.tsx:128-145`

Timings measured from the GSAP timelines (cover = geometry tween plus stagger plus the HUD fade tail; reveal = HUD fade plus geometry plus the light sweep, which is the last thing to finish):

| FxKind (geometry) | cover | hold (`FX_META`) | reveal | **total** |
|---|---|---|---|---|
| module-boot (shutterV) | ~0.53 s | 400 ms | ~0.84 s | **~1.77 s** |
| shell-return (iris) | ~0.48 s | 180 ms | ~0.84 s | **~1.50 s** |
| vault-decompress (shutterH) | ~0.53 s | 320 ms | ~0.84 s | **~1.69 s** |
| system-access (doors) | ~0.49 s | 380 ms | ~0.84 s | **~1.71 s** |
| uplink (irisTop) | ~0.48 s | 260 ms | ~0.84 s | **~1.58 s** |
| tool-mount (shards) | ~0.54 s | 220 ms | ~0.98 s | **~1.74 s** |

After the overlay opens, more motion is still stacked on top of it:
- `shellVariants.visible` blurs 6px to 0 over 500 ms with `when: "beforeChildren"` (`AnimatedPanels.tsx:129-139`), so the page's own children wait 500 ms before they start.
- The edge-flash cascade runs 600 ms plus up to 660 ms of delay (`index.css` `[data-fx="enter"]`).
- Pages add `TerminalText` delays of 0.3–2.0 s and `ScanLine` delays of up to 4.5 s (for example `ColorPaletteExtractor.tsx:243`, `ImageCompare.tsx:326`).

The hold is pure padding. No page is lazy-loaded (App.tsx has no `lazy(`/`Suspense`), so React has nothing to wait for. The 520 ms scramble on the HUD label (`TransitionOverlay.tsx:133`) outlasts the 180–260 ms holds, so the label is still unreadable when the reveal starts.

Frequency: navigation happens 100+ times a day. Emil's rule for that tier is no animation at all.

**Fix (exact values):**
- Cover: all geometries `duration: 0.22`, `ease: 'power3.in'` (use `'power2.in'` for iris), stagger `each: 0.012`.
- Hold: one value, `80` ms, for every kind (enough for one legible HUD frame). Drop the scramble, or set its duration to `hold` (80 ms).
- Reveal: `duration: 0.32`, `ease: 'power3.out'` (the new content is entering, so use ease-out, not `expo.inOut`), stagger `each: 0.015`. Sweep `duration: 0.4`, starting at `'<'`.
- Target: about 650 ms in total for the heaviest kind.
- Better: play the full cinematic only on the **first visit to each module per session**, and play a 150 ms opacity crossfade after that (`--duration-quick`, `--ease-smooth-out`). Either keep a `Set<ActiveTab>` of visited tabs in the director, or add a settings toggle such as "Cinematic transitions".
- `shellVariants.visible`: `{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: [0.22,1,0.36,1] } }`. Remove `filter`, remove `when: 'beforeChildren'`, and set `staggerChildren` to at most 0.03.

### #2 HIGH — IdleOverlay's matrix canvas runs forever while hidden — VERIFIED
`components/IdleOverlay.tsx:43-129, 132-135`

The overlay is always mounted (App.tsx:480-482) and hidden with `visibility`. The matrix effect's dependency list is `[settings.idleScreenType]` only, not `isVisible`. So with the default matrix mode, a rAF loop draws a full-window canvas at about 20 fps for the whole session. It also calls `getComputedStyle(document.documentElement)` on every drawn frame (line 80), which forces a style recalculation. In gallery mode, `ChromaticText` (issue #4) runs instead.

**Fix:** add `if (settings.idleScreenType !== 'matrix' || !isVisible) return;` to that effect and add `isVisible` to its dependencies. Read `--p` and `--b1` once in `init()`, not per frame. On hide, use `duration: 0.2` instead of 0.8 and set `pointerEvents: 'none'` immediately. Today the fading overlay (`pointer-events-auto`, line 134) swallows clicks for 800 ms after the user comes back. Keep the 2 s fade-in, since that moment is rare.

### #3 HIGH — Timing hazards created by the async commit (beyond the known pre-navigate state bug) — VERIFIED
`components/transitions/useTransitionDirector.ts`, `components/transitions/TransitionOverlay.tsx:236`, `components/Header.tsx:170-180, 230-234`

1. **Clicks go through the opaque cover.** The overlay root is `pointer-events-none` for its whole life (TransitionOverlay.tsx:236). During the ~0.5 s cover the old page is still live, and during the hold the new page is live but invisible. A double-click or a stray click lands on a page the user cannot see. Fix: call `gsap.set(root, { pointerEvents: 'auto' })` at the start of `cover()` and set it back to `'none'` at the start of the geometry tween in `reveal()`.
2. **You cannot cancel back to the origin tab.** `navigate()` line 182 checks `if (tab !== getActiveTab()) pendingRef.current = tab;`. During the cover, `getActiveTab()` is still the origin tab, so clicking it is ignored and the app still goes to the first destination. That breaks the documented rule that "the latest destination always wins". Fix: always set `pendingRef.current = tab` while mid-flight (committing the current tab is a no-op).
3. **Header submenu reopens on the wrong page.** In `handleParentClick` for a single-page group (Header.tsx:230-234), `setActiveMenu(null)` runs immediately, but `activeTab` only changes ~0.5 s later. The layout effect at Header.tsx:170-180 sees `activeMenu == null` while `activeTab` is still the old tab (for example `crafter`), so it reopens the old group. After the commit `activeMenu` is not null, so it never re-syncs. Result: clicking Home from Crafter leaves the Workbench submenu open on the dashboard. Fix: base the auto-expand on the destination (pass the pending tab), or run it only when `activeTab` actually changes, using a ref of the previous value.
4. **No recovery path.** `run()` has no `try/finally`. If a cover or reveal promise never resolves (the timeline is killed on unmount or HMR, and `onComplete` never fires), `phaseRef` stays `'covering'` and every later navigation gets swallowed as "pending". `abort()` exists but is never called (a grep for `.abort()` finds no caller). Fix: wrap the body of `run` in `try { … } finally { phaseRef.current = 'idle'; }` and resolve the pending cover promise from `abort()`/kill. Either wire `abort()` up or delete it.
5. **Rapid clicks during the reveal chain a second full transition** (lines 171-175), so two clicks about 1 s apart cost about 3.4 s. Fix: when `pendingRef` is set during the reveal, call `activeTl.current.progress(1)` and commit the pending tab through the 150 ms crossfade path instead of a full `run()`.
6. **SUSPECTED: `AnimatePresence mode="wait"` delays the new page mount** (App.tsx:569) until every exiting descendant variant finishes. Pages built on `panelVariants`/`pageVariants` have 0.3–0.4 s exits with `when: 'afterChildren'`, so the total exit can exceed the 180–260 ms holds, and the reveal would open onto an empty or half-mounted area. The overlay already hides the swap, and workspace siblings share the key `prompts_group`, so the shell-level `AnimatePresence` adds nothing. Fix: replace it with a plain keyed `<div key=… className="h-full w-full">`. That also removes the exit wait entirely.

### #4 HIGH — ChromaticText re-renders about 16 times a second, forever, including when disabled, in the always-visible Header — VERIFIED
`components/ChromaticText.tsx:8-37`. It is used in `Header.tsx:53`, `Dashboard.tsx:80`, `IdleOverlay.tsx:158`, and twice in `InitialLoader`.

A rAF loop calls `setOffsets` every 60 ms. When `enabled === false` it still sets a new object every tick (lines 26-28), so it re-renders anyway. It uses `Math.random()` during render for `filter: contrast(1.5) brightness(1.2)` (line 49), which produces random brightness flashes, a photosensitivity concern. It ignores reduced motion.

**Fix:** make it pure CSS with no JS: `@keyframes chroma-jitter` with 8 text-shadow stops, `animation: chroma-jitter 0.5s steps(1) infinite`, and no `filter` flash. Render only when `enabled`. Under `prefers-reduced-motion: reduce`, use `animation: none; text-shadow: none`. If you keep JS, mutate `el.style.textShadow` through a ref and don't start the loop when disabled.

### #5 HIGH — RollingText duplicates every letter, which breaks screen readers and e2e — VERIFIED
`components/RollingText.tsx:20-47`, used for every Header nav label (`Header.tsx:108, 282`).

Each letter is rendered twice (the top and bottom spans), both in the DOM and in the accessibility tree. "Home" becomes the text content "HHoommee", split across 8 inline-block spans. Screen readers either spell it out letter by letter or read it doubled, and `getByText('Home')` fails. The hover roll is also 500 ms plus 20 ms × index, on a hover that happens tens of times a day.

**Fix:** `<span className="sr-only">{text}</span>` plus `aria-hidden="true"` on the animated letter container. Transition: `duration: 0.25`, `ease: [0.22,1,0.36,1]`, `delay: i * 0.01`. Gate the roll behind `(hover: hover) and (pointer: fine)`. Under reduced motion, change color only.

### #6 HIGH — The global button press transition is `all 0.3s ease`, so press feedback lags — VERIFIED
`index.css:158` (`button:not(...) { transition: all 0.3s ease }`) and `index.css:406` (`.form-btn { transition: all 0.2s … }`), with `button:active { transform: scale(0.98) }` at `index.css:169`.

The scale-on-press exists, but it eases in over 300 ms, so the button reaches its pressed state after the finger is already up. The `transition: all` also animates every property change, including layout.

**Fix:** `transition: transform 120ms var(--ease-smooth-out), background-color var(--duration-quick) ease, color var(--duration-quick) ease, border-color var(--duration-quick) ease, opacity var(--duration-quick) ease;` on both selectors. Keep `scale(0.98)`.

Related: `transition-all` appears 172 times in 67 `.tsx` files, and `index.css` has 14+ shorthand `transition: 0.5s` / `all` declarations (lines 158, 177-326, 368, 406, 453, 571, 1459, 2569). Replace them with named properties as files are touched. That is a follow-up clean-up, not one mass rewrite.

### #7 HIGH — ImageCard: 2.4 s filter reveal per image, a dead 1.8 s clip-path, and 0.5–2.5 s hovers — VERIFIED
`components/ImageCard.tsx`

- Lines 111-123: each image that loads runs `clipPath` on `shutterRef` for 1.8 s, but that shutter is `bg-transparent` (line 168), so the clip-path animation is invisible dead work. It then runs `scale 1.2→1` plus `filter grayscale/brightness` for **2.4 s**. In a grid of 50 cards that is 50 concurrent filter repaints. Fix: delete the shutter. Use `gsap.fromTo(media, { opacity: 0, scale: 1.02 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' })`, or better, CSS `transition: opacity 300ms var(--ease-smooth-out)` toggled by `data-loaded`.
- Lines 128-143: hover zoom is `scale 1.1` over 2.5 s, and hover-out is 1.5 s with `power2.inOut`. It also has no `overwrite`, so it fights the reveal tween over `scale` (SUSPECTED jump when both run). Fix: `scale: 1.04, duration: 0.4, ease: 'power2.out', overwrite: 'auto'` on hover in, and `duration: 0.3, ease: 'power2.out'` on hover out. Or use pure CSS `group-hover:scale-[1.04] transition-transform duration-[400ms]`.
- Lines 242-290: the hover text uses `duration-500` / `duration-700` / `duration-1000`, and line 278 animates **`grid-template-rows` (layout) for 1000 ms** on hover. Fix: opacity at `duration-[150ms]`, translate at `duration-[250ms]` with `ease-[cubic-bezier(0.22,1,0.36,1)]`, grid-rows at `duration-[250ms]`. Wrap in `@media (hover:hover)`.
- Lines 186 and 205: permanent `will-change-transform` on every `<img>`/`<video>` creates one compositor layer per card, which is a memory blow-up in large galleries. Remove it; GSAP promotes elements during tweens on its own.
- Line 232: `transition-all duration-700` on the card root animates nothing. Delete it.

### #8 MEDIUM — Header submenu switch takes about 1.5 s and animates layout — VERIFIED
`components/Header.tsx:198-256`

Switching from one open group to another does `setActiveMenu(null)`, then a hard-coded `setTimeout(…, 900)`, then opens the new group over 0.6 s. That is about 1.5 s before the items are clickable, and clicks during the switch are dropped (`switchingRef`). The close also has `delay: 0.3`. The container animates `width` (0 to auto), which reflows and shifts every nav group to its right, so targets move under the cursor. `NavItem` fades 0.4 s / 0.3 s with `expo.in` (line 90; ease-in on an exit adds perceived lag).

**Fix:** remove the 900 ms timeout and `switchingRef`. Close the old group and open the new one in the same tick. Open: `duration: 0.2, ease: 'power3.out'`. Close: `duration: 0.15, delay: 0, ease: 'power2.out'`. NavItem: `duration: 0.15`, `ease: 'power2.out'` both ways. Keep the width tween (auto width needs it), but at those durations the layout cost is brief.

Separate a11y issue: collapsed `NavItem`s are only `opacity: 0` inside a `w-0` container, with no `inert` or `tabIndex={-1}`, so keyboard focus can land on invisible items. Add `inert={!isActive}` on the container.

### #9 MEDIUM — Reduced-motion coverage is patchy; neither GSAP nor `motion` honours it globally — VERIFIED
There is no `MotionConfig`, no `useReducedMotion`, and no `gsap.matchMedia` anywhere (grep). What does respect it: the route director (`routeFx.ts:74`, used at `useTransitionDirector.ts:46`), `TerminalText` (`AnimatedPanels.tsx:20`), `StormBackground` (line 247), the `index.css:2797` block (fx classes only), and `index.css:1868`, which is **scoped to `[data-theme="Kollektiv"]` only**, so CSS transitions in the other 40+ themes are not reduced.

Ignores reduced motion: the boot reveal timeline (App.tsx:303-362), InitialLoader GSAP (lines 82-97), CustomCursor (infinite rotation plus follower), ChromaticText, RollingText, ImageCard reveal and hover, ScanLine (infinite), AssistantBackdrop (4 infinite loops), IdleOverlay matrix, Header nav tweens, FeedbackToast, AboutModal, CommandPalette, `.pulse-glow`, `shine-sweep`, `crt-flicker` (0.15 s infinite flicker, `index.css:1033/1168/1177/2556`, a photosensitivity risk), `grid-move-anim`, and the `moveBox5631-*` keyframes.

**Fix:**
- (a) Wrap the app root in `<MotionConfig reducedMotion="user">` (motion v12). That drops transform and layout animations and keeps opacity.
- (b) Change `index.css:1868` from `[data-theme="Kollektiv"] *` to `*, *::before, *::after`, with `animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important;`.
- (c) Guard the GSAP call sites with the existing `prefersReducedMotion()` from `routeFx.ts`. For the boot reveal, InitialLoader and ImageCard, call `tl.progress(1)` or `gsap.set` the end state. For decorative infinite loops (the cursor arrow, ChromaticText, ScanLine, AssistantBackdrop), don't start them at all.

### #10 MEDIUM — Boot takes about 4.4 s from clicking "Continue" to a usable app, plus 2 s of dead wait before the button appears — VERIFIED
`components/InitialLoader.tsx:88, 102, 117-123, 167, 172, 188` and `components/App.tsx:303-362`

- After progress reaches 100% there is an artificial `setTimeout(…, 1000)` (line 102), then a 1000 ms fade (line 188), so the user waits 2 s for Continue.
- The Continue exit takes 0.8 s (line 120).
- The first-reveal timeline runs about 3.6 s: frame 2.0 s, blinds 1.2 s plus stagger, header and content 1.0 s each, sequenced.
- The logo fill animates **`width`** 0–100% over 2.5 s (line 88), which is a layout property.
- The progress bar animates `width` twice: GSAP counts it up, then CSS applies `transition-all duration-500` on top (line 172).
- 12 full-height blinds each carry `backdrop-blur-md` (App.tsx:537) while animating.

Boot is rare (once per session), so it earns some delight budget, but 6+ s of waiting is past that.

**Fix:**
- Line 102: `0` ms. Line 188: `duration-[250ms]`. Line 120: `duration: 0.35`.
- Logo: `clipPath: 'inset(0 100% 0 0)' → 'inset(0 0% 0 0)'` over 1.2 s with `power2.inOut`, on the fill element at `width: 100%`.
- Progress: `transform: scaleX(p)` with `origin-left` and no CSS transition.
- Boot reveal: frame 0.8 s `expo.out`, corners 0.6 s, blinds 0.6 s with stagger 0.03, header, footer and content 0.4 s. Target about 1.4 s in total.
- Blinds: remove `backdrop-blur-md` and use `bg-base-100` (they are opaque enough).

---

Other findings (not in the top 10, but verified):

- **FeedbackToast exit never plays** — VERIFIED. App.tsx:653 renders `{globalFeedback && <FeedbackToast …/>}`, which unmounts the whole component, including its internal `AnimatePresence`, so the `exit` at FeedbackToast.tsx:57 is dead code. Fix: always render `<FeedbackToast isOpen={!!globalFeedback} message={globalFeedback?.message ?? ''} …/>`. The progress bar animates `width` (lines 86-90); use `initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}` with `origin-left`. Enter: `transition={{ duration: 0.25, ease: [0.22,1,0.36,1] }}`. Exit: `{ opacity: 0, y: 20, duration: 0.15 }` (same edge as the entry). Also SUSPECTED: a new message of the same type doesn't reset the timer or the bar, because `message` isn't in the effect deps (line 28). Key the motion.div by `message`.
- **AboutModal enters from `scale: 0`** (AboutModal.tsx:28-30) — VERIFIED. Use `initial={{ scale: 0.96, opacity: 0 }}`, 250 ms enter and 150 ms exit. It also animates `backdropFilter` from 0 to 20px (lines 18-20), which re-rasterises the blur every frame. Set the blur statically and animate `opacity` only.
- **CommandPalette animates on a keyboard-triggered open** (CommandPalette.tsx:137-148), which is a 100+/day action. Set `transition={{ duration: 0 }}` on both layers, or keep a single 100 ms opacity-only fade on the backdrop.
- **ScanLine animates `top` forever** (AnimatedPanels.tsx:98-99), with 1–3 instances per page. **AssistantBackdrop animates `top` forever** (AssistantBackdrop.tsx:46, 88, 116) on an element that also carries `filter: blur(1px)` (line 44). Both are layout properties on the main thread. Fix: `style={{ top: 0 }}` with `initial={{ y: '-100%' }} animate={{ y: '333%' }}` (percent of its own 45% height covers the parent), or CSS `@keyframes` with `transform: translateY()`.
- **CustomCursor** (CustomCursor.tsx:24-33) calls `setCoords` on every `mousemove`, re-rendering at mouse rate, and creates a new `gsap.to` per event with a 400 ms trail. Fix: `const xTo = gsap.quickTo(cursor, 'x', { duration: 0.12, ease: 'power3.out' })` (same for y), write the coordinates through `textContent` refs, and don't mount when `(pointer: coarse)` or reduced motion. Also SUSPECTED hover flicker: `mouseout` from a child of a button sets hovering to false, then `mouseover` sets it back. Use `pointerover`/`pointerout` with `relatedTarget` checks. The system cursor stays visible (`index.css:122` has `cursor:none` commented out), so this is decorative; keep it cheap.
- **Modals using `animate-fade-in`** (78 uses): enter only, 400 ms plus a 4px translate of the entire full-screen backdrop, with `backdrop-blur-xl` (24px) on full-viewport layers (AddItemModal.tsx:162, ConfirmationModal.tsx:35, MigrationModal.tsx:66, PromptLibraryModal.tsx:17, WorkflowImportModal.tsx:359, ImageEditorPage.tsx:53, NewDocumentModal.tsx:49, …). Fix: change `.animate-fade-in` to `var(--duration-fast)` (250 ms) and translate only the dialog, not the backdrop. For full-screen modal backdrops, drop to `backdrop-blur-sm` (4px) with `bg-black/60`. An instant close is acceptable for frequently used modals, so exits are not required.
- **SavedPromptCard expand** (SavedPromptCard.tsx:123) uses the `max-h-[2000px]` trick over 700 ms, so the visible motion ends early and the collapse starts late. Use `grid-rows-[0fr]→[1fr]` with `duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]`.
- List rows (ClippingPanel.tsx:153/253, SavedPromptCard.tsx:83, SavedResultItem.tsx:42, SuggestionItem.tsx:154, WebTabContent.tsx:21) use `transition-all duration-700` for a hover background tint. Use `transition-colors duration-150`.
- **`loading_animation.json` is dead**: a 5.4 KB Lottie file with zero references (`git grep loading_animation` is empty) and no lottie dependency. Delete it.
- **StormBackground is well-behaved** — VERIFIED. It renders at CSS-pixel size (not DPR), the trail runs at 0.5x, it skips work when `document.hidden`, it does a single static paint under reduced motion, and it unmounts with the loader. Minor: under reduced motion the rAF loop keeps ticking and returning early (line 537). You could stop requesting frames and repaint on `resize` only. Low priority.

---

## 2. Proposed motion token set (extends what already exists)

`index.css:2664-2680` already defines a transitions.dev-aligned scale. **Keep it and don't invent a parallel one.** Two things are missing: (a) Tailwind cannot reach the tokens, which is why 172 `transition-all` and arbitrary `duration-700/1000` values exist, and (b) JS (GSAP/motion) has no mirror of them.

**CSS (keep, add 3):**
```css
:root {
  /* existing */
  --duration-stagger: 40ms; --duration-micro: 80ms; --duration-quick: 150ms;
  --duration-fast: 250ms; --duration-medium: 350ms; --duration-slow: 400ms; --duration-very-slow: 500ms;
  --ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1);   /* enter / open / reveal / press release */
  --ease-sharp-in:   cubic-bezier(0.7, 0, 0.84, 0);    /* ONLY for content leaving behind a cover (derez) */
  /* add */
  --duration-press: 120ms;                              /* :active scale feedback */
  --ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);     /* on-screen moves (already used ad hoc in ImageCard) */
  --fx-hold: 80ms;                                      /* was 260ms; also replace FX_META.hold numbers */
}
```

**Tailwind (`tailwind.config.js` → `theme.extend`)**, so utilities replace the arbitrary values:
```js
transitionDuration: { press: 'var(--duration-press)', quick: 'var(--duration-quick)', fast: 'var(--duration-fast)', medium: 'var(--duration-medium)', slow: 'var(--duration-slow)' },
transitionTimingFunction: { 'smooth-out': 'var(--ease-smooth-out)', 'sharp-in': 'var(--ease-sharp-in)', 'in-out-strong': 'var(--ease-in-out)' },
```
Usage: `transition-colors duration-quick`, `transition-transform duration-fast ease-smooth-out`.

**JS mirror** (a small exported const next to `prefersReducedMotion` in `components/transitions/routeFx.ts`, which is already the shared motion helper):
```ts
export const MOTION = { press: 0.12, quick: 0.15, fast: 0.25, medium: 0.35, slow: 0.4,
  easeOut: [0.22, 1, 0.36, 1] as const, gsapOut: 'power3.out', gsapIn: 'power2.in' };
```

**Usage map:**

| Interaction | Token |
|---|---|
| Button / press | transform `--duration-press` with `--ease-smooth-out`, scale 0.98 |
| Hover color or tint | `--duration-quick`, `ease` |
| Hover transform (card zoom, lift) | `--duration-slow` in, `--duration-medium` out, `--ease-smooth-out` |
| Tooltip | `--duration-quick`, `ease-out` |
| Dropdown / submenu | open `--duration-fast`, close `--duration-quick` |
| Modal | open `--duration-fast` (scale 0.96 → 1), close `--duration-quick` |
| Toast | open `--duration-fast`, close `--duration-quick` |
| Side panels | open `--duration-slow`, close `--duration-medium` |
| Route crossfade (repeat visits) | `--duration-quick` |
| Route cinematic (first visit) | cover 220 ms + hold `--fx-hold` + reveal 320 ms |
| Keyboard-triggered UI (palette, shortcuts) | none |
| Stagger | `--duration-stagger` (40 ms), cap at 8 items |

---

## 3. Inventory of animation systems

| System | Library | Files | Notes |
|---|---|---|---|
| Route transition overlay ("Context Shift Engine") | GSAP timelines + CSS keyframes | `components/transitions/{TransitionOverlay.tsx, useTransitionDirector.ts, routeFx.ts}`, `hooks/usePageTransitions.ts`, `index.css:2662-2810` | 6 geometries, ~1.5–1.77 s each; reduced-motion aware |
| Page shell mount/exit | motion (`AnimatePresence mode="wait"`) | `App.tsx:569-581`, `AnimatedPanels.tsx:128` (`shellVariants`) | Redundant behind the overlay; 500 ms blur fade |
| Page-internal reveal kit | motion variants | `AnimatedPanels.tsx` (`pageVariants`, `panelVariants`, `sectionWipeVariants`, `contentVariants`, `TerminalText`, `PanelLine`, `ScanLine`), used by about 20 pages (AssetsManager, ColorPalette, Converter, ImageCompare, ImageResizer, MediaAnalyzer, PromptAnalyzer, PromptCrafter, RefinerPage, VideoToFrames, LocalGenerationStudio, LoraEditor, Discovery, …) | 0.65–1.0 s entries, delays up to 4.5 s; ScanLine animates `top` |
| Boot loader | GSAP + React-state typewriter + WebGL | `InitialLoader.tsx`, `StormBackground.tsx`, `ChromaticText.tsx`, `hooks/useBootSequence.ts` | Storm is good; loader has artificial waits and `width` tweens |
| First app reveal | GSAP timeline | `App.tsx:298-365`, `PageFrame.tsx` | About 3.6 s; 12 blurred blinds |
| Idle screen | GSAP fade + canvas 2D rAF / DashboardGallery | `IdleOverlay.tsx`, `DashboardGallery.tsx` | Matrix loop never stops (#2) |
| Custom cursor | GSAP + React state | `CustomCursor.tsx` | Re-renders per mousemove |
| Header nav | GSAP (width/opacity) + motion (RollingText) | `Header.tsx`, `RollingText.tsx`, `HUDNavItem.tsx` | 900 ms switch delay; duplicate text nodes |
| Side panels | GSAP | `ClippingPanel.tsx`, `ActivityPanel.tsx`, `LlmStatusPanel.tsx`, `MediaPanel.tsx`, `VideoPlayerOverlay.tsx` | Not individually audited (out of top-10 budget) |
| Gallery / detail | GSAP | `ImageCard.tsx`, `ImageGallery.tsx`, `ItemDetailView.tsx`, `FullscreenViewer.tsx`, `DashboardGallery.tsx`, `PromptDetailView.tsx`, `SavedPrompts.tsx` | ImageCard 2.4 s filter reveal |
| Modals | motion (`AboutModal`, `CommandPalette`, `CodeSnippetModal`, `JSONBreakdownModal`) + CSS `.animate-fade-in` (78 uses) | see #9 and other findings | Enter-only CSS modals; AboutModal uses scale(0) |
| Toast | motion | `FeedbackToast.tsx` | Exit never plays |
| Assistant ambience | motion (infinite loops) | `AssistantBackdrop.tsx`, `LiveAssistantBar.tsx`, `LiveCaptionOverlay.tsx`, `ScreenControlOverlay.tsx` | Animates `top` forever |
| Global CSS FX | CSS keyframes | `index.css` (`shine-sweep`, `crt-flicker`, `grid-move-anim`, `moveBox5631-1..9`, `marquee`, `system-glow-pulse`, `fx-hud-blink`) | Only partly reduced-motion guarded |
| Image editor chrome | CSS `transition-colors` only | `image-editor/ui/ToolRail.tsx:46`, `StatusBar.tsx:27` | Correctly minimal (see §4, item 16) |
| Unused asset | none | `loading_animation.json` | Delete |

**Library duplication (task item 4) — VERIFIED counts:** `motion` v12 is imported in **45** files and `gsap` 3.12 in **23**. Both are heavily used, so "is `motion` actually used?" gets a clear yes. **Do not do a mass migration.** It would be a large rewrite with regression risk, for a bundle saving I have not measured (unverified; check with `vite build` plus rollup-visualizer before deciding). Pragmatic split:
- **motion**: React mount and unmount (`AnimatePresence`), declarative variants, springs, `MotionConfig reducedMotion`.
- **GSAP**: multi-step imperative timelines only (TransitionOverlay, the boot reveal).
- **CSS**: every hover, press, color and simple fade.

Following that split moves CustomCursor, the IdleOverlay fade, the InitialLoader counter, NavItem fades and the ImageCard hover off GSAP, which shrinks GSAP to about 5–8 files naturally, as those files get touched.

---

## 4. Specific fix list (ordered; each item is self-contained)

1. **Route timings** — `TransitionOverlay.tsx` cover: all `duration` → `0.22`, stagger `each` → `0.012`, iris ease `power4.in` → `power2.in`. Reveal: `duration` → `0.32`, `ease: 'expo.inOut'` → `'power3.out'`, stagger → `0.015`, sweep `0.65` → `0.4`. `routeFx.ts:55-62`: every `hold` → `80`. `scrambleTo(…, 520)` → `80`.
2. **First-visit gate** — `useTransitionDirector.ts`: add `const visitedRef = useRef(new Set<ActiveTab>())`. If `visitedRef.current.has(tab)`, take a fast path: commit, then CSS-fade `contentRef` with `el.animate([{opacity:0},{opacity:1}], {duration:150, easing:'cubic-bezier(0.22,1,0.36,1)'})`. Add the tab to the set after the first full run.
3. **Overlay blocks input during cover and hold** — in `cover()`, `gsap.set(root, { visibility: 'visible', pointerEvents: 'auto' })`. At the start of the reveal geometry tween, `tl.set(root, { pointerEvents: 'none' }, '<')`.
4. **Allow retargeting to the origin tab** — `useTransitionDirector.ts:182` → `pendingRef.current = tab;` (unconditional).
5. **try/finally** around the body of `run()`, resetting `phaseRef.current = 'idle'`. Either wire `abort()` into unmount and resolve open promises, or delete it.
6. **Mid-reveal interrupt** — `useTransitionDirector.ts:171-175`: replace `void run(next)` with the item 2 fast-path commit (no second cinematic).
7. **Remove the shell `AnimatePresence`** — App.tsx:569-581 → `<div key={groupKey} className="h-full w-full">{renderContent()}</div>`. Delete `shellVariants`, or reduce it to `{ duration: 0.2 }` opacity with no filter or `when`.
8. **Header** — delete `setTimeout(…, 900)` and `switchingRef` (Header.tsx:243-251). Open: `duration: 0.2, ease: 'power3.out'`. Close: `duration: 0.15, delay: 0, ease: 'power2.out'` (lines 204-220). NavItem: `0.15` / `power2.out` both ways (lines 78-92). Container gets `inert={activeMenu !== group.id}`. Fix the auto-expand effect (lines 170-180) so it only runs when `activeTab` changes.
9. **IdleOverlay** — effect deps `[settings.idleScreenType, isVisible]` with an early return when `!isVisible`; hoist `getComputedStyle` into `init`; hide `duration: 0.8` → `0.2` plus `gsap.set(el, { pointerEvents: 'none' })` first.
10. **ChromaticText** — replace with CSS keyframes (`steps(1)`, 0.5 s, 8 stops, text-shadow only, no filter). Render nothing extra when `enabled={false}`. Add a reduced-motion override.
11. **RollingText** — add an sr-only label and `aria-hidden` on the letters; `duration: 0.25`, `delay: i*0.01`, `ease: [0.22,1,0.36,1]`; hover-capable pointers only.
12. **Buttons** — `index.css:158` and `:406`: exact-property transitions, with transform at `var(--duration-press)` (120 ms).
13. **ImageCard** — delete `shutterRef` and its tween. Reveal: opacity 0→1 plus scale 1.02→1 over 0.3 s with `power3.out`, no filter. Hover: scale 1.04, 0.4 s in / 0.3 s out, `overwrite: 'auto'`. Text: 150 ms opacity / 250 ms translate / 250 ms grid-rows. Remove per-image `will-change-transform` and the root `transition-all duration-700`.
14. **Reduced motion** — `<MotionConfig reducedMotion="user">` around `AppContent`'s return (App.tsx:436). Globalise `index.css:1868`. Guard the boot timeline (`App.tsx:303`) with `if (prefersReducedMotion()) { gsap.set(end states); return; }`, and do the same in InitialLoader (lines 80-98) and CustomCursor (skip the mount).
15. **Boot** — InitialLoader.tsx:102 `1000` → `0`; :188 `duration-1000` → `duration-[250ms]`; :167 `transition-all duration-1000` → `transition-[opacity,transform] duration-[250ms]`; :120 `0.8` → `0.35`; :88 width → clip-path inset 1.2 s; :172 width → `scaleX` with no CSS transition. App.tsx boot timeline durations as in #10; remove `backdrop-blur-md` from the blinds (App.tsx:537).
16. **Toast** — always render it (App.tsx:653); scaleX progress; explicit 250 / 150 ms timings; exit `y: 20`; key by message.
17. **AboutModal** — `scale: 0` → `0.96`; animate opacity only; 250 ms enter / 150 ms exit.
18. **CommandPalette** — `transition={{ duration: 0 }}` on the panel. The backdrop may keep 100 ms opacity.
19. **ScanLine / AssistantBackdrop** — `top` → `y` (transform) keyframes. Skip under reduced motion.
20. **`.animate-fade-in`** → `var(--duration-fast)`. Move the translate to the dialog child. Full-screen modal backdrops: `backdrop-blur-xl` → `backdrop-blur-sm`.
21. **CustomCursor** — `gsap.quickTo` at 0.12 s, textContent coordinates, no mount on coarse pointers or reduced motion.
22. **Delete `loading_animation.json`.**
23. **Image editor** — keep it as is. Wheel and tool zoom are instant (`CanvasViewport.tsx:119, 137` call `renderer.zoomAt` directly), which is correct for a high-frequency action. Tool switching is `transition-colors` only (ToolRail.tsx:46), also correct. Optional and low value: `FloatingPanel` mount at opacity 0→1 plus scale 0.98→1 over 150 ms with `--ease-smooth-out`, and no animation on close. The one change that meaningfully speeds up the editor is item 2: entering it currently costs the 1.74 s `tool-mount` cinematic every time.

### Missed opportunities (after gating) — only one survives
- `image-editor/ui/FloatingPanel.tsx:76`: panels appear instantly. Purpose: preventing a jarring change. Frequency: occasional. Motion: opacity + scale 0.98, 150 ms, `cubic-bezier(0.22,1,0.36,1)`, origin at the invoking toolbar button if known. Low leverage.

### Rejected candidates
- CommandPalette open/close: rejected, keyboard-triggered at 100+/day (and the existing animation should be removed).
- Canvas zoom easing: rejected, it is a direct-manipulation, high-frequency action where motion would add input lag.
- Gallery grid stagger on entry: rejected, the gallery is opened tens of times a day, and ImageCard already over-animates.
- Tool-switch feedback animation in ToolRail: rejected, tool switches are often keyboard-driven, and the color change is enough.

### Verdict
The motion vocabulary is coherent and the token foundation already exists (`index.css:2664`). The problem is budget allocation: cinematic durations (0.5–2.5 s) are spent on the highest-frequency paths (navigation, hover, press), and several decorative loops run when nobody can see them. The highest-leverage change is **#1 plus fix-list item 2**: cut the route transition to about 650 ms and play it only on the first visit to each module. That turns roughly 1.7 s of waiting per click into about 150 ms without losing the brand moment.
