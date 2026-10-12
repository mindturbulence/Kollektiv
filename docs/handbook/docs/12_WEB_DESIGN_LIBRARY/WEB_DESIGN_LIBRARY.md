# Web Design Library

Vault → **Web Design** (`design_library` tab). A personal library of *design recipes*: reference screenshots plus a structured design spec, turned at use-time into a one-shot prompt for a file-reading coding agent (Claude Code, Codex, Gemini CLI). Decisions, council review and the WDL-05 spike result are in the original plans, kept in git history at commit `1bff4895` (`docs/plans/2026-10-05-web-design-library.md`, `docs/plans/2026-10-07-website-clone.md`); this page is the map of what exists.

## How it works

1. **Add** a recipe: title, page type, tags, source URL (text only) and 1–6 screenshots (paste, drag-drop or file picker; non-PNG/JPEG/WebP images are converted to PNG). Or use **Clone a website** (see below) to create a fully-filled recipe in one step.
2. **Spec**: write it by hand in the detail editor, or press **Extract from screens** (regular recipe) / **Rewrite with AI** (cloned recipe) to have a vision model draft it. The spec is a Google-style `DESIGN.md` — YAML front matter (tokens) plus 13+ fixed body sections (Overview … Signature; cloned recipes add Responsive, Assets, Content, Site Map and Tech Stack). The editor has a colour form, a YAML box for the other tokens and one text area per section, with "missing" badges. Cloned recipes also show a read-only **Clone prompt** preview.
3. **Use recipe**: type a short brief, pick **Adapt** (borrow the system, use your brand and copy) or **Clone** (match the screenshots closely; for cloned recipes also downloads a starter project ZIP). Adapt writes `design/` (`DESIGN.md`, `BRIEF.md`, `PROMPT.md`, `refs/`) into a folder you pick and copies a short prompt. Clone downloads `<slug>.zip` — a complete starter project a coding agent can open and build. Browsers without the folder picker download `design.zip` for Adapt.

## On disk (vault root)

- `kollektiv_design_library_manifest.json` — index of recipes and collections (`DesignRecipe`, `DesignCollection` in `types.ts`).
- `design-library/<id>/DESIGN.md` and `design-library/<id>/refs/<n>.<ext>` — the spec and screenshots.
- `design-library/<id>/assets.json`, `content.json`, `measurements.json` — clone-only: asset descriptions, page text (or lengths), raw measurements. Deleted with the recipe.

## Code map

| Concern | Files |
|---|---|
| UI | `components/DesignLibrary.tsx` (grid, filters, collections sidebar), `DesignRecipeDetail.tsx` (editor), `DesignRecipeAddModal.tsx`, `UseRecipeModal.tsx`, `RecipeThumb.tsx`, `CollectionSelect.tsx` |
| Collections admin | `components/settings/DesignLibrarySection.tsx` (Settings → Web Design, uses `NestedCategoryManager`) |
| Storage | `utils/designLibraryStorage.ts` (`loadManifestSafe` + `stampSchemaVersion`; files are written before the manifest, deletes are verified before the index entry is removed) |
| Spec codec | `utils/designSpec.ts` (parse/serialize, truncation detection, `(est.)` stripping, unquoted-`#hex` repair), `utils/designSpecForm.ts` |
| One-shot prompt + export | `utils/designRecipePrompt.ts` (`compileRecipePrompt`, `renderBriefMd`), `utils/designExport.ts` |
| Extraction | `services/designSpecPrompt.ts` (system prompt), `services/designSpecService.ts` (`extractDesignSpec`), `generateDesignSpec` in `services/llmService.ts` |
| Images / palette | `utils/designImage.ts`, `utils/paletteExtract.ts` (`extractDesignPalette`) |
| Collections logic | `utils/designCollections.ts` (tree helpers; CRUD is in the storage module) |
| Import from site | `components/DesignRecipeAddModal.tsx` (URL row), `routes/captureSiteRoutes.ts`, `services/siteCapture.ts`, `utils/captureUrlValidation.ts`, `src/schemas/captureSite.ts` |
| Clone a website | `components/CloneSiteModal.tsx`, `routes/captureSiteRoutes.ts` (`POST /api/clone-site`), `services/siteCapture.ts` (`createPlaywrightClone`), `services/siteMeasure.ts`, `services/cloneSiteService.ts`, `services/cloneSitePrompt.ts` |
| Clone export (ZIP) | `utils/cloneExport.ts` (pure: `slugify`, `exportContent`, `templateDocs`, `compileAgentsMd`, `parseDocs`, `buildStarterFiles`), `services/cloneDocsService.ts` (AI PRD/BRD/TASKS/ISSUES generation with template fallback) |

## Clone a website

**Clone site** button (next to Add recipe) → paste a URL → Kollektiv captures the page twice (desktop 1440 px and mobile 390 px), measures its CSS, typography, palette, sections, links, assets and visible text, then has the active vision provider fill every spec field. The result is a complete recipe with zero "missing" badges.

`POST /api/clone-site` reuses the same sandboxed headless Chromium and filtering proxy as `/api/capture-site` (see below) with a 60 s deadline. Both routes share the same one-at-a-time lock and 6/min rate limit. The clone capture differs in three ways:
- **Two passes**: desktop (reduced-motion, network-idle, cookie/consent overlays hidden by CSS, cross-origin stylesheet text read from Playwright response events) + a real mobile device context (390 px, touch, DPR 2, mobile UA; its failure keeps the desktop result).
- **Measurements**: `services/siteMeasure.ts` runs an in-page script that returns CSS custom properties, typography, colours, section bounding boxes, nav/footer links, detected source tech, and visible text by section. Strict value patterns (colour strings, font families `[\w -]{1,64}`) are validated by `sanitizeMeasurements` before anything is stored; values that fail are dropped.
- **Three data files** stored alongside the recipe (`assets.json`, `content.json`, `measurements.json`). Screenshots are JPEG (quality 85), not PNG. Nothing from the source site is stored as a URL or sent to an AI as a reference to fetch.

The **AI fill** step (`services/cloneSiteService.ts`) sends the screenshots and compact measurements digest to the active vision provider. The model writes DESIGN.md (including the new Responsive, Assets and Tech Stack sections). Code writes References, Site Map and Content deterministically from the measurements. The prompt requires the model to write DESIGN.md using the measured token values directly. A text-only provider (or failure) fills the spec from measurements alone and leaves the A-only sections empty with honest "missing" badges.

Cloned recipes have a `clone` marker on their index entry (`capturedAt`, `tech`). The detail editor shows the clone-specific sections and changes Extract to **Rewrite with AI** (reruns the AI step from the saved `measurements.json` and screenshots without a new capture).

### Clone ZIP export (starter project)

**Use recipe → Clone** generates a starter project ZIP any coding agent can open:

```
<slug>/
  AGENTS.md            build instructions (recreate assets, never copy)
  CLAUDE.md            @AGENTS.md
  GEMINI.md            @./AGENTS.md
  README.md            how to start with Claude Code / Codex / Gemini CLI / Cursor
  docs/PRD.md          product requirements
  docs/BRD.md          business requirements
  docs/DESIGN.md       the recipe's DESIGN.md
  docs/TASKS.md        phased checkboxed tickets
  docs/ISSUES.md       permanent decisions (no copied assets; copy permission)
  design/assets.json
  design/content.json  verbatim if owner ticked permission; lengths-only otherwise
  design/refs/1.*      desktop screenshot
  design/refs/2.*      mobile screenshot (if captured)
```

PRD, BRD, TASKS and ISSUES are written by the active AI provider at export time; any document the model leaves out is filled by a template. The **permission tick** ("This is my site / I have permission") determines whether `content.json` ships the real text or just word/character counts — never remembered, chosen per export.

The agent reads `AGENTS.md` and builds the project: scaffold the recommended stack, theme from tokens, recreate every asset from `assets.json` descriptions (SVG/CSS for shapes, open-licence icons, placeholders for photos, neutral wordmark for logos — nothing downloaded from the source), build sections top to bottom, verify at 1440 and 390 px. Source URLs are never included in the ZIP.

## Import from site

The Add dialog can capture a public web page as a reference screenshot (and fills the source URL if empty). It needs the app's server (`POST /api/capture-site`, not available in a plain `vite preview`). The server starts its **own** sandboxed headless Chromium (Playwright's, else Edge, else Chrome; otherwise the error code `capture_unavailable`) with a throwaway profile — it never uses the CDP bridge, so your own Chrome tabs and cookies are untouched. Only `http`/`https` on ports 80/443, no IP literals or internal names; every request the browser makes (redirects and sub-resources included) goes through an in-process proxy that resolves the host itself and connects only to a vetted public IP. Same-origin + JSON-only requests, 6 per minute, one at a time, 30 s, PNG ≤ 8 MB, 1440 px wide and at most 4500 px tall. The page is untrusted: only the PNG, final URL and title come back and nothing is sent to an AI model.

## Extraction

- Providers: whichever of **Gemini, Ollama, Anthropic, OpenRouter** is the active provider; llama.cpp gets a clear "unsupported" error and nothing silently falls back. OpenRouter needs an explicit vision-capable model (not `openrouter/auto`). Ollama needs a vision-capable model.
- Input: the top of the first screenshot (up to 1440×1600) at full resolution, then that page downscaled, then other refs downscaled; at most 4 refs and 8 MB per request. A measured palette (`surfaces` / `accents`) is injected into the prompt.
- Output is parsed with `parseDesignSpec`. Provider error text (`System: …`, `**Error calling …**`) is an error, never a spec. A **truncated** answer (no Signature section) blocks Save and offers Re-run; Save unblocks once Signature is filled in by hand. Nothing is saved automatically.

## Known limits

- The folder picker needs a Chromium browser; otherwise ZIP.
- Deleting a recipe leaves empty `design-library/<id>/` folders (no directory-removal API in the file manager).
- Export clears `design/refs/*` and its three files before writing; a failure mid-write leaves a partial export.
- Drive pull restores `prompts/` and `design-library/` (see `syncDriveToLocal`).
- Ollama extraction is slow on CPU: with `num_ctx` 32768 a `qwen3-vl:2b` run on a machine without GPU offload (`ollama ps` shows `size_vram: 0`) had not finished after 10+ minutes. Use a GPU-backed vision model, or expect to wait.
- Import from site: the first capture after the server starts can be slow and may time out once (retry works); pages may serve a bot page to the default headless user agent; the WebRTC leak switch is set but unverified.
- Clone capture: mobile pass failure is non-fatal (desktop result kept); the mobile screenshot is skipped silently. Cross-origin stylesheets are read from Playwright response events (≤ 1 MB each, in memory only) — stylesheets larger than 1 MB are skipped.
- Clone ZIP: the side-by-side test gate (run the ZIP with Claude Code vs the JCodesMore template) has not been completed yet.
- Verification status (details in `docs/plans/TASKS.md` § 8): unit tests plus a real-browser walk (grid, Library view, upload through the picker, export into a stubbed folder, index recovery, layouts at 390–1440 px) and real captures of public sites (linear.app, stripe.com) during CL-1. **Not verified:** real AI clone fill (CL-2 code only, no provider key during build), the Clone ZIP export in a real browser, real Gemini/Anthropic/OpenRouter extraction, a finished Ollama extraction, real Drive pull, the real folder picker/clipboard/ZIP, and the Import-from-site row in a real browser.
