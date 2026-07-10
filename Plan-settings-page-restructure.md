# Settings Page Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the settings page "structurized" in both senses — split the 1,785-line `components/SetupPage.tsx` monolith into per-section components (code structure / cleanup), then improve the organization and hierarchy of settings within each section (UI/UX structure). Scope **C**: Phase 1 (code) then Phase 2 (UI), with a checkpoint between so the pixel-identical split can be reviewed before any visual change.

**Architecture:** `SetupPage.tsx` is the `settings` tab, rendered from `components/App.tsx:816`. Shape today: a left "System Hub" sidebar → 5 main categories (`ActiveSettingsTab` in `types.ts:23`: `app | appearance | integrations | prompt | gallery`) → per-category sub-tab strip (`subMenuConfig`, `SetupPage.tsx:46`) → scrollable content → `Abort`/`Confirm` footer (`SetupPage.tsx:1700-1703`). Content is produced by five `renderXxxSettings()` functions dispatched from `renderActiveTabContent` (`SetupPage.tsx:1606-1615`), each a large `switch(activeSubTab)` of inline JSX. The only shared primitives are `SettingRow` (`SetupPage.tsx:182`) and `SetupNavItem` (`SetupPage.tsx:154`). The component holds **29 `useState`, 10 `useRef`, 6 `useMemo`, 16 `handleX` handlers** in one closure that all five render functions read from — this coupling, not the line count, is what makes the split non-trivial. The fix: co-locate section-specific state inside extracted section components and leave only genuinely-shared state in the shell.

## Hard constraints (non-negotiable)

1. **No change to persisted settings.** Every key and shape read/written via `contexts/SettingsContext.tsx` and `utils/settingsStorage.ts` stays byte-identical. No renames, no reshaping, no migrations. (This app just shipped vault data-loss guardrails; a settings-key change is silent user data loss.)
2. **Behavior preserved.** Every control that works today works identically after. Same toggles, same handlers, same side effects (audio clicks, feedback toasts, modals).
3. **Keep the pip-boy / cyberpunk idiom.** Structure and hierarchy only — not a visual rebrand. Existing Tailwind/daisyUI classes and theme tokens stay.
4. **Phase 1 is pixel-identical.** The code split must produce zero visual diff. Visual change begins only in Phase 2.

## Prerequisite audit (do first — prevents thrashing)

- [ ] **Classify all 29 `useState` + 10 `useRef` + 6 `useMemo` + 16 handlers as SHARED or SECTION-LOCAL.** Read the declarations from the top of the `SetupPage` component (`SetupPage.tsx:194` onward) and grep each identifier's usages across the five render functions.
  - **SHARED** (stay in shell): the working settings draft + `setSettings`, `saveSettings`, `handleCancel`, `handleSettingsChange`, `activeSettingsTab`/`setActiveSettingsTab`, `activeSubTab`/`setActiveSubTab`, `showGlobalFeedback`, `audioService` usage. Confirm the exact set from the audit.
  - **SECTION-LOCAL** (move into one section): e.g. Ollama/OpenRouter/LlamaCpp model arrays + fetch state, Google/YouTube auth refs and token clients, migration modal flags/refs, folder-creation modal state, reset/restart modal flags. Confirm ownership from the audit.
  - Output: a short table (identifier → SHARED | section name) written as a comment in the plan's working notes or the shell file. Target ≈5 shared props threaded, not ~40.

## Phase 1 — Code structure (cleanup, pixel-identical)

- [ ] **Step 1:** Create `components/settings/` folder.
- [ ] **Step 2:** Create `components/settings/primitives.tsx` and move `SettingRow` (`SetupPage.tsx:182-192`) and `SetupNavItem` (`SetupPage.tsx:154-180`) into it verbatim (export them). Add `SettingsGroup` (labeled card wrapping related `SettingRow`s) and `ProviderTab` (the provider tab-button pattern currently inlined at `SetupPage.tsx:1057-1087`) as new exports — used in Phase 2, defined now so sections import a stable surface. Do not yet change any call sites' appearance.
- [ ] **Step 3:** Create `components/settings/config.tsx` (or `.ts`) and move `subMenuConfig` (`SetupPage.tsx:46`) and the `mainCategories` list (`SetupPage.tsx:449-455`) into it. Keep icons/JSX where they already live; export typed config. Import back into the shell.
- [ ] **Step 4:** Extract each render function into its own component, moving its SECTION-LOCAL state/handlers (from the audit) inside it and accepting only SHARED values as props:
  - `components/settings/AppSection.tsx` ← `renderAppSettings` (general / data / migration)
  - `components/settings/AppearanceSection.tsx` ← `renderAppearanceSettings` (styling / background)
  - `components/settings/IntegrationsSection.tsx` ← `renderIntegrationSettings` (llm / anthropic / openrouter / google / youtube)
  - `components/settings/PromptsSection.tsx` ← `renderPromptSettings` (categories / data)
  - `components/settings/GallerySection.tsx` ← `renderGallerySettings` (categories / data)
  - Each keeps its internal `switch(activeSubTab)`; only the closure boundary moves.
- [ ] **Step 5:** Reduce `SetupPage.tsx` to the shell: sidebar (`SetupNavItem` map), header + sub-tab strip, footer, SHARED state, and a dispatch that renders `<AppSection/>` / `<AppearanceSection/>` / … based on `activeSettingsTab` (replacing `renderActiveTabContent`, `SetupPage.tsx:1606`). Preserve the `motion.section` panel animation, `corner-frame`/`backdrop-blur` wrappers, and all trailing modals (`SetupPage.tsx:1708-1780`) exactly. Target: shell well under 300 lines.
- [ ] **Step 6:** `pnpm lint` (`tsc --noEmit`) green. Then `pnpm dev` and confirm **zero visual diff** and full behavior across all 5 categories and every sub-tab.

### CHECKPOINT — stop here for review before Phase 2.

## Phase 2 — UI/UX structure (needs IA confirmation before Step 7)

- [ ] **Step 7 (confirm IA first):** Resolve the redundant Integrations navigation. Today the `AI Engine` sub-tab contains a full 6-provider switcher (`gemini/anthropic/ollama/ollama_cloud/openrouter/llamacpp`, `SetupPage.tsx:1057-1087`) while `anthropic` and `openrouter` also exist as their own sub-tabs — two overlapping ways to pick a provider. Target model: engine picker selects the active provider; the sub-tab strip shows config for the selected provider only. Confirm exact IA with the user before editing.
- [ ] **Step 8:** Wrap related settings in `SettingsGroup` cards with subsection labels (e.g. App/general → Storage / Engine lifecycle / Dashboard background). Apply consistently so long tabs stop reading as one flat list. Convert the bespoke Integrations JSX to `SettingRow` + `SettingsGroup` where it doesn't lose provider-specific layout.
- [ ] **Step 9:** Tighten in-row hierarchy in `SettingRow` — differentiate label vs description by weight/size within the existing dense theme (both are ~10px uppercase today). Normalize the reused `data` sub-tab labels ("Backup & Restore" / "Prompt Data" / "Gallery Data") for consistency.
- [ ] **Step 10:** `pnpm lint` green; `pnpm dev` walk-through of all categories/sub-tabs, toggling representative controls and confirming values persist across reload.

## Verification (both phases)

- `pnpm lint` → `tsc --noEmit` reports zero errors (the CI gate added in recent commits).
- Manual drive of the settings UI in `pnpm dev`: open every main category, every sub-tab; toggle a representative control in each; reload and confirm persistence. Typecheck alone will not catch a broken handler wire-up from the state move.

## Out of scope

- Renaming or migrating any persisted settings key.
- Restyling the theme, colors, or fonts beyond intra-row hierarchy.
- Behavior changes to any setting's effect.
- Touching non-settings pages.
