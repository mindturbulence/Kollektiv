# Kollektiv — Remaining Tasks

Single backlog of open work, consolidated 2026-09-28 from the finished/obsolete plans (deleted — read
them in git history at commit `3bc6f65`) and the open items of `docs/ISSUES.md`. The only active
feature plan is [2026-09-28-image-editor-looks.md](2026-09-28-image-editor-looks.md). Durable
design records live in the [handbook](../handbook/README.md).

Legend: **S** small · **M** medium · **L** large. Check items off here; delete a section when empty.

---

## 1. Image Editor

- [x] **Looks / Quick-Edit / RAW** — v1 complete (Phases 0–5, 2026-09-29); plan: [2026-09-28-image-editor-looks.md](2026-09-28-image-editor-looks.md).
- [x] **Looks follow-ups** (2026-09-29):
  - [x] Rename a My Look
  - [x] Thumbnail priority by visibility (IntersectionObserver)
  - [x] Automated context-loss e2e
- [ ] **Tiled look export** for GPUs whose `MAX_TEXTURE_SIZE` < 8192 (Jev 0.41 then 0.36 → Claude's call: wait for a real low-end GPU; the editor caps images at 8192 and desktop GPUs report 16384; needs a test hook to verify here). **M**
- [ ] **Looks v2** (plan §8): Gallery batch-apply, full float document pipeline, 16-bit PNG/TIFF export, high-quality grain on export, skin-tone isolation. **L**
- [ ] **Optional: CC0 texture scans** (paper/dust/light-leak photos from ambientCG-style CC0 sources, listed in `public/looks/LICENSES.md`) if the procedural textures feel too clean. **S**

## 2. Assets Manager (Utilities → `assets_manager`)

Shipped: registration, multi-root scan + permission re-grant, folder tree, masonry grid, lightbox,
multi-select, drag-move within a root, export (download/ZIP), Convert and Editor handoffs.
Design constraints to keep: path-keyed asset IDs; index manifest `kollektiv_assets_index.json`
via `loadManifestSafe` + `stampSchemaVersion`; AI only through the server Gemini proxy (never
port ImageGallery's `geminiService.ts`); use the shared `Modal`, never `window.confirm`.
Boundary: Assets Manager = external multi-root browser; Vault gallery = ingested assets.

- [ ] Human review of the Foundation phase — **owner**. (Built on anyway at the owner's request, 2026-09-29.)
- [ ] Destructive-op UX review after T13–T16 (plan checkpoint) — **owner**.
- [x] **T5 Asset indexer** — facts (size/mtime/dimensions/EXIF) cached in IndexedDB by `size:mtime`, incremental; user data in `kollektiv_assets_index.json`, in-memory with a notice without a vault, read-only on `ManifestWriteBlockedError`. (2026-09-29)
- [x] **T6 Thumbnails** — 256 px WebP from the same decode (IndexedDB); undecodable formats (TIFF/HEIC) show a type badge instead of a magick-worker render. (2026-09-29)
- [x] **T7 Filter panel + sort + saved filters** (AND-composed; saved filters in the manifest). (2026-09-29)
- [x] **T8 Metadata side panel** (facts + EXIF; editable caption/tags/copyright/rating/label). (2026-09-29)
- [x] **T10 Ratings + colour labels** (keys 0–5, 6–9; grid overlay; filterable). (2026-09-29)
- [x] **T11 Tags & keywords** (datalist autocomplete from the user's own tags; bulk add/remove on a selection). Batch *AI* auto-tag is T19. (2026-09-29)
- [x] **T12 Collections + stacks** (manifest-persisted, survive rescan/restart; collection view spans roots). (2026-09-29)
- [x] **T13 Batch rename** (tokens, validated preview, two-phase apply, index follows, undoable). (2026-09-29)
- [x] **T14** — conflict policy (skip / keep both) and cross-root copy/move. (2026-09-29)
- [x] **T15 Delete + safety** — built on `main` (2026-09-30, `services/assets/trash.ts`, `folderOps.ts`, context menus): Move to Trash is the default delete, per-root `.kollektiv-trash/`, restore, delete forever, empty trash, folder create/rename/delete, tree folder move. All confirmations and name prompts now use in-app Modal dialogs (`components/assets/AskDialog.tsx`), not `window.confirm/prompt`.
- [x] **T16 Undo journal** — IndexedDB, survives restart (e2e), per-item honest failures. (2026-09-29)
- [x] **T17** — save-to-vault export target (via T24). (2026-09-29)
- [ ] **T18 AI captions** (batch queue, resumable, no key → manual workflow unaffected). **M** — needs a live AI key to build/verify.
- [ ] **T19 Auto-tagging** (vision → keywords, dedupe merge). **M** — needs a live AI key.
- [x] **T20 Duplicate detection** (dHash from indexing, single-link groups, review + "select extras"; no delete — that's T15). (2026-09-29)
- [ ] **T21 Find similar** — waits on the owner: phash-first or embeddings?
- [x] **T22 XMP/IPTC write-back** — JPEG (XMP APP1 + EXIF) and PNG (iTXt XMP), atomic write, read-back verify (restores on mismatch), undoable; other formats index-only with a badge. (2026-09-29)
- [x] **T23** — Resizer and Media Analyzer handoffs (`utils/pendingHandoff`). (2026-09-29)
- [x] **T24 Vault bridge** — save to the gallery (category, tags, caption) and the local vault's gallery folder as a root. (2026-09-29)
- [ ] **T25 View modes + keyboard** — grid size, list view, slideshow, shortcuts overlay. **M** — waits on the owner: slideshow wanted? (Rating/label/select-all keys are in.)
- [x] **RAW files** — listed with embedded-JPEG thumbnails and a RAW badge; the editor handoff routes them to the RAW importer. (2026-09-29)
- [x] **T26 States + docs + e2e** — no-vault/read-only/missing-collection notices, `e2e/assets-manager.spec.ts` (3 flows), handbook Feature Modules entry. (2026-09-29)
- Open questions: phash-first find-similar? slideshow in T25? (Soft-delete is settled: trash is the default. The index manifest lives in the vault.)

## 3. App-wide (from the 2026-09-24 whole-app review)

- [x] **D2** — 20 hand-rolled dialogs now run on `components/Modal.tsx` (2026-09-30): Confirmation, Migration, PromptTxtImport, YouTubePublish, GalleryPicker, WorkflowImport, PromptLibrary, AddSource, CodeSnippet, JSONBreakdown, AddItem, ClippingPanel, NestedCategoryManager, PromptCrafter (save), ResearchSources preview, GallerySection (bulk convert), RefinerPage (register preset), and the editor's Export / Size / Unsaved dialogs. `Modal` gained `bare` (keep a dialog's own chrome but get the portal, Escape, focus trap/restore, labelled `role=dialog`), `backdropClassName` and sizes up to `7xl`. Intentionally left bespoke: `PromptEditorModal` (GSAP staged entrance tied to refs) and `AboutModal` (animated blur/scale entrance). The other `fixed inset-0` uses aren't dialogs (loaders, idle overlay, command palette, fullscreen viewers/lightbox, drawers/panels, page frame) and stay as they are. **L**
- [x] **T2** — ESLint: 321 errors → 0 and the CI step is blocking (2026-09-30). Autofixes that typecheck; test-file overrides for `unbound-method`/`no-require-imports`; `require-await` off (Jev 0.80: interface-conforming async methods); `literal | string` → `(string & {})`; unused `catch (e)` → `catch`; explained suppressions for deliberate coercions and the LoRA calculator's `new Function`. Left: 9 `react-hooks/exhaustive-deps` warnings (fixing changes behaviour — review each). **M**
- [x] Page content visible at t=0: `TerminalText` start delays capped at 150 ms in the component (all 22 call sites); the decrypt effect stays. (2026-09-29)
- [x] Motion leftovers (2026-09-30): ScanLine animates a transform not `top`; `.animate-fade-in` uses the 250 ms token; AboutModal scales from 0.92 not 0; CustomCursor uses `gsap.quickTo`; ChromaticText flickers on a 60 ms timer instead of a per-frame rAF loop; the 12 boot blinds lost their stacked backdrop-blur; InitialLoader's forced waits trimmed (system text 3.2 s → 1.2 s, completion 1 s → 0.25 s, crossfades 1 s → 0.5 s).
- [ ] Light theme (`sanrita`) polish: ~200 hard-coded `white`/`black`; dark dashboard artwork reads as grey haze. **M**
- [ ] V12 phone width (390 px) — deferred by design (desktop-first). **L**

## 4. Home

- [ ] Optional Phase 2: a week of local-only counts of Home entries by source (boot, logo, ⌘1, palette); if purposeful entries ≈ 0, logo → last-used page and Home becomes first-run only. **S**
- [ ] Decide: "Recent" = recently added (current) or recently opened/edited (needs per-item tracking)? **S**

## 5. Video Editor

- [ ] Make WebGPU the preview renderer — **waits until a GPU-only effect or transition is exposed in the UI**. Checked 2026-09-29: the UI only offers color grade, chroma key and crossfade, which the WebGPU renderer runs on the same CPU/Canvas2D paths, so switching adds readbacks and risk for no visible gain (Jev: defer 0.97). **M**
- [x] Media GC sweep — `sweepOrphanedMedia` deletes blobs no saved project references, in one transaction with the project read (no autosave race); runs silently when the project list opens (Jev unsure 0.15 → Claude's call: automatic, no grace period, no button). (2026-09-30)

## 6. Converter (deferred ideas)

- [x] `convert_file` assistant/MCP tool — vault path or gallery item → any Converter target (quality, max size), saved to `gallery/converted/`; auto-registered as a capability; manifest entry in `mcp-config.json`. (2026-09-29)
- [x] Export presets — Web image, Social post, Archive, Print, Web video, Social clip, Podcast, Broadcast audio; Max size (shrink only) for images and video; audio bitrate now 32–320 kbps (was capped at 100). (2026-09-29)
- [x] Auto-convert on gallery save — the existing opt-in toggles now convert to JPG / WebP / AVIF (default JPG, unchanged); WebP/AVIF via the converter worker, noting the prompt isn't embedded in those files (Jev: format choice 0.73; metadata note 0.69 → Claude's call). (2026-09-29)
- [ ] Long-form / >60 s 1080p video: server-side ffmpeg via `server.ts` (single-thread wasm is impractical). **L**

## 7. Manual tests and external-service issues (from `docs/ISSUES.md`)

Procedures and details are in [ISSUES.md](../ISSUES.md). Deferred by the owner on 2026-09-28 (need live accounts/network). Remove an item here and in ISSUES.md once it's resolved.

- [ ] **ISSUE-1** Spotify connect end-to-end from a clean checkout (needs a Spotify Developer app).
- [ ] **ISSUE-2** Google silent refresh — re-run after the ISSUE-44 fix: Test A (forced expiry refreshes silently), Test B (revocation offers reconnect).
- [ ] **ISSUE-11** Source-aware research answers — walk the checklist (ISSUE-9's run already produced a cited answer).
- [ ] **ISSUE-30** Production CSP: verify live voice, Spotify, YouTube search, local Ollama/llama.cpp, Google Sign-In under Report-Only, then switch `security.ts` to enforcing and re-verify.
- [ ] **ISSUE-42** YouTube transcript tool fails (empty caption body / UNPLAYABLE) — re-verify from a residential network; if still failing it needs a PO-token-capable path. Reddit 403 from datacenter IPs is expected.
- [ ] **ISSUE-12 follow-up** — description strengthened 2026-09-30; if the assistant still answers "noted" without calling `append_findings`, add a nudge in `buildSystemIdentity`. (Needs live use to tell.)
- [ ] **ISSUE-47 residuals** — only `mcp_call`/`persistence`/`fallback` still throw "not implemented" (the planner never emits them — build when a plan needs one). Step-output data flow already existed and `user_confirmation` now auto-approves explicitly (2026-09-30).
