# PromptsPage Refiner Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `components/PromptsPage.tsx` is the largest file in the repo (2,228 lines, 44 `useState`, 5 `useRef`, 8 `useEffect`). It is really a 4-way view router (`activeView: 'refine' | 'composer' | 'analyzer' | 'prompt_analyzer'`, declared at `PromptsPage.tsx:169`) where three views already delegate to their own components (`PromptCrafter`, `MediaAnalyzer` at `:2118`, `PromptAnalyzer`) and one — the **Refiner** — is ~1,500 lines rendered and stateful inline. Extract the Refiner into its own component pair, leaving PromptsPage as a thin router. **Pixel-identical, behavior-identical** — this is a code move, not a redesign.

**Architecture:** The Refiner content inside PromptsPage today: the modifier control panel `renderRefineSubContent()` (`:853-1296`, a ~443-line `switch (activeRefineSubTab)` over basic/styling/photography/motion/audio/platform sub-tabs), the refine view JSX (`{activeView === 'refine' && (...)}` starting at `:1402`), the enhance/arena/direct-generate/preset handler cluster (`handleEnhance :414`, `handleEnhanceArena :470`, `handleDirectGenerate :591`, plus preset/save/clip handlers through `:852` and `:1297-1372`), and ~35 refiner-local `useState` hooks (media mode, modifiers, presets, dual-arena comparison state around `:221-232`). The shared modals (save preset, delete, PromptEditor, JSONBreakdown, CodeSnippet) live at `:2116-2226`. Note: `App.tsx:806-810` routes five tabs into PromptsPage with a `forcedView` prop — that outer contract must not change.

**Tech Stack:** React 19, TypeScript, framer-motion. No new dependencies.

## Global Constraints

1. **Pixel-identical.** Zero visual diff in any of the four views. Copy JSX verbatim; only the closure boundary moves.
2. **No persisted-data changes.** `refiner_presets_manifest.json` shapes, localStorage keys, and every service call signature stay byte-identical.
3. **The `App.tsx` contract is frozen.** `PromptsPage`'s props (`forcedView`, `onClipIdea`, `promptsPageState`, etc. — read the actual interface at the top of the file) do not change.
4. **There are no tests.** `pnpm lint` (= `tsc --noEmit`) plus the manual walk in the acceptance criteria are the only safety nets — do the walk after every task, not just at the end.
5. Do this **after** the dead-code sweep plan (`Plan-dead-code-sweep.md`) so you're not moving dead lines.

---

### Task 0 (prerequisite audit — do first, prevents thrashing)

- [ ] **Classify every hook and handler in PromptsPage as REFINER-LOCAL or SHARED.** Read `PromptsPage.tsx:157-352` (state declarations) and grep each identifier across the file. Classification rule: an identifier is REFINER-LOCAL iff every usage outside its declaration is inside `renderRefineSubContent` (`:853-1296`), the refine-view JSX block (`:1402-2114`), or a handler that is itself refiner-local. Everything else is SHARED.
  - **Expect SHARED to include (verify, don't assume):** `activeView`/`setActiveView`, `savedPrompts` + its loader (`PromptAnalyzer` receives `libraryItems={savedPrompts}` at `:2129`), `handleSaveSuggestion`, `handleClipSuggestion`, `handleSendToRefine` (called from Composer/Analyzer to hand text INTO the refiner), `handleSwitchView`, `composerPromptToInsert`, `isExiting`/navigation state, and the state behind the shared modals at `:2116-2226`.
  - **Expect REFINER-LOCAL to include (verify):** `refineText`, `modifiers`, `constantModifier`, `mediaMode`, `activeRefineSubTab`, arena/comparison state (`:221-232`), refiner preset state, enhance/generate loading flags, and the handlers `handleEnhance`, `handleEnhanceArena`, `handleDirectGenerate`.
  - Output: a table (identifier → REFINER-LOCAL | SHARED) as a scratch comment at the top of the working branch or in a scratch file. **Target: ≤ 10 props threaded into the extracted Refiner.** If your count lands above ~15, your classification is wrong — recheck before cutting.
  - **The known coupling trap:** `handleSendToRefine` sets refiner state (the incoming prompt text) but is *called* from other views. Resolution: keep a small `pendingRefineInput` (or reuse the existing equivalent state if one exists — check `promptsPageState` handling first) in the shell, pass it down as a prop, and let the Refiner consume it in an effect. Do not lift all refiner state up just to serve this one handoff.

### Task 1: Extract the modifier controls (pure render, lowest risk)

**Files:**
- Create: `components/RefinerModifierControls.tsx`
- Modify: `components/PromptsPage.tsx`

- [ ] **Step 1:** Create `RefinerModifierControls` and move the entire `renderRefineSubContent` switch body (`:853-1296`) into it verbatim. Its props are exactly the identifiers that body reads — from the Task 0 audit (expect: `activeRefineSubTab`, `modifiers` + setter, `refineText` + setter, `constantModifier` + setter, `mediaMode`, and a handful of handlers). Type the props explicitly; no `any`.
- [ ] **Step 2:** Replace the `renderRefineSubContent()` call site with `<RefinerModifierControls ...props />`.
- [ ] **Step 3:** `pnpm lint` green. `pnpm dev`: open the Refiner, click through **all six** sub-tabs (basic/styling/photography/motion/audio/platform), toggle a modifier in each, confirm the prompt-idea textarea still edits. Zero visual diff.
- [ ] **Step 4:** Commit: `git commit -am "refactor: extract RefinerModifierControls from PromptsPage (verbatim move)"`

### Task 2: Extract the Refiner view

**Files:**
- Create: `components/RefinerPage.tsx`
- Modify: `components/PromptsPage.tsx`

- [ ] **Step 1:** Create `RefinerPage.tsx`. Move into it, verbatim: every REFINER-LOCAL `useState`/`useRef`/`useMemo`/`useEffect` from the audit, the handler cluster (`handleEnhance`, `handleEnhanceArena`, `handleDirectGenerate`, refiner preset handlers), the `<RefinerModifierControls>` usage from Task 1, and the whole `{activeView === 'refine' && (...)}` JSX block (`:1402-2114`, minus the outer `activeView` condition — that stays in the router). Move the imports each piece needs (check `services/refinerPresetService`, `llmService` functions, motion variants, icon imports).
- [ ] **Step 2:** Give it the SHARED props from the audit (target ≤ 10): expect roughly `pendingRefineInput`/`promptToInsert`, `onSaveSuggestion`, `onClip`, `onSwitchView`, `isExiting`, `header`, and the shared-modal openers if refine JSX triggers them. Match the prop-naming style of the sibling extractions (`MediaAnalyzer` receives `onSaveSuggestion`, `onClip`, `header`, `isNavigating` — see `:2118-2127`).
- [ ] **Step 3:** In PromptsPage, render `{activeView === 'refine' && <RefinerPage ...props />}` in the same position in the JSX tree (order matters for AnimatePresence siblings — keep the block exactly where the old one was relative to `:2116`'s modals and the other views).
- [ ] **Step 4:** Delete the now-unused refiner state/handlers/imports from PromptsPage. `pnpm lint` will list every leftover — chase it to zero. **If tsc says a "refiner" identifier is still used by another view, your Task 0 classification missed a coupling: stop, re-classify that identifier as SHARED, thread it as a prop — do not duplicate state in both components.**
- [ ] **Step 5:** Full manual walk (acceptance criteria list below). Commit: `git commit -am "refactor: extract RefinerPage; PromptsPage becomes a view router"`

### Task 3: Confirm the shell is thin and document the seam

- [ ] **Step 1:** `wc -l components/PromptsPage.tsx components/RefinerPage.tsx components/RefinerModifierControls.tsx` — expect roughly ≤ 350 / ~1,300 / ~470. If PromptsPage is still > 600 lines, list what remains and why (shared modals and handoff plumbing are legitimate residents; refiner logic is not).
- [ ] **Step 2:** `pnpm lint` and `pnpm build` green. Commit any cleanup.

---

## Edge cases a weaker model would miss

1. **The cross-view handoffs are the whole difficulty.** `handleSendToRefine` (Composer/Analyzer → Refiner), `onMapToRefiner` (PromptAnalyzer → Refiner, see `:2135`), and the `promptsPageState` payload from `App.tsx` all inject data INTO refiner state from outside. Each needs a prop-based handoff (shell holds the pending value; Refiner consumes it in `useEffect` and signals consumption via a callback or by keying on the value). Getting this wrong loses the user's text mid-handoff — test each handoff path explicitly.
2. **AnimatePresence and mount order:** the views are animated siblings. Moving the refine block into a child component changes React's tree identity — keep the same `key`s and the same relative order, or exit animations will glitch. If the refine block had no `key`, add none.
3. **`forcedView` re-routing** (`useEffect` at `:171`) stays in the shell — the Refiner must not know about tabs.
4. **Do not convert `useState` clusters into a reducer or context while moving.** Verbatim move first; improvements are a separate change or the diff becomes unreviewable.
5. **Shared modals (`:2116-2226`) stay in the shell** if more than one view triggers them (check each: save-preset may be refiner-only → moves; PromptEditor/JSONBreakdown may be shared → stay). Decide per-modal from actual usage, not by guess.
6. Watch for module-level constants (`DEFAULT_MODIFIERS :145`, `PropertyCard :85`, `ReferenceSlot :113`) — `PropertyCard`/`ReferenceSlot` move with whichever view uses them; if both a moved and a kept view use one, it goes to the new file and is imported back (never duplicated).
7. Stale-closure bugs after the move: any moved handler that referenced a SHARED value now reads a prop — if it was inside a `useCallback` with a dependency array, update the deps to the prop names or the handler will act on stale data.

## Acceptance criteria

1. `pnpm lint` and `pnpm build` green.
2. Manual walk in `pnpm dev`, all through the app's tabs (App routes 5 tabs into this page):
   - Refiner: type an idea → Enhance streams a result; arena/compare mode runs both sides; direct generate works; all six modifier sub-tabs render and modify the prompt; save a refiner preset, reload the app, load the preset back.
   - Composer view: build a template, "send to refine" → text arrives in the Refiner textarea.
   - Media Analyzer: analyze an image, send a suggestion to refine → arrives.
   - Prompt Analyzer: dissect a prompt, `onMapToRefiner` → modifiers and prompt arrive in the Refiner.
   - Clip an idea from the Refiner → lands in the clipping panel.
3. Zero visual diff in all four views (compare against `main` side-by-side if unsure).
4. No state duplication: `grep -c "useState" components/PromptsPage.tsx` + same for `RefinerPage.tsx` ≈ 44 total (a few may legitimately consolidate, none may double).

## Out of scope

- The redundant double-routing (`App.tsx:806-810` `forcedView` → internal `activeView` switch) — worth flattening later, separate change.
- Any visual/UX improvement to the Refiner.
- Extracting further pieces of PromptCrafter/LLMChatPanel/PromptAnalyzer.
- Reducer/context refactors of the moved state.
