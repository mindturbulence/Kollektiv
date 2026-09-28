# Image Editor

The `image_editor` tab is a browser-only layered image editor for touching up and preparing images from the vault and from generation (inpaint masks, outpaint padding, crops, grades). Source: `image-editor/`. The next feature plan (Looks / Quick-Edit / RAW) is `docs/plans/2026-09-28-image-editor-looks.md`; remaining small tasks are in `docs/plans/TASKS.md`.

Where it came from: planned 2026-09-22 (engineering + frontend plans), built as milestones M1–M4, then a whole-app review (2026-09-24) found the core loop untrustworthy and the M5 "make editing real" pass fixed it (2026-09-25). A UI reachability pass and a selection/brush mechanics pass followed on 2026-09-28. The original plans were deleted once implemented; read them in git history at commit `3bc6f65` (`docs/plans/image-editor-engineering-plan.md`, `image-editor-frontend-plan.md`, `review-2026-09-24/image-editor.md`).

## Architecture

A framework-free core plus a React UI — the pattern the video editor later copied.

```
image-editor/
  core/
    types.ts            Layer union (image | text | shape | group | look), EditorState, EditorAction
    store.ts            module-scoped store (getSnapshot/subscribe/dispatch), read via useSyncExternalStore
    history/            HistoryCommand {do, undo, bitmapRefs}; 50-command AND 512 MB decoded-byte cap, oldest-first eviction, .close() on evicted bitmaps;
                        jumpTo(index) for the History panel; patchCommand (dirty-rect stroke history)
    layers/             LayerManager (add/remove/duplicate/group/merge/flatten/masks/resize/crop), layerTree helpers
    renderer/           CanvasRenderer (on-screen rAF loop), LayerPainter (ALL layer drawing), BlendCompositor (WebGL2 manual blend modes)
    geometry/           docToLayer (doc → layer-bitmap space), selectionClip (selection clip/mask in bitmap space, masked stroke compositing)
    selection/          SelectionEngine (marquee, lasso, polygon, raster), FloodFill (magic wand), maskGeometry (raster runs/edges)
    paint/              BrushEngine, CloneStampTool (stroke buffer masked by the selection, live preview)
    adjust/             AdjustmentEngine (GPU preview tier + worker commit tier), kernels, selection-masked commits
    transform/, text/, shape/, gradient/   tools
    io/FileIO.ts        import (MAX_DIM 8192), export via LayerPainter, mask export, resample
    io/psdImport.ts     PSD → layered document via ag-psd (MIT, lazy chunk)
    looks/              Look recipes (JSON), .cube parser, LUT registry, LookRenderer (fused WebGL2 look pass), built-in looks
  looks/lab/            #looks-lab Phase 0 diagnostics page (GPU caps, LUT accuracy, pass timings, RAW decode)
    autosave/           IndexedDB 'kollektiv-editor-autosave' v2 (PNG blobs + masks, formatVersion 2)
    thumbnails/         per-layer thumbnail cache
  ui/                   ImageEditorPage, EditorToolbar (Image/Select/Adjust menus), ToolRail, ToolHeader, CanvasViewport,
                        LayersPanel (Layers | History tabs), HistoryPanel, adjustments/*Panel, dialogs, GalleryBridge, hooks/useEditorShortcuts
```
Non-destructive grading is the **look layer**; the old dormant `AdjustmentLayer` type (never created, never rendered) was removed on 2026-09-29 (Jev triage: remove, 0.97). The Levels/Curves/Hue-Sat/Exposure dialogs stay destructive.

Key rules:

- **Look LUTs** resolve by asset id in `looks/lutRegistry.ts`: `proc:<name>` are in-house looks generated in code (`procLuts.ts`, 33³, no files); `file:<name>` are vetted third-party `.cube` files in `public/looks/` (each listed in `public/looks/LICENSES.md`), fetched lazily — the viewport repaints when one arrives, and export/flatten/merge/wand `preloadLuts` first. The catalog is `looks/builtins.ts` (16 looks in 4 categories).
- **Look layers** (`type: 'look'`) shade the composite beneath them: `LayerPainter.drawLookLayer` reads `ctx.canvas`, runs `LookRenderer` (one fused pass; grain/vignette in document space via the inverse canvas transform) and copies the result back; opacity is the look's strength. `drawLayers` caches the composite up to the topmost look for the on-screen painter, keyed on the identity of every layer below (+ transform, canvas size, LUT registry version); a live brush/clone stroke or adjustment preview below disables/refreshes it. Looks are top-level only, can't be merged into, merge-down/flatten bake them. No WebGL2 → the look is skipped, never faked.
- **One compositor.** `LayerPainter` draws every layer kind (image/text/shape, groups, masks, 16 native + 9 WebGL2 manual blend modes). The viewport, export, merge down, flatten and the magic wand (`rasterizeLayersToCanvas`) all go through it, so none can diverge from what the user sees. Don't write another.
- **Doc space vs bitmap space.** Pointer input is document space; pixel tools stamp into a layer's bitmap, which is drawn through its transform. Always map with `geometry/docToLayer` / `docToBitmapMatrix` — painting doc coordinates directly lands in the wrong place on moved/scaled/rotated/flipped/cropped layers.
- **Selections are document-space**, raster (wand) masks are document-sized. Paint tools rasterize the selection into bitmap space once per stroke and composite a stroke buffer through it once per pointer event (`composeStroke`); per-dab `clip()` on a wand path was ~15 s per stroke on a noisy photo. Fill, delete, gradient and adjustments use the exact per-row clip path.
- **Magic wand** fills in document space, samples all visible layers by default (a click on a blank layer otherwise selects the canvas), uses per-channel tolerance, O(n) queue. Settings are module state in `FloodFill.wandSettings`.
- **Two-tier adjustments.** Dragging a slider renders a GPU preview (outside the store; `MARK_LAYER_DIRTY` forces a frame); release commits once through the worker as one `HistoryCommand`. The same drag-live / commit-once rule applies to layer opacity.
- **The renderer skips frames whose store state is unchanged.** Work that changes pixels without dispatching (brush and clone strokes) must request a forced frame (`scheduleStrokeFrame`).
- **Destructive vs undoable.** Every edit is a `HistoryCommand`; commands holding bitmaps declare them in `bitmapRefs` so the byte cap can account and free them.
- **Dirty-rect stroke history.** Brush, eraser, mask and clone strokes keep only the stroked rectangle, before and after (`history/patchCommand.ts`); do/undo rebuild the layer bitmap from the current one plus the patch (`transferToImageBitmap` keeps it synchronous). Exact because history is linear. Adjustments, fill/delete and structural edits still swap whole bitmaps.
- **History panel** jumps with `jumpTo`, which steps undo/redo so every command runs in order — never set `historyIndex` directly.
- Groups are one level deep and are **not composited as a unit** (children draw straight through).
- The editor is its own chunk (`React.lazy` in `components/App.tsx`); `ag-psd` is a further lazy chunk loaded only when a PSD is opened.
- **PSD import:** opening a `.psd` builds a layered document (positions, visibility, opacity, blend modes; text/shape layers as their rasterized pixels; nesting flattened to one group level). Dropping a PSD into an open document places it flattened as one layer.

## Gallery round-trip

Gallery → EDIT resolves the vault path to a Blob in `ui/GalleryBridge.loadGalleryImage` (core stays vault-agnostic). Save to Gallery offers **Save as new** (default) or **Update original**, carries the source's `generationId`/prompt, and warns before flattening to JPEG. A cold open shows the Open-or-Create modal (open image, drop zone, Ctrl+O, blank sizes).

## Testing

- **Unit** (`npx vitest run image-editor`): store/reducer, history (+ `jumpTo`) and bitmap accounting, dirty rects, docToLayer, selection clip/mask, canvas ops, merge/flatten, adjustment kernels, flood fill + mask geometry, PSD blend mapping.
- **E2E** (`e2e/image-editor.spec.ts`, full motion): open from the start modal, Ctrl+Shift+M and toolbar menus, autosave v1→v2 upgrade, Gallery EDIT via the animated route, and wand-clipped brushing on a blank layer (reads editor-canvas pixels — pick the canvas with `left > 50`, not the app's full-screen backdrop canvas), footer layout, merge and flatten; Invert Selection + History panel jumps + two-stroke dirty-rect undo + Levels placement; opening a layered PSD (built in Node with `ag-psd`'s writer).
- E2E gotchas: disable idle standby with `kollektivSettingsV4 { isIdleEnabled: false }`; screenshots in headless need reduced motion or a settle wait, or they capture the route transition.

## Known open items

The remaining editor work is the Looks plan (`docs/plans/2026-09-28-image-editor-looks.md`). PSD export is not built (`ag-psd` can write PSDs if it's wanted).

Notes: Select → Invert Selection is menu-only (Ctrl+Shift+I is the browser's DevTools shortcut). Floating adjustment panels open inside the canvas area (`[data-editor-viewport]`) so they never cover the toolbar menus. E2E that drags right after opening a file must wait for the Open-or-Create dialog to finish animating out (`waitForFit` in the spec).
