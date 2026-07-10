# Dead Code Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete ~470 lines of verified-dead code: four unreferenced components, one service calling a server endpoint that doesn't exist, and one plumbed-but-never-enabled parameter. Pure deletion, zero behavior change. This also clears the ground for the PromptsPage split (separate plan).

**Architecture:** Verified by grep this session: `components/ArtistCard.tsx` (52 lines) and `components/ArtstyleCard.tsx` (52 lines) are identical except one label string; `components/CheatsheetCard.tsx` (99 lines) is a different card; **none of the three is imported anywhere**. `components/ImageSlider.tsx` (156 lines) is imported **only** by the two dead cards (`ArtistCard.tsx:5`, `ArtstyleCard.tsx:5`), so it's transitively dead. `services/webSearchService.ts` is imported nowhere and calls `/api/search`, an endpoint with no route in `server.ts` — it could never have worked. The live cheatsheet pages render through `GenericCheatsheetPage` → `LayeredCheatsheetDetail`, not these cards. Finally, `streamChatGemini`'s `useWebSearch` parameter (`services/geminiService.ts:295`) is only ever called with the hard-coded literal `false` (`services/llmService.ts:749`).

**Tech Stack:** Just `git rm`, grep, and the TypeScript compiler.

## Global Constraints

- **Re-verify before every deletion.** The grep results above were true at plan-writing time; run each verification step yourself before deleting, in case the codebase moved.
- If any verification grep returns an unexpected hit, **do not delete that file** — leave it, note the hit, and continue with the rest.
- `pnpm lint` (= `tsc --noEmit`) and `pnpm build` must both be green at the end.

---

### Task 1: Delete the dead components

**Files:**
- Delete: `components/ArtistCard.tsx`
- Delete: `components/ArtstyleCard.tsx`
- Delete: `components/CheatsheetCard.tsx`
- Delete: `components/ImageSlider.tsx`

- [ ] **Step 1: Verify no importers.** Run each of these; expected result for each: hits **only** inside the four files being deleted (self-references and cross-references among them), never in any other file:

```bash
grep -rn "ArtistCard" components services utils contexts constants index.tsx --include="*.ts" --include="*.tsx"
grep -rn "ArtstyleCard" components services utils contexts constants index.tsx --include="*.ts" --include="*.tsx"
grep -rn "CheatsheetCard" components services utils contexts constants index.tsx --include="*.ts" --include="*.tsx"
grep -rn "ImageSlider" components services utils contexts constants index.tsx --include="*.ts" --include="*.tsx"
```

  Also check for lazy/dynamic imports by path string: `grep -rn "ArtistCard\|ArtstyleCard\|CheatsheetCard\|ImageSlider" index.html vite.config.ts` → no hits expected.
- [ ] **Step 2:** `git rm components/ArtistCard.tsx components/ArtstyleCard.tsx components/CheatsheetCard.tsx components/ImageSlider.tsx`
- [ ] **Step 3:** `pnpm lint` → green (if the compiler reports a missing module, a caller existed that grep missed — restore with `git checkout -- <file>` and investigate before proceeding).
- [ ] **Step 4:** Commit: `git commit -m "chore: delete dead card components and their orphaned ImageSlider"`

---

### Task 2: Delete the dead web-search service

**Files:**
- Delete: `services/webSearchService.ts`

- [ ] **Step 1: Verify:** `grep -rn "webSearchService" components services utils contexts index.tsx --include="*.ts" --include="*.tsx"` → hits only inside `services/webSearchService.ts` itself.
- [ ] **Step 2: Confirm its endpoint never existed:** `grep -n "api/search" server.ts` → no hits (this is why the service is dead weight, not a dormant feature).
- [ ] **Step 3:** `git rm services/webSearchService.ts`
- [ ] **Step 4:** `pnpm lint` green. Commit: `git commit -m "chore: delete webSearchService - unimported, calls a nonexistent endpoint"`

---

### Task 3: Remove the never-enabled useWebSearch parameter

**Files:**
- Modify: `services/geminiService.ts` (`streamChatGemini` signature at `:295`, usage at `:350`)
- Modify: `services/llmService.ts:749` (the call site)

- [ ] **Step 1: Verify the only call site:** `grep -rn "streamChatGemini" components services utils --include="*.ts" --include="*.tsx"` → expected: the definition in `geminiService.ts` and exactly one call at `llmService.ts:748-749` passing literal `false`.
- [ ] **Step 2:** In `geminiService.ts`, remove the `useWebSearch: boolean = false` parameter from `streamChatGemini` and change line `:350` from `tools: useWebSearch ? [{ googleSearch: {} }] : undefined` to `tools: undefined` — then, since a constant `undefined` field is noise, delete the `tools:` line entirely if it is a plain object literal entry.
- [ ] **Step 3:** In `llmService.ts:749`, change `yield* streamChatGemini(finalMessages, settings, false);` to `yield* streamChatGemini(finalMessages, settings);`.
- [ ] **Step 4:** `pnpm lint` green. Commit: `git commit -m "chore: drop plumbed-but-never-enabled useWebSearch param"`

---

### Task 4: Final verification

- [ ] **Step 1:** `pnpm lint` → zero errors.
- [ ] **Step 2:** `pnpm build` → succeeds.
- [ ] **Step 3:** `pnpm dev`, then in the app: open the Guides, Artists, and Art Styles cheatsheet pages, open one detail entry in each, and open the LLM chat panel and send a message with Gemini selected. All render/work — these are the areas adjacent to the deleted code.

---

## Edge cases a weaker model would miss

1. **Grep must cover dynamic imports and path strings**, not just `import X from` lines — hence the `index.html`/`vite.config.ts` check and searching by bare name.
2. `ImageSlider` looks alive at first glance (it *is* imported — but only by files that are themselves dead). Delete the cards and the slider in the same commit or the intermediate state fails `tsc`.
3. Use `git rm`, not filesystem delete — the files are tracked.
4. Do **not** delete `Cheatsheet.tsx`, `ArtistCheatsheet.tsx`, or `ArtstyleCheatsheet.tsx` — despite the similar names, those are the LIVE page wrappers (wired in `App.tsx:813-815`). Only the `*Card` files and `ImageSlider` are dead.
5. Do not "improve" anything while deleting (no renames, no refactors of neighbors). A deletion PR that is 100% deletions reviews itself.
6. `youtubeService.ts`, `discoveryService.ts`, and `appControlService.ts` were audited and are **live** — don't get ambitious.

## Acceptance criteria

1. `git diff main --stat` for this branch shows only deletions plus the two-file `useWebSearch` edit.
2. `pnpm lint` and `pnpm build` green.
3. The manual walk in Task 4 Step 3 passes.
4. Repo is ~470 lines lighter: 52+52+99+156 (components) + ~short service file + a few lines of parameter plumbing.

## Out of scope

- Hunting further dead code beyond the six verified targets (a broader unused-export audit is a different task).
- The Gemini `googleSearch` capability itself — if someone wants web search later, it's one parameter away in git history.
