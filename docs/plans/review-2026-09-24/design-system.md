# Kollektiv: Design System and Frontend Code Audit

Read-only code audit, 2026-09-24, branch `development`. Scope: `components/**` (117 top-level files plus the settings, widgets, transitions and loraEditor subfolders), `image-editor/ui/**`, `index.css` (2810 lines), `tailwind.config.js`, `hooks/useAppTheme.ts` and `constants/themes.ts`. I did not use a browser.

Labels: **VERIFIED** means I read the code or CSS and checked it with a count or a specificity calculation. **SUSPECTED** means it is inferred and needs a live check. Several ImageEditorPage.tsx and NewDocumentModal.tsx line numbers refer to the working tree as read today; another engineer is editing those files, so the numbers may move.

Method note: only the impeccable skill's SKILL.md loaded. Its reference files (audit.md and the others) were blocked by the sandbox's outside-working-directory read rule. I did not apply frontend-design, ui-ux-pro-max, emil-design-eng or redesign-existing-projects. The lenses used here are the audit, harden, typeset and layout lenses applied from first principles.

---

## 0. The brief has four wrong premises. These are findings too.

1. **"Hardcoded white breaks light themes."** In practice nobody can reach a light theme. The only light theme, `sanrita` (tailwind.config.js:125, base-100 `#f8fafc`), is missing from `DAISYUI_DARK_THEMES` (constants/themes.ts:1-8), so no picker or theme cycle can select it. In addition, **31 of the 43 themes share the same base palette** (`base-100 #0d0221`, `base-200 #1a043c`, `base-300 #21064d`, `base-content #ffffff`). That includes the ones named `light`, `cupcake`, `winter`, `lemonade` and `corporate` (tailwind.config.js:273, 295, 328, 544, 577). Those 31 are the same dark theme with a different primary color. So there are about 12 distinct themes, not 43, and hardcoded `white/N` colors are a **latent** problem (Medium), not a live light-theme break. VERIFIED.
2. **"PageFrame: which pages use it vs roll their own."** PageFrame.tsx is not a page layout primitive. It is a single decorative overlay: a fixed frame with scan lines, mounted once in App.tsx (`fixed inset-0 z-[1000] pointer-events-none`, PageFrame.tsx:61). **No shared page shell exists.** Every page defines its own root element (see §4.4). VERIFIED.
3. **"The New Document modal has no Open image option."** This is already fixed in the working tree. NewDocumentModal.tsx now shows an "Open or Create" header, an "Open image…" drop zone and a "Create Blank" button, and ImageEditorPage passes it `onOpenImage` and `onDropFile`. I do not report it as open. VERIFIED (working tree).
4. **"Image Editor UI density and styling."** The root cause of how the editor looks is not its design. **Most of its utility classes are never compiled** (issue #1 below). Density, tooltips and the toolbar cannot be judged until that is fixed.

---

## 1. Top 12 issues, ranked

| # | Sev | Issue | Where | Status |
|---|---|---|---|---|
| 1 | **Critical** | **Tailwind never scans `image-editor/`.** `content` lists only `./index.html`, `./src/**` and `./components/**`, so every class used only inside `image-editor/ui` is purged. The compiled `dist/assets/index-QsYH3XwJ.css` (built 2026-09-23 20:20, after HEAD 8393b5d at 20:13; the config is unmodified) has **0** occurrences of `.h-11{`, `.w-11{`, `.w-7{`, `.max-w-[16rem]`, `.min-w-[8rem]`, `.bg-base-100/85`, `.text-base-content/85`, `.input-sm`, `.radio-xs`, `.radio-primary`, `.tooltip-bottom`, `.tooltip-right`, `.cursor-crosshair` or `.max-h-72`. The effect is that the toolbar (`h-11 … bg-base-100/85`, EditorToolbar.tsx:171) has no height or background, the tool rail (`w-11`, ToolRail.tsx:113) has no width, rail buttons (`w-11 h-11`, ToolRail.tsx:46) lose their size, tooltips lose their placement, the New Document inputs and radios render at DaisyUI default size, and the canvas has no crosshair cursor. **Fix:** add `"./image-editor/**/*.{ts,tsx}"` to `content` in tailwind.config.js:3-7. After that the editor will render with its intended classes for the first time, so it needs a fresh visual pass. | tailwind.config.js:3-7 | VERIFIED (config and dist CSS grep) |
| 2 | **Critical** | **A global `button` rule overrides utilities on every button.** `button:not(.tab):not(.btn-sm):not(.dropdown):not(.font-normal)` has specificity (0,4,1) and sets `position:relative; overflow:hidden; z-index:1; font-size:12px; font-weight:700; uppercase; letter-spacing:.1em; transition:all .3s`. Any single utility class is (0,1,0), so the rule beats all of them. Of 574 buttons, 522 are not exempt. Consequences: (a) `absolute` is ignored. The FG/BG swatch buttons stack in normal flow instead of overlapping (ToolRail.tsx:76, 85, 94, 101), and the same happens at FeedbackToast.tsx:78, ColorPaletteExtractor.tsx:273, ImageResizer.tsx:195 and VideoPlayerOverlay.tsx:150. (b) DaisyUI `tooltip` draws its tip with `::before`/`::after`, which `overflow:hidden` clips, so all five `data-tip` tooltips are invisible (EditorToolbar.tsx:134, 144, 177, 197; ToolRail.tsx:44). (c) `text-xs`, `text-sm` and `text-[Npx]` on 72 buttons have no effect; they all render at 12px. `btn-xs` (59 uses) is also forced to 12px. (d) `.form-btn`'s own 10px / 900 weight / 0.2em spacing (index.css:394-412) never applies. (e) `z-[99999]` on HUDNavItem.tsx:22 has no effect. **Fix:** wrap the selector in `:where(button:not(.tab):not(.btn-sm):not(.dropdown):not(.font-normal))` to bring its specificity to zero, and remove `position`, `overflow`, `z-index` and `transition` from it. `.btn-snake` already sets its own `position:relative; overflow:hidden` (index.css:174-177), so the snake buttons (111 uses) are unaffected. Putting the rule in `@layer base` does **not** help, because Tailwind 3 layers only reorder rules and do not create CSS cascade layers. | index.css:150-160 | VERIFIED (specificity math); confirm live (§6) |
| 3 | **High** | **Secondary `.form-btn` text disappears on hover.** `.form-btn:hover:not(:disabled)` is (0,3,0) and keeps the base-300 background (index.css:415). The later `.form-btn:hover` is (0,2,0) and loses on background, but it is the only rule that sets `color: oklch(var(--pc))` (index.css:473-477), so its color applies. The result is primary-content text on a base-300 background. On the default Kollektiv theme that is dark text on `#22261D`, which is effectively invisible. This affects every Cancel, Discard and Export secondary button (147 `form-btn` uses). `.form-btn` and `.form-btn-primary` are each defined twice with conflicting disabled opacity (0.3 at :420 and 0.5 at :483; the later one wins). **Fix:** delete index.css:473-497 and keep the first block. | index.css:394-497 | VERIFIED (specificity); confirm live |
| 4 | **High** | **The recovery prompt is hidden under the New Document modal.** On a fresh open with an autosave present, `isNewDocOpen` starts as `!openPayload`, i.e. true (ImageEditorPage.tsx:~92), and `showRecovery` becomes true (:151). The recovery overlay is `z-[200]` (:292) and NewDocumentModal is `z-[1000]` (NewDocumentModal.tsx:53), so the user sees New Document, and if they create a blank document, the "Unsaved Work Found" prompt is still waiting behind it. **Fix:** render recovery through the shared modal at the same layer and close the New Document modal while recovery is open (for example `isNewDocOpen && !showRecovery`). | ImageEditorPage.tsx:~92, 151, 292 | VERIFIED (code path); confirm live |
| 5 | **High** | **The save confirm contradicts itself.** The text is "Vault JPG conversion is enabled — saving will flatten transparency. Save as PNG instead?\n\nOK = Save Anyway   Cancel = Abort". The question asks about saving as PNG, but OK saves anyway (and the vault flattens the image to JPG). It also uses `window.confirm`. **Fix:** use the shared modal with the title "Transparency will be lost", the body "Your Vault converts saves to JPG, which has no transparency.", and the actions **Save as JPG** / **Cancel** (optionally **Export PNG instead**, which opens ExportModal). | ImageEditorPage.tsx:169-170 | VERIFIED |
| 6 | **High** | **A generic rule changes the monospace font.** `.uppercase, .tracking-widest, .tracking-[0.4em], .font-black, .font-display { font-family: Nunito }` is unlayered and comes after the utilities, so at equal specificity it beats `.font-mono`. In **146 of 405** `font-mono` class strings, the element also has `uppercase`, `tracking-widest` or `font-black` and silently renders in Nunito, not JetBrains Mono. **Fix:** delete index.css:330-337. Nunito is already the `sans` default in tailwind.config.js:11. | index.css:330-337 | VERIFIED (cascade); confirm live |
| 7 | **High** | **Microtext is the default body size.** There are **824 uses of text sizes below 12px** across **103 files**: `text-[10px]` ×548, `text-[9px]` ×164, `text-[11px]` ×70, `text-[8px]` ×36, `text-[7px]` ×5, `text-[6px]` ×1. There are also 852 `uppercase`, 449 `font-black` and 409 `tracking-widest`. The Tailwind scale is barely used (`text-xs` 190, `text-sm` 81, `text-base` 20). Stacking all of these (for example "10px, 900 weight, uppercase, 0.3–0.4em tracking, 30% opacity" subtitles such as AddItemModal.tsx:176) is below comfortable legibility and contrast. See §4.2. | repo-wide | VERIFIED (counts) |
| 8 | **High** | **There are 20+ modal implementations and they are not accessible.** 36 files render `fixed inset-0` overlays and 24 use `createPortal`. Only 8 set `role="dialog"`, 7 set `aria-modal`, and 9 handle Escape. The shared ConfirmationModal is imported in just 8 files, and it has **no Escape key, no initial focus or focus trap, and fixed "Abort"/"Execute" labels** (ConfirmationModal.tsx:57-72), which forces the editor to re-implement it (UnsavedChangesModal at ImageEditorPage.tsx:~46). Every bespoke modal's close X is icon-only with no `aria-label`. That covers 14 files, including AddItemModal.tsx:178, PromptLibraryModal.tsx:27, CodeSnippetModal.tsx:113 and YouTubePublishModal.tsx:83, and it is also colored `text-error/30`, using the error color for a neutral action. See §3. | see §3 | VERIFIED |
| 9 | **Medium** | **The z-index scale has 34 distinct values** from `z-[-1]` to `z-[99999]`, plus CSS values of 9999, 10000 and 10001. Modals are spread over 200, 300, 500, 1000, 2000 and 9999. The z-[1000] PageFrame overlay (PageFrame.tsx:61) draws its frame lines **over** the editor's Export modal (z-300) and recovery modal (z-200) and over SetupPage (z-500). See §4.3. | repo-wide | VERIFIED |
| 10 | **Medium** | **The same destination has four names in one flow.** The editor button says "Save to Gallery" (EditorToolbar.tsx:223), the toast says "Saved to library." (ImageEditorPage.tsx:186), the confirm says "Vault JPG conversion", and the navigation says **Vault → Media** (Header.tsx:138-141). LocalGenerationStudioPage says "Saved to gallery." (:399) and PromptAnalyzer says "Saved to library" (:949). **Fix:** pick one user-facing noun. Because the navigation already says Vault → Media, use "Save to Vault" and "Saved to Vault". | see §4.7 | VERIFIED |
| 11 | **Medium** | **Five `window.confirm` calls bypass the app modal:** App.tsx:106, App.tsx:512, LLMChatPanel.tsx:136, ResearchProjectBrowser.tsx:45 and ImageEditorPage.tsx:169. | | VERIFIED |
| 12 | **Medium** | **Hover-only actions are unreachable by keyboard.** 38 `opacity-0 … group-hover:opacity-100` reveals across 20 files, and **none** has a `group-focus-within` or `focus:` equivalent. Examples: AssetsManagerPage.tsx:717 and 722, ItemDetailView.tsx:201, LLMChatPanel.tsx:513 (session delete). There is no `focus-visible:` utility anywhere in the TSX (0 uses), and the only focus-ring CSS is scoped to `[data-theme="Kollektiv"]` (index.css:1858-1865), so the other 42 themes get only the browser default. **Fix:** add `group-focus-within:opacity-100` next to each `group-hover:opacity-100`, and remove the `[data-theme="Kollektiv"]` prefix from the focus-ring rule. | | VERIFIED |

---

## 2. Quantified inventory

All counts cover `components/**/*.tsx` and `image-editor/ui/**/*.tsx`. They are regex counts; where a scan was single-line or heuristic, the number is marked as a lower bound.

### 2.1 Hardcoded colors

| Pattern | Count |
|---|---|
| `text-white` | 58 (13 files), plus `text-white/N` ×26 |
| `bg-black` / `bg-black/N` | 67 (36 files) |
| `bg-white/N` | 19 |
| `border-white/N` | 82 |
| any `*-white/N` | 122 |
| any `*-black/N` | 62 |
| Tailwind palette colors (`emerald-500`, `red-600`, `gray-*`, …) | 34 |
| arbitrary `-[#hex]` classes | 5 (all in MigrationModal: `text-[#00ffa3]`, `bg-[#00ffa3]`, lines 135, 138, 152) |
| `#hex` literals in TSX | 28 (12 files) |
| `rgb()` / `rgba()` in TSX | 41 (14 files) |

How to read these numbers:
- **Legitimate (not theming debt):** black and white over media in FullscreenViewer.tsx, VideoPlayerOverlay.tsx, the AssetsManagerPage lightbox (:820-880) and ItemDetailView's image stage (:137, :189). The FG/BG `#000000`/`#ffffff` defaults (ToolRail.tsx:71) and CurvesPanel canvas drawing are data, not styling.
- **Real debt:** `border-white/5` and `border-white/10` used as chrome dividers, where they should be `border-base-content/5` or `/10`. These appear in LLMChatPanel.tsx:434-606, SetupPage.tsx:672-711, DiscoveryPage.tsx:149-607 and ItemDetailView.tsx:271-321. Also: `bg-black/40` input fills in OnboardingFlow.tsx:456, 612 and 635 (use `bg-base-300`); `text-white/40 hover:text-white` on segmented-control tabs in AppearanceSection.tsx:128 and 134; the `emerald-*` button in MigrationModal.tsx:218 (use `btn-success` / `text-success`); and `text-[#00ffa3]` (use `text-success` or `text-primary`).
- **Top files by hardcoded-color lines:** ItemDetailView 31, FullscreenViewer 21 (mostly legitimate), OnboardingFlow 13, LLMChatPanel 13, MigrationModal 10, AssetsManagerPage 9, VideoPlayerOverlay 8 (legitimate), DiscoveryPage 8, AddSourceModal 7. 52 files use `text-`, `bg-` or `border-` with white or black.
- **Themes:** 43 defined, 42 selectable, about 12 visually distinct (31 share the `#0d0221` base). `index.css` has 260 `!important` and dead theme CSS: 56 `[data-theme="prompt"]` and 56 `[data-theme="explorer"]` selectors for themes that do not exist, plus 15 for the unreachable `sanrita`.

### 2.2 Typography

- **Arbitrary sizes (sub-12px):** 824 in total, listed in the table in §1 (#7). Other arbitrary sizes: `text-[12px]` ×49, `[15px]` ×8, `[14px]` ×5, `[13px]` ×3, `[16px]` ×2, `[20px]` ×2, `[34px]` ×1.
- **Tailwind scale:** `text-xs` 190, `text-sm` 81, `text-base` 20, `text-lg` 20, `text-xl` 39, `text-2xl` 17, `text-3xl` 15, `text-4xl` and up 14.
- **Letter-spacing:** `tracking-widest` 409, `tracking-wider` 162, `[0.2em]` 77, `[0.3em]` 51, `[0.4em]` 32, `[0.25em]` 8, `[0.1em]` 7, `[0.5em]` 6, `[0.6em]` 3, `[0.15em]` 3, `[1.5em]` 2, `[0.35em]` 2. That is 11 distinct arbitrary tracking values.
- **Families in TSX:** `font-mono` 428, `font-sf-mono` 42, `font-rajdhani` 35, `font-nunito` 23, `font-logo` 20, `font-display` 18, `font-fixedsys` 7, `font-monofonto` 5, `font-monoton` 4, `font-rainmaker` 1, `font-prime-light` 1. Note that `font-display` and `sans` are both Nunito, so `font-display` is not a display face.
- **Font loading:** index.css:1-14 imports 14 font stylesheets (Google and onlinewebfonts.com), about 20 families, all render-blocking `@import`s. Most exist only for per-theme skins.

### 2.3 z-index

- **34 Tailwind values:** 0, 10 (124), 20 (148), 30, 40, 50, [-1], [30], [50], [55], [60], [100], [110], [190], [200], [300], [500], [600], [700], [705], [710], [720], [730], [800] ×8, [900], [999], [1000] ×18, [1500], [2000], [2100], [3000], [9999] ×7, [12000], [99999].
- **Inline and CSS:** inline `zIndex` 1, 50 and 100. CSS values 9999, 10000 ×4, 10001 ×3.
- **Modal layers in use:** 200 (editor recovery), 300 (ExportModal, AddSourceModal, ResearchSourcesPanel), 500 (SetupPage), 1000 (18 files including ConfirmationModal and PageFrame), 2000 (CodeSnippetModal, JSONBreakdownModal), 9999 (RefinerPage save-preset modal :874, CommandPalette :141).

### 2.4 Modal implementations

- 36 files with `fixed inset-0`, 24 with `createPortal`, 0 native `<dialog>` and 0 DaisyUI `modal`.
- **Distinct modal shells:**

  | Style | Files |
  |---|---|
  | (a) corner-frame glass | ConfirmationModal, AboutModal, AddItemModal, PromptEditorModal, PromptLibraryModal, PromptTxtImportModal, MigrationModal, WorkflowImportModal, YouTubePublishModal, GallerySection |
  | (b) editor flat, bg-base-100/95 | UnsavedChangesModal, NewDocumentModal |
  | (c) editor base-300, black/50 at z-300, no role or aria | ExportModal.tsx:40 |
  | (d) editor base-300 over base-100/80 at z-200, no role or aria | recovery overlay, ImageEditorPage.tsx:292 |
  | (e) z-2000 | CodeSnippetModal, JSONBreakdownModal |
  | (f) inline, not portalled | RefinerPage :874, PromptCrafter, LLMChatPanel, NestedCategoryManager, AddSourceModal, VideoToFrames, and others |

- The **4 editor dialogs use 4 different styles**, and none matches the app's corner-frame ConfirmationModal. `role="dialog"` appears in 8 files, `aria-modal` in 7, and Escape handling in 9 of 36.

### 2.5 Buttons and controls

- 574 `<button>` elements (7 `motion.button`).
- **Class systems in use at once:**
  - custom `form-btn` 147 / `form-btn-primary` 33
  - DaisyUI `btn-ghost` 138, `btn-sm` 108, `btn-xs` 59, `btn-primary` 26, `btn-error` 10, `btn-circle` 10, `btn-square` 4
  - decorative `btn-snake` 111, which needs four empty `<span/>` children every time
  - `corner-frame` 72
  - many one-off `p-2 text-… hover:…` icon buttons
- **Inputs:** `form-input` 83, `form-select` 31, `form-textarea` 13, versus DaisyUI `input` 28, `select` 12, `textarea` 8. There are 41 native `<select>` and 10 `AutocompleteSelect`.
- **Tooltips:** `title=` 146 versus DaisyUI `data-tip` 5. The five `data-tip` tooltips are all clipped (issue #2) and all in the editor.
- **Icon-only buttons:** at least 39 found by a heuristic scan. 14 have neither `aria-label` nor `title` (all of them modal close buttons), and 11 have only `title`.
- **Clickable non-buttons:** at least 29 `div`/`span`/`img`/`td` with `onClick` on a single line, and 0 of them have `role`. Examples: ColorPaletteExtractor.tsx:44-46 (copy-value spans), ComposerPage.tsx:618 (layer row), SavedPromptCard.tsx:110, SuggestedPromptPanel.tsx:46, ItemDetailView.tsx:147.

### 2.6 Other

- Arbitrary spacing: 65, mostly `p-[3px]` ×47, which is the corner-frame inset.
- Arbitrary widths and heights: 201.
- Radius: `rounded-none` 277, `rounded-full` 82, `rounded` 51, `rounded-md` 11, `rounded-lg` 11, `rounded-2xl` 5, `rounded-xl` 2. The theme tokens `--rounded-btn` and `--rounded-box` are 0 or 3px, so `rounded-lg`, `rounded-xl` and `rounded-2xl` fight the tokens.
- `backdrop-blur*`: 189 uses (a GPU cost on stacked panels).
- `transition-all`: 172 in TSX, plus the global `transition: all .3s` on every button.

---

## 3. Proposed minimal consolidation (reuse only, no new dependencies)

| Role | The primitive | What changes |
|---|---|---|
| **Modal shell** | **ConfirmationModal.tsx**, generalized into `Modal` plus a thin `ConfirmDialog` | Keep its portal, backdrop, `role="dialog"`, `aria-modal` and `aria-labelledby`. Add Escape to close, focus on the first action when it opens, and focus restore when it closes. Add props `confirmLabel`, `cancelLabel` and an optional `secondaryAction {label, onClick}` so it can replace UnsavedChangesModal (Save / Discard / Cancel), the recovery overlay (Restore / Discard), the 5 `window.confirm` calls and the JPG confirm. One z-layer for all modals (for example `z-[1000]`), with toasts above it (`z-[3000]`, FeedbackToast as today). Replace "Abort" / "Execute" with verbs passed in by the caller. Stop uppercasing `message` (:53), because body text should be sentence case at `text-sm`. An alternative is native `<dialog>.showModal()` inside the same component: the platform top layer removes the modal z-index problem entirely and gives Escape and inert background for free, at the cost of restyling `::backdrop`. |
| **Buttons** | **`.form-btn` / `.form-btn-primary`** (index.css:394-434, the first block only) | Delete the duplicate block (:473-497), fix the global button rule (#2), then give `.form-btn` two sizes (default 40px, plus a `.form-btn-sm` at 28px for editor and panel footers). Map DaisyUI `btn-ghost` to icon buttons only. Keep `btn-snake` as decoration **on** a form-btn, not as a separate button system. |
| **Icon button** | new CSS class `.icon-btn` in index.css (not a component) | Formalizes the repeated `p-1.5 text-base-content/60 hover:text-primary` pattern, with a 28px minimum hit area (fixes the swatch-control icons at ToolRail.tsx:76-92, which are 10px icons with `p-0.5`, about 14px targets). Always pair it with `aria-label`. |
| **Inputs** | **`.form-input` / `.form-select` / `.form-textarea`** (index.css:355-392) | Replace `input input-sm input-bordered` in NewDocumentModal and the `bg-black/40` fields in OnboardingFlow. Remove the duplicate font-family block at :125-133. |
| **Panel chrome** | **`.panel-header` / `.panel-footer`** (already 26 uses each) | Use them for every modal header and footer, including ExportModal and the recovery overlay. |
| **Settings rows** | **components/settings/primitives.tsx** (`SettingRow`, `SettingsGroup`, `ProviderTab`) | Already shared by 10 files. Reuse them for editor adjustment panels and the ExportModal form rows. |
| **Tooltip** | native `title=` (146 uses) | Remove the 5 DaisyUI `data-tip` uses in the editor, or keep DaisyUI only after fix #2. Don't run both systems. |
| **Dropdown** | **AutocompleteSelect.tsx** for searchable lists, native `<select>` with `.form-select` for short lists | Move its `z-[12000]` to the shared popover layer. |
| **Page shell** | none exists today | Smallest step: a documented root class (`h-full w-full flex flex-col min-h-0 overflow-hidden`) and one gap value for the 12-column tool pages. PromptCrafter.tsx uses `gap-4`, while RefinerPage.tsx and MediaAnalyzer.tsx use `gap-6` for the same layout. A component is not needed yet. |
| **z-index** | `theme.extend.zIndex` in tailwind.config.js | Five named layers: `raised: 10`, `sticky: 20`, `popover: 800`, `modal: 1000`, `toast: 3000`, plus `frame` for PageFrame placed **below** modal. Delete 9999, 12000 and 99999. |
| **Type scale** | `theme.extend.fontSize` in tailwind.config.js | `micro: 11px` (labels only), `xs: 12`, `sm: 13`, `base: 14`. Then replace `text-[9px]`, `text-[10px]` and `text-[11px]` with `text-micro` or `text-xs` using codemods. Ban 6–8px. |

---

## 4. Findings by area

### 4.1 Tokens and theming
- **High, VERIFIED:** tailwind.config.js:3-7 content glob (issue #1).
- **Medium, VERIFIED:** 31 themes are clones of one palette. Either give the "light" themes (light, cupcake, winter, lemonade, corporate, garden, pastel, fantasy, wireframe) real light bases, or rename them. Today a user who picks "light" gets `#0d0221`.
- **Medium, VERIFIED:** `sanrita` is defined (tailwind.config.js:125, plus 15 CSS rules) but is missing from constants/themes.ts:1-8. Either add it or delete it. If you add it, you must first clear the `border-white/*` and `text-white/*` chrome debt in §2.1.
- **Low, VERIFIED:** dead CSS for the non-existent `prompt` and `explorer` themes (112 selectors in index.css, from about :774 and :900).
- **Low, VERIFIED:** `useAppTheme` writes `darkTheme` only (hooks/useAppTheme.ts:13), and `types.ts:234` fixes `activeThemeMode: 'dark'`, so `lightTheme` (types.ts:235) is a dead setting.
- **Medium, VERIFIED:** MigrationModal.tsx:135, 138 and 152 (`#00ffa3`) and :218 (`emerald-*`) should use `success` tokens.

### 4.2 Typography
- **High, VERIFIED:** index.css:330-337 overrides `font-mono` (issue #6).
- **High, VERIFIED:** microtext (issue #7). The worst patterns are 10px uppercase subtitles at `text-base-content/30–/40` with 0.3–0.4em tracking. Examples: AddItemModal.tsx:176, PromptLibraryModal.tsx:25, ConfirmationModal.tsx:49, DiscoveryPage.tsx:540 and 584 (`text-base-content/20`).
- **Medium, VERIFIED:** ConfirmationModal body is `text-lg font-black uppercase` (:53). Long confirmation sentences in all caps at weight 900 are hard to read, and the title slot shows the literal word "CONFIRM." while the real title is demoted to a 10px subtitle (:48-49). Swap them.
- **Medium, VERIFIED:** `.form-btn` specifies 10px / 900 / 0.2em, but the global rule forces 12px / 700 / 0.1em (issue #2). Choose one on purpose; 12px / 700 / 0.08em is the readable option.
- **Low, VERIFIED:** 14 font `@import`s at index.css:1-14 block first paint, and 9 come from `db.onlinewebfonts.com`, a third-party origin. Load theme-only faces on demand.

### 4.3 Layering and layout
- **Medium, VERIFIED:** the z-index spread (§2.3). The PageFrame overlay at z-1000 draws over the modals at z-200, 300 and 500.
- **SUSPECTED:** Header.tsx:312 `z-[9999]` and HUDNavItem.tsx:22 `z-[99999]` are neutralized by the global button rule and by header stacking contexts, so they are dead values. Confirm and delete.
- **Medium, VERIFIED:** the three 12-column tool pages use different gaps: PromptCrafter `gap-4`, RefinerPage and MediaAnalyzer `gap-6`.
- **Low, VERIFIED:** the LoraEditorPage and VideoToFrames roots use `overflow-visible p-0 bg-transparent` while siblings use `overflow-hidden`. That inconsistency can produce page-level scroll bleed (SUSPECTED; verify live).

### 4.4 Page roots (no shared shell)
AssetsManagerPage and ConverterPage use `h-full w-full flex flex-col relative overflow-hidden`. PromptsPage and Dashboard use `flex flex-col h-full bg-transparent w-full relative overflow-hidden`. BatchRunnerPage uses `h-full flex flex-col font-mono`. LocalGenerationStudioPage uses `h-full min-h-0 flex gap-6 font-mono`. RefinerPage, PromptCrafter and MediaAnalyzer use `grid lg:grid-cols-12 overflow-hidden h-full gap-4|6`. ImageGallery, SavedPrompts and ImageResizer use centered `h-full w-full flex items-center justify-center bg-transparent`. ComposerPage has a `cursor-grab` canvas root. That is 6 or more root patterns with no shared shell.

### 4.5 Accessibility in code
- **High, VERIFIED:** modal close buttons without an accessible name in 14 files (listed in §1 #8). Add `aria-label="Close"` and switch `text-error/30` to `text-base-content/50`.
- **Medium, VERIFIED:** 38 hover-only reveals with no keyboard path (issue #12).
- **Medium, VERIFIED:** ConfirmationModal and the editor dialogs have no Escape handling and no focus management. ExportModal and the recovery overlay lack `role="dialog"`.
- **Medium, VERIFIED:** clickable `div`/`span`/`td` without `role` or keyboard handling (§2.5). The ColorPaletteExtractor copy spans (:44-46) and ComposerPage layer rows (:618) matter most.
- **Medium, VERIFIED:** the focus ring and the full reduced-motion collapse are scoped to `[data-theme="Kollektiv"]` (index.css:1858-1876). The global reduced-motion block (:2797-2810) covers only the FX engine and `animate-fade-in` / `slide-in`, not `transition-all` or GSAP (PageFrame's endless scan timeline at PageFrame.tsx:24 ignores reduced motion).
- **Low, VERIFIED:** `button:active { transform: scale(.98) }` combined with `transition: all .3s` on every button makes presses feel slow. `transition-all` on 172 elements also animates layout properties.

### 4.6 Image Editor UI
- **Critical:** issue #1 (classes never compiled) and issue #2 (swatches lose `absolute`, tooltips clipped). The editor cannot be visually judged until both are fixed.
- **High:** issue #4 (recovery prompt hidden) and issue #5 (JPG confirm copy).
- **Medium, VERIFIED:** four dialog styles (§2.4). ExportModal (`bg-base-300`, `bg-black/50`, z-300, 10px labels, 9px warning at ExportModal.tsx:74) and the recovery overlay (`bg-base-300`, `text-lg text-primary` title, `text-xs` buttons) do not match NewDocumentModal and UnsavedChangesModal (`bg-base-100/95`, `panel-footer h-11`). Move all four onto the shared Modal.
- **Medium, VERIFIED:** FG/BG reset and swap controls are 10px icons (`w-2.5 h-2.5`) with `p-0.5`, about 14px hit targets (ToolRail.tsx:76-92). LayersPanel's "Add mask" control is 9px text (LayersPanel.tsx:185). Layer rows at `h-7` (28px) with `w-3.5` icons are acceptable density for an editor, but the "Add mask" and "Paint mask" targets inside them are `w-4 h-4` (16px, :168).
- **Low, VERIFIED:** the toolbar zoom menu (EditorToolbar.tsx:99) has no Escape handling or outside-click close.
- **Low, VERIFIED:** the ExportModal JPEG warning uses a literal "⚠" character at 9px (:74). Use `text-xs text-warning` with the existing icon set.
- **Aesthetic:** the editor uses flat, quiet chrome (`font-display` at `text-sm`, plain borders), while the rest of the app uses corner-frame glass with heavy uppercase microtext. The editor's direction is the **more usable** one for an Operate-mode surface. Consider it the baseline to converge toward, not the outlier to restyle.

### 4.7 Copy and UX writing
- **High, VERIFIED:** ImageEditorPage.tsx:170, the contradictory confirm (issue #5).
- **Medium, VERIFIED:** Gallery, Library, Vault and Media all name the same store (issue #10). Rough counts of string occurrences: "Gallery" 25, "Vault" 15, "Library" 14, "Media" 10.
- **Medium, VERIFIED:** jargon subtitles that say nothing useful:

  | Current | File | Plain alternative |
  |---|---|---|
  | "Local Archival Accession" | AddItemModal.tsx:176 | "Add to Vault" |
  | "Neural Pattern Archival Access" | PromptLibraryModal.tsx:25 | "Saved prompts" |
  | "Bulk Token Archival Module" | — | — |
  | "External Repository Uplink" | — | — |
  | "Processed Breakdown Structure" | — | — |
  | "Detail Node Idle" | — | — |
  | "DO NOT INTERRUPT SIGNAL" | — | — |

  Plain alternatives are proposed only for the first two, because they are the only ones whose file I checked; the rest need a lookup (`grep -rn "Bulk Token Archival"`) before rewording.
- **Medium, VERIFIED:** ConfirmationModal uses "Abort" / "Execute" for every action, including deletes (ConfirmationModal.tsx:62, 70). Use verbs that name the action ("Delete prompt" / "Cancel").
- **Low, VERIFIED:** mixed casing. Navigation labels are Title Case, modal titles are all caps, and editor labels are sentence case ("Open image…", "Create Blank" in the same footer as "Cancel").

---

## 5. Suggested fix order (smallest diffs first)
1. Add `./image-editor/**/*.{ts,tsx}` to tailwind.config.js `content` (one line).
2. Wrap index.css:150 in `:where()` and drop `position`, `overflow`, `z-index` and `transition` from it.
3. Delete index.css:473-497 (the duplicate form-btn block) and :330-337 (the font override).
4. Remove the `[data-theme="Kollektiv"]` prefix from the focus-ring rule (:1858-1862).
5. Generalize ConfirmationModal (labels, Escape, focus). Migrate the 4 editor dialogs and the 5 `window.confirm` calls, and fix the recovery vs New Document ordering.
6. Add `aria-label="Close"` to the 14 close buttons, and add `group-focus-within:opacity-100` to the 38 hover reveals.
7. Add named zIndex and fontSize tokens, then run codemods for `text-[9px]`, `text-[10px]` and `text-[11px]`.
8. Settle the naming (Vault) and rewrite the jargon subtitles.

Steps 1–3 will visibly change many screens at once, because they re-enable utilities that were silently overridden. Do a full visual walk afterwards.

## 6. Browser checks for the live-walk agent
Each item is a `getComputedStyle` check that confirms a cascade claim above:
- Image Editor FG/BG swatch button (ToolRail.tsx:94): `position` should be `absolute`; I expect `relative`.
- EditorToolbar root (EditorToolbar.tsx:171): `height` should be 44px; I expect auto. `background-color` should be translucent base-100; I expect transparent.
- ToolRail root: `width` should be 44px.
- Hover a toolbar button with `data-tip`: is the tooltip visible? I expect it to be clipped by `overflow:hidden`.
- Any element with `font-mono uppercase` (for example NewDocumentModal "Width" label): `font-family`. I expect Nunito.
- Hover a secondary `.form-btn` (the editor's "Cancel"): `color` against `background-color`. I expect dark primary-content text on base-300.
- Editor fresh load with an autosave present: which dialog is on top? I expect New Document over "Unsaved Work Found".
