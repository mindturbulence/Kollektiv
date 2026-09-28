# Video Editor

The `video_editor` tab is a browser-only, multi-track editor for cutting short-form video (reels, shorts) from media generated or collected in Kollektiv. Source: `video-editor/`. The original plan and research (`docs/plans/2026-09-26-video-editor-plan.md`) were deleted once implemented — read them in git history at commit `3bc6f65`; open items are in `docs/plans/TASKS.md`.

## Where it came from

Before this, the "Video Editor" was a 368-line trim tool inside `VideoToFrames.tsx`, and it had been removed from the nav. This editor is new code. It takes selected leaf modules from two MIT-licensed browser editors, **openreel-video** (`5f3c85e`) and **FreeCut** (`4d62e80`). Neither was adopted wholesale: measured import closures were 81k lines (openreel core) and 159k lines (FreeCut runtime), and both need `COEP: require-corp`, which would break the Home montage, YouTube embeds and remote images.

Every ported file starts with `// Ported from <repo>@<sha> <path> — MIT, (c) <holder>`. `video-editor/THIRD_PARTY.md` holds both MIT notices and the list of ported files. No VERT (AGPL) code is used.

## Architecture

The editor follows the image editor's pattern: a framework-free core plus a React UI.

```
video-editor/
  core/
    types.ts         shared contract: Project/Track/Clip/Keyframe/Effect/Transition, EditAction, module interfaces
    store.ts         module-scoped store (getSnapshot/subscribe/dispatch), read via useSyncExternalStore — no zustand
    actions/apply.ts applyEdit(project, action) → { project, inverse }; pure; inverses are snapshots
    history/         bounded undo/redo of (action, inverse) pairs
    timeline/        pure edit math: snapping, placement, razor-snap, slip, slide (FreeCut ports)
    media/           MediaEngine on mediabunny: probe, frame decode, audio decode, thumbnails, waveforms
    playback/        compositor (layers at time t), rAF + AudioContext clock, WebAudio mixer, keyframe evaluation
    render/          Canvas2D renderer (the one used for preview and export), frame cache, CPU pixel effects
    engines/         speed, color grading, chroma key (openreel ports, pure ImageData functions)
    gpu/             WebGPU renderer + FreeCut WGSL effects/transitions/scopes (not the default renderer)
    effect-params.ts codec for structured effects (colorGrade → params.value JSON; chromaKey → flat scalars)
    export/          WebCodecs export via mediabunny, ffmpeg.wasm fallback, OfflineAudioContext mixdown
    captions/        SRT parse/serialize ↔ text clips
    autosave/        IndexedDB 'kollektiv-video-editor' (projects + media blobs), reference-counted media GC
  ui/                page, toolbar, media bin, preview, inspector, timeline, color, keyframes, captions, projects
  bridge/            openInVideoEditor(files) — used by the Assets Manager
```

Key rules:

- **Every edit is an `EditAction`** dispatched to the store. `applyEdit` returns the same project reference for a no-op, so the store records no history entry. Moves onto occupied ranges are rejected, and locked tracks reject clip edits. A seeded property test checks that apply → inverse returns a deep-equal project.
- **UI drags commit once, on release.** A drag, trim, slip or slide is one undo step, and slider drafts commit on release or blur. The Inspector body is keyed by clip id, so switching clips drops a pending draft instead of committing it onto the new clip.
- **Keyframed properties.** Transform x, y, scale, rotation and opacity, plus volume. Once a property has keyframes, changing its slider writes a keyframe at the playhead. `evaluateVolume` includes fades; the Inspector reads `evaluateVolumeLevel` (without fades), so a fade never gets baked into the base level.
- **Renderer.** The preview and export both use the **Canvas2D** renderer. `createPreferredRenderer()` (WebGPU with a Canvas2D fallback) exists, but it isn't the default: no GPU-only effect is exposed yet, and it hasn't been run on a real GPU.
- **Routing.** The page loads through `React.lazy`, so it doesn't add to the entry chunk. Integration points: the `ActiveTab` value `video_editor`, `NAV_GROUPS` in the header, `routeFx.ts`, and three switch points in `App.tsx`.

## Browser requirements

WebCodecs decode and encode (Chromium). If the browser has no `VideoEncoder`, export falls back to ffmpeg.wasm. **No COOP/COEP headers are needed.** None of the ported code uses SharedArrayBuffer, and ffmpeg runs the single-thread core. The editor makes **zero third-party requests** (`e2e/video-editor-network.spec.ts`).

## Export

- **Primary path (WebCodecs):** mediabunny `Output` with `CanvasSource` and `AudioBufferSource`. MP4 uses H.264/AAC; WebM uses VP9 or VP8 with Opus, chosen with `canEncode*`.
- **Fallback (no `VideoEncoder`):** JPEG frames plus a WAV mixdown go to the `encodeFrames` job in `workers/ffmpegWorker.ts`, through the same serial queue, watchdog and cancel policy as the Converter. MP4 uses x264 `ultrafast` + AAC. **WebM uses VP8 + Vorbis.**

> **ffmpeg.wasm codec limits (`@ffmpeg/core` 0.12.10):** `libvpx-vp9` (with any input) and `libopus` with **stereo** input abort with `RuntimeError: memory access out of bounds`. `libvpx` (VP8), `libvorbis`, mono `libopus`, `libx264` and `aac` work. The Converter's video→WebM target used VP9 + Opus and was broken until 2026-09-28. Check any codec change with a real run: unit tests mock ffmpeg. For a fast repro, run the core in Node. Import `ffmpeg-core.js` after setting `globalThis.self = globalThis` and `globalThis.location = { href }`, pass `wasmBinary`, then call `core.exec(...)`. That takes seconds instead of an 8-minute Playwright run.

## Testing

- **Unit:** `npx vitest run video-editor` (42 test files). The riskiest logic has the densest coverage: `actions/apply` (property round-trips), `timeline/*`, `export/*` (timing, codecs, WAV, audio mix), `autosave` (debounce, flush-on-stop, save race, GC).
- **E2E** (the Canvas2D preview is read through a 2D context):
  - `video-editor.spec.ts`: import two clips and a still, preview, export 1080p MP4 (H.264/AAC) and WebM, verify frame accuracy with ffprobe, then reload and Resume from autosave.
  - `video-editor-fallback.spec.ts`: with `VideoEncoder`/`AudioEncoder` deleted, export MP4 (H.264/AAC) and WebM (VP8/Vorbis) through ffmpeg.wasm. The spec fails fast with the app's own "Export failed" message.
  - `video-editor-network.spec.ts`: fails on any third-party request the editor causes. App-shell requests (fonts, Footer ticker, Pexels montage, the YouTube overlay) are attributed and allow-listed.
- **E2E gotchas:** Playwright wipes `test-results/` at the start of every run, so keep fixtures in `e2e/fixtures/video/`. The boot-gate helper clicks with a 5 s timeout, because gate screens swap mid-click and an unbounded click stalls the retry loop. Idle standby is disabled via `kollektivSettingsV4 { isIdleEnabled: false }`.

## Known open items

- Make WebGPU the preview renderer, after a check on a real GPU (deferred by the 2026-09-28 Jev triage, confidence 0.93).
- Media GC runs only on project delete. There is no background sweep.
- The network audit's `youtube-nocookie.com` request is the app shell's ambient music (the "Hidden Audio Engine" in `App.tsx`), which the e2e boot helper turns on by clicking CONTINUE rather than CONTINUE WITHOUT MUSIC. Intended behaviour, not editor code.

## Related

- [ARCHITECTURE_CONSTITUTION.md § Web Worker pattern](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#web-worker-pattern-established-by-the-converter-feature): the ffmpeg worker conventions the export fallback follows
- `docs/plans/2026-09-26-video-editor-plan.md` (in git history at commit `3bc6f65`): research, measured closures, Jev feature triage, phase status
