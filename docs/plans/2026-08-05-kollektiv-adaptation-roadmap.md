# Kollektiv — Adaptation Roadmap

**Date:** 2026-08-05
**Status:** Active plan. Consolidates and replaces the four working documents produced on this date.
**Branch base:** `main` @ `1af90ec`

---

## 1. Thesis

Kollektiv's durable asset is the **prompt authoring layer** — Crafter, Refiner, the modifier vocabulary, the vault. That layer is yours and it holds its value. Generation services are commodity and they churn: Higgsfield did not exist when this app was built, and something else will replace it.

So the product should be positioned as:

> **The durable record and authoring layer over interchangeable generators.**

Outputs will increasingly come back from services that appear, change and die. Your vault should be the one place the prompt, the parameters, the lineage and the reasoning survive all of them. Local-first stops being only a privacy argument and becomes a **continuity** argument.

Everything below serves that. No new pages are built.

---

## 2. What's actually true today

Findings from reading the codebase, with references. These justify the sequencing.

**The vault is invisible to the assistant.**
`initSearchIndex()` (`utils/obsidianStorage.ts:505`) has **zero callers**. Boot calls `initObsidianVault()` and `ensureFolders()` (`hooks/useBootSequence.ts:121`) but never this. So `searchIndex.isBuilt` is false on every boot, and `searchNotes()` gates BM25 *and the entire hybrid/semantic block* behind that flag — everything falls through to the brute-force substring scan at line 458. BM25 (`utils/vaultSearch.ts`), the embedding service, the IDB vector store and `hybridRank()` are all built, tested, and unreachable in normal operation.

**Two systems each assume the other indexes the vault.**
`knowledgeService.rebuildIndex()` carries a comment stating vault notes are *deliberately* not indexed because "the BM25 search index in vaultSearch.ts already handles full-text vault search." BM25 never runs. Neither covers it.

**Hand-authored relationships are ignored.**
`extractWikilinks()` (`utils/obsidianStorage.ts:254`) has **zero callers**, while `relationshipGraph.ts` infers edges from tag Jaccard similarity. Statistical guesses are being used in place of ground truth the user wrote by hand.

**Memory never reaches the vault.**
`syncAgentMemoryToVault()` and `getAgentMemoryBlock()` (`utils/memoryStorage.ts`) have **zero callers**. Only `memoryPromptBlock()` is wired (`services/assistantService.ts:155`).

**Generation parameters are computed, used, and discarded.**
`hooks/useLocalGenerationStudio.ts` builds model/sampler/seed/steps/cfg/dimensions, then line 191 calls `addItemToGallery()` and drops all of it. Confirmed on disk — `local_storage/gallery/item_1785291657695_5de472_metadata.json` holds a prompt and nothing else. **Outputs are not reproducible from the vault.**

**The transport layer can't adapt; the prompt layer already can.**
`constants/modelProfiles.ts` is a real data registry — add an entry, support a new model, no code. `registerBackend()` (`services/generationBackend.ts:96`) is called from exactly two files at import time. Closed set of two. A new service requires an adapter and a release.

**No reference-image path exists.**
`a1111Service.ts` and `comfyService.ts` are txt2img only — no `init_images`, no `denoising_strength`, no ControlNet.

**Built but unreachable.** `services/matrixGenerator.ts` (40 tests) and `services/comfyWorkflowParser.ts` have no callers outside tests. `ImageResizer` does not save upscale results back to the gallery.

**Known defect.** `modifiers.realism` has a UI slider but `buildContextForEnhancer` never reads it.

---

## 3. Constraints

1. **Backend-first.** UI edits only where they make new data reachable, confined to components that already exist.
2. **No new pages, no new routes.** New capability ships through the Refiner's preset dropdown, the Command Palette, `ItemDetailView`, or the assistant chat.
3. **Crafter and Refiner are the core.** Work serves them; nothing replaces them.
4. **Every package is independently shippable** and leaves `pnpm lint` clean and `pnpm test` green on its own.

---

## 4. Decisions of record

| # | Decision | Note |
|---|---|---|
| D1 | `Generation` is its own entity, holding `resultItemIds[]` | One run → N images (matrix/batch). Also what makes the survival signal possible (WP10). |
| D2 | **Refiner stays. Prompt Assembly is dropped.** | *Reversal.* I previously recommended Assembly replace the Refiner. The Refiner is the product's core and works; replacing it was solving a problem you don't have. |
| D3 | **Video is first-class, not deferred** | *Revised.* `PromptModifiers` already carries `motion`/`cameraMovement`/`videoEffect`; `RefinerPreset.mediaMode` already handles `'video'`. The deferral only applied to editors no longer being built. |
| D4 | **No universal versioning** | Withdrawn as too costly. Prompt lineage (`PromptVersionNode`) stays as-is. `Generation.parentGenerationId` is kept — one nullable FK, not a system. |
| D5 | **No generation adapters** | Transport is config (MCP) or data (profiles). Every hand-written adapter is a liability against a service that may not outlive it. |
| D6 | **Implicit signals produce aggregates, not events** | Automatic capture writes digests, never a verdict per image. A polluted second brain is worse than an empty one. |
| D7 | **Story bible lives under `knowledge/projects/`** | Uses the existing `knowledgeLifecycle` folder projection. |
| D8 | **`projectId?` defined but inert** | Optional field on `Generation`/`GalleryItem`, unwritten. Costs nothing now; avoids a second migration later. |

---

## 5. Work packages

Twelve, in execution order, grouped in four stages. Sizes are relative (S/M/L).

### Stage 1 — Wake what's already built

#### WP1 — Wake the vault · S · UI: none
The highest capability-per-line change in the repo.

- Call `initSearchIndex()` in `useBootSequence.ts`, inside the block that already succeeds at `initObsidianVault()`.
- Wire `syncAgentMemoryToVault()` so assistant memory projects into the vault as notes with frontmatter, via `knowledgeLifecycle`'s existing folder model. Writes confined to `knowledge/**` — never touch user-authored notes outside it.
- Feed `extractWikilinks()` output into `relationshipGraph` as explicit edges, weighted above the tag-derived `similar_to` edges.

*Why it matters:* activates BM25, embeddings and hybrid rank across the whole vault; makes `traverse`/`findShortestPath`/`VaultMapPanel` operate on your real link structure; and turns Obsidian into the memory UI so none has to be built.

**Acceptance:** search a phrase you know is in a note and get ranked results, not substring hits; index survives reload from IDB; a stored memory appears as a well-formed note in `knowledge/`; `VaultMapPanel` shows wikilink edges.

#### WP2 — Manifest `schemaVersion` · S · UI: none
Prerequisite for all data work. None of the six manifests in `local_storage/` carry a version field.

- Add `schemaVersion: number` to everything written through `utils/manifestStore.ts`.
- **Absent means v1.** Readers tolerate both; writers emit v2. No behavior change.

#### WP3 — Generation record · M · UI: none
The defect. Every generation made before this lands is permanently unreproducible — the params are simply gone and cannot be backfilled.

```ts
// types.ts — GenerateParams already exists in services/generationBackend.ts. Reuse it.
export interface Generation {
  id: string;
  createdAt: number;
  promptId?: string;
  promptText: string;                    // denormalized — the text AS SENT
  negativePromptText?: string;
  modifiers?: Partial<PromptModifiers>;  // makes the run explainable, not just repeatable
  backendId: string;                     // local backend id, MCP tool id, or 'external:<name>'
  params: GenerateParams;
  resolvedSeed?: number;
  resultItemIds: string[];
  parentGenerationId?: string;
  status: 'ok' | 'failed' | 'cancelled';
  error?: string;
  batchId?: string;
  projectId?: string;                    // inert (D8)
}

export interface GalleryItem {
  // ...existing unchanged...
  generationId?: string;                 // undefined = legacy or manual upload
  projectId?: string;                    // inert (D8)
}
```

- New `utils/generationStorage.ts` following the `presetStorage.ts` pattern (`loadManifestSafe` + `ManifestWriteBlockedError`).
- Fix five ingest sites: `useLocalGenerationStudio.ts:191`, `useGenerateLoop.ts:209`, `assistantTools.ts:951 / :1017 / :1217`.
- `addItemToGallery()` already takes nine positional params — add an **options bag**, not a tenth, and migrate call sites in the same commit.
- Extend `utils/integrity.ts` to report % of items with no `generationId` and generations with dangling `resultItemIds`.
- Legacy items stay legacy. No backfill.

**Acceptance:** generate → reload → the `Generation` repopulates every studio control. Assert on **params round-trip, not pixel equality** — identical params don't guarantee identical output across driver or checkpoint revisions.

#### WP4 — Surface it · S · UI: one existing component
`ItemDetailView.tsx` already has an `InfoRow label="Metadata"` block at line 815.

- Add rows for model, sampler, steps, CFG, seed, backend, read from the linked `Generation`.
- Add **"Load these settings"** → emits `navigate` to the studio with params, over the existing `appEventBus`.
- Legacy items with no `generationId` render exactly as today.

*Also:* this button is the cleanest positive signal for WP10 — returning to a generation's settings is a vote.

#### WP5 — Search coverage · M · UI: none
Depends on WP1 (pointless before the index runs).

- Feed gallery items (title, prompt, tags, notes) and saved prompts into the same index as `VaultNote`-shaped documents with a `kind` discriminator.
- Return through the existing `searchNotes()` path.

Results appear in the Ctrl+K palette you already use, and the assistant's search tool improves for free.

---

### Stage 2 — Adaptation

#### WP6 — MCP generation bridge · M · UI: none
The answer to a fast-moving service landscape. You already own the client, proxy, `mcp-config.schema.json`, the preset catalog and the capability platform. A service that ships MCP becomes reachable with **zero adapter code** — a config entry.

- Bridge: an MCP tool call that returns image/video data → `addItemToGallery()` + a `Generation` record with `backendId: 'mcp:<server>/<tool>'` and the invocation arguments stored in `params`.
- Register MCP-provided generators alongside local backends in `listBackends()` so existing surfaces see them without special-casing.
- Reuse the per-user proxy allowlist for any new host; do not widen `DEFAULT_PROXY_ALLOWED_HOSTS` casually.

**Acceptance:** an MCP-provided generator produces a gallery item with a complete, reproducible `Generation` record, with no adapter written.

#### WP7 — Profile-driven external targets · S · UI: none
Serves the Crafter and Refiner directly, and covers every service including those with no API at all.

- Extend `constants/modelProfiles.ts` with entries for current external targets so the Refiner formats correctly for them. Data edit, no release.
- Record destination on copy-out: when a prompt is exported or copied for an external service, write a `Generation` with `backendId: 'external:<name>'`, `status: 'ok'`, empty `resultItemIds`. Paste the result back later and it links up.

*Why:* the copy-out workflow you already use becomes a first-class, recorded path rather than an untracked one.

---

### Stage 3 — Creative second brain

#### WP8 — `RefinerPreset` as the asset model · S · UI: none
`services/refinerPresetService.ts` already stores `{ name, modifiers: PromptModifiers, targetAIModel, mediaMode, ... }`. That is a creative asset. It needs five optional fields:

```ts
  kind?: 'character' | 'scene' | 'world' | 'camera'
       | 'lighting' | 'style' | 'composition' | 'palette' | 'general';
  tags?: string[];
  freeform?: string;          // backstory, world rules, scene notes
  previewItemId?: string;     // a gallery item as thumbnail
  useCount?: number;
```

All optional — existing presets stay valid. Appears in the Refiner's existing preset dropdown. No editor, no asset library, no new store. `mediaMode` already covers video (D3).

#### WP9 — Script → cast and locations · M · UI: none
The World Builder idea at a fraction of its cost. `utils/documentParser.ts` already extracts PDF and DOCX.

- Assistant tool `extract_story_assets(text | vaultPath)` → structured cast + locations.
- Support **Fountain** explicitly — caps character names, `INT./EXT.` headings — via cheap regex. Structured input makes extraction far more reliable, and it's the format the reference tools accept.
- **Two artifacts per entity:**
  1. A `RefinerPreset` with `kind: 'character' | 'world'`, `modifiers` pre-filled from existing vocabularies (`HAIR_STYLES`, `EYE_COLORS`, `CLOTHING_STYLES`, `TIME_OF_DAY`, `WEATHER_OPTIONS`…) — immediately generatable.
  2. An Obsidian note under `knowledge/projects/` (D7) with frontmatter and `[[wikilinks]]` to the other entities from the same script — immediately part of the graph WP1 activated.
- Generate an image for a character → it becomes the preset's `previewItemId` and an embed in the note. The story bible gets faces, and the faces carry their own reproduction data.

**Honest caveat:** extraction quality tracks model quality. Good on Gemini, mediocre on a small local model — it must degrade visibly rather than emit garbage presets.

#### WP10 — Implicit signals → digest notes · M · UI: none
Automatic capture of what actually works. Per D6, this writes **aggregates, never per-image verdicts**.

Signals, strongest first:

| Signal | Source | Cost |
|---|---|---|
| **Survival** — item deleted vs kept | `deleteItemFromGallery` strips the item; the `Generation` persists, so dangling `resultItemIds` = discarded | Free, given D1 |
| **Publish** | `publishedAt`/`youtubeUrl`, already written (`ItemDetailView.tsx:893`) | Free |
| **Param reuse** | WP4's "Load these settings" | Free |
| **Naming** | a real title vs "Untitled Group" | Free |
| **Iteration-stop** | the generation you stopped iterating from | Needs `parentGenerationId` |
| **Downstream use** | contact sheet, compare, upscale | Needs `ImageResizer` to save results back to the gallery — worth doing regardless |

- Accumulate a cheap composite score on the `Generation` record. **No notes at this stage.**
- Periodically write/update a **digest** note per project or per checkpoint: *"across your last 40 keepers on this checkpoint, DPM++ 2M at CFG 4–5 survived; euler at CFG 9 was deleted every time."*
- **The assistant proposes the write** rather than a daemon doing it silently.

Combined with WP1, WP3 and WP5, this is what makes *"what lighting did I use for the rooftop scenes?"* answerable. No single package delivers it.

---

### Stage 4 — Rounding out

#### WP11 — Local img2img / reference input · M · UI: none
Demoted from earlier drafts, but still the identity path: local, free, private, reproducible.

- `GenerateParams` gains `initImage?: string` and `denoisingStrength?: number`.
- **A1111/Forge:** `/sdapi/v1/img2img` when `initImage` is set — same payload plus `init_images[]` and `denoising_strength`.
- **ComfyUI:** a second default workflow, `LoadImage` → `VAEEncode` → `KSampler` with `denoise < 1.0`. Per the Phase 4 lesson, resolve real node inputs from `/object_info` rather than guessing, and live-verify before calling it done.
- Source images from the gallery — `GalleryPickerModal` already exists.

#### WP12 — Ship the orphans and fix the defects · S · UI: none

- `services/matrixGenerator.ts` as an assistant tool. Keep `checkJobCountGate()` at 25 jobs — a matrix can silently consume hours of GPU time.
- `services/comfyWorkflowParser.ts` as an assistant tool. **Keep in the tool description:** `validateWorkflowOnComfy()` really submits — empty `node_errors` means the job is queued and executing, not merely schema-checked.
- Fix `modifiers.realism` — `buildContextForEnhancer` never reads it; the slider does nothing.
- `activeTab` declared twice (`App.tsx:137`, `useAppShell.ts:85`) — verify intent.
- `executionEngine` records `'skipped'` on one failure path and `'failed'` on another for the same situation.

---

## 6. Not building

- **New pages of any kind.** No Project System UI, no asset editors, no asset library, no Prompt Assembly.
- **Universal versioning** (D4).
- **A 3D viewport.** `three.js` isn't a dependency and a blocking engine is its own product. If a reference frame is ever wanted, the cheap 80% is a 2D blocking layer over `ComposerPage`, which is already a working canvas — and only after WP11 exists to consume it.
- **Hand-written service adapters** (D5).
- **Gallery visual similarity.** The Constitution gated it because Ollama's `/api/embed` was live-verified text-only, and `onnxruntime-web` was removed in the July cleanup. Unchanged.

---

## 7. Sequencing

**First branch: WP1 alone.** A few lines, independently verifiable, and it will tell you how much latent capability is sitting unwired better than any further planning.

Then **WP2 + WP3 + WP4** as one release — the durable record, which is the thesis in §1 made real.

Then WP5, WP6, WP7 in any order. Stage 3 after that; WP8 gates WP9.

---

## 8. Open questions

1. **Video: generated directly, or stills assembled into sequences?** Direct video generation (Veo/Kling/Sora-class) and frame-sequence work pull WP6 and WP10 in different directions — for sequences, the unit of "worked" is a shot that cuts together with its neighbours, and seed/character consistency across shots matters more than any single output.
2. **Which external services to profile first** in WP7?
3. **Digest cadence and scope** in WP10 — per project, per checkpoint, or per N keepers?
4. **`ImageResizer` gallery save-back** — do it inside WP10, or as its own small fix?

---

## 9. Provenance

This file is the single source of truth for the plan. It consolidates five working documents produced on 2026-08-05 and since deleted:

- `2026-08-05-expansion-prd-review.md` — review of the module-by-module PRD
- `2026-08-05-v2-prd-assessment.md` — assessment of the architecture-driven v2 PRD
- `2026-08-05-v2-phase-0-spec.md` — first relational-schema draft (included universal versioning, since withdrawn — D4)
- `2026-08-05-backend-refinement-program.md` — first backend-only narrowing
- `2026-08-05-worth-building-decision.md` — the worth-building verdict and reference-product analysis

Their substantive content — findings (§2), decisions (§4) and work packages (§5) — is carried forward here. The codebase references in §2 are the durable evidence; re-verify against the source rather than trusting this document if the two ever disagree.
