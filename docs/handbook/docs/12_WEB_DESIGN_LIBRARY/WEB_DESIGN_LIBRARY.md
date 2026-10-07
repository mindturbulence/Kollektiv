# Web Design Library

Vault → **Web Design** (`design_library` tab). A personal library of *design recipes*: reference screenshots plus a structured design spec, turned at use-time into a one-shot prompt for a file-reading coding agent (Claude Code, Codex, Gemini CLI). Decisions, council review and the WDL-05 spike result live in [the plan](../../../plans/2026-10-05-web-design-library.md); this page is the map of what exists.

## How it works

1. **Add** a recipe: title, page type, tags, source URL (text only) and 1–6 screenshots (paste, drag-drop or file picker; non-PNG/JPEG/WebP images are converted to PNG).
2. **Spec**: write it by hand in the detail editor, or press **Extract from screens** to have a vision model draft it. The spec is a Google-style `DESIGN.md` — YAML front matter (tokens) plus 13 fixed body sections (Overview … Signature, including Page Composition, Motion and Dials). The editor has a colour form, a YAML box for the other tokens and one text area per section, with "missing" badges.
3. **Use recipe**: type a short brief (project and pages required), pick **Adapt** (borrow the system, use your brand and copy) or **Reproduce**, then export. Kollektiv writes `design/` (`DESIGN.md`, `BRIEF.md`, `PROMPT.md`, `refs/<n>.<ext>`) into a folder you pick and copies a short prompt that points the agent at those files. Browsers without the folder picker download `design.zip` instead (the prompt then starts "First unzip design.zip into the repo root.").

## On disk (vault root)

- `kollektiv_design_library_manifest.json` — index of recipes and collections (`DesignRecipe`, `DesignCollection` in `types.ts`).
- `design-library/<id>/DESIGN.md` and `design-library/<id>/refs/<n>.<ext>` — the spec and screenshots; the spec text lives only in `DESIGN.md`.

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

## Extraction

- Providers: whichever of **Gemini, Ollama, Anthropic, OpenRouter** is the active provider; llama.cpp gets a clear "unsupported" error and nothing silently falls back. OpenRouter needs an explicit vision-capable model (not `openrouter/auto`). Ollama needs a vision-capable model.
- Input: the top of the first screenshot (up to 1440×1600) at full resolution, then that page downscaled, then other refs downscaled; at most 4 refs and 8 MB per request. A measured palette (`surfaces` / `accents`) is injected into the prompt.
- Output is parsed with `parseDesignSpec`. Provider error text (`System: …`, `**Error calling …**`) is an error, never a spec. A **truncated** answer (no Signature section) blocks Save and offers Re-run; Save unblocks once Signature is filled in by hand. Nothing is saved automatically.

## Known limits

- The folder picker needs a Chromium browser; otherwise ZIP.
- Deleting a recipe leaves empty `design-library/<id>/` folders (no directory-removal API in the file manager).
- Export clears `design/refs/*` and its three files before writing; a failure mid-write leaves a partial export.
- Drive pull restores `prompts/` and `design-library/` (see `syncDriveToLocal`).
- Verified by unit tests only: real provider calls, real Drive, real folder picker/clipboard/ZIP and a browser walk are owner-verified items at the end of `docs/plans/TASKS.md` § 8. The recipes were checked end to end only in the WDL-05 spike (Claude as extractor and builder, three public landing pages); Codex and Gemini were not tried.
