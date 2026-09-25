> **Reconciliation (2026-09-25).** This walk ran against the *pre-fix* build (`8393b5d`). Status of its findings after Phase 0 of the [revision plan](../2026-09-24-app-review-and-revision-plan.md):
> - **Fixed:** the Image Editor handoff and "no Open image" (0.1–0.3); editor modal buttons about 17px tall and missing editor styles (Tailwind never scanned `image-editor/`, 0.6); the global button rule overriding authored sizes and clipping tooltips (0.7); **issue 8** (ADD PROMPT label over its icon: snake-border selectors now target only the empty decorative spans, 0.12); **issue 4** (keyboard focus on invisible collapsed nav items: `inert` plus `aria-expanded`, 0.13).
> - **Still open:** everything else, now tracked as V1–V12 in plan §3 (Phase 2 "Layout and legibility").
> - The screenshots referenced below were in the session scratchpad and are **not** committed. Re-shoot them with `e2e/image-editor.spec.ts`'s boot helper if needed.
> - An independent impeccable critique (dual-agent: design review plus detector) on the *fixed* build, 2026-09-25, is summarised in plan §1.1. It also scored Nielsen **17/40**. The detector found 11 hits (1 false positive, 4 in tests, 6 intentional selected-row accents), so the problems are compositional, not pattern-level.

# Kollektiv Visual UI/UX and Layout Review

This was a single-context run. I applied three skill rubrics myself: impeccable (critique and audit), ui-ux-pro-max (review checklist) and design-taste-frontend (audit-first). I did not split the work across sub-agents. The impeccable detector ran over `components/` and `image-editor/` and found only 11 hits: 6 side-tab, 4 bounce-easing and 1 broken-image, which is in a test file. So almost every finding below comes from screenshots and code reading, not from the detector.

**Build and setup:** production build (`dist/`, EXIT=0), served with `vite preview --port 4173`, driven by gstack `/browse`. The folder picker was stubbed with OPFS, and `matchMedia('prefers-reduced-motion')` was patched to return false.

**Viewports:** 1440x900 for every route, 1024x768 for 14 routes, and 390x844 for 3 routes as a spot check.

**Labels:**
- **VERIFIED** means I saw it in a screenshot, confirmed it with a DOM probe, or read it directly in code.
- **SUSPECTED** means it is inferred and was not observed.

**Line numbers:** another engineer is editing files in parallel, and `index.css` line numbers moved by about 24 during this session. For `index.css`, grep for the selector rather than trusting the line number.

**Not re-reported (already known):** the Image Editor handoff drops its payload, the editor has no "Open image" entry, and the Gallery EDIT button is hidden in compact view. My screenshots are consistent with the first two: `image_editor` opens straight into a blank "New Document" modal (`31-image_editor-modal-1440.png`).

**Routes I could not render:** `assistant` sends you back to the dashboard 800 ms after load if no live session exists (`AssistantPage.tsx:455-458`). That is by design, so the page itself was not reviewable without an API key.

---

## Scores (rubric summary)

**Impeccable audit health: 7/20 (Poor).**

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 1 | Keyboard focus lands on invisible collapsed nav items. 255 uses of `text-base-content/40` (3.6:1) and 181 of /30 or lower (2.5:1 or less). 748 text sizes of 10px or smaller. |
| 2 | Performance | 2 | Not the focus here. Main chunk is 4.1 MB. Every panel uses a backdrop-blur layer over an animated background. |
| 3 | Responsive | 0 | At 1024 the header, footer, Refiner, Gallery toolbar and Comfy/A1111 studios all break. Header.tsx has zero responsive prefixes. 390 is unusable. |
| 4 | Theming | 2 | 43 "themes", but 29 share the same `#0d0221` base. No selectable light theme exists. 5 themes put primary text below 3:1. |
| 5 | Implementation integrity | 2 | Four different panel-header type treatments. Three button systems. `rounded-none` ×277 against a theme radius of 6px/3px. |

**Nielsen heuristics: 17/40.**

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Disabled and enabled buttons look almost the same. Status footer is dense jargon ("OLM ORT LCP GLG"). |
| 2 | Match with the real world | 1 | "AWAITING DUAL INPUT SEQUENCE", "CHROMIC SOURCE", "PURGE BUFFERS", "NEURAL DISSECTION", "RE-CENTER OPTICS", "Abort/Confirm" on Settings. |
| 3 | User control and freedom | 2 | Switching nav groups waits a hard-coded 900 ms. |
| 4 | Consistency and standards | 1 | Every page uses a different header font, empty-state style and primary-button style. |
| 5 | Error prevention | 2 | Settings has a modal-style Abort/Confirm footer, so it is unclear whether changes auto-save. |
| 6 | Recognition rather than recall | 1 | Nine icon-only header buttons with `title` only. Submenus stay hidden until a group is clicked. Three routes are not in the nav at all. |
| 7 | Flexibility and efficiency | 2 | A command palette exists (it is the only way to reach Batch Runner), but nothing surfaces it. |
| 8 | Aesthetic and minimalist design | 2 | The identity is strong, but the HUD decoration (photo collage, circuit background, corner brackets) competes with content. |
| 9 | Error recovery | 2 | Reloading mid-boot shows a developer diagnostic screen telling users to type into the console (`public/boot-diagnostics.js:134-142`). |
| 10 | Help and documentation | 2 | Empty states rarely say what to do next. The Gallery and Prompt Library empty states have no call to action. |

**Design specificity:** strong. The acid-lime HUD, corner-bracket frames, monoline "KOLLEKTIV" wordmark and status-bar footer belong to this product and nothing else. It does not look like a generic template. The problem is execution discipline, not identity.

---

## 1. Top 10 issues, ranked by user impact

### 1. [Critical] The header overflows and hides the logo, Settings and Standby

**Label:** VERIFIED.

**What happens:**
- At 1440, expanding **Utilities** (7 subitems) pushes the header past the viewport. The KOLLEKTIV logo disappears on the left, and the Settings (gear) and Standby (power) icons are clipped on the right.
  - Evidence: `19-composer-1440.png` through `25-video_to_frames-1440.png`.
- At 1024 it happens on every page:
  - The logo is clipped to "OLLEKTIV" (`50-dashboard-1024.png`, `57-settings-1024.png`).
  - With Workbench expanded, only one right-hand icon survives (`52-crafter-1024.png`, `53-refiner-1024.png`).
  - With Utilities expanded, the subnav itself is cut off at "CONVERTE" (`58-composer-1024.png`).
- Expanding any group also shifts the logo sideways (x=70 to x=50), because the whole row reflows. Compare `11-prompts-1440.png` with `12-crafter-1440.png`.

**Where:**
- `components/Header.tsx:259-312`: a single flex row with no `overflow`, no `min-w-0`, no breakpoints and no overflow menu.
- The logo is `w-[180px]` (`Header.tsx:50`).
- The right-hand cluster is `ml-auto flex` with no `shrink-0` (`Header.tsx:312`).
- Subnav containers are animated to `width:'auto'` (`Header.tsx:203-210`).
- Header.tsx contains no `sm:`, `md:` or `lg:` classes at all.

**Fix:**
- Make the header a 3-column grid, `grid grid-cols-[auto_minmax(0,1fr)_auto]`, and put `shrink-0` on the logo and the right cluster.
- Give the middle nav `overflow-x-auto no-scrollbar` (or an overflow "More" menu).
- Render submenus as a second row or a dropdown panel (`absolute top-full`) instead of expanding inline. Inline expansion is what drives the reflow.
- Below `xl`, collapse the eight right-hand icons into one kebab menu.

### 2. [Critical] The ComfyUI and A1111 studios lose their prompt and canvas column at 1024

**Label:** VERIFIED.

**What happens:** at 1024 the center column shrinks to about 50px. The prompt textarea shows one letter per line ("a / p / h / o / t / o") and the title reads "COM / STU". Meanwhile the right-hand "Extra Networks" panel, which says it is *not available for this backend*, takes the most width (`62-comfy_studio-1024.png`).

**Where:**
- `components/ExtraNetworksPanel.tsx:117` is `w-[34rem] shrink-0 hidden lg:flex`.
- It sits beside `LocalGenerationStudioPage.tsx:410` (`w-[26rem] shrink-0`).
- 416 + 544 = 960px of fixed width inside a roughly 930px content area.

**Fix:**
- Change the ExtraNetworks panel to `hidden 2xl:flex w-[22rem]`, or make it a collapsible drawer.
- Do not render it at all when the backend is ComfyUI, since it has no content there.
- Give the center column `min-w-[28rem]`.

### 3. [Critical] Gallery IMPORT and STATS are pushed off-screen at 1024, and search collapses to an icon

**Label:** VERIFIED (`55-gallery-1024.png`).

**What happens:** the page's only primary action cannot be reached.

**Where:** the `components/ImageGallery.tsx` toolbar row, around L430-462. It is one non-wrapping flex row made of the search box, NSFW toggle, SML/MED/LRG, ALL/IMG/VID, STATS and IMPORT, each button `px-6`. The category panel stays about 335px wide beside it.

**Fix:**
- Let the toolbar wrap (`flex-wrap`), with the search box on its own row below `xl`.
- Pin IMPORT with `order-first` or `ml-auto shrink-0`, so it never leaves the viewport.
- Collapse the category sidebar by default below `xl`. The collapse handle already exists.

### 4. [Critical] Keyboard focus lands on invisible elements

**Label:** VERIFIED (DOM probe plus `80-focus-tab6-1440.png`).

**What happens:** after six Tab presses on the Prompt Library, `document.activeElement` is the "Refiner" button inside the *collapsed* Workbench group. It has a valid 2px outline, but it sits at `opacity:0` inside a `width:0` container, so nothing is visible on screen.

**Where:**
- `Header.tsx:285-299`: collapsed containers get `opacity-0 w-0 overflow-hidden` but stay in the tab order.
- `Header.tsx:106` (`NavItem`) has no `tabIndex` or `inert` handling.

**Fix:**
- Put `inert` on the collapsed container (`<div inert={!isExpanded}>`), or set `tabIndex={isExpanded ? 0 : -1}` on each `NavItem`.
- Add `aria-expanded` to the parent group buttons.

### 5. [High] Low-contrast text is the house style

**Label:** VERIFIED (token math plus screenshots).

**What happens:** with the Kollektiv tokens (`base-content #F4F6EF` on `base-100 #0F120C`):

| Class | Contrast | WCAG AA |
|---|---|---|
| `text-base-content/40` | 3.60:1 | fails |
| `/30` | 2.54:1 | fails |
| `/20` | 1.79:1 | fails |
| `/10` | 1.28:1 | fails |

Usage counts in `components/` and `image-editor/`: /40 ×255, /30 ×119, /20 ×62, /10 ×7.

Many of these are applied to 9-10px uppercase text with tracking of 0.2-0.4em (text-[10px] ×548, [9px] ×164, [8px] ×36, [7px] ×5).

Examples:
- **Empty states wrapped in `opacity-10`, which are effectively invisible:**
  - `SavedPrompts.tsx:408` "LIBRARY EMPTY"
  - `ImageGallery.tsx:486` "No items found"
  - `MediaAnalyzer.tsx:305` "Select Image or Video"
  - Evidence: `15-media_analyzer-1440.png`, `16-gallery-1440.png`, `17-prompt-1440.png`.
- **Tagline under the dashboard wordmark:** unreadable over the photo collage (`Dashboard.tsx:86`, `03-dashboard-1440.png`).
- **Inactive top-nav items:** `text-base-content/30` at 12px (`Header.tsx:106, 280`).
- **Onboarding:**
  - Body copy is `text-[10px] text-base-content/40 tracking-[0.3em]` (`OnboardingFlow.tsx:312`).
  - The "Skip" link is barely visible (`01-loader-1440.png`).

**Fix:**
- Set a floor: `/60` minimum for secondary text (5.98:1), `/50` minimum for tertiary text (4.99:1).
- Replace the `opacity-10` empty-state wrappers with `text-base-content/60`, with the icon at `/30`.
- Enforce an 11px minimum for any text meant to be read: remap `text-[9px]` and `text-[10px]` to a `text-2xs` token of 11px.
- Keep 0.3em tracking only for labels of 3 words or fewer.

### 6. [High] Disabled buttons look almost the same as enabled ones, and primary buttons read as disabled

**Label:** VERIFIED.

**What happens:**
- In the Crafter action row (`12-crafter-1440.png`), RESET DRAFT and SAVE TEMPLATE are enabled while PREVIEW WILDCARDS and GENERATE PROMPT are disabled. The only difference is a slight grey shift.
- The bottom row (TRANSLATE, REWRITE, IMPROVE, CLIP, SAVE RESULT) looks identical whether enabled or not.
- In Converter (`23-converter-1440.png`), CONVERT ALL, DOWNLOAD ZIP and SAVE TO VAULT are all ghost buttons and give no state signal.
- The reverse also happens: disabled *primary* buttons turn a dark olive (Composer SAVE, Video EXTRACT, Resizer ZIP DOWNLOAD in `19-composer`, `22-resizer`, `25-video_to_frames`). That reads as a theme colour rather than as "unavailable".

**Where:**
- The `index.css` `.form-btn:disabled { opacity: 0.3 }` rule.
- The `btn-ghost ... disabled:opacity-30` pattern, for example `LocalGenerationStudioPage.tsx:735`.
- Ghost buttons with no border, so a lower opacity barely changes them.

**Fix:**
- Disabled: `disabled:opacity-40 disabled:cursor-not-allowed disabled:border-dashed`, plus `aria-disabled`.
- Show *why* it is disabled in a tooltip or helper line ("Add a prompt first").
- Make the primary action in each panel footer a filled `form-btn-primary` when it is enabled.

### 7. [High] The theme system claims 43 themes, but has no light theme and five illegible ones

**Label:** VERIFIED (config plus screenshot).

**What happens:**
- `tailwind.config.js` sets `base-100: #0d0221` on 29 themes, including the ones *named* `light`, `cupcake`, `winter` and `corporate`. For example, `light` at L274-282 has `base-100 #0d0221` and `base-content #ffffff`.
- `sanrita` (base `#f8fafc`) is the only light-base theme in the config, and it is not in `constants/themes.ts DAISYUI_DARK_THEMES`, so users cannot select it.
- Primary colour on base-100, which is used for panel titles, active nav and primary-coloured labels:

| Theme | Contrast |
|---|---|
| fantasy | 1.86:1 |
| autumn | 2.06:1 |
| business | 2.34:1 |
| light | 2.69:1 |
| dark | 2.73:1 |
| MindTurbulence | 3.70:1 |
| garden | 4.47:1 |

- In `40-light-crafter-1440.png` (theme "light"), the panel titles WILDCARDS and CRAFTED RESULTS and the buttons REFRESH, IMPORT, RESET DRAFT and SAVE TEMPLATE are violet on near-black and barely legible.

**Fix:**
- Rename or delete the dark clones that carry light-theme names.
- Either ship one real light theme (add `sanrita`, or build a proper `light` with base `#f7f8f3` and content `#14170f`), or say "dark only" and cut the list to about 8 curated themes.
- Add a CI check that asserts every theme meets `primary`/`base-100` ≥ 4.5:1 and `base-content`/`base-100` ≥ 7:1. The script is in scratchpad `contrast2.mjs`.

### 8. [High] The ADD PROMPT label renders on top of its own icon

**Label:** VERIFIED (`17-prompt-1440.png`, `80-focus-tab6-1440.png`; the label reads "P✦OMPT").

**Why:** the `index.css` rule `.btn-snake-primary span { position:absolute; display:block }` (around L270) is meant for the four decorative border spans. It also matches the label `<span>Add Prompt</span>` at `SavedPrompts.tsx:383`, so the label is pulled out of flow and overlaps the `PlusIcon`.

**Fix:**
- Scope the rule to `.btn-snake-primary > span:nth-child(-n+4)`, and do the same for `.btn-snake span`.
- Or mark the decorative spans with `aria-hidden` and a class such as `.snake-edge`.
- Then grep every `btn-snake*` button that has a `<span>` label, because the same pattern appears in the gallery and settings buttons (SUSPECTED for those).

### 9. [High] Navigation and IA: hidden submenus, orphan routes, icon-only chrome, slow group switching

**Label:** VERIFIED (code and screenshots).

**What happens:**
- **Orphan routes:**
  - `batch_runner` can only be reached through the command palette (`constants/commandRegistry.ts:34`). It is not in the Header.
  - `prompts` renders the same composer as Crafter but no nav group lights up (`11-prompts-1440.png`, `App.tsx:392`).
  - `assistant` is only reachable from a Footer click (`Footer.tsx:263`).
- **Hidden submenus:** Workbench, Vault, Utilities and Studio show their items only after a click. Nothing tells the user the groups contain items.
  - Switching directly between groups waits a hard-coded 900 ms (`Header.tsx:247-251`).
- **Mixed nav grouping:** "Image Editor" sits in Studio while "Composer", which also edits images, sits in Utilities. "Media" (the gallery) sits under Vault while "Assets" (a folder browser) sits under Utilities.
- **Icon-only chrome:** the nine right-hand header icons are `HUDNavItem` with `title=` only and no `aria-label` (`HUDNavItem.tsx:23`). They are 16px glyphs with about 24px hit areas. Settings does not show an active state when you are on the Settings page (`18-settings-1440.png`).
- **Doubled accessible name (SUSPECTED):** `RollingText` renders each glyph twice, so `innerText` reads "RReeffiinneerr". Screen readers may announce doubled names; see the appendix check.

**Fix:**
- Move Batch Runner into Workbench.
- Either drop `prompts` as a separate route or map it to Crafter's highlight.
- Put Composer, Image Editor and Compare together in "Studio / Edit".
- Show group items on hover or focus as a dropdown with no delay.
- Add `aria-label` to `HUDNavItem`.
- Give `RollingText`'s duplicate layer `aria-hidden="true"`.

### 10. [High] Settings uses a select whose text overlaps its chevron, and modal-style Abort/Confirm on a page

**Label:** VERIFIED.

**What happens:**
- The text "LOCAL STORAGE (BROWSER DIRECTORY)" overlaps the chevron (`18-settings-1440.png`, `57-settings-1024.png`).
- Section labels such as "STORAGE", "ENGINE LIFECYCLE" and "SYSTEM HUB" are about 8px at roughly 2:1 contrast.
- A full-width ABORT / CONFIRM footer (`SetupPage.tsx:729-730`) makes a settings *page* behave like a modal. It is unclear whether changes save, and "Abort" is alarming wording.

**Where:** `settings/AppSection.tsx:179`. The select uses `form-select select select-bordered max-w-xs font-mono font-bold text-xs uppercase` (around L177). The long uppercase mono label is wider than `max-w-xs` minus the chevron padding.

**Fix:**
- Use shorter option labels ("Local folder", "Google Drive").
- Add `pr-10` and `truncate` to the select.
- Auto-save settings with a toast, or rename the buttons to "Discard changes" / "Save changes" and show them only when the settings are dirty.

---

## 2. Per-page findings

| Page | Sev | Finding | Where | Label | Shot |
|---|---|---|---|---|---|
| Onboarding STORAGE_INIT | High | Provider tabs are truncated at 1440 ("LOCAL_SANDBO", "GOOGLE_DRIVE_CLO"). The flex row has three fixed-padding buttons in a card about 380px wide. | `OnboardingFlow.tsx:317-365` | VERIFIED | 00 |
| Onboarding | Medium | Snake_case UI copy ("SELECT_VAULT_FOLDER", "STORAGE_INIT."). 10px body text at /40 with 0.3em tracking. Unselected tabs use hard-coded `border-white/10`. | `OnboardingFlow.tsx:312, 330` | VERIFIED | 00 |
| Onboarding PROVISION | Medium | The link uses the browser-default blue-violet (`aistudio.google.com`), which clashes with the lime theme. "Skip" is barely visible. The model list shows retired models (1.5 Flash/Pro). | OnboardingFlow | VERIFIED | 01 |
| Boot | Medium | Reloading mid-boot shows "PAGE RELOAD DETECTED … type sessionStorage.clear() in the console", which is developer UX shown to end users. | `public/boot-diagnostics.js:106-142` | VERIFIED | (seen live) |
| Dashboard | High | Quick-action labels clip at 1024 ("GALLER", "PROMPT"). The 2-column grid is locked inside a fixed side column. | `widgets/QuickActionsWidget.tsx:26,31` | VERIFIED | 50 |
| Dashboard | Medium | The translucent panels (`bg-base-100/40 backdrop-blur`) sit on a moving photo collage, so the panel text competes with the imagery. The 9px "QUICK ACTIONS" is `text-primary/60`. The tagline is unreadable. "PROMPT LIBRARY" wraps, so the grid rows have unequal heights. | `QuickActionsWidget.tsx:24-25`, `Dashboard.tsx:86` | VERIFIED | 03 |
| Dashboard | Low | The "Recent activity" empty state is a tiny grey mono line centred in a tall empty box, with no call to action. | Dashboard | VERIFIED | 03 |
| Dashboard | Critical | At 390px the logo, nav and all header icons fall off-canvas, the wordmark is cut to "KO", and there is no mobile nav. | Header/Dashboard | VERIFIED | 70-dashboard-390 |
| Discovery | Medium | The left "UPLINK - TERMINAL" panel is decorative (it only shows "AWAITING ARCHIVE SELECTION") and takes 300px from the data table. The table rows are 250px tall because the full prompt text fills a narrow column. This panel's title style (Rajdhani 12px /80) differs from every other page. | `DiscoveryPage.tsx:465` | VERIFIED | 04 |
| Crafter / Prompts | High | See issue 6: disabled and enabled states are indistinguishable. The "DELETE" button next to CLEAR is effectively invisible, so it is unclear whether it exists. | `PromptCrafter.tsx` | VERIFIED | 12 |
| Crafter | Medium | The Wildcards panel has no empty state (a blank 620px column). The page mixes three type families: a pixel-mono panel title, Space-Grotesk-style placeholder text, and a mono checkbox label. At 1024 the action buttons wrap to two lines ("SAVE / TEMPLATE"). | `PromptCrafter.tsx:668-670` | VERIFIED | 12, 52 |
| Refiner | High | At 1024 the left panel (`lg:col-span-3`, about 220px) crushes. Labels clip ("COMPLEXIT", "NEURAL / ENGINE"), selects show "Defaul" / "Mediu", the "PASTE / CL" buttons are cut, the slider label overlaps, and the right preset select shows just "S". | `RefinerPage.tsx:519, 526, 785` | VERIFIED | 53 |
| Refiner | Medium | A native `<select>` with the OS chevron ("Default (Genera…") sits next to a custom select ("SELECT PRESE…"), both truncated at 1440. "EXPORT CODE" wraps to two lines. | `RefinerModifierControls.tsx:139` | VERIFIED | 13 |
| Analyzer | Low | Its "0 TOKENS" counter floats above the header baseline. The empty-state icon is not centred with the text. | `PromptAnalyzer.tsx` | VERIFIED | 14 |
| Abstractor | High | The drop-zone copy "SELECT IMAGE OR VIDEO" is roughly 1.3:1 and invisible. The right-hand empty state uses white bold text, unlike every other empty state. | `MediaAnalyzer.tsx:305` | VERIFIED | 15 |
| Gallery | Critical | See issue 3 (IMPORT is clipped at 1024). | `ImageGallery.tsx:430-462` | VERIFIED | 55 |
| Gallery | Medium | The "NO ITEMS FOUND" empty state is `opacity-10` and has no Import call to action. The H1 "IMAGE LIBRARY." page hero appears only on Gallery and Prompt Library; other pages use panel titles. | `ImageGallery.tsx:486, 379` | VERIFIED | 16 |
| Prompt Library | High | See issue 8 (ADD PROMPT overlaps its icon). The "LIBRARY EMPTY" empty state is `opacity-10` with no call to action. | `SavedPrompts.tsx:380-384, 408-411` | VERIFIED | 17 |
| Settings | High | See issue 10. | `AppSection.tsx:177-179`, `SetupPage.tsx:729` | VERIFIED | 18, 57 |
| Composer | Medium | The canvas defaults to pure `#FFFFFF`, with light-grey placeholder cells, a large white slab on a dark UI. The width/height lock button is an empty box with a 4px glyph. "SPACING" is about 1.5:1. The disabled SAVE is olive. "DOWNLOAD" and "EDIT" read as disabled. | `ComposerPage.tsx:283, 570` | VERIFIED | 19 |
| Compare | Medium | Two identical filled-lime "LIBRARY" buttons compete as primaries. The copy is jargon ("AWAITING DUAL INPUT SEQUENCE", "RE-CENTER OPTICS", "PURGE BUFFERS"). | `ImageCompare.tsx:326` | VERIFIED | 20 |
| Palette | Low | Jargon: "CHROMIC SOURCE", "NODES" for the colour count, "RE-SCAN SPECTRUM". The two primary buttons are duplicated in the same way as Compare. | `ColorPaletteExtractor.tsx` | VERIFIED | 21 |
| Resizer | Medium | The aspect-lock button is an empty square. The unlabelled toggle next to JPEG gives no clue what it controls. The "ZIP DOWNLOAD" primary button overhangs the input column's right edge by about 15px. | `ImageResizer.tsx` | VERIFIED | 22 |
| Converter | Medium | The quality slider fill is white while every other slider is lime. The dropzone floats as a separate strip above the queue instead of being the queue's empty state. The action buttons give no state signal (issue 6). The footer strip "0/0 CONVERTED" duplicates the "0 FILES" counter. | `ConverterPage.tsx` | VERIFIED | 23, 60 |
| Assets | Low | It has no panel frame and uses a full-bleed centred call to action, unlike every other Utility page. That is acceptable as a first-run state but inconsistent. | `AssetsManagerPage.tsx` | VERIFIED | 24 |
| Video | Low | The page shows three different empty-state treatments: an icon plus big grey caps, a small grey "QUEUE IS EMPTY", and none. The disabled EXTRACT is olive. | `VideoToFrames*` | VERIFIED | 25 |
| LoRA Editor | Low | A clean single drop zone. The panel title "LORA EDITOR" repeats the active nav label. | `components/loraEditor` | VERIFIED | 26 |
| Batch Runner | High | Unreachable from the nav (issue 9). It is the only page without the corner-frame panels, and uses `rounded` corners and sentence case. The RUN button is nearly invisible. It fills only the left 290px of a 1440 viewport. | `BatchRunnerPage.tsx:68-111` | VERIFIED | 27 |
| ComfyUI / A1111 | Critical | See issue 2 (the centre column collapses at 1024). | `ExtraNetworksPanel.tsx:117`, `LocalGenerationStudioPage.tsx:410` | VERIFIED | 62 |
| ComfyUI / A1111 | Medium | The GENERATE primary button is a ghost button at /40, the least prominent control on the page. The A1111 helper text is 9px grey over three lines. | `LocalGenerationStudioPage.tsx:735` | VERIFIED | 28, 29 |
| Image Editor | Medium | In the New Document modal footer, CANCEL and CREATE are about 17px tall (a hit target under 24px). The dialog title is 9-10px. The whole app, header included, is blurred behind the modal, so there is no nav escape. | `image-editor/ui` (new-doc modal) | VERIFIED | 31, 64 |

---

## 3. Global design-system inconsistencies

1. **Four panel-header typographies.**
   - (a) `font-sf-mono text-xs text-primary` through `TerminalText` in Crafter/Abstractor (`PromptCrafter.tsx:670`, `MediaAnalyzer.tsx:266`).
   - (b) `text-[11px] font-black tracking-[0.3em] text-primary` ("CATEGORY FOLDER", `ImageGallery.tsx:333`, `SavedPrompts.tsx:284`), which renders as a *condensed* face with negative-looking tracking.
   - (c) `font-rajdhani text-[12px] tracking-[0.2em] text-base-content/80` (Discovery, `DiscoveryPage.tsx:465`).
   - (d) `text-[10px] font-black uppercase text-primary` (`ImageCompare.tsx:326`).
   - Meanwhile `index.css` forces `.panel-header { font-family: "Nunito" !important }`, which the child spans then override.
   - **Fix:** create a single `<PanelTitle>` (for example `font-sf-mono text-[11px] tracking-[0.18em] uppercase text-primary`) and delete the per-page variants.
2. **Three button systems.** `.form-btn`/`.form-btn-primary` (index.css), DaisyUI `btn btn-ghost btn-snake` with four decorative spans, and ad-hoc `<button className="px-3 py-2 …">` (QuickActionsWidget, BatchRunner). A global `:where(button…)` rule also forces Nunito, 700 weight, 12px, uppercase and 0.1em tracking on *every* button. **Fix:** a single `<Button variant="primary|secondary|ghost|danger" size>` component. Drop the snake spans or render them with `aria-hidden`.
3. **Radius.** The theme defines `--rounded-box 6px` and `--rounded-btn 3px`, but the code uses `rounded-none` 277 times, `rounded-full` 82 times, `rounded` 51 times and `rounded-md/lg/xl/2xl` 29 times. **Fix:** commit to square (set the theme radius to 0) and remove the stray `rounded*` classes from BatchRunner, the Comfy canvas (`LocalGenerationStudioPage.tsx:797`) and chat bubbles.
4. **Hard-coded colours that ignore the theme.** `border-white/5|10|20` ×81, `text-white*` ×53, `bg-black*` ×55, `bg-white*` ×18. They are harmless while every theme is dark, but they will break the moment a real light theme ships (issue 7). **Fix:** use `border-base-content/10`, `text-base-content`, `bg-base-300/60`.
5. **Hover-only affordances.** There are 35 `opacity-0 group-hover:opacity-100` reveals across 12 or more files (ImageCard, ItemDetailView, ClippingPanel, ComposerPage, RefinerPage and others). They are invisible on touch and to keyboard users. **Fix:** add `group-focus-within:opacity-100`, and show at reduced opacity (`opacity-60`) by default.
6. **Empty states.** There are at least five styles: opacity-10 giant caps, grey mono small caps, white bold, pixel-font, and full-bleed call to action. The copy relies on sci-fi jargon (13 "AWAITING…" strings). **Fix:** one `<EmptyState icon title body action>` pattern: `/60` body text, one plain sentence, and one button.
7. **Uppercase plus wide tracking everywhere.** `tracking-widest` ×409, `[0.2em]+` ×180. Almost every label, placeholder, button and status is uppercase. Uppercase is fine for short HUD labels, but it hurts reading on sentences, which include onboarding copy, helper text and empty-state bodies. **Fix:** sentence case for anything longer than 3 words.
8. **Select controls.** Native selects with the OS chevron (Refiner, Composer, Resizer, Studio) sit next to custom lime-chevron selects (Crafter, Refiner preset). **Fix:** one `form-select` with `appearance-none` and the lime chevron everywhere.
9. **Sliders.** Lime fill with a knob in most places, white fill in Converter, olive in Palette.
10. **Status footer.** "INT VLT OLM ORT LCP GLG SPO TRT" is 8 unexplained abbreviations. At 1024 it collides ("MCP: 0VLT 0 UNITS") and clips on the right (`Footer.tsx:229`, `whitespace-nowrap`, no breakpoints). **Fix:** hide the integration abbreviations below `xl`, and give each item a tooltip.
11. **Focus rings exist only for the default theme.** The `index.css` rule `[data-theme="Kollektiv"] button:focus-visible { outline… }` is scoped to one theme. The other 42 themes fall back to browser defaults, which many custom theme rules then suppress (for example `[data-theme="arwes"] .input:focus { outline:none }`). This is SUSPECTED per theme and was not individually tested. **Fix:** move the focus-visible rule to `:root`.

---

## 4. Fix recommendations (priority order, concrete)

1. **Header (issues 1 and 4):**
   - Use `grid grid-cols-[auto_minmax(0,1fr)_auto]`, with `shrink-0` on the logo and the icon cluster.
   - Render submenus as `absolute top-full left-0` dropdown rows instead of inline width animation.
   - Put `inert={!isExpanded}` on the collapsed containers.
   - Replace `switchingRef` and its `setTimeout(900)` with an immediate switch.
   - Below `xl`, collapse the icons into a single `…` menu.
2. **Studio layout (issue 2):** `ExtraNetworksPanel` should be `hidden 2xl:flex w-[22rem]` and should not render for ComfyUI. The centre column gets `min-w-[28rem]`.
3. **Gallery toolbar (issue 3):** `flex flex-wrap gap-y-2`, search at `basis-full xl:basis-auto`, IMPORT at `shrink-0 ml-auto`.
4. **Responsive grid for three-panel pages** (Crafter, Refiner, Discovery): change `lg:grid-cols-12` with 3/6/3 spans to `xl:grid-cols-12`, with `lg:grid-cols-[18rem_1fr]` and the right panel as a drawer at `lg`. Remove the `hidden lg:flex` that currently hides content at `lg`.
5. **Contrast floor:**
   - Search and replace `text-base-content/(10|20|25|30)` with `/50` for decorative text and `/60` for readable text.
   - Replace the `opacity-10` empty-state wrappers.
   - Introduce a `text-2xs: 11px` token in `tailwind.config.js theme.extend.fontSize` and migrate `text-[7-10px]` to it.
6. **Snake-span bug (issue 8):** in `index.css`, change `.btn-snake span` and `.btn-snake-primary span` to `> span:nth-child(-n+4)`.
7. **Button component (issue 6):** a single `Button` with a filled primary, outlined secondary, and a disabled state of `opacity-40 border-dashed cursor-not-allowed` with a reason tooltip.
8. **Themes (issue 7):** prune to curated themes, fix or rename the dark clones named `light/cupcake/winter/corporate`, ship `sanrita` (or a real light theme) in `DAISYUI_DARK_THEMES` (rename the constant to `THEMES`), and add a contrast unit test.
9. **IA (issue 9):** Batch Runner goes into Workbench, `prompts` maps to the Crafter highlight, Composer and Compare move to Studio, and `HUDNavItem` gets an `aria-label`.
10. **Copy pass:** swap the jargon for plain verbs.
    - "Awaiting dual input sequence" becomes "Add two images to compare".
    - "Purge buffers" becomes "Clear".
    - "Abort / Confirm" becomes "Discard / Save".
    - "Chromic source" becomes "Source image".
    - Snake_case onboarding labels become sentence case.
11. **Settings select:** add `pr-10 truncate` and shorter option labels.
12. **Composer:** default `composerBgColor` to `transparent` (checkerboard) or `#1C2018`, and make the placeholder cells `bg-base-content/5`.
13. **Boot diagnostic** (`public/boot-diagnostics.js`): show it only when `reloadCount >= 2` or in dev, and replace the console instruction with the existing "Clear and reload" button alone.

---

## 5. Screenshot index

All shots are in `scratchpad/shots/`.

| File | Content |
|---|---|
| 00-storage-init-1440 | Onboarding storage step (tab truncation) |
| 01-loader-1440 | Onboarding provider step |
| 02-onboard3-1440 | Continue / music gate |
| 03-dashboard-1440 | Dashboard |
| 04-discovery-1440 | Discovery |
| 10-assistant-1440 | Assistant route (bounced to dashboard: no session) |
| 11-prompts-1440 | `prompts` route (same as Crafter, no nav highlight) |
| 12..16 | crafter, refiner, prompt_analyzer, media_analyzer, gallery @1440 |
| 17..22 | prompt library, settings, composer, compare, palette, resizer @1440 (19-25 show the header overflow) |
| 23..30 | converter, assets, video, lora, batch_runner, comfy, a1111, image_editor @1440 |
| 31-image_editor-modal/doc-1440 | New Document modal |
| 40-light-*-1440 | Theme named "light" forced on 8 pages. It renders dark purple, which is evidence for issue 7. |
| 50..64 (-1024) | dashboard, discovery, crafter, refiner, analyzer, gallery, prompt, settings, composer, resizer, converter, video, comfy, image_editor @1024 |
| 70-*-390 | dashboard, crafter, gallery @390 (mobile spot check) |
| 80-focus-*-1440 | Keyboard focus test (focus ring invisible, on hidden nav item) |

## Appendix: forced light-theme check and live probes

These results are appended after the main report.
