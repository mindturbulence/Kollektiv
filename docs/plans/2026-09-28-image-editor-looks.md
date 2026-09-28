# Image Editor — Looks (Textures // Overlays // Filters), Quick-Edit mode, RAW import

Status: **Phases 1–3 done; Phase 4 (RAW/DNG) next; Phase 0 measurements still pending** — `#looks-lab` is built and waits for results from the owner's real GPU and a RAW file (they only choose fallbacks). Date: 2026-09-28.

**Phase 0 GPU results (2026-09-29, owner's machine, Intel UHD Graphics via ANGLE D3D11, headed Chromium):** WebGL2 ✓, MAX_TEXTURE_SIZE 16384 (24 MP single tile), MAX_3D_TEXTURE_SIZE 2048, EXT_color_buffer_float ✓, RGBA16F framebuffer complete, identity 33³ LUT max error 0.000/255, fused pass 2.6 ms @ 2048² and 6.6 ms @ 4096², 4K repaint 10.2 ms uncached / 1.96 ms cached. Every check passes on integrated graphics, so no GPU fallback is needed. The RAW decode probe is still unmeasured (no RAW file on hand) and is run first thing in Phase 4.

**Phase 1 progress (2026-09-28):** `LookLayer` type + `drawLayer` branch; `LookRenderer` fused pass (develop, 3D LUT, curve, split tone, fade, vignette, grain — linear-light exposure/WB/grain, document-space grain and vignette, one quantize); on-screen render cache in `LayerPainter.drawLayers` keyed on the identity of the layers below (skips live strokes and adjustment previews); export/flatten/wand share the uncached path; recipe JSON (`core/looks/recipe.ts`, validated by `parseRecipe`) and `.cube` parser (`core/looks/cube.ts`) with tests; autosave serializes look layers (additive, no format bump); looks are top-level only, can't be merged into, and merge-down bakes them. Temporary entry: Adjust → Look: … (all 16 built-ins). **Phase 1 complete (2026-09-29):** LUT assets — 12 in-house looks generated in code (`proc:`, no files) + the one CC0 look LUT worth shipping from darkyboys/opensource-luts (`file:cold-vs-warm`; Jev triaged the other four as correction utilities), provenance in `public/looks/LICENSES.md`; lazy file LUTs repaint on arrival and are preloaded before export/flatten/merge/wand; catalog of 16 looks in 4 categories (Jev-triaged). The dormant `AdjustmentLayer` was **removed** instead of wired (Jev: remove, 0.97 — dead code, LookLayer covers non-destructive grading).

**Phase 2 complete (2026-09-29):** Quick | Pro labelled segmented control (`ui/editorMode.ts`, persisted; opened images → Quick, blank documents → Pro); Quick trims the rail to Move/Crop/Brush/Eraser/Eyedropper/Hand/Zoom and folds Image/Select/Adjust into **More**; right panel is Looks | Layers | History (Looks default in Quick). `ui/looks/LooksPanel.tsx` (lazy chunk, ~10 kB): category chips, 16 live thumbnails of the user's image (`core/looks/thumbnails.ts`: scaled-context proxy of the non-look layers, one shared LookRenderer, generation-cancelled, 300 ms debounce, re-rendered when the image under the looks or a LUT changes), strength slider, Compare (hold button or `\`, `core/looks/compare.ts`, on-screen only), inspector (per-component enable + main sliders, add Develop/Split tone/Fade/Vignette/Grain; live drag → one history step), Remove. Click behaviour **Jev-decided**: click replaces the active look (0.98), Shift+click stacks (0.84), browsing clicks merge into one undo step (per-click undo 0.25 → no) — `HistoryManager.pushMergeable` + `REPLACE_TOP_HISTORY`, whose merged redo replays the older do first. The cold-open dialog already leads with Open image / drop, so it is unchanged. Deferred to Phase 3: favourites, randomize, IntersectionObserver priority (16 thumbs don't need it).

**Phase 3 complete (2026-09-29):** new additive recipe kinds `chromaticAberration`, `lightLeak` (CPU-seeded blobs), `halation`, `bloom`, `frame` (thin/polaroid/rounded SDF), `hsl` (8 bands, neighbour interpolation, grey guard), `paper`, `dust` (specks + broken scratches). Halation/bloom use dual-Kawase bright/down/up pyramids (RGBA16F when renderable), radius in document px. Catalog is 30 looks. Randomize (`core/looks/randomize.ts`, seeded mulberry32, merges with browsing) and per-browser Favourites (`ui/looks/favourites.ts`). **Jev decisions:** build order by score (chromatic aberration, favourites and HSL were uncertain → Claude's call: medium-high / medium / medium-low); new look categories Jev-triaged (Pastel Haze 0.59 and Dusty Film 0.49 → Claude's call, Fade & Matte); textures procedural over CC0 scans (0.97); "add CC0 scans later" 0.59 → Claude's call, optional backlog item. Still open: IntersectionObserver thumbnail priority (30 thumbs render fine without it).
Inputs: 4 research reports (product, pipeline, frontend UX, React), a 3-way design debate
(architecture reviewer, product skeptic, graphics engineer), a RAW/DNG research pass, and the
owner's decisions below. Brainstorm artefacts were not committed; this file is the record.

## 1. Owner decisions (2026-09-28)

| Question | Decision |
|---|---|
| Tuned for | **Both** AI generations and photos, **plus DNG / camera RAW import** |
| v1 breadth | **Full catalog** (phased — see §8; a usable core ships first) |
| UI | **Quick-Edit mode** (Quick ⇄ Pro), not just a tab |
| Batch-apply a look to many gallery images | **v2**, but the recipe format is editor-independent from day one |

Product framing: *a finishing pass* — beautiful film-like character without changing composition
(the one thing re-prompting a generation can't give you). Not a Photoshop/Photopea clone; the pro
tools stay, but recede in Quick mode.

## 2. What exists today (verified in code)

- `LayerPainter.drawLayer` (`image-editor/core/renderer/LayerPainter.ts:51-71`) has **no branch
  for `AdjustmentLayer`**; the type exists (`core/types.ts:89-92`), autosave serializes it, nothing
  creates or renders it. Levels/Curves/Hue-Sat/Exposure are **destructive** (GPU preview in
  `adjust/AdjustmentPreview.ts`, worker commit in `adjust.worker.ts`, one history command).
- `LayerPainter.drawWithManualBlend` (`LayerPainter.ts:83-122`) already does "take everything
  below from `ctx.canvas` → WebGL2 → shader → write back with `copy`" on screen **and** on export
  (`io/FileIO.ts:172-193`). A look is the same operation without a blend layer.
- Viewport, export, flatten/merge and the magic wand all route through `drawLayer`
  (`rasterizeLayersToCanvas` in `LayerPainter.ts`) — anything rendered there is consistent.
- WebGL2 is already a hard requirement (`BlendCompositor.ts:114`); no `TEXTURE_3D`, no GL worker,
  no `webglcontextlost` handling anywhere.
- Masks are image-layer-only in ~5 places: `BrushEngine.beginStroke`, `LayerManager.addMask` /
  `removeMask`, `AutosaveService` mask serialization, `LayerPainter.applyMask` (called only from
  `drawImageLayer`).
- Groups are one level and **not composited as a unit** (`LayersPanel.tsx:5-7`).
- The editor is imported eagerly (`components/App.tsx:47`); the video editor is `React.lazy`'d
  (`App.tsx:53`). No `manualChunks`.
- Gallery → Edit is already photo-first (`ImageEditorPage.tsx:145-165`); only a cold open shows the
  dimensions-first New Document modal. Save to Gallery already defaults to *Save as new*.
- No COOP/COEP headers (`vite.config.ts`, `server.ts`) → no SharedArrayBuffer / WASM threads.

## 3. Architecture decisions (from the debate)

### 3.1 A Look is a layer: `LookLayer` (hybrid) — confidence 0.8
One new layer kind that **shades the composite beneath it** in a new `drawLayer` branch, reusing
the `drawWithManualBlend` pattern. Rejected alternatives:
- *Document-level `activeLook` slot* — tints captions/frames placed above it; needs its own mask,
  autosave, history and a third render stage every consumer must remember. (A top-pinned
  LookLayer *is* this option, when wanted.)
- *Ordered AdjustmentLayers per component* — 6 rows per look clutters Quick mode; one intensity
  can't scale six layers.
- *Looks as ordinary ImageLayers* — cannot grade (a LUT is f(pixels below)); baked grain is up to
  256 MB per layer through history and autosave. **Kept only for real textures** (dust, paper,
  light-leak scans), which genuinely are overlay images.

What the LookLayer gets for free: intensity = `layer.opacity`; before/after = `visible`; undo via
`makeLayerUpdateCmd`; z-order (text above the look stays clean); export/flatten/wand consistency.

Rules: LookLayers are **top-level only** (groups don't composite as a unit, same rule as
mergeDown). Merge-down *into* a LookLayer is disallowed; merge-down *of* a LookLayer bakes it.
Creating a look with an active selection initialises its mask from the selection.

Also wire the dormant `AdjustmentLayer` through the same branch (non-destructive Levels/Curves/
Hue-Sat/Exposure become an "adjustment look component") — one code path, not two.

### 3.2 Recipe format (editor-independent, batch-ready)
```ts
interface LookRecipe {
  formatVersion: 1;
  id: string; name: string;
  components: LookComponent[];          // ordered, each toggleable
}
type LookComponent =
  | { kind: 'develop'; exposure: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number; temp: number; tint: number }
  | { kind: 'lut'; assetId: string; strength: number }
  | { kind: 'curve'; rgb: CurvePoints; r?: CurvePoints; g?: CurvePoints; b?: CurvePoints }
  | { kind: 'hsl'; bands: HslBand[] }                    // 8 hue bands
  | { kind: 'splitTone'; shadowHue: number; shadowSat: number; highlightHue: number; highlightSat: number; balance: number }
  | { kind: 'fade'; amount: number }
  | { kind: 'grain'; amount: number; size: number; roughness: number; color: number; seed: number }
  | { kind: 'halation'; threshold: number; radius: number; strength: number; tint: string }
  | { kind: 'bloom'; threshold: number; radius: number; strength: number }
  | { kind: 'vignette'; amount: number; midpoint: number; roundness: number; feather: number }
  | { kind: 'chromaticAberration'; amount: number }
  | { kind: 'lightLeak'; preset: string; seed: number; opacity: number; blend: BlendMode }   // procedural
  | { kind: 'texture'; assetId: string; blend: BlendMode; opacity: number; fit: 'cover' | 'tile'; rotate: 0 | 90 | 180 | 270; flip: boolean }
  | { kind: 'frame'; assetId: string };
```
- A LookLayer stores `{ recipe: LookRecipe }`; intensity is the layer's opacity. The recipe is
  plain JSON with `assetId` references (never pixels) → saved looks, sharing, and v2 batch-apply
  replay it headlessly.
- `texture` components render inside the look shader (sampled texture + blend), so a "formula"
  (Mextures) is one layer. Users can still add a texture as a real ImageLayer for masking/transform.
- Autosave: bump `AUTOSAVE_FORMAT_VERSION` + `DB_VERSION` (`AutosaveService.ts:26,34`).

### 3.3 GPU pipeline — confidence 0.75–0.85
- **`LookRenderer`** (new, `image-editor/core/looks/`): one WebGL2 context (singleton, like
  `AdjustmentPreview`), `precision highp float`.
- **Fused main pass**: develop → LUT → curve → HSL → split-tone → fade → vignette → grain →
  texture in ONE fragment shader. Separate passes only for neighbourhood effects: halation/bloom
  via a 3–4 level dual-Kawase down/up chain (never a large Gaussian), chromatic aberration.
- **Precision**: intermediates `RGBA16F` (`EXT_color_buffer_float`); grain, halation, bloom and
  exposure math in **linear light** (decode sRGB → linear, re-encode at the end). Quantize to 8-bit
  once, at the end.
- **LUTs**: `TEXTURE_3D`, `RGBA16F`, `LINEAR`, `CLAMP_TO_EDGE`, texel-centre remap
  `(c*(N-1)+0.5)/N`; parsed from `.cube` floats. (2D atlas rejected: more shader code for an
  unproven driver risk; add a startup smoke test behind the feature flag.)
- **Grain**: procedural, seeded in **document-pixel coordinates** (`hash(floor(docPos/size))`,
  2–3 octaves band-limited), amplitude shaped by luminance (strong mids/shadows, weak highlights).
  Identical between a 1600 px preview and a 6000 px export. Newson (GPL) is out of v1 — at most a
  later "high quality grain on export" option.
- **Radii in document px** (halation, bloom, vignette, CA) and rescaled per render resolution.
- **Preview/export**: the same shader. Export renders in **tiles** (~2048²) when the document
  exceeds `MAX_TEXTURE_SIZE` or a memory budget; tiles overlap by the largest blur radius; grain
  seeds are document-space so seams can't appear.
- **Context loss**: handle `webglcontextlost/restored` (rebuild programs + textures, retry once);
  export surfaces an error instead of failing silently.
- **No CPU twin**. If WebGL2/float render targets are unavailable, Looks is disabled with a message.

### 3.4 Render cache (the #1 engineering risk)
The look re-shades "everything below" on every repaint; painting *above* a look on a 4K display
stutters without a cache.
- Cache the look output keyed on **(below-stack version, look version, viewport transform, canvas
  size)**. Add a monotonic `docVersion` counter per layer-stack region (bumped on bitmap replace,
  layer add/remove/reorder/visibility/opacity/blend/transform, crop/resize).
- Brush dabs, text edits, transforms *above* the look don't invalidate it.
- While a slider drags, render the look from a **downscaled proxy** (≤2048 px) and upscale; render
  full-viewport-res once on release (same two-tier pattern as `AdjustmentEngine`).
- Pan/zoom: reuse the cached result during the gesture, re-render on settle.

## 4. RAW / DNG import

- Decoder: **`libraw-wasm`** (LibRaw, LGPL-2.1/CDDL — GPL-3.0-compatible when used unmodified),
  **no-thread build** (`garbarok/libraw-wasm-nothread` or equivalent) because the app has no
  COOP/COEP. Lazy `import()` into its own chunk, run in a Worker with timeout and size guard.
  Ship LibRaw's license + source-availability notice.
- Formats: DNG, CR2, NEF, ARW, RAF, ORF, RW2; **CR3 flagged high-risk** (documented LibRaw bugs).
- Fallback: `exifr` (MIT) extracts the embedded full-size JPEG when decode fails or times out →
  opened as a normal image with a "Preview only — limited latitude" badge.
- Decode to 16-bit linear camera-matched RGB (skip LibRaw's own tone curve) →
  upload as `RGBA16F`.
- **v1 bit-depth tradeoff (explicit):** the RAW stays float through a **Develop component**
  (exposure, WB temp/tint, highlights/shadows/whites/blacks, highlight recovery) at import; the
  developed result becomes the layer's 8-bit bitmap, and the source float buffer is kept (memory
  permitting) so *Re-develop* regenerates it without re-decoding. The rest of the editor stays
  8-bit. A full float document pipeline is **v2** (it touches every tool).
- File picker / drag-drop / Gallery import accept the RAW extensions; Save to Gallery stores the
  developed result (the RAW original is not uploaded).
- Unknowns to measure before committing: WASM chunk size, decode time and peak memory for 24/45 MP.

## 5. Quick-Edit mode (UX)

- **Segmented `Quick | Pro` control** in `EditorToolbar`, labelled (not an icon); persisted per
  user (localStorage). Default: **Quick** when opened from Gallery → Edit, a RAW file, or Open
  image; **Pro** from New Document.
- Quick mode is a **view-state flag only** — same store, same document, no data differences:
  - Tool rail collapses to Move, Brush, Eraser, Crop, Hand, Zoom (+ Eyedropper).
  - Image / Select / Adjust menus fold into one **More** menu.
  - Right panel defaults to a **Looks** tab (Looks | Layers; Layers still one click away).
  - Cold open (no payload) in Quick mode shows an **open-photo-first** drop zone instead of the
    dimensions-first New Document modal.
- **Looks panel** (lazy chunk — the editor's first code split):
  - Category chips: *Film Color, Film B&W, Cinematic, Fade & Matte, Grain, Light Leaks,
    Textures, Dust & Scratches, Overlays/Gradients, Vignette & Lens, Frames, My Looks*.
  - Grid of **live thumbnails of the user's own image** (shared ~256 px proxy, one GL context,
    source uploaded once per job, priority queue + `IntersectionObserver`, generation counter for
    cancellation, cache key `(docVersion, presetId)`); skeletons while rendering.
  - Click = add/replace the look; **strength slider** (layer opacity) + **Edit** reveals the
    component inspector (per-component sliders, toggle, reorder).
  - **Before/after**: hold `\` (Space is reserved for panning conventions) or press-and-hold the
    compare button; plus a draggable split view.
  - Favourites, **Randomize** (seeded variations of the current look), **Save as My Look**,
    import/export look JSON, import `.cube` LUTs and texture images (user assets in IndexedDB).
  - Hover preview after a 150 ms debounce; `prefers-reduced-motion` → instant swaps.
  - Grid is a `listbox` with roving tabindex; Enter applies, arrows move.
- **Masking a look**: the stack row's mask button starts a mask-brush session on that LookLayer
  (Snapseed-style entry point) — requires widening masks to LookLayers (§3.1).

## 6. Catalog (all procedural or verified-licence assets)

Naming: evocative, **no trademarked film-stock names** ("Warm Portrait", not "Portra").

| Category | v1 contents |
|---|---|
| Film Color | ~10 LUT looks (warm portrait, vivid slide, cool pastel, faded print, cross-process, tungsten night…) |
| Film B&W | ~6 (soft, high-contrast, grainy push, selenium, sepia, cyanotype) |
| Cinematic | ~6 (teal/orange, bleach bypass, day-for-night, muted drama…) |
| Fade & Matte | lifted blacks, milky highlights, pastel wash |
| Grain | fine / medium / coarse / push-processed / colour grain presets |
| Light Leaks | procedural (gradient + noise, seeded, screen/lighten) — edge burn, corner flare, rainbow leak |
| Textures | paper, canvas, emulsion, grit (ambientCG CC0) |
| Dust & Scratches | CC0 scans (ambientCG) with random rotate/flip per seed |
| Overlays/Gradients | colour washes, sky gradients, sun flare (procedural) |
| Vignette & Lens | vignette variants, chromatic aberration, soft glow / bloom, halation |
| Frames | film borders, polaroid, rounded matte (procedural or CC0) |
| My Looks | user-saved recipes |

Asset sources: LUTs authored in-house (edit an identity Hald/cube in the app itself, export
`.cube`) plus **darkyboys/opensource-luts (CC0)**; textures from **ambientCG (CC0)**. **Do not
bundle** YahiaAngelo/Film-Luts or any "free LUT pack" without per-file provenance. Every bundled
asset gets a row in `public/looks/LICENSES.md` (source URL, licence, author).

AI-generation vs photo tuning: every preset is reviewed on a fixed test set of 6 photos + 6 AI
generations (skin, sky gradient, night, foliage, flat diffusion render, over-saturated render);
"counter-plastic" looks (fine grain + slight fade + gentle desaturation) get their own entries.

## 7. Assets & persistence

- Bundled assets under `public/looks/` (lazy-fetched when the Looks panel opens, HTTP-cached);
  parsed LUT textures cached in a new IndexedDB store (reuse the `idb` pattern of
  `AutosaveService`). Textures ≤ 2048 px, tileable where possible.
- User assets (imported `.cube`, textures) and My Looks in IndexedDB; exported as a `.klook`
  (JSON + embedded user assets) for sharing.

## 8. Phases

Estimates are solo-developer weeks, assuming familiarity with the editor internals.

| Phase | Scope | Est. |
|---|---|---|
| **0 — Spikes** | TEXTURE_3D + RGBA16F smoke test; libraw-wasm no-thread decode of 24/45 MP (size, time, memory); LookLayer render-branch prototype with cache, measured on a 4K canvas while brushing above it | 1 |
| **1 — Engine core** | LookLayer type + `drawLayer` branch + render cache + `docVersion`; `LookRenderer` fused pass (develop, LUT, curve, fade, split-tone, vignette, grain) in linear/RGBA16F; export via same shader (single tile); autosave bump; wire dormant AdjustmentLayer through the same branch; unit tests for recipe reducer, `.cube` parser, cache keys | 3 |
| **2 — Quick mode + Looks UI** | Quick/Pro toggle, collapsed rail, More menu, open-photo-first cold start; lazy Looks panel; thumbnail scheduler; strength slider; before/after; component inspector; ~20 core looks | 2–3 |
| **3 — Full catalog** | halation + bloom (dual-Kawase), chromatic aberration, HSL, procedural light leaks, texture/dust/frame components + CC0 assets, remaining ~30 presets, randomize, favourites | 2–3 |
| **4 — RAW / DNG** | worker decode, embedded-JPEG fallback, Develop component on float source, Re-develop, format tests incl. CR3 fallback, licence notices | 1.5–2 |
| **5 — Personal looks & robustness** | My Looks save/import/export, `.cube` + texture import, mask a look (widen the 5 image-only mask sites), tiled export for > MAX_TEXTURE_SIZE, context-loss recovery | 2 |
| **v2** | Gallery batch-apply (headless recipe replay), full float document pipeline, 16-bit PNG/TIFF export, optional high-quality grain on export, skin-tone isolation | — |

**Total v1 ≈ 11.5–14 weeks.** Phases 1–2 alone are a shippable "core looks" release.

## 8b. Phase 0 — how to run and what decides what

Open `http://localhost:<dev port>/#looks-lab` in the normal browser (no app shell). *Run GPU tests*, then *Pick a RAW file…*, then *Copy results*. Headless/CI numbers come from a software GPU (SwiftShader) and don't count.

| Result | Decision |
|---|---|
| WebGL2 / `EXT_color_buffer_float` / RGBA16F target missing | Looks disabled with a message on that machine (no CPU twin) |
| 3D LUT error ≥ 0.5 / 255 | Fall back to the 2D-atlas LUT |
| Fused pass 2048² ≥ 16 ms | Drag preview uses a smaller proxy (≤ 1280 px) |
| Uncached repaint at 4K ≥ 16 ms | Render cache (§3.4) is mandatory before any look ships — expected |
| `MAX_TEXTURE_SIZE` < 8192 | Tiled export is Phase 1, not Phase 5 |
| RAW decode ≥ 10 s or fails for the owner's camera | Open the embedded preview first, decode in the background |

Decoder: `libraw-wasm-nothread` 1.6.0 (LibRaw 0.22.1, LGPL-2.1/CDDL, unmodified; ISC wrapper) — 1.4 MB WASM + worker, lazy.

## 9. Testing

- Vitest (jsdom, no GL): recipe reducer + versioning, `.cube` parser, cache-key/`docVersion`
  logic, thumbnail scheduler priority/cancellation, grain seed-space math, tile planner.
- Playwright (`pnpm build && pnpm preview`, extend `e2e/image-editor.spec.ts`): Quick/Pro toggle;
  apply a look and read editor-canvas pixels vs. a reference; strength slider = 1 history entry;
  undo/redo; before/after; export pixels match viewport within tolerance; autosave restore;
  brushing above a look stays responsive (frame-time budget); RAW fixture (small DNG) decodes and
  a corrupt RAW falls back to the embedded preview; reduced-motion variant.
- Visual preset review on the 12-image test set before each preset ships.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Stutter when painting above a look | Render cache + proxy-while-dragging (§3.4); measured in Phase 0 |
| GPU memory / context loss on large exports | Tiling + context-loss recovery (Phase 5); disable-with-message fallback |
| Preview ≠ export (grain, halation radii) | Document-space seeds and radii; same shader; e2e pixel comparison |
| Banding in skies | RGBA16F intermediates, linear-light math, single final quantize |
| RAW memory / CR3 decode failures | Worker + guards, embedded-JPEG fallback, per-format fixtures |
| Mode confusion (Quick vs Pro) | Labelled segmented control, identical document in both modes |
| Licensing | Only CC0 / in-house assets; LibRaw unmodified with notices; `LICENSES.md` per asset |
| Scope (full catalog + RAW ≈ 3 months) | Phases 1–2 ship independently; catalog and RAW layer on top |

## 11. Resolved questions (owner, 2026-09-28)

1. RAW source for Re-develop: **re-decode on demand** (don't hold the 400–700 MB float buffer);
   cache only the decoded file bytes.
2. Develop component: **offered for non-RAW images too** (same component, no extra engine work).
3. Default mode: **Quick Edit on open** (New Document still opens Pro).
