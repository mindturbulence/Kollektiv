# Kollektiv Image Editor — Technical Architecture Plan

> Source: Compositor (MIT), https://github.com/robbietilton/Compositor  
> Generated: 2026-09-22  
> Status: Planning — no code written

## 0. Grounding Summary

Verified against the live repository (`D:/AI-Dev/Kollektiv-Dev`) this session:

- **Stack**: React 19.1.1, TypeScript 5.4.5, Vite 5.2.11, Tailwind 3.4.3, DaisyUI 4.12.10, GSAP 3.12.5, `idb` 8.0.0 (IndexedDB wrapper), Vitest 3.2.7, `@playwright/test` 1.61.1.
- **Routing**: `types.ts` defines `ActiveTab` as a flat string union (20 values currently; no `image_editor` yet). `App.tsx` renders via a `switch(activeTab)`. No React Router; no code-splitting today.
- **Gallery persistence**: `addItemToGallery(type, urls[], sources[], categoryIdOrOptions?, defaultTitle?, tags?, notes?, prompt?, isNsfw?): Promise<GalleryItem>` (`utils/galleryStorage.ts:174`). The 4th parameter accepts **either** a `categoryId` string **or** an `AddItemOptions` bag (`:163`) — and the options bag carries `generationId`, which the positional form cannot. It `fetch`es each URL and persists the bytes, so blob URLs may be revoked immediately after the call resolves. **It also re-encodes images to JPEG when the storage provider's conversion flag is set** (defaults: `storageProvider: 'local'`, `convertImageToJpgLocal: false`, `convertImageToJpgDrive: true` — `utils/settingsStorage.ts:92,97-98`). See §7.
- **Existing canvas precedent**: `ComposerPage.tsx` is DOM-transform collage, not a pixel editor. Confirms export convention (`canvas.toDataURL`/`toBlob` → `addItemToGallery`) but contributes no reusable pixel/blend/undo engine.
- **WASM precedent**: `viteStaticCopy` copies `.wasm` to dist and no `vite-plugin-wasm` is used — but the copied rnnoise binary is located by `simple-rnnoise-wasm` internally (`services/noiseCancellation.ts:47`), *not* by any URL written in this repo. There is therefore no in-repo precedent for resolving a `.wasm` URL at runtime, and `vite.config.ts:13` sets `base: '/'` against a `/Kollektiv/` Pages deploy. See §4.
- **No existing canvas library** (no Fabric.js, PixiJS, Konva) — every option below is net-new dependency.

---

## 1. Architecture Decision: Rendering Approach

### Option A — Fabric.js v6 + PixiJS v8 hybrid

**Pros**: Fabric's object model covers transform gizmos, selection handles, serialization. PixiJS GPU filters cover adjustments and blend-mode compositing.

**Cons**: Two independent scene graphs that must stay in sync every frame — no first-party bridge, bespoke integration, dominant source of bugs. Bundle: ~450–520 KB gzipped added on top of an already-heavy bundle. Fabric is vector-first; Compositor/this editor is raster-first — Fabric's ImageObject fights the use case.

**Risk**: **High** — M1/M2 dominated by desync debugging rather than tool features.

### Option B — Custom Canvas2D + WebGL2 for manual blend modes ✅ CHOSEN

**Pros**: Single mental model. Layers are plain data; one `CanvasRenderer` owns all draw calls. Exact control over masks, hit-testing, manual blend-mode shaders. Zero scene-graph dependency (only small helpers like `earcut` ~5 KB for lasso polygon fill). Matches Kollektiv's existing idiom (`ComposerPage.tsx` = hand-rolled canvas + React state). Keeps bundle size minimal.

**Cons**: No off-the-shelf transform gizmos or serialization. Higher front-loaded M1/M2 investment; each subsequent milestone is fully additive.

**Risk**: **Medium** — front-loaded, but no adapter-layer debt, every decision traceable to a spec.

### Option C — Pure PixiJS v8 scene graph

**Cons**: Display/game graph — no selection, mask-painting, or undo primitives. Raster pixel access via `renderer.extract.pixels()` is async/expensive. Pays ~300 KB bundle cost without covering the tools that are 80% of the feature list. **Not chosen.**

### Decision: **Option B**

Compositor's feature set is dominated by raster pixel manipulation. Every option still requires bespoke selection engine, brush engine, and history manager. Option B buys the most value (full control over the raster pipeline) with the least integration risk, matches the codebase's existing idiom, and minimizes bundle growth.

---

## 2. Module Breakdown

**State-container decision (resolves a contradiction between the two plans).** This document previously specified Zustand; the frontend plan specifies page-scoped React context and "no new dependency." Neither is right. Zustand is not installed (verified against `package.json`) and buys nothing this design uses. React context is the wrong shape: the renderer must read store state inside a `pointermove` loop at 120Hz, and context propagation re-renders the React tree on every sample.

**Chosen**: one plain module-scoped store object exposing `getSnapshot()` / `subscribe(fn)`. `CanvasRenderer` subscribes imperatively (no React involvement in the paint loop). React panels read it through `useSyncExternalStore` — React 19 built-in, zero dependencies. Update the frontend plan's §2 "State ownership" paragraph to match.

All modules live under `image-editor/` (sibling to `components/`, `utils/`, `services/`), split into `image-editor/core/` (framework-agnostic engine, no React imports) and `image-editor/ui/` (React components + hooks).

| Module | Path | Responsibility |
|---|---|---|
| **EditorStore** | `core/store.ts` (plain store + `useSyncExternalStore`) | Single source of truth: `Document`, active layer/selection IDs, tool state, viewport (zoom/pan). All mutations dispatch through here. |
| **CanvasRenderer** | `core/renderer/CanvasRenderer.ts` | Owns the visible `<canvas>` (Canvas2D main compositor) + offscreen WebGL2 context for manual blend modes and mask passes. Subscribes to `EditorStore`, re-composites via `requestAnimationFrame`-batched dirty-rect invalidation (not full-canvas redraw every keystroke). |
| **LayerManager** | `core/layers/LayerManager.ts` | CRUD on `Document.layers` tree: add/delete/duplicate/reorder/group/rename, opacity/blend/visibility. Pure data ops dispatched through `EditorStore`. |
| **SelectionEngine** | `core/selection/SelectionEngine.ts` | Marquee (rect/ellipse), Lasso (freehand polygon via `earcut`), Magic Wand (flood-fill by color-distance over raw pixel buffer, run in `select.worker.ts`). Produces `Selection` consumed by all tools to clip their effect. |
| **BrushEngine** | `core/paint/BrushEngine.ts` + `core/paint/brush.worker.ts` | Freehand pixel painting (Brush/Erase) with pressure (Pointer Events) and stroke smoothing (Catmull-Rom interpolation). Pixel writes run on `OffscreenCanvas` transferred to Worker. Also hosts Clone Stamp and approximated Spot Healing (V2). |
| **AdjustmentEngine** | `core/adjust/AdjustmentEngine.ts` | Two-tier: live-preview via WebGL2 shader uniforms (GPU, 60fps slider drag), committed per-pixel pass on release/apply. The commit backend is **TypeScript-in-worker first, WASM only if profiling demands it** (§4) — `AdjustmentEngine`'s interface is identical either way. |
| **TransformEngine** | `core/transform/TransformEngine.ts` | Move/scale/rotate/flip. Non-destructive: writes to `Layer.transform`, never resamples source pixels except at export/flatten. |
| **HistoryManager** | `core/history/HistoryManager.ts` | Command-pattern undo/redo stack. Structural commands store before/after field values. Pixel-mutating commands store dirty-rect `ImageBitmap` diffs (bounded to stroke/selection bbox, not full canvas). |
| **FileIO** | `core/io/FileIO.ts` | Import: `createImageBitmap(file)` for PNG/JPEG/WebP/HEIC. PSD partial via `psd.js` (V2). Export: `OffscreenCanvas.convertToBlob()` → PNG or JPEG. |
| **GalleryBridge** | `ui/GalleryBridge.ts` | Only module allowed to import `utils/galleryStorage.ts`. Wraps `addItemToGallery` matching verified signature. Handles entry (Gallery item id+url → editor) and save-back (blob → new `GalleryItem` with `generationId` linkage). |

---

## 3. Data Model

All types in `image-editor/core/types.ts`. Serializable (plain JSON-compatible + one `ImageBitmap` ref per raster layer, not serialized).

```ts
interface Document {
  id: string;
  width: number;
  height: number;
  resolution: number;           // px/inch metadata only; default 72
  layers: Layer[];              // index 0 = topmost (matches Compositor convention)
  guides: Guide[];
  activeLayerId: string | null;
  createdAt: number;
  sourceGalleryItemId?: string; // set when opened from Gallery; feeds GalleryBridge linkage
}

interface Guide { orientation: 'horizontal' | 'vertical'; position: number; }

type LayerType = 'image' | 'group' | 'adjustment' | 'shape' | 'text';

interface LayerBase {
  id: string; name: string; type: LayerType;
  transform: LayerTransform; opacity: number; blendMode: BlendMode;
  visible: boolean; locked?: boolean; mask?: LayerMask; effects?: LayerEffect[];
}

interface ImageLayer extends LayerBase {
  type: 'image'; bitmap: ImageBitmap; // NOT in history snapshots
  intrinsicWidth: number; intrinsicHeight: number;
}

interface GroupLayer extends LayerBase { type: 'group'; children: Layer[]; }
interface AdjustmentLayer extends LayerBase { type: 'adjustment'; adjustment: AdjustmentDef; } // V2
interface ShapeLayer extends LayerBase { type: 'shape'; shape: 'rect' | 'ellipse'; fill: string; stroke?: { color: string; width: number }; }
interface TextLayer extends LayerBase { type: 'text'; text: string; font: { family: string; size: number; weight: number }; color: string; }

type Layer = ImageLayer | GroupLayer | AdjustmentLayer | ShapeLayer | TextLayer;

interface LayerTransform {
  origin: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number; flipH: boolean; flipV: boolean;
}

interface LayerMask {
  bitmap: ImageBitmap; // 8-bit grayscale, same intrinsic size as layer bbox
  enabled: boolean; invert: boolean; feather: number;
}

type SelectionShape =
  | { kind: 'rect'; bounds: Rect }
  | { kind: 'ellipse'; bounds: Rect }
  | { kind: 'polygon'; points: Array<{ x: number; y: number }> }
  | { kind: 'raster'; mask: ImageBitmap }; // Magic Wand result

interface Selection { shape: SelectionShape; bounds: Rect; feather: number; }

interface Rect { x: number; y: number; width: number; height: number; }

type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
  // 9 Photoshop-only modes — manual WebGL2 shader fallback (Section 6):
  | 'dissolve' | 'linear-burn' | 'linear-dodge' | 'vivid-light'
  | 'linear-light' | 'pin-light' | 'hard-mix' | 'darker-color' | 'lighter-color';
```

**History entry**: command pattern, not full snapshots.

```ts
interface HistoryCommand {
  id: string; label: string; timestamp: number;
  do(): void;   // mutates EditorStore + pixel buffers
  undo(): void; // exact inverse
  // Pixel-mutating commands store dirty-rect ImageBitmap diffs (pre+post), not full-canvas bitmaps.
}
```

Structural ops store field before/after values. A 50-step history on a 3000×3000px doc with 500×500 average dirty rects costs ~100 MB (2 MB × 50) vs 1.8 GB for naive full snapshots.

---

## 4. WASM Strategy

### Evaluation

**Emscripten (compile Compositor's `AdjustPixels.c`/`BrushPixels.c`)**
- Pro: Bit-identical output to Compositor. Con: Unverified C API surface (no local checkout), Emscripten glue is heavier/harder to integrate with Worker transfer, new toolchain dependency. Con: `malloc`/exception scaffolding overhead for pure array-arithmetic workloads.

**Rust crate via `wasm-pack` ✅ CHOSEN**
- Pro: `wasm-pack build --target web` → `.wasm` + typed TS glue. `#[wasm_bindgen]` accepts `&mut [u8]` slices directly over transferred `ArrayBuffer` — no manual heap-pointer bookkeeping. Pixel math (Levels/Curves/Hue-Sat/Exposure) is standard published algebra; reimplementing in Rust is bounded, well-understood effort. Smaller `.wasm` binary than Emscripten C runtime (no libc emulation for array-arithmetic kernels).

**⚠️ Toolchain cost is unpriced.** Verified this session: no `cargo`, `rustc`, or `wasm-pack` on PATH; no `Cargo.toml` anywhere in the repo; `pnpm lint` is `tsc --noEmit` only and `pnpm build` is bare `vite build`. Adding this crate means a new toolchain install, a pre-build step nothing currently runs, a checked-in `pkg/` artifact or a CI Rust job, and a `cargo test` tier (§10) outside the existing `pnpm test`. That is a real M3 cost the milestone does not budget. Cheaper alternative worth measuring first: the same kernels as plain TypeScript in the existing worker. Levels/Curves/Hue-Sat are LUT-and-multiply loops over `Uint8ClampedArray`; on 9M pixels in a worker they are plausibly fast enough, and the WASM crate can be added later behind the same `AdjustmentEngine` interface if profiling proves it necessary. **Benchmark the TS version before committing to Rust.**

**✅ Benchmarked 2026-09-23** (Node/V8, single-threaded, 4096×4096 = 16.7M px, `image-editor/core/adjust/kernels.ts` as shipped):

| Kernel | Commit latency |
|---|---|
| Levels | 49ms |
| Curves | 50ms |
| Exposure | 89ms |
| Hue/Saturation | 2,114ms (down from 3,751ms after removing a per-pixel tuple allocation in `applyHueSaturation` — see kernels.ts history) |

Levels/Curves/Exposure are comfortably fast enough in TS — no WASM case for them. Hue/Saturation is the outlier: its per-pixel RGB↔HSL round trip doesn't reduce to a byte LUT the way the other three do, and 2.1s on the largest supported canvas is a real "commit and wait" delay, worker-thread or not. **Decision: ship Hue/Saturation as TS for V1** (it already runs off the main thread via `adjust.worker.ts`, so it costs a spinner, not jank) **and revisit WASM only for this one kernel if it comes up as a user complaint** — the other three don't justify the toolchain cost this section prices out above.

### WASM module API (crate: `kollektiv-imgproc`)

```rust
#[wasm_bindgen]
pub fn adjust_levels(pixels: &mut [u8], width: u32, height: u32,
                      in_black: u8, in_white: u8, gamma: f32,
                      out_black: u8, out_white: u8, channel: u8 /* 0=RGB,1=R,2=G,3=B */);

#[wasm_bindgen]
pub fn apply_curve(pixels: &mut [u8], width: u32, height: u32,
                    lut: &[u8], // 256-entry LUT built in TS from Curves control points
                    channel: u8);

#[wasm_bindgen]
pub fn adjust_hue_saturation(pixels: &mut [u8], width: u32, height: u32,
                              hue_shift_deg: f32, saturation: f32, lightness: f32);

#[wasm_bindgen]
pub fn adjust_exposure(pixels: &mut [u8], width: u32, height: u32,
                        exposure_stops: f32, offset: f32, gamma_correction: f32);

#[wasm_bindgen]
pub fn paint_brush_stamp(canvas_pixels: &mut [u8], canvas_width: u32, canvas_height: u32,
                          brush_alpha_mask: &[u8], brush_size: u32,
                          center_x: f32, center_y: f32, color: u32 /* RGBA packed */,
                          flow: f32, hardness: f32);

#[wasm_bindgen]
pub fn flood_fill_select(pixels: &[u8], width: u32, height: u32,
                          seed_x: u32, seed_y: u32, tolerance: u8, contiguous: bool) -> Vec<u8>;
```

`apply_curve` takes a precomputed 256-entry LUT — LUT construction stays in TS; WASM boundary crosses only flat numeric arrays.

### Memory transfer: `ArrayBuffer` transfer (not `SharedArrayBuffer`)

`SharedArrayBuffer` requires COOP/COEP response headers — would break every cross-origin image/font/API fetch across the whole app including GitHub Pages deployment. Zero-copy `ArrayBuffer` **transfer** via `postMessage(msg, [pixelData])` achieves identical "no extra copy" performance for the actual workload (one-shot batch operations, not continuously-shared mutable memory).

Direct WASM linear-memory views (`new Uint8Array(wasmMemory.buffer, ptr, len)`) used *inside* the Worker — `wasm-bindgen`'s glue handles this via mutable slice parameters without extra application code.

### Vite integration

**Verify first**: `vite.config.ts:13` sets `base: '/'` while `package.json` `homepage` is `https://mindturbulence.github.io/Kollektiv/`. An absolute `/kollektiv_imgproc_bg.wasm` fetch would 404 on the Pages deployment. The rnnoise precedent does not settle this — that `.wasm` is resolved by the library itself inside `simple-rnnoise-wasm`, not by a hand-written URL in this repo (`services/noiseCancellation.ts:47`). Resolve the worker's wasm URL with `new URL('./kollektiv_imgproc_bg.wasm', import.meta.url)` so Vite rewrites it per base, and confirm against an actual `pnpm build` + Pages preview.

Follow `simple-rnnoise-wasm` precedent: `viteStaticCopy` target copying `image-editor/wasm/pkg/kollektiv_imgproc_bg.wasm` → dist root, fetched by URL at runtime inside the Worker. One WASM-loading convention in the codebase, no `vite-plugin-wasm` added.

---

## 5. OffscreenCanvas + Worker Architecture

| Operation | Thread | Rationale |
|---|---|---|
| Brush/Erase strokes | `brush.worker.ts` (owns transferred `OffscreenCanvas`) | Pointer events fire at 120–144 Hz; any main-thread work competing causes visible jank. |
| Adjustment **commit** (per-pixel pass, TS or WASM) | `adjust.worker.ts` (separate from brush worker) | Per-pixel loops over 9M pixels take milliseconds; synchronous → UI jank. Backend choice per §4. |
| Adjustment **live preview** (slider drag) | Main thread, GPU (WebGL2 uniform update) | Sub-frame requirement; any `postMessage` round-trip latency is disqualifying. This is the reason `AdjustmentEngine` is two-tier. |
| Full-canvas export flatten | Main thread or `export.worker.ts` (if >50ms) | One-shot user-initiated action; brief block acceptable; defer to worker only if profiling proves needed. |
| Magic Wand flood-fill, Lasso rasterization | `select.worker.ts` | O(pixels) can spike on large canvases; keeps "marching ants" UI responsive. |

**Worker message protocol** (discriminated union, consistent across all workers):

```ts
type EditorWorkerMessage =
  | { type: 'brush-stroke'; layerId: string; points: BrushPoint[]; brush: BrushSettings }
  | { type: 'adjustment-commit'; layerId: string; adjustment: AdjustmentLayer['adjustment']; pixelData: ArrayBuffer; width: number; height: number }
  | { type: 'flood-fill'; pixelData: ArrayBuffer; width: number; height: number; seed: { x: number; y: number }; tolerance: number }
  | { type: 'result'; requestId: string; pixelData: ArrayBuffer; dirtyRect: Rect };
```

Every request carries a `requestId` for async response correlation back to the waiting `HistoryCommand`. `ImageBitmap` used where consumer only needs to draw (not read/write pixels) — GPU-uploadable, decode-once, transferable.

---

## 6. Blend Mode Implementation

### Native vs. manual map

| Mode | Browser native | Notes |
|---|---|---|
| Normal → Luminosity (16 modes) | ✅ `globalCompositeOperation` / `mix-blend-mode` | String values are identical between Canvas2D and CSS mix-blend-mode |
| Dissolve | ❌ Manual WebGL2 | Stochastic per-pixel alpha threshold (random dither weighted by opacity) |
| Linear Burn | ❌ Manual WebGL2 | `base + blend - 255` per channel |
| Linear Dodge (Add) | ❌ Manual WebGL2 | `base + blend` clamped |
| Vivid Light | ❌ Manual WebGL2 | Branch to Color Dodge/Burn based on blend value |
| Linear Light | ❌ Manual WebGL2 | Combination of Linear Burn/Dodge |
| Pin Light | ❌ Manual WebGL2 | Branch to Darken/Lighten based on blend value |
| Hard Mix | ❌ Manual WebGL2 | Vivid Light thresholded to black/white per channel |
| Darker Color | ❌ Manual WebGL2 | Luminosity-compare whole pixel (≠ per-channel Darken) |
| Lighter Color | ❌ Manual WebGL2 | Same, lighter wins |

**9 manual modes, 16 native.** Manual modes have no `globalCompositeOperation` value to set — requires WebGL2 fragment shaders.

### Compositing pipeline (intermediate-texture pattern)

Naive single-flat-canvas compositing is incorrect for groups, masks, and manual blend modes. Instead:

1. **Bottom-up raster pass**: Native-mode image/shape/text layers with no mask/effects draw directly via Canvas2D `globalCompositeOperation` into the accumulating buffer.
2. **WebGL2 manual-blend pass**: Manual-mode layers render to their own `OffscreenCanvas`/texture, composited into the accumulator via a full-screen-quad fragment shader (ping-pong pattern — never read and write the same texture simultaneously).
3. **Masks**: Alpha-multiply pass *before* the blend step. Mask texture feathering/inversion applied in a separate cheap shader pass.
4. **Groups**: Rendered recursively into their own intermediate texture first, then treated as a single layer for blending into the parent stack.
5. **Adjustment layers** (V2): Shader pass over the accumulator-so-far texture, affecting only layers beneath them in their own group.

---

## 7. File I/O

### Import
- PNG/JPEG/WebP/HEIC: `createImageBitmap(file)` — native off-main-thread decode. Unsupported formats → caught error, user-facing message. Drag-and-drop + `<input type="file" accept="image/*">` both funnel into `FileIO.importImage(file: File): Promise<ImageLayer>`.
- PSD partial (V2): `psd.js` (MIT) for raster layer data extraction. PSD *export* deferred (no mature MIT write library verified; `ag-psd` is the V3 candidate).

### Export
- `OffscreenCanvas.convertToBlob({ type, quality })` → `Blob`. Avoids extra canvas-to-canvas copy vs `HTMLCanvasElement.toBlob`.
- Two UX destinations: (1) client-side download via `URL.createObjectURL` + `<a download>` (matches Composer precedent), (2) "Save to Vault" via `GalleryBridge`.

### GalleryBridge (verified against actual `addItemToGallery` signature)

```ts
// image-editor/ui/GalleryBridge.ts
async function saveToGallery(blob: Blob, opts: {
  title: string; categoryId?: string; generationId?: string;
}): Promise<GalleryItem> {
  const url = URL.createObjectURL(blob);
  try {
    // Options-bag overload (galleryStorage.ts:178, AddItemOptions:163) carries generationId directly.
    return await addItemToGallery('image', [url], ['Image Editor'], {
      categoryId: opts.categoryId,
      defaultTitle: opts.title,
      generationId: opts.generationId,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

Revoking in `finally` is safe: `addItemToGallery` `fetch`es each URL and persists the **bytes** via `fileSystemManager.saveFile` before returning (`galleryStorage.ts:196-218`).

**⚠️ Alpha-destroying JPG conversion — must be handled before M1.**
`addItemToGallery` re-encodes every saved image to JPEG when the storage-provider-specific flag is set (`galleryStorage.ts:202-212` → `convertToJpgWithMetadata`). Verified defaults (`utils/settingsStorage.ts:92,97-98`): `storageProvider: 'local'`, `convertImageToJpgLocal: false`, `convertImageToJpgDrive: true`. So the default local profile is safe, but **any user on Drive storage — or anyone who enabled local JPG conversion (an actively-developed feature, commit `8f764a9`) — silently loses the alpha channel on every "Save to Vault"**, flattening transparency to black. For a layered editor that is data loss, not a preference.

Required before M1 ships: `GalleryBridge` must either (a) detect the flag and warn/offer PNG-preserving save, or (b) galleryStorage must skip conversion for already-lossless editor output. Option (b) needs a new opt-out in `AddItemOptions` — decide which before M1 acceptance, because M1's own criterion ("Save to Vault… result visible in ImageGallery") passes green while destroying transparency.

Route addition: add `'image_editor'` to `ActiveTab` in `types.ts` + `case 'image_editor': return <ImageEditor .../>` in `App.tsx` switch.

---

## 8. Performance Constraints

- **Max canvas: 4096×4096** — universal safe `gl.MAX_TEXTURE_SIZE` floor for WebGL2 on desktop + mobile. Importing a larger image triggers a downscale-to-fit prompt.
- **Downsample cache**: `CanvasRenderer` renders at `min(devicePixelRatio, 2) × viewport CSS size`, not full document resolution, for zoom levels where the on-screen size is less than the full resolution. Full-res compositing only for zoomed-in views and export.
- **Layer thumbnail cache**: 128×128 `ImageBitmap` per layer, regenerated only when that specific layer's pixels/transform change (per-layer dirty flag). Never regenerated on unrelated changes.
- **Peak RAM estimate (3000×3000px, 10 layers)**:
  - Layer bitmaps: 36 MB × 10 = 360 MB (JS heap)
  - Masks (3 layers, single-channel): ~27 MB
  - GPU textures (layer copies + 2 ping-pong RTs): ~400–450 MB (VRAM, separate budget)
  - History (50 steps × 500×500 dirty-rect × 2 (pre+post)): ~100 MB worst case
  - **Total: ~850 MB–1 GB combined JS heap + VRAM**
  - Naive full-snapshot history would be 36 MB × 50 = 1.8 GB for history alone — quantified reason the command-pattern diff strategy is non-negotiable.

---

## 9. Phased Milestones (V1 MVP)

### M1 — Canvas viewport + import + zoom/pan + export
**Scope**: `EditorStore` (document/viewport slices), `CanvasRenderer` (single-layer Canvas2D, no blend modes), `FileIO` (import `createImageBitmap`, export `convertToBlob`), zoom (scroll-wheel, 5%–800%, cursor-anchored), pan (space-drag + two-finger scroll), `'image_editor'` route wired in `App.tsx`.

**Acceptance criteria**:
- Gallery → "Edit" → editor opens with the selected image as the single layer.
- Zoom/pan smooth with no main-thread jank.
- PNG/JPEG export and "Save to Vault" (round-trips through `GalleryBridge`/`addItemToGallery`, result visible in ImageGallery).

### M2 — Layer system + undo/redo
**Scope**: `LayerManager`, `HistoryManager` (command stack + dirty-rect diffs), layers panel UI with thumbnail cache. Blend modes: 16 native only (Canvas2D `globalCompositeOperation`).

**Also in M2 — crash/reload recovery.** The plans guard `isDirty` on tab switch but have nothing for a reload, a crash, or the OOM that §8's own ~850MB–1GB peak estimate makes plausible. Losing an hour of layer work to a refresh is the kind of data loss that is never worth simplifying away. `idb` 8.0.0 is already a dependency: autosave the `Document` (layer bitmaps as blobs via `convertToBlob`, transform/blend metadata as JSON) to an IDB store on an idle-debounced timer, and offer "Recover unsaved document?" on editor mount. This belongs in M2 alongside the history stack, not in V2.

**Acceptance criteria**:
- Import multiple images as layers; reorder via drag; toggle visibility; adjust opacity; pick any native blend mode.
- Reloading mid-edit offers recovery of the in-progress document.
- Ctrl+Z / Ctrl+Shift+Z undo/redo all structural layer operations including redo-after-undo.
- Layer groups create + nested reorder works with correct recursive compositing.

### M3 — Adjustments (WASM) + Brush/Erase
**Scope**: `AdjustmentEngine` two-tier pipeline (WebGL2 live preview + worker commit) for Levels/Curves/Hue-Sat/Exposure. Commit kernels in TypeScript first; adopt the `kollektiv-imgproc` Rust/WASM crate (via `viteStaticCopy` + worker fetch) only if the TS pass misses its frame budget on a 4096² document (§4). `BrushEngine` (`brush.worker.ts` + `OffscreenCanvas`) for Brush/Erase with pressure + smoothing.

**Acceptance criteria**:
- Adjustment dialogs show live GPU preview while dragging; commit result on apply; each commit undoable.
- Brush/Erase paint smoothly at natural speed with pressure sensitivity; each stroke one undoable command.
- Levels and Hue-Sat kernels pass against known pixel pairs (Vitest on the TS path, `cargo test` if WASM was adopted).
- Commit latency on a 4096×4096 layer measured and recorded — this number is what decides whether WASM is needed at all. **Done — see §4 benchmark table (2026-09-23): Levels/Curves/Exposure all under 100ms, Hue/Saturation ~2.1s; TS-first stands, WASM deferred.**

### M3.5 — Mask painting + Gradient + Shape + Type
**Scope**: Mask painting reuses `BrushEngine` painting onto a `LayerMask.bitmap` instead of the color layer. Gradient tool (linear/radial, foreground-to-background or foreground-to-transparent). Shape tool (rect/ellipse, editable, not rasterized). Type tool (text layers with inline paragraph editing, font/size/color/alignment).

**Acceptance criteria**: All four features work with undo/redo. Mask painting clips correctly to the layer's edges.

### M4 — Selections + Transform + Gallery integration polish
**Scope**: `SelectionEngine` (Marquee rect/ellipse, Lasso freehand via `select.worker.ts`, Magic Wand with tolerance slider). `TransformEngine` (move/scale/rotate/flip, non-destructive, on-canvas gizmo UI). Full `GalleryBridge` polish (generationId linkage, category/tag pass-through, GSAP transition via `routeFx.ts`).

**Acceptance criteria**:
- All selection tools produce "marching ants" outline; Brush/adjustments clip to exact selection shape.
- Move/Scale/Rotate/Flip non-destructive; transform re-editable without pixel loss.
- Opening from Gallery and saving produces a new `GalleryItem` linked to the original's `generationId`.
- V1 MVP feature-complete.

---

## 10. Testing Strategy

### Unit (Vitest 3.2.7)
- `EditorStore`: every action tested for correct resulting state; reordering never drops/duplicates layer IDs.
- `LayerManager`: group/ungroup preserves child order; delete of active layer correctly re-selects sibling.
- `HistoryManager`: push/undo/redo correctness; redo stack clears on new action after undo; dirty-rect undo restores exact pre-state pixels (byte-for-byte comparison on synthetic bitmap).
- `AdjustmentEngine`: TS-side Curves LUT construction tested against known control-point/output pairs.
- **Adjustment kernels**: Levels/Curves/Hue-Sat/Exposure tested against hand-computed pixel arrays. On the TS-first path (§4) these are ordinary Vitest cases. **Only if** the WASM crate is adopted do these move to `cargo test`, plus `wasm-pack test --headless --chrome` for JS-boundary marshalling — a conditional tier, not a baseline requirement.

### Integration (Vitest + jsdom + `@testing-library/react`)
- `GalleryBridge` round-trip: save blob → mock IndexedDB → reload → assert `GalleryItem` urls/sources/`generationId`.
- Worker protocol: `BrushEngine`/`AdjustmentEngine` main-thread coordinator logic tested with mocked `Worker` (EventTarget-based stub); pixel correctness covered by WASM and E2E layers.

### E2E (Playwright 1.61.1)
- Full flow: Gallery → "Edit" → paint brush stroke → apply Levels → "Save to Vault" → Gallery shows new item with visually-different thumbnail.
- Import/export round-trip fidelity: imported PNG → immediately exported → pixel-identical (guards against accidental color-space conversion).

All tiers run independently (`vitest run image-editor/`, `playwright test image-editor.spec.ts`, plus `cargo test -p kollektiv-imgproc` only if the WASM crate is adopted) — no full Kollektiv suite required for editor-only validation.

---

## 11. Plan Review Addendum — Scope (2026-09-22)

The corrections above are applied in place. This section is a **proposal requiring a decision**, not an applied change.

### The honest size of M1–M4

As written, V1 MVP is Photoshop: layer tree with groups, per-layer masks, 25 blend modes (9 of them hand-written WebGL2 shaders), three independent selection engines, non-destructive transform gizmos, pressure-sensitive brush on a worker-owned `OffscreenCanvas`, a two-tier GPU-preview/WASM-commit adjustment pipeline, Curves with spline interpolation, plus shape and text layers. That is not a milestone list; it is a product. Nothing in either plan estimates effort, and the milestone ordering implies each is comparable in size when M3 alone (new Rust toolchain + WebGL2 shader pipeline + worker brush engine) plausibly exceeds M1+M2 combined.

### What the vault actually holds

Kollektiv's gallery is AI-generated images. The high-frequency operations on that corpus are plausibly: crop, levels/curves, erase a defect, composite two generations, overlay text. Magic Wand, Lasso, layer groups, 9 exotic blend modes, non-destructive transform gizmos, and adjustment layers are Photoshop-parity features, not demand-driven ones — no evidence in the plans that anyone asked for them.

### Proposed re-cut (decide before writing M1 code)

| Keep for V1 | Defer until asked |
|---|---|
| M1 entire (viewport, import, zoom/pan, export, Gallery round-trip) | M3.5 — Gradient, Shape, Type |
| M2 minus groups (flat layer list, native blend modes, undo/redo, autosave) | M4's Lasso + Magic Wand (`select.worker.ts`, `earcut`, flood-fill WASM) |
| M3's adjustments (Levels/Curves/Hue-Sat) — **TS-first, WASM only if profiling demands** | The 9 manual WebGL2 blend modes (§6) |
| M3's Brush/Erase | Layer groups + recursive group compositing |
| M4's Crop + Move/Scale/Rotate/Flip + rect/ellipse Marquee | Per-layer masks (M3.5), adjustment layers, PSD import |

That cut removes the WebGL2 shader pipeline, the Rust toolchain, `earcut`, recursive group compositing, and two of three selection engines from V1 — roughly half the engineering surface — while covering what the vault's images plausibly need. Everything deferred remains additive against the same `EditorStore` / `CanvasRenderer` interfaces; none of it is foreclosed.

**Decision needed**: ship the full V1 as originally scoped, or the re-cut above. This is a product call, not an engineering one.

### Lower-confidence items (verify before relying on)

- `psd.js` (§7) — license and maintenance status asserted but not verified this session. V2 concern.
- §8's ~850MB–1GB peak RAM figure is an estimate, not a measurement. Worth a real profile at M2 before treating 4096×4096 as the safe ceiling.

---

## 12. Status and Re-plan (2026-09-24)

> Source: [whole-app review](2026-09-24-app-review-and-revision-plan.md). Full defect list with file:line evidence is in [review-2026-09-24/image-editor.md](review-2026-09-24/image-editor.md).

### What happened to the §11 decision

§11's re-cut was never formally decided. In practice the team built most of the **defer** column (Wand, Lasso, Gradient, Shape, Type, masks, groups, the 9 WebGL2 blend modes), while the **keep** column shipped broken: crop is not undoable, the brush paints in the wrong place on transformed layers, and the marquee has no effect. The feature count grew and the core loop stayed untrustworthy.

### Milestone status

| Milestone | Status | Blocking defects |
|---|---|---|
| M1 viewport/import/zoom/export/Gallery round-trip | **Fixed 2026-09-24**, except round-trip metadata | Gallery→EDIT payload race and vault-path fetch fixed. Export now flattens via the shared `LayerPainter` (identical to the viewport). *Open:* save duplicates the item, `generationId` carries the gallery id (E8) |
| M2 layers/undo/autosave | Partial | Autosave JPEG destroys alpha and drops masks (C3). History used full bitmaps with no byte cap (H3). Nested delete is broken (H12). *Fixed:* history is now cleared on document load |
| M3 adjustments + brush | Partial | No live stroke preview, dotted strokes (H4/H5). The Curves preview ignores mid points (M3) |
| M3.5 masks/gradient/shape/type | Partial | Masks share the C1 coordinate bug. Text/shape can't be moved or edited (H9) |
| M4 selections/transform/crop | Partial / broken | Selections affect nothing (H7). Crop is not undoable and skips non-image layers (C2). Rotated-layer resize drifts (M2) |

### Architecture change made

`core/renderer/LayerPainter.ts` now owns all layer drawing: image, text and shape layers, groups, masks, and native plus manual (WebGL2) blend modes. `CanvasRenderer` (on-screen) and `FileIO.exportToBlob` (offscreen, its own compositor instance, `showAdjustmentPreviews=false`) both use it, so export can no longer diverge from what the user sees. **Merge down, flatten, the eyedropper and mask export should reuse it too**; don't write a third compositor.

`FileIO.importFromPayload` accepts only `blob` and `blank` payloads. Gallery payloads are resolved to a Blob by `ui/GalleryBridge.loadGalleryImage` first, so core stays vault-agnostic.

### M5: "make editing real" (adopted; no new tools until done)

Order follows the review's §4 and the revision plan's Phase 1–2 (Jev-prioritised):

1. **Correctness:** `docToLayer` for all pixel tools (C1). Crop as a HistoryCommand across all layer types with Enter/Esc confirm (C2). `disposeTools()` on document change and unmount (M12). A `SET_TITLE` action so renames stop abusing `SET_DOCUMENT`.
2. **Autosave integrity:** PNG/lossless WebP plus masks, with a format version (C3). A non-blocking recovery banner when a payload is present (M11).
3. **Brush:** live preview, spaced stamping, correct clone radius and pressure, fresh source (H4–H6).
4. **Selection clipping** for brush, eraser, clone, gradient, fill and adjustments (H7), plus fill and delete-in-selection.
5. **Layer basics:** a blank layer (H11), nested delete (H12), merge down and flatten via `LayerPainter`, one history entry per slider drag (H8).
6. **Upload workflow:** Image Size and Canvas Size, crop to selection, paste, mask → B/W PNG, a `MAX_DIM` guard (H13).
7. **Gallery round-trip:** real `generationId`/prompt, Update Original vs Save as New (H10/E8).
8. **Text/shape usability** (H9).
9. **History memory:** a byte cap plus `.close()` now, dirty-rect diffs immediately after (H3). This must land before 8k documents are routine.

#### M5 progress — 2026-09-25 (Phase 1 landed)

Items 1–4, 7, 8 of the list above plus the M11 banner are implemented and verified (`tsc --noEmit` clean, 1430/1430 tests pass):

- **C1 (E1):** `core/geometry/docToLayer.ts` maps doc→bitmap space (un-translate → un-rotate → un-flip → scale), wired at the CanvasViewport pointer step for brush, eraser, clone and wand; brush radius scales by `intrinsic/size`. Unit tests cover identity/move/scale/rotate 90°/flip/crop-shift.
- **C2 (E2):** `commitCrop` stages a **pending rect** (`SET_PENDING_CROP`, Enter applies, Esc cancels via `useEditorShortcuts`); `applyCrop` pushes one HistoryCommand (`APPLY_CROP`/`RESTORE_CROP`) whose reducer shifts **every layer type recursively through groups** via `shiftLayersBy`. Crop overlay shared between live drag and pending state, with an Enter/Esc hint.
- **C3 (E3):** Autosave encodes layers **losslessly (PNG)**, serializes masks (`${layerId}::mask` blobs + flags), and tags records with `formatVersion: 2` (DB_VERSION bumped to 2); old JPEG records are discarded on restore, never misdecoded.
- **H4/H5/H6 (E4):** `BrushEngine.getScratchBitmap()` / `CloneStampTool.getScratchCanvas()` feed `LayerPainter.drawImageLayer` so strokes preview live (renderer registers a `setRequestFrame` pump because stamps bypass the store); spaced stamping at `max(1, r·0.25)` in both tools; clone radius is `size/2 · scale · pressure` (was hard-coded 0.5 pressure), source is captured per stroke, `disposeTools()` (`core/toolsRegistry.ts`) runs on document change and unmount.
- **H7 (E5):** `SelectionEngine.getSelectionClip()` builds a doc-space Path2D (rect/ellipse/polygon; raster wand masks are sampled into opaque-run rects); `geometry/selectionClip.ts` re-expresses it in bitmap space through the inverse layer matrix (`DOMMatrix` + `Path2D.addPath`); BrushEngine and CloneStampTool `ctx.clip()` every stamp.
- **H9 (E9):** gizmo/TransformControls/renderer/TransformEngine image-only guards dropped (text and shape transform like images); `addTextLayer` measures bounds with `measureText` (was `len*size*0.6`); default text colour is the store foreground (TypeTool seeds lazily), not white.
- **H10 (E8):** `getSourceItemMeta` returns the source's `generationId`/`prompt`; saves write those (not the gallery item id) and record `savedItemIdRef` so a re-save can update the original in place via `updateItemInGallery`; the JPEG-conversion `window.confirm` became an app modal.
- **M11:** recovery with a payload is a non-blocking banner (Restore confirms replacement; Discard clears autosave) instead of a modal over the just-opened image.

**Still open in M5:** nothing from the review list — SET_TITLE, fill/delete-in-selection, gradient clip and text re-edit landed same-day (see next section). Dirty-rect history diffs (H3 phase 2) remain deferred.

#### M5 progress — 2026-09-25 (leftovers landed: SET_TITLE, fill/delete, gradient clip, text re-edit)

- **SET_TITLE:** new `SET_TITLE` action — a title-only mutation (+ updatedAt/isDirty) that never resets viewport/selection/paintTarget. `EditorToolbar.renameDocument` collapsed from a five-dispatch SET_DOCUMENT workaround (re-applying viewport/layer/selection/dirty) to a single dispatch; no-op on blank/unchanged titles. `loadDocument` remains the only SET_DOCUMENT caller.
- **Fill / delete-in-selection (E5 remainder):** `LayerManager.fillSelection()` / `deleteInSelection()` paint the foreground colour or a `destination-out` clear through `selectionClipInBitmapSpace` on the active image layer — the same clip the brush uses, so moved/scaled/rotated layers fill exactly where the marching ants show. One undoable REPLACE_LAYER_BITMAP pair with `bitmapRefs`. Shortcuts (review §3 P1): **Shift+F5** = fill, **Delete / Alt+Backspace** = clear (plain Backspace untouched).
- **Gradient selection clip:** `commitGradient` applies a `destination-in` pass with the doc-space selection Path2D after drawing — the gradient canvas is document-sized so no bitmap-space transform is needed. Skipped when nothing is selected (behaviour unchanged).
- **Text re-edit (E9 remainder):** double-clicking a text layer with the **Type or Move** tool re-opens the edit box prefilled with the layer's text — `TypeTool.beginEditExisting(layerId, x, y)` seeds font/colour settings from the layer and `commit` routes through the new undoable `LayerManager.updateTextLayer`, which re-measures bounds (`measureText`) but keeps the layer's origin and identity. Empty commit leaves the layer untouched. Hit-test is a doc-space AABB walk through groups (topmost text wins); re-editing ignores rotation (V1 simplification).
- **E8 remainder — explicit save choice:** the jpeg-confirm modal became the general save modal (`saveChoice = { jpegWarning, canUpdateOriginal }`). Whenever `savedItemIdRef` holds a library original, it offers **Update original** vs **Save as new** (the update path was wired in H10 but never user-selectable); the JPEG-flattening warning folds into the same dialog and the primary button reads "Save as new (JPG)" when it applies. Saves with no original and no JPEG conversion skip the modal entirely.
- **E5 remainder — selection-masked adjustments:** `core/adjust/selectionMask.ts`. The commit tier (`AdjustmentEngine.commitAdjustment`, shared by all four panels) copies the ORIGINAL pixels on the main thread, builds a per-pixel selection coverage map (selection clip rasterized in the layer's bitmap space via the brush-clip inverse matrix; `feather > 0` blurs the filled path for a soft edge), and after the worker returns, lerps every channel between original and adjusted weighted by coverage — outside the selection pixels keep their original values exactly, feather pixels blend. The GPU preview tier (`updatePreview`) composites unadjusted-outside/adjusted-through-clip so sliders show the masked result; `updatePreview` became async (`void`-awaited at the four panel call sites). No selection → previous unmasked behaviour, byte-identical.
- New tests: `core/__tests__/M5Leftovers.test.ts` (13 cases: SET_TITLE rename/preserve/no-op, fill+delete guards/clip/undo, gradient clip/no-selection, re-edit commit/empty/refusal/re-measure), `core/__tests__/SelectionMask.test.ts` (9 cases: clip build guards, coverage rasterization + feather path, lerp t=0/t=1/t=0.5/truncation). Suite: 1487 passing.

#### M5 progress — 2026-09-25 (item 6 landed: upload workflow)

- **H13 / MAX_DIM:** `FileIO.MAX_DIM = 8192` enforced in `importImage`, `importFromPayload` and `createBlankDocument` (the modal's `max=8192` attribute was advisory only; `NewDocumentModal.handleCreate` now enforces in code too, and `ImageEditorPage.handleCreateDocument` routes the throw to `showGlobalFeedback`). Oversize imports are rejected with the offending dimensions *at import time* — previously they failed later, silently, inside the tools. HEIC decode failures say "convert via the Converter tab" instead of a bare "Unsupported format". `bitmap.close()` on rejection.
- **Image Size (Ctrl+J):** `LayerManager.resizeLayer()` resamples the active image layer via `FileIO.resampleBitmap` (high-quality smoothing); one undo entry restores the original bitmap, intrinsic size and rendered size (`RESAMPLE_LAYER` action, `bitmapRefs` declared for the byte cap). `ImageSizeDialog` with constrain-proportions.
- **Canvas Size (Ctrl+K):** `LayerManager.resizeCanvas()` with a 9-anchor grid (`anchorOffset` maps anchor → content shift); `RESIZE_CANVAS` shifts every layer type recursively and one undo restores dimensions *and* positions. Growing documents adds transparent padding toward the anchored edge (outpaint prep). `CanvasSizeDialog`.
- **Crop to selection (Ctrl+Shift+C):** `LayerManager.cropToSelection()` stages the selection bounds as the pending crop rect — reuses the whole Enter/Esc apply path from E2, including the undoable `APPLY_CROP`.
- **Paste (Ctrl+V):** `navigator.clipboard.read()` image → routed through the same no-document/document+layer logic as drop (`openOrPlaceFile`); graceful feedback when the clipboard has no image or permission is refused.
- **Mask export (Ctrl+Shift+M):** `FileIO.exportMaskToBlob()` renders the active layer's mask as a B/W PNG download (inpaint prep); errors surface via feedback (no mask → points at the +M chip).
- Toolbar: Image Size / Canvas Size icon buttons between the title and undo group; brush-size `[` / `]` shortcuts shipped alongside (review §3 P1).
- New tests: `core/__tests__/canvasOps.test.ts` (10 cases: MAX_DIM, anchor offsets, resize/undo round trip, RESAMPLE_LAYER swap, crop-to-selection staging + apply, resize guards). Suite: 1465 passing.

#### M5 progress — 2026-09-25 (item 9 landed: history memory)

- **H3 (short-term fix, as the review scoped it):** `core/history/bitmapAccounting.ts` — commands now declare their bitmaps via `HistoryCommand.bitmapRefs` (structural walk finds bitmaps nested in objects/arrays; detection is structural, not `instanceof`, so jsdom tests and cross-realm bitmaps work). `PUSH_HISTORY` enforces BOTH caps: **512 MB unique decoded bytes** and the existing **50-command** ceiling (the count cap must stay — structural commands carry no bytes and would otherwise never evict; this bit was caught by the existing HistoryManager test). Oldest-first eviction.
- **`.close()` discipline:** after every trim (byte eviction, count eviction, redo-branch drop, `CLEAR_HISTORY`, `resetStore`), every bitmap that NO surviving command and NO live document layer references is closed immediately. `collectDocumentBitmaps` walks the live tree (nested groups, color + mask bitmaps) as the never-close set; shared references are accounted once and never double-closed (close is also wrapped against double-close throws).
- **Producers declaring refs:** BrushEngine stroke, CloneStampTool stroke, AdjustmentEngine commit (`new` + `prev`/`source` pairs). Structural commands (add/remove/reorder/group/transform/merge/flatten/crop) declare nothing and cost 0 bytes.
- **Net effect:** 50 strokes on one 4096² layer now hold ≤512 MB (≈8 strokes) and every evicted bitmap frees its backing storage at eviction time — previously ≈3.2 GB pinned until GC, which could never collect them while the stack held the commands.
- New tests: `core/__tests__/bitmapAccounting.test.ts` (12 cases: unique-byte accounting, nested refs, oldest-first eviction, live-document keep-set, redo-drop close, shared-ref keep, CLEAR_HISTORY integration). Suite: 1455 passing.

**Deferred (review's plan-aligned follow-up):** dirty-rect diffs — the byte cap makes 8k documents *safe*; diffs make history *cheap*. Schedule right after item 6.

#### M5 progress — 2026-09-25 (item 5 landed)

- **H11:** `LayerManager.addBlankLayer()` creates a transparent document-sized layer named `Layer N` (collision-free), inserted **above** the active layer. Found and fixed en route: `ADD_LAYER`'s `insertAfterIndex + 1` slid new layers *underneath* the active one — corrected to insert at the active index (above in z-order); the EditorStore unit test that encoded the old behaviour was updated. LayersPanel footer: "+" = new blank layer, separate photo-icon button = Place image as layer.
- **H12:** `layerTree.findLayerLocation()` returns `{layer, siblings, index, parentId}`; `removeLayer` and `duplicateLayer` now operate on nested layers (the old top-level `findIndex` silently did nothing on children). Undo restores via `INSERT_LAYER_AT` with the pre-removal sibling snapshot; the reducer supports both restore (snapshot already contains the layer) and insert (duplicate splices it in at `index`). Duplicate strips the mask so painting the copy's mask can't corrupt the source's.
- **Merge down / Flatten:** `mergeDown()`/`flattenImage()` rasterize through a private `LayerPainter(false)` (text/shape, masks, manual WebGL2 blends — identical to viewport/export) into a document-sized image layer. Store actions `REPLACE_TOP_LEVEL_PAIR`/`RESTORE_TOP_LEVEL_PAIR` and `SET_LAYERS` carry full undo. Merge-down is top-level only (groups are organizational in V1); the panel exposes both as buttons in a row under the footer with proper disabled states.
- **H8:** `setLayerOpacityLive()` dispatches `UPDATE_LAYER` with **no history** during drags; `commitLayerOpacity()` records exactly **one** command on pointerup/blur (keyboard edits commit on blur). The 100→0 drag no longer evicts real undo history. Tests assert history length 0 during drag and 1 after commit.

New tests: `core/__tests__/LayerManagerM5.test.ts` (13 cases: blank-layer guard/placement/undo, nested delete + undo/redo, nested duplicate + mask strip, merge/flatten store actions, opacity history). Suite: 1443 passing.

**Tests required per item:** a unit test for `docToLayer` (rotate/flip/scale/crop cases), crop undo/redo, and an autosave round-trip that preserves alpha and masks. Extend `e2e/image-editor.spec.ts` with brush → Levels → Save. That spec runs with **full motion** on purpose; keep it that way.

**Deferred until M5 ships:** adjustment layers, a history panel, more blend modes, and Wand/Lasso polish beyond the O(n²) flood-fill fix.
