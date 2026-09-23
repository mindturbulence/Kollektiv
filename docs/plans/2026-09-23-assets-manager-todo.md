# TODO: Assets Manager for Kollektiv (Utilities submenu)

Companion to `2026-09-23-assets-manager.md`. Check off as phases complete.

## Phase 1 — Foundation
- [x] Task 1: Register the feature (6 touch points: types.ts, Header.tsx, App.tsx, commandRegistry.ts, assistantTools.ts, routeFx.ts)
- [x] Task 2: Port scan core + types (`services/assets/directoryScanner.ts`, path-keyed IDs, chunked scan)
- [x] Task 3: Multi-root manager (`services/assets/assetRootManager.ts`, IDB persistence, permission re-grant)
- [x] Task 4a: UI shell — root picker + folder tree sidebar (restyled)
- [x] Task 4b: UI shell — masonry grid + lightbox (restyled, object URL hygiene, 200-item page cap for 10k+ folders)

## Checkpoint: Foundation
- [x] pnpm lint / pnpm test / pnpm build pass
- [x] Browse two roots, switch folders, lightbox works (covered by component test suite)
- [x] Post-review fixes: sidebar tree text size, screen-centered load progress, lightbox portaled to document.body (matches FullscreenViewer pattern — fixes prev/next/close/reset positioning, which was broken by App.tsx's route-transition transform re-anchoring `position: fixed`)
- [ ] Review with human before proceeding

## Phase 2 — Index, Metadata, Thumbnails, Filter
- [ ] Task 5: Asset indexer (EXIF/dimensions extraction, incremental rescan, `kollektiv_assets_index.json` manifest)
- [ ] Task 6: Thumbnail pipeline (256px thumbs, IDB cache, magick fallback)
- [ ] Task 7: Filter panel + sort + smart collections (saved filters)
- [ ] Task 8: Metadata side panel (display + editable index fields)

## Checkpoint: Phase 2
- [ ] Rescan updates index incrementally
- [ ] Filters + smart collections work; thumbs cached
- [ ] pnpm lint / pnpm test / pnpm build pass

## Phase 3 — Organize
- [x] Task 9: Selection model (multi-select — ctrl/cmd-click toggle, shift-click range, checkbox overlay, selection toolbar)
- [ ] Task 10: Ratings + color labels (0-5 stars, Bridge 6-color)
- [ ] Task 11: Tags & keywords (manual + autoTagService batch)
- [ ] Task 12: Collections + stacks (manifest-persisted)

## Checkpoint: Phase 3
- [ ] Organize ops survive rescan and restart
- [ ] pnpm lint / pnpm test / pnpm build pass

## Phase 4 — Batch + File Ops (Full Bridge parity begins)
- [ ] Task 13: Batch rename (token patterns, preview table, `move()` feature-detect)
- [x] Task 14: Move/copy (drag-and-drop onto sidebar tree — `services/assets/fileOps.ts`, `move()` feature-detect with copy+delete fallback; index refresh via `refreshTick`. No conflict-resolution UI or cross-root copy yet — same-root moves only)
- [ ] Task 15: Delete + safety (soft-delete `.kollektiv-trash/` default, hard delete double-confirmed)
- [ ] Task 16: Undo buffer (IDB operation journal, undo recent ops)
- [x] Task 17: Batch convert + export panel — Export (single download / ZIP via existing `utils/zipDownload.ts`) and Convert (handoff to Converter page via `appEventBus` `openInConverter`, mirroring `openInEditor`) shipped from the selection toolbar. Not yet done: save-to-vault target.

## Checkpoint: Phase 4
- [ ] Destructive ops always confirmed; undo verified
- [ ] Index consistent after renames/moves
- [ ] pnpm lint / pnpm test / pnpm build pass
- [ ] Review with human (destructive-op UX) before proceeding

## Phase 5 — AI
- [ ] Task 18: AI captions (Kollektiv Gemini proxy, batch queue)
- [ ] Task 19: Auto-tagging (autoTagService + vision)
- [ ] Task 20: Duplicate detection (dHash, grouped review UI)
- [ ] Task 21: Find similar (phash nearest-neighbor v1)

## Checkpoint: Phase 5
- [ ] AI features degrade gracefully offline
- [ ] pnpm lint / pnpm test / pnpm build pass

## Phase 6 — XMP/IPTC Write-back (Full parity, scoped)
- [ ] Task 22: Write-back engine (JPEG piexif + APP1 XMP, PNG tEXt/iTXt, WebP best-effort, index-only badge for unsupported)

## Checkpoint: Phase 6
- [ ] Written files re-read with matching metadata; originals preserved on failure
- [ ] pnpm lint / pnpm test / pnpm build pass

## Phase 7 — Synergy + Polish
- [x] Task 23: Cross-feature handoffs — Editor (`openInEditor`, single-select) and Converter (`openInConverter`, multi-select) shipped. Resizer/Analyzer handoffs not yet done.
- [ ] Task 24: Vault bridge (save-to-gallery, vault folder as root — note: drag-and-drop OS folder → new root now works, via `addRootFromHandle`, but that's Task 3/9 territory, not vault-specific)
- [ ] Task 25: View modes + keyboard (grid slider, list view, slideshow, shortcuts overlay)
- [ ] Task 26: States + docs + e2e (degraded states, e2e smoke, ARCHITECTURE_CONSTITUTION entry)

## Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] pnpm lint / pnpm validate-config / pnpm test / pnpm build pass
- [ ] Ready for review

## Open Questions (resolve during execution)
- [ ] 1. Soft-delete `.kollektiv-trash/` as delete default — confirm
- [ ] 2. Find-similar v1 via local perceptual hash — confirm
- [ ] 3. Slideshow mode in Task 25 — include or defer
- [ ] 4. Asset index manifest in Vault — assumed yes
