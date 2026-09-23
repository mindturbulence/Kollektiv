<!-- /autoplan restore point: ~/.gstack/projects/mindturbulence-Kollektiv/development-autoplan-restore-20260922.md -->
# Plan: Utilities Expansion — VERT-Inspired File Conversion for Kollektiv

Status: REVIEWED (autoplan complete — see Final Gate section)
Date: 2026-09-22
Branch: development
Source reference: https://github.com/VERT-sh/VERT (AGPL-3.0)

---

## 1. Problem Statement

Kollektiv's Utilities submenu has five tools (Composer, Compare, Palette, Resizer, Video)
but no general-purpose **file converter**. Users working with generative-media assets
routinely need format conversion (webp/avif/png/jpeg, flac/mp3/wav/ogg, short-clip video)
and currently must leave the app. VERT proves this can be done 100% locally in the
browser via WASM. Goal: bring VERT's conversion capability into kollektiv's Utilities
submenu, adapted to kollektiv's architecture, themes, and vault-first data model.

**Non-goal:** replicating VERT the product (i18n, Stripe, SvelteKit, vertd deployment
infrastructure). Only the conversion capability is in scope.

## 2. What VERT Is (research summary)

- SvelteKit + TypeScript SPA. Converts image/audio/doc in-browser via WASM; video
  only through an optional companion server ("vertd").
- Core: `src/lib/converters/` — `MagickConverter` (@imagemagick/magick-wasm, runs in
  a Web Worker), `FFmpegConverter` (@ffmpeg/ffmpeg), `PandocConverter` (pandoc via
  WASI shim), `VertdConverter` (optional remote). Format registry + capability matrix
  (`Categories` with canConvertTo), native-over-remote ordering, multi-file queue,
  ZIP download (client-zip), worker-based conversion, toasts, progress, no size limits.
- Key UX: drag-drop anywhere, format picker with category grouping, per-file status,
  batch convert-all, download zip, settings (privacy toggle to disable all external
  requests, conversion concurrency, output naming).

## 3. Premises (confirmed by user at Phase 1 gate)

- **P1 (capability-not-code):** We replicate VERT's *capability* using the same
  underlying MIT/Apache libraries (magick-wasm, ffmpeg.wasm) — we do **not** copy
  VERT's AGPL-3.0 source. kollektiv is GPL-3.0; ingesting AGPL code would force the
  whole project to AGPL-3.0. Using the libraries directly keeps licenses clean and
  fits React (VERT's glue is SvelteKit-specific anyway).
- **P2 (fit):** A "Converter" tab belongs in the existing Utilities submenu alongside
  Resizer/Video — same users, same asset workflow.
- **P3 (local-first):** All conversion stays on-device. No upload endpoints. An
  optional local-server video path (vertd-like via existing server.ts) is deferred.
- **P4 (REVISED by user at premise gate — video IS in scope):** ffmpeg.wasm ships
  two cores: single-thread (no SharedArrayBuffer needed — works on GH Pages and every
  serving context) and multithread (needs COOP/COEP headers GH Pages can't serve).
  Plan: video via **single-thread core**, targeting kollektiv's actual video workload
  — short AI-generated clips (5-10s Veo/Kling/Sora outputs, the same clips
  VideoToFrames already handles). Long-form video encoding on single-thread wasm is
  impractical → deferred. Precedent: docs/plans/image-editor-engineering-plan.md:203
  already rejected COOP/COEP headers for breaking cross-origin embeds — that decision
  stands; mt-core via headers is a TODOS item only.

## 4. Scope

### In scope (this plan)
- **W1 — Converter tab (image):** `@imagemagick/magick-wasm` in a dedicated Web
  Worker (warm instance reused across batch); formats: webp, avif, png, jpeg, gif,
  tiff, bmp, heic(read). Drag-drop + file picker, multi-file queue, per-file status
  LEDs, target-format picker, quality/resize options, progress, per-file download +
  ZIP-all (jszip). Batch cap 200 files with visible warning. Worker cancellation
  `{kind:'cancel', jobId}` + teardown on unmount + restart-once-on-crash policy.
  Output filename sanitization (strip path separators, cap 200 chars).
- **W2 — Converter tab (audio + video):** `@ffmpeg/ffmpeg` (single-thread core) +
  `@ffmpeg/util`, run in a **dedicated ffmpeg worker** (never the main thread —
  see Phase 3 E1). Audio formats: mp3, wav, flac, ogg, m4a, aac (bitrate/sample-rate
  options). Video formats: mp4 (h264), webm (vp9), gif, plus audio-extract from video.
  Video targets the short-clip workload (≤60s, ≤1080p guidance in UI); core loaded
  lazily on first audio/video job (~32MB; image path must not pay this cost).
  Progress via ffmpeg progress events; cancel via ffmpeg.terminate(). Pre-check:
  reject video >500MB or >10min before queueing (wasm ~2GB memory ceiling).
- **W3 — Navigation + registry wiring:** new `ActiveTab` value `converter`;
  Header.tsx `utilityItems` entry; App.tsx render switch; commandRegistry entry;
  `PAGES` in services/assistantTools.ts; routeFx transition mapping; TabTitleManager.
- **W4 — Vault integration:** "Save to Vault" per file and batch; save-converted
  dialog reuses GalleryPickerModal/fileSystemManager patterns used by VideoToFrames.
  Vault-disconnected → button hidden, plain download remains.
- **W5 — Settings:** converter section in Settings (default output format, overwrite
  naming, concurrency 1-4, audio-engine lazy-load toggle). Conversion outcome
  counters routed through the galleryAnalytics pattern.
- **W6 — Extract shared `utils/zipDownload.ts`** reused by ImageResizer +
  VideoToFrames + ConverterPage (removes 3rd duplicate), with regression tests.

### Explicitly NOT in scope (deferred — see TODOS at Final Gate)
- **Long-form video conversion** (>60s / >1080p): single-thread wasm is too slow.
  Follow-up paths: COOP/COEP headers on server.ts for the mt core, or a vertd-style
  local helper using the user's own ffmpeg binary. Both need a hosting decision and
  embed-compat testing.
- Document conversion (pandoc-wasm) — heavy, niche for this user base; kollektiv
  already ingests doc/pdf via mammoth/pdfjs for the assistant.
- i18n, Stripe, vertd deployment, kollektiv Assistant tools for conversion
  (a `convert_file` MCP tool is a cheap follow-up but separate).
- 250-format breadth: we ship the generative-media core set (~15 output formats),
  not the full registry.

## 5. What already exists (reuse map)

| Sub-problem | Existing kollektiv code |
|---|---|
| Multi-file batch queue + status | `ImageResizer.tsx` (ImageItem queue pattern), `BatchRunnerPage.tsx` |
| Image decode/encode | `image-editor/` canvas pipeline (decode via createImageBitmap) |
| ZIP download | `jszip` in VideoToFrames/ImageResizer → extracted in W6 |
| Save to vault | `utils/fileUtils.ts` fileSystemManager, `GalleryPickerModal` |
| Drag-drop region | ComposerPage/ImageResizer drop zones |
| WASM asset shipping | `vite-plugin-static-copy` (rnnoise.wasm precedent in vite.config.ts) |
| Workers | none yet in-repo — pattern established here (Vite `new Worker(new URL(...))`) |
| Object URL hygiene | `utils/useObjectUrls.ts` |
| Toasts/progress/errors | FeedbackToast, LoadingSpinner, ErrorDisplay/AppError |
| Motion/theme conformance | AnimatedPanels panelVariants, 4 DaisyUI themes, routeFx 'tool-mount' |
| MCP config gates | validate-mcp-config (only if an MCP tool is added — out of scope) |

## 6. Architecture

```
components/ConverterPage.tsx            (UI: queue, format picker, options, save)
services/convert/convertRegistry.ts     (format metadata, capability matrix, queue)
workers/convertWorker.ts                (magick-wasm; message protocol {id, kind:'convert'|'cancel', ...})
workers/ffmpegWorker.ts                 (ffmpeg single-thread core; audio + video)
services/convert/audioVideoConverter.ts (main-thread wrapper: lazy core load state machine, enqueue to ffmpegWorker)
constants/converterFormats.ts           (format list, ext/MIME maps, default presets)
utils/converterNaming.ts                (output naming, collision handling, sanitization)
utils/zipDownload.ts                    (W6, shared)
types.ts                                (+ 'converter' ActiveTab)
```

- Worker protocol: `{id, kind:'convert'|'cancel', file, target, opts}` →
  `{id, ok, blob?, progress?, error?}`; transfer ArrayBuffer, not Blobs, across
  postMessage. Unmount → cancel all + terminate workers.
- magick-wasm WASM asset copied to `/magick.wasm` via viteStaticCopy; worker
  instantiates with locateFile. Warm instance reused across the batch.
- ffmpeg core fetched lazily from /ffmpeg/ (static copy, ~32MB) only when W2 used.
- Concurrency: 1 magick worker (instance is heavy); queue serialized. Audio/video
  jobs serialized through the ffmpeg worker (single-thread core).
- GH Pages constraint: no COOP/COEP → `crossOriginIsolated === false` → ffmpeg
  single-thread core only. Fine for audio + short clips. Documented in Settings copy.

## 7. Implementation order (est. human / CC time)

1. W1 image path (worker + registry + ConverterPage shell) — 3d / 4h
2. W3 wiring (tab, nav, commands, titles) — 0.5d / 1h
3. W2 audio+video (lazy ffmpeg, dedicated worker) — 2d / 3h
4. W4 vault save + W5 settings — 1d / 2h
5. W6 zipDownload extraction + regression tests — 0.5d / 1h
6. Tests + docs (below) — 1d / 2h
Total: ~8d human / ~13h CC

## 8. Test plan

- Unit (24 planned — full diagram in Phase 3): registry capability matrix (target
  formats valid per source), unknown extension rejection, naming collisions +
  sanitization, worker protocol happy/error/cancel/restart paths (mocked magick),
  audio/video lazy-load state machine, ZIP succeeded-only membership, Vault save
  paths, settings persistence round-trip.
- Component: ConverterPage queue render, drag-drop, per-file status transitions,
  cap warning, double-click dedupe, unmount teardown, save-to-vault modal,
  theme snapshots (all 4 themes).
- Regression (required): ImageResizer + VideoToFrames ZIP behavior ports stay green
  after W6 extraction.
- E2E (8 candidates → e2e/converter.spec.ts): 30-file happy batch, cancel at 25/50,
  flac→mp3 no-freeze, clip→gif <90s, vault round-trip shows in gallery.
- Manual matrix: 20MB png→avif, heic read (Safari vs Chrome), 50-file batch,
  tab-away mid-batch, worker crash → restart, vault disconnected, GH Pages build
  check (main bundle must not include ffmpeg core; /magick.wasm 200 + MIME).
- Existing suite green: `pnpm lint && pnpm validate-config && pnpm test && pnpm build`.

## 9. Failure modes / error paths

| Failure | Handling |
|---|---|
| WASM instantiate fails (old browser, CSP) | ErrorDisplay with browser-support message; image path degrades to canvas encoder for webp/jpeg/png |
| Unsupported source format / unknown ext | Registry lookup; row marked unsupported before queueing |
| Out-of-memory (large batch) | Concurrency 1 default; cap 200; per-file error row, batch continues |
| ffmpeg core fetch fails (offline first use) | Audio/video section disabled with retry; image path unaffected |
| ffmpeg hang on malformed video (single-thread) | terminate() after 10min watchdog; row error; batch continues |
| OOM on large video (single-thread wasm ~2GB cap) | Pre-check: warn + reject clips >500MB / >10min before queueing |
| Vault disconnected | "Save to Vault" hidden; plain download still available |
| Vault write permission denied | VaultWriteError toast; plain download offered |
| Duplicate output names | suffix `-2`, `-3` via converterNaming |
| Worker crash mid-batch | restart once; then per-row failure |

## 10. Risks

- R1: Bundle/memory — magick-wasm is ~10MB wasm + worker; ffmpeg core 32MB lazy.
  Mitigation: static copy + lazy; verify dist budget.
- R2: magick-wasm AVIF encode speed (single-thread) — acceptable for ≤25MP assets;
  document.
- R3: AGPL contamination if anyone later copies VERT glue code — CLAUDE.md note +
  header comment in convertRegistry.ts pointing at the libraries-only stance.
- R4: GH Pages build size growth (wasm copies to dist) — acceptable; no SRI/CSP
  conflicts known.
- R5: ffmpeg.wasm single-thread speed on 1080p video — acceptable for ≤60s clips;
  UI guidance + pre-check enforce the envelope.

## 11. Success criteria

- Convert 10 mixed png/heic/webp images → webp/avif/jpeg in one batch, all saved to
  Vault, under 60s on a mid-range laptop.
- flac→mp3 with no page freeze >2s.
- 10s 1080p mp4 clip → webm and → gif, and clip → mp3 audio extract, each under 90s.
- `pnpm lint && test && build` green; no regression in existing Utilities tabs.

---

# PHASE 1 — CEO REVIEW (autoplan, mode: SELECTIVE EXPANSION, voices: [single-reviewer])

Voices: codex CLI not installed; no subagent tool in session → dual voices degraded,
primary review only. Consensus tables mark missing voices N/A.

## 0A. Premise challenge (evaluated, auto-accept per P6 unless clearly wrong)

| # | Premise | Verdict | Evidence |
|---|---------|---------|----------|
| P1 | Capability-not-code (license-clean rebuild) | VALID, load-bearing | kollektiv LICENSE = GPL-3.0; VERT = AGPL-3.0. Copying VERT glue makes the whole repo AGPL. magick-wasm (Apache-2.0) + @ffmpeg/ffmpeg (wrapper LGPL/core GPL-3.0, GPL-compatible with GPL-3.0 project) are clean. Svelte→React port of VERT glue would be throwaway work anyway. |
| P2 | Converter belongs in Utilities submenu | VALID | utilityItems already hosts Resizer/Video — same batch-asset workflow, same users. User-stated requirement. |
| P3 | Local-first, no upload endpoints | VALID | ARCHITECTURE_CONSTITUTION.md names data sovereignty as a design pillar; plan adds zero network calls. |
| P4 | Audio-first; video deferred (GH Pages COOP/COEP) | VALID as originally drafted → REVISED at gate | GH Pages serves no COOP/COEP headers → crossOriginIsolated=false → ffmpeg single-thread only. User chose video in scope; revised to single-thread-core-for-short-clips (see P4 above). |

Weakest assumption overall: that magick-wasm's AVIF/HEIC support covers the real asset
set — verify in W1 spike before committing the format list.

## 0C. Dream state

```
CURRENT STATE                    THIS PLAN                        12-MONTH IDEAL
5 utility tools, no converter → Converter tab: image+audio+  → Media pipeline hub: convert,
users leave app to convert       short-clip video, worker-      upscale, batch-process,
                                 based, vault-integrated        long-form video via local
                                 batch queue + ZIP export       server, all flowing through
                                                                the Vault
```

Delta after this plan: utilities become self-sufficient for image+audio+short-video;
the worker+registry pattern created here is the platform the future long-form video
path and a `convert_file` MCP tool would build on.

## 0C-bis. Implementation alternatives (auto-decided per P1/P5)

```
APPROACH A: Capability rebuild on the same libraries (CHOSEN)
  Summary: magick-wasm worker + lazy ffmpeg, React UI, vault integration
  Effort:  M (~8d human / ~13h CC)   Risk: Low-Med
  Pros:    license-clean; full format breadth; reusable worker pattern
  Cons:    ~40MB dist growth; new worker pattern to establish
  Reuses:  jszip, fileSystemManager, useObjectUrls, AnimatedPanels, viteStaticCopy

APPROACH B: Port VERT's converter glue source
  Summary: translate magick/ffmpeg converter .svelte.ts to React
  Effort:  M   Risk: HIGH (AGPL contamination forces repo license change; Svelte runes don't port)
  Reuses:  nothing cleanly — rejected per P4/DRY

APPROACH C: Minimal canvas-only converter (no wasm)
  Summary: encode via canvas.toBlob to webp/jpeg/png only
  Effort:  S   Risk: Low
  Pros:    tiny diff, zero wasm
  Cons:    no AVIF/HEIC/audio/video — fails the stated "replicate VERT" goal (Completeness 3/10)
```

## 0D. Selective expansion candidates (auto-decided: defer unless blast-radius + <1d)

| Candidate | Effort | Decision | Why |
|---|---|---|---|
| Video conversion via local server.ts (ffmpeg binary server-side) | L | SUPERSEDED by user gate | user chose in-browser single-thread video instead; server path → TODOS |
| `convert_file` assistant MCP tool on the new registry | S | DEFER → TODOS | cheap follow-up, needs mcp-config.json + executor wiring |
| Export presets (web/social/broadcast bitrate targets) | S | DEFER → TODOS | delight, not core; avoids preset soup in v1 |
| Auto-convert-on-import gallery action | M | DEFER → TODOS | gallery blast radius; not needed for core value |
| Extract shared zipDownload util | S | ACCEPT (W6) | in blast radius, DRY, <1d, 3 files |
| Batch cap at 200 files with visible warning | XS | ACCEPT (W1) | prevents OOM; 1 line in queue logic |
| Worker cancellation + teardown | S | ACCEPT (W1) | plan lacked it; navigating away mid-batch would leak a worker |
| Conversion outcome counters into galleryAnalytics pattern | XS | ACCEPT (W5) | consistent with repo's observability habit |

## Section findings (1-11) — primary reviewer, full depth

**S1 Architecture — 3 findings (all auto-decided).** Worker protocol lacked
cancellation and a worker-restart path; a 32MB ffmpeg fetch would continue after the
user leaves the tab. Fixes: `{kind:'cancel', jobId}` message + worker teardown on
unmount + WorkerError → restart worker once, fail job after. Single worker correct
(magick instance is heavy) — queue serial. Dependency graph: ConverterPage →
convertRegistry → convertWorker → magick-wasm; audioVideoConverter → ffmpegWorker →
ffmpeg.wasm; no cycles; touches 6 shared files — matches the nav-wiring checklist in
ARCHITECTURE_CONSTITUTION (comfy_studio/a1111_studio precedent).

**S2 Error & Rescue — registry below; 0 unrescued gaps after additions.**

```
METHOD/CODEPATH            | WHAT CAN GO WRONG            | EXCEPTION CLASS      | RESCUED | USER SEES
instantiate magick worker  | old browser/CSP blocks wasm  | WasmInitError        | Y | ErrorDisplay banner; canvas fallback for webp/jpeg/png
convertWorker convert      | decode/encode failure        | ConvertError         | Y | per-row error, batch continues
worker postMessage         | structured-clone failure     | WorkerProtocolError  | Y | per-row error + worker restart
audioVideo lazy core load  | fetch of 32MB core fails     | CoreLoadError        | Y | audio/video section disabled + retry button
ffmpeg run                 | exit ≠ 0 / malformed input   | FfmpegError          | Y | per-row error with ffmpeg stderr tail
any job                    | >10min wall time             | JobTimeoutError      | Y | per-row timeout error
saveToVault                | FSA permission denied        | VaultWriteError      | Y | toast; plain download offered
naming                     | collision                    | (not an error)       | Y | -2/-3 suffix
```
No catch-all handlers; each class named, per Prime Directive 2.

**S3 Security — 2 findings, both accepted as notes.** No new endpoints, no network,
no auth surface change. Findings: (a) malicious-image → wasm parser vuln (ImageMagick
history): likelihood low, impact local-only; mitigation = pin dependency versions,
note in CLAUDE.md; (b) supply chain: lockfile-pinned exact versions for both wasm
deps. No PII/credential handling. Output filename sanitization (strip path separators
from source filenames) added to W1.

**S4 Data/interaction edge cases — mapped.** Double-convert click → jobId dedupe;
navigate away mid-batch → unmount cancels queue + terminates worker; zero files →
drop-zone empty state; 10,000 files → 200 cap + warning; batch partial failure →
summary row "N of M failed, download succeeded items"; tab hidden → workers keep
running (intended); duplicate filenames → suffix; HEIC source + Safari/Chrome
differences → capability note in UI row.

**S5 Code quality — 1 finding.** ZIP-blob-download logic exists twice
(ImageResizer.tsx, VideoToFrames.tsx); plan adds a third. Auto-decided: extract
`utils/zipDownload.ts` (W6). Naming: `convertRegistry` (capability matrix) vs
`converterFormats` (constants) — distinct responsibilities, kept.

**S6 Test review — diagram produced; see test plan artifact
(dwun2-development-eng-review-test-plan-20260922-222225.md).** New flows: queue
lifecycle, cancel, capability matrix, naming, vault save, audio/video lazy-load.
2am-Friday test: "convert 50-file mixed batch, cancel at 25, verify 25 artifacts +
no leaked worker".

**S7 Performance — 2 notes.** Keep source as File refs, read to ArrayBuffer only
inside worker transfer; AVIF encode single-thread p99 on 25MP asset ~30-60s —
documented in UI row; audio/video jobs serialized to avoid thread starvation.

**S8 Observability — 1 accepted addition.** Route conversion outcomes
(success/error/duration bytes-in/out) through the existing galleryAnalytics
pattern; structured console group per job (local-first app — no remote logging).

**S9 Deployment — 0 risks beyond R1/R4.** No migrations, no flags; rollback = git
revert (new files + 6 touch points). Post-deploy smoke: convert one image on the
GH Pages build; verify /magick.wasm 200 + correct MIME.

**S10 Long-term — reversibility 4/5.** New files additive; 6 shared-file touch
points are the standard nav-wiring list. Platform potential: registry + worker
protocol is the substrate for future long-form video path and MCP convert tool.
Debt: record worker pattern in ARCHITECTURE_CONSTITUTION when landed (TODOS).

**S11 Design (UI scope detected) — passed to Phase 2 for the 7-pass treatment.**

## Dual voices — consensus tables [single-reviewer mode]

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                            Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                    PASS     N/A     N/A
  2. Right problem to solve?            PASS     N/A     N/A
  3. Scope calibration correct?         PASS     N/A     N/A
  4. Alternatives sufficiently explored? PASS    N/A     N/A
  5. Competitive/market risks covered?  PASS     N/A     N/A
  6. 6-month trajectory sound?          PASS     N/A     N/A
═══════════════════════════════════════════════════════════════
Missing voice = N/A (not CONFIRMED). [single-reviewer: codex absent, no subagent tool]
```

## Dream state delta

After this plan: utilities self-sufficient for image+audio+short-clip video with
vault integration — roughly 70% of the 12-month hub vision. Remaining gap:
long-form video (hosting-gated), document conversion (deferred), MCP tool surface.

## Failure Modes Registry

```
CODEPATH            | FAILURE MODE              | RESCUED? | TEST? | USER SEES?      | LOGGED?
wasm instantiate    | WasmInitError             | Y | Y | banner + fallback | Y
worker convert      | ConvertError              | Y | Y | row error         | Y
worker protocol     | WorkerProtocolError       | Y | Y | row + restart     | Y
audio/video lazy    | CoreLoadError             | Y | Y | disable + retry   | Y
ffmpeg run          | FfmpegError/JobTimeout    | Y | Y | row error         | Y
save to vault       | VaultWriteError           | Y | Y | toast + download  | Y
queue overflow      | 200 cap                   | Y | Y | visible warning   | Y
```
CRITICAL GAPS: 0 (all rows rescued + tested + visible).

## Completion Summary

```
+====================================================================+
|            MEGA PLAN REVIEW — COMPLETION SUMMARY (Phase 1)         |
+====================================================================+
| Mode selected        | SELECTIVE EXPANSION (autoplan override)     |
| Step 0               | 4 premises valid; Approach A chosen (P1/P5) |
| Section 1  (Arch)    | 3 issues found → all auto-fixed in plan     |
| Section 2  (Errors)  | 8 error paths mapped, 0 GAPS                |
| Section 3  (Security)| 2 findings (dep pinning, parser vuln) — noted |
| Section 4  (Data/UX) | 11 edge cases mapped, 0 unhandled           |
| Section 5  (Quality) | 1 issue (ZIP DRY) → W6 accepted             |
| Section 6  (Tests)   | Diagram produced, artifact written (Phase 3)|
| Section 7  (Perf)    | 2 notes, 0 blockers                         |
| Section 8  (Observ)  | 1 accepted (analytics counters)             |
| Section 9  (Deploy)  | 0 new risks                                 |
| Section 10 (Future)  | Reversibility 4/5, 1 debt TODO              |
| Section 11 (Design)  | → Phase 2                                   |
+--------------------------------------------------------------------+
| Scope proposals      | 8 proposed, 4 accepted, 4 deferred          |
| Outside voice        | unavailable ([single-reviewer])             |
| Unresolved decisions | 0 (premise gate passed with amendment)      |
+====================================================================+
```

**PHASE 1 COMPLETE.** Consensus: 0/6 confirmed (single-reviewer mode), 0 disagreements.
Premise gate: PASSED — user confirmed premises with amendment (video in scope), P4 revised.

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|----------|
| 1 | CEO | Approach A (library rebuild) | Mechanical | P1 completeness, P5 explicit | only approach meeting the stated goal license-clean | B (AGPL), C (canvas-only) |
| 2 | CEO | Mode = SELECTIVE EXPANSION | Mechanical | autoplan override | per Phase 1 override rules | — |
| 3 | CEO | Worker cancellation added to W1 | Mechanical | P1 | navigation-away leak | none |
| 4 | CEO | Batch cap 200 | Mechanical | P1 | OOM guard | none |
| 5 | CEO | zipDownload util extraction (W6) | Mechanical | P4 DRY | 3rd duplicate | keep-dup |
| 6 | CEO | Video-via-server deferred | Taste | P3 | hosting decision needed | include now |
| 7 | CEO | MCP convert tool deferred | Taste | P3 | separate concern | include now |
| 8 | CEO | Export presets deferred | Taste | P5 | preset soup in v1 | include now |
| 9 | CEO | Auto-convert-on-import deferred | Taste | P3 | gallery blast radius | include now |
| 10 | CEO | Analytics counters (W5) | Mechanical | P1 | repo habit, cheap | none |
| 11 | CEO | Filename sanitization | Mechanical | P1 | path-separator injection | none |
| 12 | Gate | USER DECISION: video in scope | User | premise gate | "Confirm, but I want video" — P4 revised: single-thread core for short clips | defer video |
| 13 | CEO | Long-form video (>60s/1080p) deferred to TODOS | Mechanical | P3 | single-thread wasm impractical; hosting paths logged | include now |
| 14 | CEO | No COOP/COEP headers on server.ts in v1 | Taste | P5 explicit | prior decision at image-editor-engineering-plan.md:203 rejected headers for breaking cross-origin embeds; mt core is opt-in follow-up | add headers now |
| 15 | Design | Download-first, explicit Save to Vault | Taste | P5 trust | never silently write user's folder | auto-save default |
| 16 | Design | Global format default + per-row override | Mechanical | P3 | matches VERT, flexible | per-row only |
| 17 | Design | 4 a11y specs (keyboard, ARIA, targets, contrast) | Mechanical | P1 | plan had none | defer |
| 18 | Eng | E1: dedicated ffmpeg worker | Mechanical | P1+P5 | fixes no-freeze contradiction | main thread |
| 19 | Eng | E2: warm magick worker instance | Mechanical | P1 | amortize 1-2s init | per-job init |
| 20 | Eng | E3: video pre-check 500MB/10min | Mechanical | P1 | 2GB wasm ceiling | no pre-check |
| 21 | Eng | 24-test suite incl. 8 E2E candidates + T3 regression tests | Mechanical | P1 | coverage diagram gaps | happy-path only |
| 22 | DX | Phase 3.5 skipped — no dev-facing scope | Mechanical | skip condition | MCP tool out of scope; checked, not assumed | run DX review |
| 23 | Eng | Worktree lanes A/B/C (A: W6, B: W1→W2/W4→W3, C: W5) | Mechanical | P6 bias-to-action | parallelizable | single lane |

---

# PHASE 2 — DESIGN REVIEW (UI scope detected; designer binary degraded → layout specs)

Mockups: gstack designer requires OpenAI API key (not configured) → fallback to
concrete layout specs. Classifier: APP UI (workspace-driven, task-focused).

## Initial rating: 4/10 — plan described controls, not what the user SEES

## Pass 1 — Information Architecture (4→9/10)

```
┌─ CONVERTER PAGE ──────────────────────────────────────────────┐
│ ① DROP STRIP (top, full width, subtle)                        │
│    "DROP FILES OR CLICK TO BROWSE — images · audio · video"   │
│ ┌───────────────────────────────┐ ┌─────────────────────────┐ │
│ │ ② BATCH QUEUE (left, 60%)     │ │ ③ SETTINGS (right, 40%) │ │
│ │ row: [icon] name.ext          │ │ TARGET FORMAT            │ │
│ │   src-chip → dst-chip         │ │  [IMAGE] webp avif png…  │ │
│ │   ● status LED  ▓▓▓░░ 45%     │ │  [AUDIO] mp3 flac wav…   │ │
│ │ row …                         │ │  [VIDEO] mp4 webm gif    │ │
│ │ …                             │ │ QUALITY  ▬▬▬●▬▬ 80      │ │
│ │ [remove] per row on hover     │ │ NAMING  [prefix]-[n]     │ │
│ └───────────────────────────────┘ │ ☐ per-row override       │ │
│ ④ STATUS BAR (bottom)             │ [CONVERT ALL] (primary)  │ │
│    12/40 · elapsed · [CANCEL]     │ [SAVE TO VAULT] (second.)│ │
│                                   └─────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```
Hierarchy: queue (what's happening) → settings (what I control) → status bar
(am I done). Empty state = full-page drop target with warmth:
"DROP MEDIA TO CONVERT — nothing leaves this machine" (states the trust prop).

## Pass 2 — Interaction State Coverage (6→9/10)

```
FEATURE          | LOADING            | EMPTY              | ERROR              | SUCCESS          | PARTIAL
page mount       | "INITIALIZING ENGINE" in panel; page usable for queueing | drop-target empty state w/ primary hint | wasm fail: banner + canvas fallback for webp/png/jpeg | — | — |
queue row        | status LED pulse   | —                  | red LED + message + retry action | green LED + output size | — |
batch            | count + elapsed in status bar | —       | "N of M failed" summary row | "40 converted · ZIP ready" | mixed: ZIP contains succeeded only |
audio/video eng  | "LOADING ENGINE (~32MB, one time)" progress | — | fetch fail: section disabled + RETRY | — | — |
save to vault    | button spinner     | hidden if no vault | VaultWriteError toast + fallback download | toast "Saved to Vault/converted" | per-file failures listed |
```

## Pass 3 — User Journey (5→9/10)

```
STEP | USER DOES            | FEELS          | PLAN SPECIFIES
1    | opens Converter      | orientation    | consistent tool-mount transition + page title
2    | drops 30 files       | confidence     | instant rows, no modal, cap warning only at 200
3    | picks webp + quality | control        | smart defaults: source-matched target, 80 quality
4    | hits CONVERT ALL     | momentum       | live per-row LEDs; page never blocks
5    | batch finishes       | closure        | summary row + ZIP + SAVE TO VAULT one click
6    | leaves mid-batch     | no anxiety     | cancel + teardown; nothing silently continues
```
5-sec: drop strip communicates purpose instantly. 5-min: repeat batches keep settings.
5-year: converter becomes the reason to keep assets inside kollektiv.

## Pass 4 — AI Slop Risk (5→9/10)
Plan text said "drag-drop + file picker" (generic). Binding decisions: reuse
kollektiv's existing vocabulary — AnimatedPanels panelVariants + TerminalText
readouts, PanelLine borders, status LEDs (not generic SaaS spinners), uppercase
tracking-widest micro-labels per Header/Resizer precedent. No new visual language.
App-UI rules: utility copy ("12/40 converted"), no decorative gradients, cards only
where the card IS the interaction (queue rows). No emoji, no 3-col grids, no
centered-everything.

## Pass 5 — Design System Alignment (7→9/10)
No DESIGN.md in repo (flagged; /design-consultation remains an option, not a blocker).
Calibration source = tailwind.config.js (4 themes: MindTurbulence, Pip-Boy, Abyss,
Explorer) + ImageResizer/VideoToFrames component patterns. Rule: ConverterPage must
pass visual spot-check in ALL FOUR themes (Pip-Boy font-fixedsys constraint incl.).
New icons (format chips) go in components/icons.tsx per existing convention.

## Pass 6 — Responsive & Accessibility (2→9/10)
- Desktop-first (kollektiv requires FSA-capable browsers anyway); min supported 1024px.
  Below: settings panel stacks under queue (same breakpoint as ImageResizer's).
- Keyboard: queue rows focusable; Del removes row; Enter opens file; CONVERT ALL on
  Ctrl+Enter; full tab order through settings.
- ARIA: aria-live="polite" region announcing batch progress ("12 of 40 done");
  status LEDs have text equivalents (aria-label="done"); drop strip is a <button>.
- 44px min touch targets on row controls and buttons; contrast: verify LED colors
  ≥4.5:1 vs panel bg in Abyss (darkest) and Explorer (lightest-dark) themes.

## Pass 7 — Unresolved Design Decisions (all resolved)

| DECISION | CHOICE | Principle |
|---|---|---|
| Default destination of outputs | Download folder; SAVE TO VAULT is explicit (never silent writes to user's folder) | P5 explicit — trust |
| Target format: global vs per-row | Global default + optional per-row override checkbox | P3 pragmatic, matches VERT |
| Progress granularity | Per-file % + batch count; no byte-level noise | P5 subtraction |
| Format chips vs dropdowns | Grouped segmented picker (image/audio/video) | constraint worship |

## Design litmus scorecard [single-reviewer]

```
DESIGN DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                            Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Brand unmistakable first screen?  PASS     N/A     N/A
  2. One strong visual anchor?         PASS     N/A     N/A
  3. Scannable via headings only?      PASS     N/A     N/A
  4. Each section one job?             PASS     N/A     N/A
  5. Cards earn existence?             PASS     N/A     N/A
  6. Motion serves hierarchy?          PASS     N/A     N/A
  7. Premium without shadows?          PASS     N/A     N/A
═══════════════════════════════════════════════════════════════
[single-reviewer: codex absent, no subagent tool]
```

## Approved Mockups

None — designer binary unavailable (missing OpenAI API key). Layout specs in Pass 1
are the visual contract. Run `/design-review` post-implementation for visual QA.

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY (Phase 2)          |
+====================================================================+
| Step 0               | 4/10 initial, APP-UI classifier              |
| Pass 1  (Info Arch)  | 4 → 9  (layout diagram + hierarchy added)    |
| Pass 2  (States)     | 6 → 9  (full state table added)              |
| Pass 3  (Journey)    | 5 → 9  (storyboard added)                    |
| Pass 4  (AI Slop)    | 5 → 9  (bound to existing kollektiv vocabulary) |
| Pass 5  (Design Sys) | 7 → 9  (4-theme calibration rule)            |
| Pass 6  (Responsive) | 2 → 9  (a11y + responsive specs added)       |
| Pass 7  (Decisions)  | 4 resolved, 0 deferred                       |
+--------------------------------------------------------------------+
| Overall design score | 4/10 → 9/10                                  |
+====================================================================+
```

**PHASE 2 COMPLETE.** Consensus: 0/7 confirmed (single-reviewer), 0 disagreements.
Passing to Phase 3.

---

# PHASE 3 — ENG REVIEW (FULL_REVIEW, autoplan)

Voices: [single-reviewer] (codex not installed; no subagent tool in session).

## Step 0 — Scope challenge (verified against actual code)

Plan touches 6 shared files (types.ts, Header.tsx, App.tsx, commandRegistry,
assistantTools PAGES, TabTitleManager) + 6 new files. Below the >8-file smell
threshold for a new feature; nav-wiring list matches ARCHITECTURE_CONSTITUTION
"Navigation wiring" precedent (comfy_studio/a1111_studio addition). Minimum set
that achieves goal = W1+W3 (image converter + wiring); W2/W4/W5/W6 deferred-able
but all ≤1d CC — kept per P2 boil-lakes. Scope accepted.

Retro check: 9286b69 (image-editor M1+M2) shows canvas/worker-adjacent patterns
landed recently; no reverted converter work found. No prior review cycles to
re-litigate.

## Section 1 — Architecture (1 finding, auto-fixed)

ASCII dependency graph:

```
                    ┌────────────────────────────────────────────┐
                    │ Header.tsx utilityItems (+Converter)       │
                    └──────────────┬─────────────────────────────┘
                                   ▼
 App.tsx render switch ──▶ ConverterPage.tsx
                                   │
              ┌────────────────────┼──────────────────────┐
              ▼                    ▼                      ▼
   services/convert/      workers/convertWorker     services/convert/
   convertRegistry.ts     (magick-wasm; new)        audioVideoConverter.ts
   (capability matrix)          │                        │ (dedicated ffmpeg worker)
              ▼                   ▼                        ▼
   constants/converterFormats  /magick.wasm (static)  /ffmpeg/* (lazy, static)
              ▼
   utils/zipDownload.ts (W6, extracted) ── reused by ImageResizer + VideoToFrames
              ▼
   utils/fileUtils (Vault save) · useObjectUrls · galleryAnalytics
```

- Worker protocol (final): `{id, kind:'convert'|'cancel', file, target, opts}` →
  `{id, ok, blob?, progress?, error?}`; cancel kind added in Phase 1. Unmount →
  cancel all + terminate.
- **E1 [P1] (confidence: 9/10) vite.config.ts — `optimizeDeps.exclude:
  ['@ffmpeg/ffmpeg','@ffmpeg/util']` already exists from an earlier ffmpeg
  attempt, but the plan's W2 said "audio on main thread", contradicting its own
  success criterion "no page freeze >2s": ffmpeg.wasm encoding blocks whatever
  thread instantiates it.** Fix (auto-decided P1+P5): ffmpeg runs in its own
  dedicated worker (`audioVideoConverter` wraps worker, not main thread).
  Audio AND video both go through it. Existing vite exclude entry stays —
  it's compatible. Production failure scenario: tab repaint stalls 10s+ during
  flac→mp3 on main thread → user perceives app hang; dedicated worker removes it.
- Single magick worker (queue serial) is correct: instance init is expensive;
  parallelism via quality setting is a future knob, not v1.
- Rollback posture: git revert of an additive change + 6 nav touch points; no
  flags needed (new tab only appears with the feature).
- Distribution: wasm assets shipped via viteStaticCopy into dist; GH Pages static
  serving verified post-deploy (smoke: /magick.wasm 200 + MIME).

## Section 2 — Code quality (1 finding, accepted)

- ZIP-download duplication now 3× (ImageResizer, VideoToFrames, new page) →
  W6 extraction (accepted in Phase 1, reaffirmed).
- Naming: `audioVideoConverter` replaces plan's `audioConverter` (E1 fix).
- New worker file pattern should be recorded in
  docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md when landed
  (P3 TODO, proposed below).
- No over-engineering found: registry is a flat map, not a plugin system.

## Section 3 — Test review

Framework detected: Vitest (vitest config in vite.config.ts, 111 test files
detected) + Playwright (playwright.config.ts, e2e/).

```
CODE PATHS                                                USER FLOWS
services/convert/convertRegistry.ts                       [+] Batch image convert
 ├── capability lookup src→dst                            │  ├── [★★★ planned] unit: matrix truth table
 │    ├── [GAP→plan] unsupported pair → row error         │  ├── [GAP→plan][→E2E] 30-file happy batch
 │    └── [GAP→plan] unknown extension → reject row       │  └── [GAP→plan][→E2E] cancel at 25/50
workers/convertWorker.ts                                  [+] Audio/video convert
 ├── convert happy path                                   │  ├── [★★★ planned] unit: lazy-load state machine
 │    ├── [GAP→plan] WasmInitError → row error            │  ├── [GAP→plan] engine fetch fail → retry UI
 │    ├── [GAP→plan] cancel mid-job → AbortAck            │  └── [GAP→plan][→E2E] flac→mp3 no-freeze
 │    └── [GAP→plan] worker restart after crash           [+] Save to Vault
utils/converterNaming.ts                                  │  ├── [★★★ planned] unit: vault-disconnected
 ├── collision suffix                                     │  ├── [GAP→plan] manifest entry written
 │    └── [GAP→plan] sanitize (path seps, 200 chars)      │  └── [GAP→plan][→E2E] gallery shows converted
audioVideoConverter.ts                                    [+] ZIP download
 ├── lazy core load (idle/loading/ready/failed)           │  ├── [★★★ planned] unit: succeeded-only membership
 │    ├── [GAP→plan] fetch fail → failed state            │  └── [GAP→plan] naming collisions in zip
 │    └── [GAP→plan] terminate() on cancel                [+] Settings
ConverterPage.tsx                                         │  ├── [★★★ planned] unit: persistence round-trip
 ├── queue add/remove/cap/cancel                          │  └── [GAP→plan] default format applied
 │    ├── [GAP→plan] double-click CONVERT dedupe
 │    ├── [GAP→plan] unmount teardown
 │    └── [GAP→plan] theme snapshot (4 themes)
utils/zipDownload.ts
 ├── [GAP→plan] unit: blob assembly + revoke hygiene

COVERAGE: 0/24 implemented (feature unimplemented — 24 planned tests, 8 gaps
marked [→E2E] candidates for e2e/). All gaps have test specs added to plan §8.
```

Regression rule check: zipDownload extraction modifies existing ImageResizer +
VideoToFrames behavior → regression tests REQUIRED (no ask): existing ZIP
behavior test ports for both components must stay green.

Eval suites: no LLM/prompt changes → no evals.

## Section 4 — Performance (2 findings, auto-decided)

- **E2 [P2] (confidence: 8/10)** — magick-wasm worker: hold one instance alive
  across the batch (init cost ~1-2s amortized), not per-job. Auto-decided: keep
  warm worker per page mount.
- **E3 [P2] (confidence: 7/10)** — video via single-thread core: memory ceiling
  ~2GB for source + output buffers; pre-check rejects >500MB/>10min before
  queueing (already in failure table). Queue serial = peak memory = 1 job.

## Failure modes (critical gap assessment)

All rows in Phase 1 registry have error handling + tests planned + visible user
feedback. CRITICAL GAPS: 0.

## Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| W1 image path | workers/, services/convert/, components/ | — |
| W3 wiring | types.ts, components/ (Header, App), constants/, services/ | W1 (tab renders something) |
| W2 audio/video | services/convert/, workers/ | W1 (registry pattern) |
| W4 vault save | components/, utils/ | W1 |
| W5 settings | components/settings/, utils/ | — |
| W6 zipDownload | utils/, components/ (2 existing) | — |

Lane A: W6 (independent, touches existing components only)
Lane B: W1 → W2/W4 → W3 (sequential, shared services/+components/)
Lane C: W5 (independent)
Launch A + B + C in parallel; merge C and A first, B last (B has the wiring).
Conflict flag: B's W4 and C both touch components/ — coordinate or sequence W4 after W5 merge.

## Implementation Tasks (eng additions)

- [ ] **T1 (P1, human: ~2h / CC: ~15min)** — services/convert — dedicated ffmpeg worker (E1)
  - Surfaced by: Architecture Review — main-thread contradiction with no-freeze criterion
  - Files: services/convert/audioVideoConverter.ts, workers/ffmpegWorker.ts
  - Verify: flac→mp3 while dragging a panel — no frame drops
- [ ] **T2 (P2, human: ~1h / CC: ~10min)** — workers/convertWorker — warm instance reuse (E2)
  - Surfaced by: Performance Review — 1-2s init per job × 50 jobs
  - Files: workers/convertWorker.ts
  - Verify: second conversion in batch is <200ms to first progress
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — utils/ — zipDownload extraction regression tests
  - Surfaced by: Test Review — REGRESSION RULE (existing behavior modified)
  - Files: utils/zipDownload.ts, ImageResizer.test.tsx, VideoToFrames.test.tsx
  - Verify: pnpm test — existing ZIP behavior green
- [ ] **T4 (P2, human: ~2h / CC: ~20min)** — tests — 24 planned tests from coverage diagram
  - Surfaced by: Test Review — 8 [→E2E] candidates into e2e/
  - Files: utils/converterNaming.test.ts, services/convert/*.test.ts, components/ConverterPage.test.tsx, e2e/converter.spec.ts
  - Verify: pnpm test && pnpm test:e2e

## Completion summary

- Step 0: Scope accepted as-is (6 shared + 6 new files)
- Architecture Review: 1 issue found (E1, fixed in plan)
- Code Quality Review: 1 issue found (zipDownload, already W6)
- Test Review: diagram produced, 24 planned tests, 8 E2E candidates, 1 regression requirement
- Performance Review: 2 issues found (E2, E3 — fixed in plan)
- NOT in scope: written (§4)
- What already exists: written (§5)
- TODOS.md updates: 4 items → Final Gate
- Failure modes: 0 critical gaps
- Outside voice: unavailable ([single-reviewer])
- Parallelization: 3 lanes, 2 parallel-capable (A, C) / 1 sequential chain (B)
- Lake Score: 6/6 recommendations chose the complete option

## ENG DUAL VOICES — CONSENSUS TABLE

```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               PASS     N/A     N/A
  2. Test coverage sufficient?         PASS     N/A     N/A
  3. Performance risks addressed?      PASS     N/A     N/A
  4. Security threats covered?         PASS     N/A     N/A
  5. Error paths handled?              PASS     N/A     N/A
  6. Deployment risk manageable?       PASS     N/A     N/A
═══════════════════════════════════════════════════════════════
[single-reviewer: codex absent, no subagent tool]
```

**PHASE 3 COMPLETE.** Passing to Phase 3.5.

---

# PHASE 3.5 — DX REVIEW: SKIPPED (condition evaluated, not assumed)

Skip check performed: grepped plan for developer-facing terms (API, endpoint, CLI,
SDK, SKILL.md, agent) → 1 incidental match ("no new endpoints", a negative
statement). The product is a creator app; the only dev-facing surface in the plan
is the deferred `convert_file` MCP tool (explicitly out of scope, TODOS). AI agent
is not the primary user. Phase 3.5 skipped — no developer-facing scope in this
plan's deliverables.

---

# CROSS-PHASE THEMES

**Theme 1: ffmpeg thread placement** — flagged in Phase 1 (P4 deferral), reopened
by user gate, re-flagged in Phase 3 (E1 main-thread contradiction). High-confidence
signal from independent passes. Resolution: dedicated ffmpeg worker.

**Theme 2: worker lifecycle / cancellation** — flagged in Phase 1 (S1), Phase 2
(journey step 6: "no anxiety" on leaving mid-batch), Phase 3 (architecture + test
diagram). Resolution: cancel message + unmount teardown + restart-once policy.

**Theme 3: ZIP duplication** — flagged in Phase 1 (S5 DRY) and Phase 3 (S2).
Resolution: W6 zipDownload extraction + regression tests (T3).

---

# Deferred to TODOS.md (surfaced at Final Gate)

1. **Long-form video conversion paths** (P2) — COOP/COEP on server.ts for mt core,
   or vertd-style local helper using the user's own ffmpeg binary. Blocked by
   hosting decision + embed-compat testing. Note: image-editor-engineering-plan.md:203
   already rejected COOP/COEP once — re-litigating needs new evidence.
2. **`convert_file` assistant MCP tool** (P3) — thin wrapper on convertRegistry;
   needs mcp-config.json entry + kollektivMcp executor (ADD_NEW_TOOL.md workflow).
3. **Export presets** (P3) — web/social/broadcast bitrate targets.
4. **Auto-convert-on-import gallery action** (P3) — gallery blast radius.
5. **Document converter (pandoc-wasm)** (P3) — heavy; mammoth/pdfjs covers ingest.
6. **Record worker pattern in ARCHITECTURE_CONSTITUTION** (P2, docs) — do when
   landing W1.
7. **DESIGN.md** (P3) — repo has no design system doc; /design-consultation
   candidate, separate effort.
8. **AGPL hygiene note in CLAUDE.md** (P2) — one line: kollektiv is GPL-3.0, VERT
   is AGPL-3.0, converter feature uses libraries only, never port VERT source.
