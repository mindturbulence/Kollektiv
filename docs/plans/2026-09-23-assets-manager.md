# Implementation Plan: Assets Manager for Kollektiv (Utilities submenu)

> Status: APPROVED, awaiting execution command.
> Source: migrated from `D:\AI-Dev\ImageGallery` (Gemini Image Gallery) + Bridge/ACDSee feature research.

## Overview

Port the ImageGallery skeleton (folder tree, masonry grid, lightbox, scan logic) into Kollektiv as a new `assets_manager` tab in the Utilities submenu, then build a Bridge/ACDSee-class asset manager on top: multi-root browsing with vault bridge, a persisted asset index with metadata, thumbnail caching, filter panel + smart collections, ratings/labels/tags/collections/stacks, batch rename/move/copy with undo, batch convert/export, AI captions + auto-tag + duplicate/similarity detection (Kollektiv's existing stack), XMP/IPTC write-back, and cross-feature handoffs (Editor/Converter/Resizer/Analyzer/gallery).

## User Decisions (locked)

- **Scope:** Multi-root browser + vault bridge (browse any local folder(s); optionally "Save to Vault").
- **File ops:** Full Bridge parity — including XMP/IPTC write-back into image files (scoped: see Risks).
- **Feature tiers:** All tiers (Core, Organize, AI, Batch + file ops, Metadata panel + synergy).
- **AI engine:** Kollektiv's existing stack (Gemini proxy via server.ts / vision services) — no client-side keys.
- Deletions default to soft-delete `.kollektiv-trash/` folder (pending final confirmation — Open Question 1).

## Architecture Decisions

- **Wiring:** Follow the 6-touch-point registration pattern (per `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md`):
  1. `types.ts` — `'assets_manager'` in `ActiveTab` union
  2. `components/Header.tsx` — `utilityItems` entry
  3. `components/App.tsx` — render case + title case
  4. `constants/commandRegistry.ts` — `nav-assets-manager` command
  5. `services/assistantTools.ts` — tab id in `PAGES`
  6. `components/transitions/routeFx.ts` — `TOOL_GROUP` + `ROUTE_LABELS`
  The Converter feature (`components/ConverterPage.tsx`, `services/convert/`) is the canonical template.
- **Multi-root:** New `services/assets/assetRootManager.ts` owns N directory handles (separate from the vault's `fileSystemManager` singleton), persisted in IDB, with boot-time permission re-grant UX per root.
- **Index:** Vault manifest `kollektiv_assets_index.json` via `loadManifestSafe` + `stampSchemaVersion` (user-sovereign, exportable — mirrors ACDSee's DB export/import). Asset identity is **path-keyed** (fixes ImageGallery's filename-only collision bug); renames update the index.
- **Thumbnails:** Generated on scan (canvas for jpg/png/webp/gif, magick worker fallback for tiff/bmp etc.), cached in an IDB `thumbnails` store; grid uses thumbs, lightbox uses full-res.
- **AI:** Kollektiv's existing Gemini proxy (server.ts) / vision stack — no client-side keys. Port ImageGallery's caption UX only, not its service (`geminiService.ts` reads `process.env.API_KEY` — a live runtime failure outside AI Studio; do not port as-is).
- **Safety:** Soft-delete folder default, confirmations, persisted undo journal (IDB), `move()` feature-detect with copy+delete fallback.

## What Is Being Ported vs Built New

**Ported (skeleton only, ~restyled):** folder tree, masonry grid + image card, zoom/pan/keyboard lightbox, recursive directory scan, caption UX concepts.

**Built new (everything Bridge/ACDSee-like):** asset index + metadata extraction, thumbnail caching, filter panel + smart collections, ratings/color labels/tags/collections/stacks, selection model, batch rename/move/copy/delete with undo, batch convert/export, AI captions/auto-tag/duplicate/similarity, XMP/IPTC write-back, cross-feature handoffs, vault bridge.

**ImageGallery bugs fixed during port:**
- Captions keyed by filename only (collide across folders, break on rename) → path-keyed IDs + index storage.
- `process.env.API_KEY` mismatch in `geminiService.ts` → not ported; Kollektiv's proxied stack used instead.
- AI Studio artifacts (importmap, metadata.json) → stripped.

## Task List

### Phase 1 — Foundation

#### Task 1: Register the feature (6 touch points)

Make `assets_manager` reachable from header, command palette, assistant, transitions, and tab title.

**Acceptance criteria:**
- [ ] `types.ts`: `'assets_manager'` in `ActiveTab` union
- [ ] `Header.tsx` `utilityItems`: `{ id: 'assets_manager' as ActiveTab, label: 'Assets' }`
- [ ] `App.tsx`: render case (`<AssetsManagerPage isExiting={...} showGlobalFeedback={...}/>`) + title case `'ASSETS | '`
- [ ] `commandRegistry.ts`: `nav-assets-manager` entry with keywords
- [ ] `assistantTools.ts`: tab id in `PAGES`
- [ ] `routeFx.ts`: `TOOL_GROUP` + `ROUTE_LABELS` entry

**Verification:**
- [ ] `pnpm lint` + `pnpm build` pass
- [ ] Manual: navigate via all 5 surfaces (header, command palette, assistant, transitions, title)

**Dependencies:** None
**Files likely touched:** `types.ts`, `components/Header.tsx`, `components/App.tsx`, `constants/commandRegistry.ts`, `services/assistantTools.ts`, `components/transitions/routeFx.ts`
**Estimated scope:** M (tiny edits ×6)

#### Task 2: Port scan core + types

`services/assets/directoryScanner.ts` from ImageGallery's `lib/fileTree.ts`: path-keyed `AssetFile` types, chunked async iteration with progress callback, depth limit, `.kollektiv-trash` ignored.

**Acceptance criteria:**
- [ ] Types defined (`AssetFile` with `path` identity, `DirectoryTree`, filterable fields)
- [ ] Scan yields progressively; partial results on permission errors
- [ ] Unit test with mocked `FileSystemDirectoryHandle`

**Verification:**
- [ ] `pnpm test -- services/assets`

**Dependencies:** Task 2 requires none; independent of Task 1
**Files likely touched:** `services/assets/directoryScanner.ts` (+.test.ts), `services/assets/types.ts`
**Estimated scope:** S

#### Task 3: Multi-root manager

`assetRootManager.ts`: add/remove/list roots, IDB handle persistence, boot-time `queryPermission` re-grant per root, remove-root never touches disk.

**Acceptance criteria:**
- [ ] N roots persist across restarts; permission re-grant flow on boot
- [ ] Vault-disconnected/permission-denied states surfaced, not silent
- [ ] Unit test

**Verification:**
- [ ] `pnpm test -- services/assets`
- [ ] Manual: disconnect + reconnect flow

**Dependencies:** Task 2
**Files likely touched:** `services/assets/assetRootManager.ts` (+.test.ts)
**Estimated scope:** M

#### Task 4: UI shell (tree + grid + lightbox, restyled)

`AssetsManagerPage.tsx` using AnimatedPanels primitives + DaisyUI/Kollektiv vocabulary; port `FileTree`/`ImageGrid`/`ImageCard`/lightbox with zoom/pan/keyboard; `useObjectUrls` hygiene with revocation on switch/unmount; welcome + empty states.

**Acceptance criteria:**
- [ ] Root picker + folder tree sidebar; multi-root switching
- [ ] Masonry grid with lazy thumbs placeholder; lightbox zoom/pan/←/→/Esc
- [ ] No leaked object URLs (teardown verified)
- [ ] Component test

**Verification:**
- [ ] `pnpm test -- AssetsManagerPage`
- [ ] Manual: browse two roots, switch folders, open lightbox

**Dependencies:** Tasks 1-3
**Files likely touched:** `components/AssetsManagerPage.tsx` (+.test.tsx), `components/assets/*`
**Estimated scope:** L → implement as 4a (shell+tree) + 4b (grid+lightbox), each M

### Checkpoint: Foundation
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` pass
- [ ] Browse two roots, switch folders, lightbox works
- [ ] Review with human before proceeding

### Phase 2 — Index, Metadata, Thumbnails, Filter

#### Task 5: Asset indexer

Records with path/name/ext/MIME/size/mtime/dimensions (`createImageBitmap`) + EXIF (`utils/piexif.js`, `utils/imageFormatTools.ts` PNG chunks); incremental rescan diff by path+mtime; persist to `kollektiv_assets_index.json` via `loadManifestSafe` + `stampSchemaVersion`.

**Acceptance criteria:**
- [ ] Incremental rescan (no full re-extract of unchanged files)
- [ ] Manifest write blocked → `ManifestWriteBlockedError` handled (degrade to read-only session)
- [ ] Unit tests for extraction + diff

**Verification:**
- [ ] `pnpm test -- services/assets`

**Dependencies:** Tasks 2, 4
**Files likely touched:** `services/assets/assetIndexer.ts` (+.test.ts), `utils/assetManagerStorage.ts`
**Estimated scope:** M

#### Task 6: Thumbnail pipeline

256px thumbs on scan; IDB `thumbnails` store; grid renders thumbs, lightbox full-res.

**Acceptance criteria:**
- [ ] Second grid visit renders from cache (no re-decode)
- [ ] Canvas path for jpg/png/webp/gif; magick worker fallback for tiff/bmp

**Verification:**
- [ ] `pnpm test -- thumbnailService`
- [ ] Manual: revisit folder, confirm fast render

**Dependencies:** Task 5
**Files likely touched:** `services/assets/thumbnailService.ts` (+.test.ts), IDB schema touch in `utils/db.ts`
**Estimated scope:** M

#### Task 7: Filter panel + sort + smart collections

Filter by type/size/date/rating/label/tag/folder; text search (name+tags); sorts (name/size/date/dims/rating); named saved filters persisted in manifest, one-click apply.

**Acceptance criteria:**
- [ ] Filters compose (AND); smart collection save/apply/delete
- [ ] Unit tests

**Verification:**
- [ ] `pnpm test -- assetFilter`

**Dependencies:** Task 5
**Files likely touched:** `services/assets/assetFilter.ts` (+.test.ts), `components/assets/FilterPanel.tsx`
**Estimated scope:** M

#### Task 8: Metadata side panel

Display EXIF/IPTC/dimensions/dates/path; edit caption/keywords/copyright/rating fields into the index.

**Acceptance criteria:**
- [ ] Editable fields save to index and reflect in cards/filters

**Verification:**
- [ ] Manual: edit a field, verify card + filter update

**Dependencies:** Task 5
**Files likely touched:** `components/assets/MetadataPanel.tsx`
**Estimated scope:** M

### Checkpoint: Phase 2
- [ ] Rescan updates index incrementally
- [ ] Filters + smart collections work; thumbs cached
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` pass

### Phase 3 — Organize

#### Task 9: Selection model

Multi-select (click/ctrl/shift), selection bar with count + bulk actions.

**Acceptance criteria:**
- [ ] Selection survives filter re-application sanely; unit-testable reducer

**Verification:**
- [ ] `pnpm test -- selection`

**Dependencies:** Task 4
**Files likely touched:** `components/assets/` selection hook
**Estimated scope:** S

#### Task 10: Ratings + color labels

0-5 stars, Bridge 6-color labels, per-asset in index, filterable.

**Acceptance criteria:**
- [ ] Ratings/labels filterable + visible in grid overlay

**Verification:**
- [ ] Manual: rate + label, filter by both

**Dependencies:** Tasks 5, 9
**Files likely touched:** `components/assets/`
**Estimated scope:** S

#### Task 11: Tags & keywords

Manual add/remove with autocomplete from existing tag vocabulary (`constants/modifiers.ts`); `autoTagService` batch application.

**Acceptance criteria:**
- [ ] Tag ops persist; batch apply queues with progress

**Verification:**
- [ ] `pnpm test -- tags`

**Dependencies:** Task 10
**Files likely touched:** `services/assets/`, `components/assets/`
**Estimated scope:** M

#### Task 12: Collections + stacks

Named collections from selection; manual stacks (auto-stack suggestion deferred to Phase 5).

**Acceptance criteria:**
- [ ] Collections/stacks survive rescan + restart (manifest-persisted)

**Verification:**
- [ ] Manual: create collection, rescan, restart, verify persistence

**Dependencies:** Task 9
**Files likely touched:** `services/assets/collectionStore.ts`, `components/assets/`
**Estimated scope:** M

### Checkpoint: Phase 3
- [ ] Organize ops survive rescan and restart
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` pass

### Phase 4 — Batch + File Ops (Full Bridge parity begins)

#### Task 13: Batch rename

Token patterns (`{name} {index} {date} {width} {height} {rating} {label}`…), preview table before apply; `move()` feature-detect with copy+delete fallback; index path update.

**Acceptance criteria:**
- [ ] Preview matches result exactly; rename updates index; undo-able

**Verification:**
- [ ] `pnpm test -- batchRename`
- [ ] Manual: rename two files, verify index + undo

**Dependencies:** Tasks 5, 12
**Files likely touched:** `services/assets/batchRename.ts` (+.test.ts)
**Estimated scope:** M

#### Task 14: Move/copy

Cross-folder move/copy (read+write+delete) with confirmation + progress + index updates.

**Acceptance criteria:**
- [ ] Conflict policy (skip/rename) explicit; index consistent after move

**Verification:**
- [ ] `pnpm test -- fileOps`

**Dependencies:** Task 13
**Files likely touched:** `services/assets/fileOps.ts` (+.test.ts)
**Estimated scope:** M

#### Task 15: Delete + safety

Default soft-delete to `.kollektiv-trash/` per root (restorable); hard delete double-confirmed; trash management (restore/empty).

**Acceptance criteria:**
- [ ] Soft delete never loses bytes; restore works; trash excluded from scans

**Verification:**
- [ ] Manual: soft-delete, restore, empty trash

**Dependencies:** Task 14
**Files likely touched:** `services/assets/fileOps.ts`, `components/assets/`
**Estimated scope:** M

#### Task 16: Undo buffer

Operation journal in IDB (op, src, dest, snapshot bytes where feasible); undo recent ops; best-effort across restart.

**Acceptance criteria:**
- [ ] Undo rename/move/copy/delete; journal survives restart; permission-loss degrades honestly

**Verification:**
- [ ] `pnpm test -- undoJournal`

**Dependencies:** Tasks 13-15
**Files likely touched:** `services/assets/undoJournal.ts` (+.test.ts)
**Estimated scope:** M

#### Task 17: Batch convert + export panel

Filtered set through existing magick converter worker; export to folder / ZIP (`utils/zipDownload.ts`) / save-to-vault.

**Acceptance criteria:**
- [ ] Worker teardown on unmount (ConverterPage pattern); ZIP export works

**Verification:**
- [ ] `pnpm test -- ExportPanel`

**Dependencies:** Task 7
**Files likely touched:** `components/assets/ExportPanel.tsx`
**Estimated scope:** M

### Checkpoint: Phase 4
- [ ] Destructive ops always confirmed; undo verified
- [ ] Index consistent after renames/moves
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` pass
- [ ] Review with human (destructive-op UX) before proceeding

### Phase 5 — AI

#### Task 18: AI captions

Kollektiv vision stack via existing Gemini proxy (server.ts); batch caption queue; captions in index + card/lightbox display.

**Acceptance criteria:**
- [ ] No key → manual workflow unaffected; batch captions resumable

**Verification:**
- [ ] `pnpm test -- captionService`

**Dependencies:** Task 5
**Files likely touched:** `services/assets/captionService.ts` (+.test.ts)
**Estimated scope:** M

#### Task 19: Auto-tagging

`autoTagService` + vision, batch tag → merge into keywords.

**Acceptance criteria:**
- [ ] Tag merge deduplicates; queue + progress

**Verification:**
- [ ] `pnpm test -- autoTag assets`

**Dependencies:** Task 18
**Files likely touched:** `services/assets/`
**Estimated scope:** M

#### Task 20: Duplicate detection

dHash perceptual hash computed during indexing; duplicates grouped by hamming threshold; review UI with keep/resolve.

**Acceptance criteria:**
- [ ] Dupes found across folders; resolve actions (soft-delete) safe

**Verification:**
- [ ] `pnpm test -- duplicateDetector`

**Dependencies:** Task 5
**Files likely touched:** `services/assets/duplicateDetector.ts` (+.test.ts)
**Estimated scope:** M

#### Task 21: Find similar

v1 nearest-neighbor by phash (local); optional multimodal embeddings via `embeddingService` if feasible.

**Acceptance criteria:**
- [ ] "Find similar" from context menu/panel returns ranked results

**Verification:**
- [ ] Manual: find similar on an asset

**Dependencies:** Task 20
**Files likely touched:** `services/assets/similarity.ts` (+.test.ts)
**Estimated scope:** M

### Checkpoint: Phase 5
- [ ] AI features degrade gracefully offline
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` pass

### Phase 6 — XMP/IPTC Write-back (Full parity, scoped)

#### Task 22: Write-back engine

JPEG: piexif EXIF/IPTC insert + APP1 XMP packet writer; PNG: tEXt/iTXt chunk write (`utils/imageFormatTools.ts` patterns); WebP best-effort; unsupported → visible "index-only" badge. Pre-write validation, confirmation, post-write re-read verify, integrated with undo journal.

**Acceptance criteria:**
- [ ] Written files re-read with matching metadata; original preserved on failure (createWritable atomic swap)
- [ ] Unsupported formats never silently "succeed"

**Verification:**
- [ ] `pnpm test -- metadataWriter`
- [ ] Manual: write JPEG + PNG, re-read, verify; attempt WebP/RAW, verify badge

**Dependencies:** Tasks 8, 16
**Files likely touched:** `services/assets/metadataWriter.ts` (+.test.ts), `components/assets/`
**Estimated scope:** M-L → split 22a (writers) / 22b (engine+UI) if needed

### Phase 7 — Synergy + Polish

#### Task 23: Cross-feature handoffs

Open-in Image Editor / Converter / Resizer, send-to-Analyzer via pending-params pattern (`setPendingStudioParams` style) + navigate.

**Acceptance criteria:**
- [ ] Each handoff lands on the right tab with the asset preloaded

**Verification:**
- [ ] Manual: each of the 4 handoffs

**Dependencies:** Task 4
**Files likely touched:** `services/assets/handoff.ts`, small edits in target pages
**Estimated scope:** M

#### Task 24: Vault bridge

Save-to-gallery (`addItemToGallery` + metadata sidecar), import vault folder as root, push picks into gallery categories.

**Acceptance criteria:**
- [ ] Saved assets appear in Vault gallery with metadata

**Verification:**
- [ ] Manual: save-to-vault, verify in gallery

**Dependencies:** Tasks 5, 9
**Files likely touched:** `services/assets/vaultBridge.ts`
**Estimated scope:** M

#### Task 25: View modes + keyboard

Grid size slider, details/list view, slideshow, keyboard shortcuts + help overlay.

**Acceptance criteria:**
- [ ] All core actions keyboard-reachable; shortcuts overlay accurate

**Verification:**
- [ ] Manual: keyboard-only walkthrough

**Dependencies:** Task 4
**Files likely touched:** `components/assets/`
**Estimated scope:** M

#### Task 26: States + docs + e2e

Empty/disconnected/permission-denied states polished; `e2e/assets-manager.spec.ts` (smoke); ARCHITECTURE_CONSTITUTION Feature Modules entry.

**Acceptance criteria:**
- [ ] All degraded states show honest messaging; e2e smoke green

**Verification:**
- [ ] `pnpm test:e2e -- assets-manager`

**Dependencies:** All
**Files likely touched:** `components/`, `e2e/`, `docs/handbook/`
**Estimated scope:** S-M

### Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] `pnpm lint` / `pnpm validate-config` / `pnpm test` / `pnpm build` pass
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| XMP/IPTC coverage limited in browser (RAW none) | Med | True write-back for JPEG/PNG only; visible index-only badge; never fake success |
| FSA `move()` support varies by Chromium version | Med | Feature-detect; copy+delete fallback with index reconciliation |
| No trash in FSA API — deletes permanent | High | Soft-delete `.kollektiv-trash/` default; hard delete double-confirmed; undo journal |
| Performance on 10k+ image folders | High | Chunked scan w/ progress, incremental index, thumbnail cache, pagination/virtual window in grid |
| Multi-root permission re-grants after restart | Med | Boot-time per-root re-auth UX; graceful partial states |
| Manifest growth (index + tags + collections in one JSON) | Med | Compact schema; revisit per-root sidecars if >5MB |
| Overlap/confusion with existing Vault gallery | Med | Documented boundary: Assets Manager = external multi-root browser; Vault gallery = ingested assets |
| Object URL leaks across folder switches | Low | `useObjectUrls` + teardown revocation (verified in Task 4) |

## Open Questions

1. Soft-delete `.kollektiv-trash/` as the delete default — OK, or hard-delete as default with soft as opt-in?
2. Find-similar v1 via local perceptual hash (no AI key needed) — OK, or embeddings-first?
3. Slideshow mode: wanted in Task 25, or defer?
4. Asset index manifest lives in the Vault (user-sovereign, follows Kollektiv convention) — assumed yes.

## Parallelization

- **Safe to parallelize:** Tasks 2+3; Phase 2 tasks 6-8 (after 5); Phase 5 tasks 18-21; Task 25/26.
- **Must be sequential:** Task 1 (wiring first), Tasks 13→14→15→16 (file ops chain), Task 22 after 8+16.
