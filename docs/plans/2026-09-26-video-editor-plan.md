# Video Editor — research and plan (freecut × openreel)

Status: PLAN, not started. No code written.
Date: 2026-09-26.
Research clones: `test-results/video-research/{freecut,openreel}` (git-ignored, shallow).
Measurement scripts: `test-results/video-research/closure.mjs`, `harvest.mjs`, `jev-score.mjs`.

## 0. Framing correction: nothing to resurrect

Kollektiv never had a full video editor. The "Video Editor" nav entry (commit `9edb6ac`) was a 368-line trim tool inside `components/VideoToFrames.tsx`: trim start/end state, a drag timeline, and ffmpeg `-ss`/`-t`. Commit `9f14f42` ("Video Page Revised") removed the nav entry, and the trim UI has since gone from the file. What exists today is `VideoToFrames.tsx` (frame extraction and join, 724 lines), `workers/ffmpegWorker.ts` (serial single-thread ffmpeg.wasm queue) and `services/convert/audioVideoConverter.ts`.

So this is a new build, not a restore, and it should be scoped and priced that way.

## 1. Main concern

Neither repo can be "implemented" into Kollektiv. Both are full applications, and even their smallest editor cores pull in most of the app. I measured this with esbuild metafile closures, with npm dependencies left external:

| What was imported | Lines pulled in | Files | Drags in |
|---|---|---|---|
| **openreel** minimal core (types, timeline, actions, video-engine, playback, export, media) | **81,252** | 200 | `motion/` 23.9k, `creation/`, `ai/`, three.js, `@paper-design/shaders`, `https:` imports |
| **freecut** composition runtime plus timeline items store | **159,027** | 684 | dopesheet editor, Radix UI, i18next, zustand, zundo, sonner, lucide, lottie, onnxruntime |

Total repo sizes are about 500k TS lines for freecut (`src/features` alone is 384k) and about 440k for openreel (`apps/web` 174k, `packages/core` 155k).

Why the openreel core balloons, verified: `video/video-engine.ts:66-86` imports `ai/background-removal-engine`, `ai/person-segmentation-engine`, `motion/motion-renderer`, `motion/motion-gpu-render` and `creation/render-binding`. `actions/action-executor.ts:41-48` imports `motion/` shaders. The engine is React-free (0 React imports in `packages/core/src`), but it is not modular.

## 2. Weakest assumption

The weakest assumption is "pick the best features of both and wire them together." The two engines use incompatible models:

- **freecut** uses zustand stores, a React composition runtime (`src/runtime/composition-runtime`, 59 files import React), and a WebGPU effects pipeline with its own `types/effects`.
- **openreel** uses a framework-free engine with a `Renderer` interface (`video/renderer-factory.ts`), an action executor, and its own `Effect` type.

"Best of both" therefore can't mean merging two engines. It has to mean one thin engine written for Kollektiv, plus leaf modules from each repo that don't depend on either engine's core.

## 3. Strongest counterargument

"Just embed freecut whole, for example as its own route or iframe. You'd get a mature pro NLE on day one." This is a serious argument. freecut has 669 test files versus openreel's 325, ships weekly (its CHANGELOG has weekly CalVer entries through 2026-07-20), and has much deeper NLE tooling. It fails in Kollektiv for four verified reasons:

1. **Cross-origin isolation.** Both repos serve `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` (freecut `vite.config.ts:109-120` and `vercel.json`; openreel `apps/web/vite.config.ts:65-72` and `public/_headers`). Applied to Kollektiv, `require-corp` breaks cross-origin images, YouTube embeds and the home montage. Keeping the home montage is a deliberate user decision. The embedded app would need its own document and origin policy.
2. **Chromium only.** freecut's README requires WebGPU, WebCodecs, OPFS and the File System Access API.
3. **A second design system and state stack.** Radix, lucide, i18next and zustand would sit inside a daisyUI app that has no zustand.
4. **Divergence.** It's 500k lines we'd never merge upstream again.

If the goal ever becomes "maximum features, minimum effort, visual consistency doesn't matter," a sandboxed freecut deployment linked from Kollektiv is the honest option. It is not integration, though.

## 4. What was verified (evidence)

**Licenses:**
- freecut is MIT (`LICENSE`, © 2025 FreeCut) and openreel is MIT (© 2024-2026 Augustus Otu). Both are GPL-3.0-compatible as long as the MIT notice is kept in every ported file.
- The `mediabunny` dependency is **MPL-2.0** (npm, v1.60.0), which is fine as a dependency.
- soundtouchjs is LGPL-2.1, which is fine as a dependency; do not vendor it.
- kokoro-js and `@paper-design/shaders` are Apache-2.0.

**Harvestable leaf modules.** These have small closures and no npm dependencies unless noted. Measured with `harvest.mjs`:

| Repo | Module | Closure lines | Use |
|---|---|---|---|
| openreel | `video/canvas2d-fallback-renderer` | 249 | Canvas2D compositor, the baseline renderer |
| openreel | `video/frame-cache` | 310 | LRU frame cache |
| openreel | `actions/action-history` | 414 | undo/redo stack |
| openreel | `actions/inverse-action-generator` | 970 | undo inverses (types only; adapt to our action set) |
| openreel | `export/webcodecs-backend` | 539 | WebCodecs encode |
| openreel | `media/mediabunny-engine` | 1,248 (+mediabunny) | decode, demux and mux |
| openreel | `media/waveform-generator` | 1,599 (+mediabunny) | audio waveforms |
| openreel | `video/keyframe-engine` | 1,323 | keyframe interpolation and easing |
| openreel | `video/transition-engine` | 1,600 | crossfade, dip, wipe, slide |
| openreel | `video/speed-engine` | 1,272 | speed and freeze frames |
| openreel | `video/color-grading-engine` | 963 | wheels, HSL, curves |
| openreel | `video/chroma-key-engine` | 427 | chroma key |
| freecut | `features/timeline/utils/razor-snap` | 92 | razor snapping |
| freecut | `features/timeline/utils/slip-utils` | 35 | slip edit math |
| freecut | `features/timeline/utils/slide-utils` | 464 | slide edit math |
| freecut | `infrastructure/gpu-effects` | 9,039 | WGSL effect library: blur, color, LUT, distort, stylize, keying |
| freecut | `infrastructure/gpu-transitions` | 2,507 | WebGPU transitions |
| freecut | `infrastructure/gpu-scopes` | 1,395 | waveform, vectorscope and histogram scopes |
| freecut | `infrastructure/gpu-compositor` | 1,440 | WebGPU compositor (a v2 candidate for the renderer) |

Closure counts measure runtime code only, because esbuild drops `import type`. Type-only references such as `GPUTexture` in the `Renderer` interface are caught by Phase 0 criterion 1.

**Renderer backends** (grep for `createShaderModule`/`GPUDevice` versus `getContext('2d')`/`ImageData`/`drawImage`): openreel `transition-engine`, `keyframe-engine`, `speed-engine`, `color-grading-engine` and `chroma-key-engine` have zero WebGPU calls. transition, color and chroma draw with Canvas2D (55, 13 and 16 hits). They fit the v1 Canvas2D renderer as they are.

**Patches:** openreel's `patches/` only adds `package.json` export entries to `@ffmpeg/core` and `@ffmpeg/core-mt` 0.12.6. Nothing patches mediabunny. The root `mediabunny.d.ts` is a copy of mediabunny's type declarations. So the mediabunny harvest runs against stock mediabunny. Only version drift remains (see risks).

**Not harvestable** because of engine drag: openreel `export/export-engine` (62,309 lines), `timeline/clip-manager` (17,779), `timeline/track-manager` (17,354), `text/index` (9,235) and `audio/index` (11,799). Write these ourselves, small.

**No cross-origin isolation needed for this path:**
- None of the harvested modules use SharedArrayBuffer. A grep found SharedArrayBuffer/`crossOriginIsolated` only in openreel `video/stabilization/vidstab-engine.ts` (not harvested) and none in freecut `src`.
- WebCodecs, WebGPU and mediabunny don't require isolation.
- Kollektiv's existing ffmpeg core is single-thread (ARCHITECTURE_CONSTITUTION §wasm).
- **Decision: no COOP/COEP headers.** The home montage, YouTube embeds and remote images stay unaffected.

**External URLs that must not come along.** These violate local-first:
- openreel `media/ffmpeg-fallback.ts:3` uses unpkg for the ffmpeg core. Replace with the existing `workers/ffmpegWorker.ts`.
- `video/stabilization/vidstab-engine.ts:26-27` uses openreel's own host. Not ported.
- `ai/person-segmentation-worker.ts:16-22` uses googleapis, unpkg and jsdelivr. Not ported.
- `multicam/silero-vad.ts:7` uses jsdelivr. Not ported.
- openreel `apps/web/src/hooks/useAnalytics.ts` sends PostHog telemetry. Take nothing from `apps/web`.

**Repo health:**
- openreel is v0.1.2 "Beta" with a last commit on 2026-08-29. Its repo root contains `test.md`, an unrelated client payment plan (for "BigShots", a golf app), which says something about its hygiene. It has 0 TODO/FIXME comments.
- freecut's last commit is 2026-08-07, with weekly releases and 3 TODO/FIXME comments.
- Upstream strategy: vendor a snapshot and pin the commit SHA in each file header next to the MIT notice. We won't track upstream.

## 5. Jev feature triage

Jev (`typesafe/jev-1.13`) scored 23 features on two things: when each should ship (0 = skip, 1 = later, 2 = v2, 3 = v1) and what it would cost (0 = days, 1 = 1-2 weeks, 2 = several weeks, 3 = months).

**Caveat:** Jev saw only one-line public feature descriptions and a one-line generic app description. It never saw either codebase or any Kollektiv source. Its cost scores are priors, and the measured closures above override them.

Following the Jev skill thresholds, a confidence below 0.6 counts as uncertain and I made the call myself. That applied to 22 of the 23 priority answers.

| Feature | Jev priority (conf) | Jev cost (conf) | Decision | Decided by |
|---|---|---|---|---|
| multi-track timeline | 2.13 (0.52) | 2.60 (0.60) | **v1** | Claude (prio) · Jev (cost) |
| undo/redo | 2.23 (0.23) | 1.92 (0.76) | **v1** | Claude · Jev |
| preview playback | 2.31 (0.31) | 1.93 (0.79) | **v1** | Claude · Jev |
| WebCodecs export | 2.04 (0.45) | 1.80 (0.76) | **v1** | Claude · Jev |
| ffmpeg export fallback | 2.48 (0.48) | 1.03 (0.67) | **v1** (reuse existing worker) | Claude · Jev |
| basic transitions | 2.27 (0.45) | 1.08 (0.69) | **v1** | Claude · Jev |
| audio mixing (volume, fades, waveforms) | 2.31 (0.46) | 1.69 (0.66) | **v1** | Claude · Jev |
| text/titles | 2.10 (0.53) | 1.52 (0.51) | **v1**, static titles only | Claude · Claude |
| speed control | 2.49 (0.49) | 1.36 (0.53) | v2 | Claude · Claude |
| basic keyframes | 1.60 (0.47) | 1.39 (0.54) | v2 | Claude · Claude |
| captions (SRT and karaoke) | 1.78 (0.58) | 1.79 (0.76) | v2 (SRT first; transcription later) | Claude · Jev |
| color grading and scopes | 1.63 (0.49) | 2.24 (0.68) | v2 | Claude · Jev |
| GPU effects library | 1.62 (0.49) | 2.28 (0.67) | v2 (needs an adapter, see §7) | Claude · Jev |
| nested sequences | 1.60 (0.51) | 2.19 (0.75) | later | Claude · Jev |
| masks and pen | 1.50 (0.42) | 2.20 (0.73) | later | Claude · Jev |
| pro trim tools (ripple, roll, slip, slide) | 1.44 (0.34) | 2.72 (0.72) | ripple and razor in v1; slip and slide in v2 (freecut utils are 35-464 lines) | Claude · measured |
| audio FX suite | 1.70 (0.53) | 2.34 (0.62) | later | Claude · Jev |
| local AI generation in the editor | 1.45 (0.35) | 2.48 (0.48) | skip; Kollektiv already generates, so bridge its assets instead | Claude · Claude |
| screen recording | 1.55 (0.37) | 1.28 (0.59) | skip | Claude · Claude |
| graph editor and dopesheet | 1.00 (0.54) | 2.83 (0.83) | skip for now | Claude · Jev |
| Lottie import | 1.16 (**0.63**) | 1.62 (0.58) | later | **Jev** · Claude |
| proxies and ProRes | 1.08 (0.52) | 2.14 (0.66) | skip | Claude · Jev |
| multicam and stabilization | 1.20 (0.56) | 2.30 (0.64) | skip (stabilization needs SharedArrayBuffer plus a CDN) | Claude · Jev |

Jev run: 23 requests, $0.000481 total, 18.7 s summed latency (run in parallel).

## 6. What to verify before committing (Phase 0 spike, 2-3 days)

Exit criteria. All four must pass, or we stop and re-plan:
1. The harvested openreel modules (`mediabunny-engine`, `canvas2d-fallback-renderer`, `webcodecs-backend`, `frame-cache`) compile under Kollektiv's `tsc --noEmit` with no `as any`, and run against one pinned, unpatched mediabunny version. Run their upstream tests: install openreel with `pnpm install`, then `pnpm --filter @openreel/core test:run` limited to those files.
2. A three-clip timeline (two videos and one image) previews at the project frame rate and exports a playable MP4 inside Kollektiv's dev server (`pnpm dev`, `server.ts`) **with no COOP/COEP headers**.
3. The export falls back to `workers/ffmpegWorker.ts` when `VideoEncoder` is undefined (simulate by deleting the global in a test).
4. The first open of the editor makes zero network requests to third-party hosts.

## 7. The better version: a thin Kollektiv-native engine plus harvested leaves

**Architecture**, following the image editor's proven pattern (`image-editor/core/store.ts`):

```
video-editor/
  core/
    types.ts           Project, Track, Clip, Transition, Effect (our own small model, openreel types as reference)
    store.ts           module-scoped store, getSnapshot/subscribe/dispatch, React via useSyncExternalStore; no zustand
    actions/           typed edit actions (add/move/trim/split/ripple-delete/...) plus inverses (adapted from openreel inverse-action-generator)
    history/           action-history (openreel, 414 lines)
    timeline/          placement, snapping (freecut razor-snap), ripple; slip/slide in v2 (freecut utils)
    media/             mediabunny-engine (openreel) for decode, demux and mux; waveform-generator (openreel)
    render/            Renderer interface; canvas2d-fallback-renderer (openreel) as v1 baseline; freecut gpu-compositor in v2
    playback/          clock plus frame-cache (openreel); WebAudio mix graph (new, small)
    transitions/       transition-engine (openreel) in v1; freecut gpu-transitions in v2
    export/            webcodecs-backend (openreel) plus our own small export loop; ffmpeg fallback via workers/ffmpegWorker.ts
    autosave/          IDB, same approach as image-editor/core/autosave
  ui/
    VideoEditorPage.tsx, Timeline.tsx, Preview.tsx, Inspector.tsx, MediaBin.tsx  (daisyUI and Kollektiv tokens)
```

**Kollektiv integration points** (verified locations):
- `types.ts:79` gets a new `ActiveTab` member, `video_editor`.
- The nav list gets an entry at `components/Header.tsx:155`.
- The route FX table in `components/transitions/routeFx.ts:21,44` needs the new tab.
- `components/App.tsx` has three `image_editor` switch points to mirror: payload reset at :160, window title at :190, and the page switch at :435. The page switch adds the editor with **`React.lazy`**. App.tsx has no `lazy(` today, and the techstack review flags a 4 MB entry chunk, so the editor must not add to it.
- **The differentiator:** a bridge from the Assets Manager, the Gallery and the image editor (`image-editor/ui/GalleryBridge.ts`) that sends AI-generated images and clips straight to the timeline. Neither upstream has this.
- `VideoToFrames.tsx` stays as is. Its "join" tab becomes redundant after v1, so revisit it then.

**Provenance rule:** every ported file starts with `// Ported from <repo>@<sha> <path> — MIT, (c) <holder>`, and a `video-editor/THIRD_PARTY.md` lists them. A ported file is not "done" until its upstream tests are ported too.

**Phases:**

| Phase | Scope | Size |
|---|---|---|
| 0 | Spike and exit criteria (§6) | 2-3 days |
| 1 (v1) | Model, store, actions and undo; tracks and clips with move, trim, split, ripple-delete and razor snap; Canvas2D preview; WebAudio volume and fades; waveforms; crossfade, dip and wipe transitions; static text titles; MP4/WebM export (WebCodecs with ffmpeg fallback); IDB autosave; asset bridge; keyboard shortcuts | ~4-6 weeks |
| 2 (v2) | Keyframes (openreel keyframe-engine); speed (openreel speed-engine); SRT captions; slip and slide; WebGPU renderer path, then an **adapter** from freecut gpu-effects/gpu-transitions to our `Effect` model (budgeted separately, ~1-2 weeks on its own); color grading (openreel engine) plus freecut scopes | ~5-7 weeks |
| later | Nested sequences, masks, audio FX, Lottie, transcription (check what the voice pipeline already provides first) | as demanded |

These sizes are my estimates for one developer. They are not measured, and the Jev cost priors above point the same way.

**Risks, most likely first:**
1. **Scope creep toward "fully fledged."** v1 is deliberately a shorts/reels cutter. Everything else waits for actual use of v1.
2. **mediabunny API drift.** openreel's code targets `^1.25.3`, freecut pins `1.50.8`, and the latest is 1.60.0. Pin one version and fix the ported engine to it in Phase 0.
3. **Firefox and Safari.** WebCodecs encoders vary by browser. Canvas2D preview plus the ffmpeg fallback covers the floor. A WebGPU-only path would not.
4. **Memory.** Long 4K timelines are a problem with Canvas2D and ImageBitmap caches. Cap the frame-cache and document the limit rather than building proxies.

## 8. Final recommendation

**Verdict: workable with changes. Confidence is medium-high on the direction and medium on the sizing.**

- Don't implement either repo. The measured closures (81k and 159k lines) and the COEP/`require-corp` conflict rule out wholesale adoption.
- Build a thin Kollektiv-native engine on mediabunny, WebCodecs and Canvas2D, shaped like the image editor.
- Take **openreel's framework-free leaf engines** (decode, Canvas2D render, WebCodecs encode, history, transitions, keyframes, speed, color).
- Take **freecut's timeline edit math and WebGPU effect, transition and scope libraries**.
- The sharpest remaining tradeoff is that we give up freecut's pro NLE depth (source monitor, 2-up/4-up trim panels, dopesheet) in exchange for a coherent, maintainable editor that fits Kollektiv. If pro depth matters more than coherence, the only honest alternative is freecut deployed standalone on its own origin, linked from Kollektiv.

Next step: run Phase 0 and report its four exit criteria before any v1 code.
