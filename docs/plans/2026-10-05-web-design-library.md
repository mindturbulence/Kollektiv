# Web Design Library (Vault → Web Design) — Plan

Status: v1 implemented 2026-10-06 (WDL-01..17). Real-provider extraction, real Drive pull, folder picker/clipboard/ZIP fallback, and browser visual walk are owner-verified items listed at the end of docs/plans/TASKS.md § 8.

## Context

A personal library of **design recipes**: reference screenshots + a structured design spec, compiled at
use-time with a per-project brief into a one-shot prompt for file-reading CLI agents (Claude Code, Codex,
Gemini CLI). Research (2026-10-05) found no open tool that keeps screenshots and spec in one entry
(closest: Refero, paid); Google's open DESIGN.md spec (Apr 2026, alpha) is the emerging standard for the
system part but has no page composition, motion, or references — our extension sections fill those.

## Decisions (from grilling)

| # | Decision |
|---|----------|
| 1 | Entry = reusable recipe (screens are reference, spec is the asset) |
| 2 | Handoff = export bundle to a picked folder + copy a short prompt that points at the files |
| 3 | Brief typed in the "Use recipe" dialog at export; last draft remembered; not a library entity |
| 4 | Ingest = paste / drag-drop / file picker; source URL is text only (no URL capture in v1) |
| 5 | Spec is stack-agnostic; stack comes from the brief (default "match the target repo") |
| 6 | Spec drafted by a vision model from the screens, fully editable |
| 7 | Format = Google DESIGN.md (YAML tokens + body) + our extension sections |
| 8 | Export mode radio: **Adapt** (default) / Reproduce |
| 9 | One agent-neutral prompt; no CLAUDE.md/AGENTS.md writes |
| 10 | Browse = grid + search + page-type filter + tags + **collections** (nested categories) |
| 11 | New Vault section reusing gallery infra (not a Media category) |
| 12 | Fix Drive pull generically for section folders (also fixes existing `prompts/*.txt` gap) |
| 13 | Vision providers: Gemini, Ollama, **Anthropic, OpenRouter** |

## Data model & storage

On disk (vault root), one folder per recipe — the folder *is* the export bundle core:

```
kollektiv_design_library_manifest.json          # index: DesignRecipe[] + DesignCollection[]
design-library/<id>/DESIGN.md                   # spec (front matter tokens + body)
design-library/<id>/refs/<n>.<ext>              # screenshots
```

`types.ts`:
```ts
interface DesignRecipe {
  id: string; createdAt: number; updatedAt: number;
  title: string; pageType: 'landing'|'dashboard'|'portfolio'|'ecommerce'|'docs'|'app'|'other';
  tags: string[]; collectionId?: string; sourceUrl?: string;
  refs: string[];            // vault-relative paths
  overview: string;          // denormalised for search/cards
}
interface DesignCollection { id: string; name: string; parentId?: string; order: number } // = GalleryCategory shape
```
Spec content lives only in DESIGN.md (single source of truth); manifest holds index fields.

DESIGN.md body order: Overview · Colors · Typography · Layout · Elevation & Depth · Shapes · Components ·
Do's and Don'ts · **References** · **Page Composition** (ordered sections, each: grid/alignment/content/imagery)
· **Motion** (1–2 moments, duration/easing, reduced-motion) · **Dials** (variance/motion/density 1–10) ·
**Signature** (the one bold element).

## One-shot prompt (compiled, copied to clipboard)

Bundle written to `<picked dir>/design/`: `DESIGN.md`, `refs/*`, `BRIEF.md`, `PROMPT.md`. Clipboard gets:

```
{ZIP only} First unzip design.zip into the repo root.
Build <brief.pages> for <brief.project> in this repo (<brief.stack | "match the existing stack">).

Read first: design/DESIGN.md (design system + page composition), design/BRIEF.md (product, audience,
content), and view every image in design/refs/.

{ADAPT}  The screenshots define the visual system — composition, rhythm, type scale, color roles, motion.
         Use OUR brand, copy and imagery from BRIEF.md. Do not copy logos, text or photos from refs.
{REPRO}  Reproduce the screenshots as closely as possible; placeholder text/images where BRIEF.md has none.

Rules:
- Use the tokens in DESIGN.md front matter exactly (as CSS variables / the repo's theme system).
- Commit to the direction in Overview + Dials. Spend boldness only on the Signature element.
- BRIEF.md decides which sections exist and their order; build each from the closest Page Composition
  pattern (grid, alignment, imagery) and drop reference sections the brief does not need.
  Every section responsive per Layout.
- Motion: only what DESIGN.md › Motion lists; respect prefers-reduced-motion.
- Load the DESIGN.md fonts (a Google Fonts <link> is fine) unless the stack forbids external requests;
  then use the closest system stack and say so.
- WCAG AA contrast, semantic HTML, real copy from BRIEF.md (no lorem ipsum).
- Avoid everything in Do's and Don'ts.
{ADAPT}  Also avoid, unless DESIGN.md or the refs show it: generic card grids, purple gradients, emoji
         icons, centered-everything layouts.
- Dials: variance 1 = strict grid … 10 = broken grid; motion 1 = none … 10 = scroll-driven;
  density 1 = editorial whitespace … 10 = dashboard.

Verify: render the page (try a headless browser on this machine, e.g. npx playwright screenshot or
chrome/msedge --headless --screenshot) at 1440px and 390px, view the images and compare against design/refs/.
Only if no browser runs, check the code section by section against DESIGN.md and the refs, and say so.
{ADAPT}  Compare composition, spacing rhythm, type scale and color roles — not content.
{REPRO}  Compare everything.
List the 5 largest differences, fix them, repeat once.
```
`BRIEF.md` fields: **project** and **pages/sections** required; job of the page, audience, content/copy,
stack, constraints collapsed under "More". Compiled with a plain template literal in a pure `compileRecipePrompt(brief, mode)`; empty
brief fields drop their line. (`replacePlaceholders` rejected: it emits HTML for missing values.)

## Extraction prompt (vision model → DESIGN.md)

System prompt for `generateDesignSpec`; this is the prompt every entry's quality depends on.

```
You are a senior product designer reverse-engineering a website design system from screenshots.
Output ONLY a DESIGN.md document: YAML front matter, then markdown body. No preamble, no code fences.

Front matter keys (all required; use your best estimate, never omit):
name: <short evocative name>
colors: { background, surface, text, muted, accent, accent-contrast, border }
  # assign roles to these measured colours: {palette}; invent a hex only if none fits. Token values must be valid CSS:
  # no comments or "(est.)" inside values; note estimated tokens in ## Colors / ## Typography instead.
  # palette is given as "surfaces: ...; accents: ..."
  # quote every value that contains a hex colour ("#fafafa", "1px solid #e5e3ee"): unquoted, YAML reads # as a comment.
typography:
  # fontFamily is a CSS font stack starting with a Google Fonts family, e.g. "Figtree, system-ui, sans-serif";
  # describe the original's font class in ## Typography. The screenshot is {imgWidth}px wide and shows a
  # {viewportWidth}px viewport: report px at viewport scale (x{scale}).
  display: { fontFamily, size, weight, lineHeight, letterSpacing }
  heading: { ... }  body: { ... }  label: { ... }       # px, unitless lineHeight, em tracking
rounded: { sm, md, lg }                                 # px
spacing: [4, 8, ...]                                    # the scale actually used
components: { button-primary: {bg, text, rounded, padding}, card: {...}, input: {...}, nav: {...} }

Body headings, exactly these, in this order:
## Overview          — 3-5 mood adjectives, brand character, the page's one job
## Colors            — role of each token; light/dark notes
## Typography        — pairing rationale; name real fonts or closest free alternative (Google Fonts)
## Layout            — grid, max width, gutters, whitespace rhythm, alignment habits
## Elevation & Depth — shadows/borders/layers
## Shapes            — radius language, dividers, image crops
## Components        — each visible component + hover/focus/active states (infer if not visible)
## Do's and Don'ts   — 5+ each, specific to THIS design
## References        — one line per screenshot: what it shows
## Page Composition  — numbered sections top→bottom; per section: grid, alignment, content, imagery
## Motion            — likely 1-2 motion moments with duration/easing; "none" if static
## Dials             — variance N/10, motion N/10, density N/10
## Signature         — the single most distinctive element to preserve, and how to build it with CSS/SVG (no images)

Rules: describe the system, not the brand — no logos, product names or copy from the screenshots.
Mark guesses with "(est.)" in the body only, never in front matter. Fonts you cannot identify: describe the class (e.g. geometric grotesk).
```
`parseDesignSpec(raw)` validates against exactly this contract: required front-matter keys, all 13
headings present and ordered. Returns `{ spec, missing[], truncated }` — `truncated` when the last
heading(s) are absent (output cut off). Truncated specs cannot be saved; the UI offers "Re-run".
Code copy of this prompt: `services/designSpecPrompt.ts` (WDL-12), which adds one last line,
`Screenshots, in order: {images}`, so the model knows image 1 is the full-res crop to measure on.
`parseDesignSpec` also drops model preamble before the first `---` line and quotes bare `#hex`
scalars before the YAML parse; the pipeline strips `(est.)` from token values and lists what it changed.

## Council review (2026-10-05) — accepted changes

Reviewers: Architect (Opus 5.5), Delivery auditor (Sonnet 5.5), Prompt & product (Opus 5.5; Fable 5.1 was
out of credits). All verdicts: **workable with changes**; none of the 13 decisions reversed. Each claim
below was re-checked in code before acceptance.

| Finding | Evidence | Change |
|---|---|---|
| Front-matter helpers are flat-only → nested tokens lost / written as `[object Object]` | `parseFrontmatter` regex `^(\w+):`, serializer `${key}: ${val}` (`utils/obsidianStorage.ts`) | Use `yaml` (add as direct dep; 2.9.0 already in tree transitively) in `utils/designSpec.ts`; round-trip test |
| `fileToBase64(.., true)` doesn't downscale; OpenRouter needs full data URL | `fileUtils.ts` `fileToBase64` = plain `readAsDataURL` | New `downscaleToJpeg(blob, 1600)` (canvas, 0.85); pass data URLs; cap 4 refs / 8 MB per request |
| Extraction truncated at 4096 tokens; Gemini helper pattern is 300 tokens, one JPEG | `server.ts` `max_tokens: 4096`; `geminiService.ts` `maxOutputTokens`/`thinkingBudget: 0` | Optional `max_tokens` passthrough (Design spec = 8192); Gemini helper multi-image, per-blob mimeType, 8192 |
| Vision models guess hex, don't sample | `ColorPaletteExtractor.tsx` `medianCut` exists | Lift `medianCut` into a pure util; feed measured palette into the extraction prompt |
| Drive pull throws without gallery manifest; no Drive pagination; provider reset to `'local'` | `syncDriveToLocal` "No gallery manifest found…"; no `pageToken` in `fileUtils.ts` | Gallery optional; paginated `listDriveFolder`; restore `oldProvider` in `finally`; separate PR |
| Prompt contradictions (Adapt bans vs Reproduce, Verify compares content in Adapt, unanchored dials) | plan text | Fixed in the prompt above |
| Export: no overwrite guard; ZIP fallback prompt wrong | plan text | Confirm overwrite of existing `design/`; `{ZIP only}` first line |
| No quality gate for the core promise | — | Golden-set spike (3 recipes → Claude Code + Codex) before UI; go/no-go |

Provider order inside Decision 13 (order only, decision kept): Gemini + Ollama → Anthropic → OpenRouter.

## Implementation

Ticket-by-ticket, phased small → large: see **`docs/plans/TASKS.md` § Web Design Library** (WDL-xx).
Cite symbols, not line numbers. Reuse: `loadManifestSafe` + `stampSchemaVersion` (`utils/manifestStore.ts`),
`fileSystemManager` (`utils/fileUtils.ts`), `createZipAndDownload`, `requireProvider` (`services/llmService.ts`),
`streamChatAnthropic`, `streamChatOpenRouter`, `ImageCard`/`ImageGallery` patterns, `NestedCategoryManager`,
`Modal`, `EmptyState`; storage template `utils/workflowStorage.ts` + its test.

## Verification

Per ticket: `pnpm lint` + `pnpm test`. End to end: fresh vault → add recipe by paste → Extract (Gemini,
then Anthropic) → edit → reload (persists) → Use recipe → export into a scratch repo → paste prompt into
Claude Code and Codex; both read DESIGN.md and the refs. Drive: push, pull into a clean folder (with and
without gallery items); recipes and `prompts/*.txt` come back.

## Out of scope (v1) / later

- ~~URL capture~~ — shipped as SD-09 (2026-10-07): `POST /api/capture-site`, its own sandboxed Chromium behind an SSRF-filtering proxy. It deliberately does NOT use the CDP bridge in `server.ts` (that bridge drives the user's own Chrome tab).
- Fidelity score per recipe, DESIGN.md lint/Tailwind export via Google's CLI, app-wide search
  (`indexGalleryAndPrompts` in `utils/obsidianStorage.ts`).
