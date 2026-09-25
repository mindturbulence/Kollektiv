# Image Editor: Functional and Code Review

Reviewed on 2026-09-23 against `development` @ 8393b5d. This was a read-only review; FileIO.ts is being changed in parallel by the lead.
Verification: `pnpm vitest run image-editor` passed 70/70. `npx tsc --noEmit` exited 0. None of the tests cover a tool, the renderer, autosave, or the gallery bridge. Every behavioural finding below comes from reading the code. I did not run the app.

Excluded because the lead is already fixing them: (a) the Gallery EDIT payload drop, (b) the Open Image modal button, drop-on-canvas, and Ctrl+O with no document, (c) exportToBlob drawing only image layers.

---

## Executive summary

The editor looks feature-rich: 15 tools, masks, groups, 25 blend modes and GPU adjustments. The core editing loop underneath is not trustworthy yet:

- **Coordinates:** every pixel tool paints in the wrong place once a layer has been moved, scaled, rotated, flipped or cropped.
- **Crop:** it cannot be undone.
- **Autosave:** it destroys transparency.
- **Selections:** they are decoration only, because nothing reads them.
- **Brush:** there is no live preview, and fast strokes come out dotted.
- **Undo:** it keeps a full-size bitmap for every step and never frees them.

The plan's own re-cut (engineering plan §11) said to ship crop, adjust, brush and marquee well and defer wand, lasso, gradient, shape, type, masks and the 9 GPU blend modes. The team built most of the deferred list, while the keep list is broken. **Recommendation:** freeze new tools and spend M5 making the six items above correct.

---

## 1. Ranked defects

Legend: **V** = verified by reading the code at the cited lines. **S** = suspected (a platform behaviour or runtime effect I could not execute).

### Critical

**C1. Pixel tools ignore the layer transform (V).**
- **Where:** `core/paint/BrushEngine.ts:102-116,41-77`, `core/paint/CloneStampTool.ts:30-44`, `ui/CanvasViewport.tsx:146-147,181,236`, and mask painting (same BrushEngine path).
- **What happens:** `getCanvasPoint` returns *document* coordinates (`CanvasRenderer.ts:152-167`). Those are stamped straight into the layer's *bitmap* space.
- **Scenario:** Crop to rect (200,150,…). The store shifts `origin` to (-200,-150) (`store.ts:302-305`). The user then brushes at doc (100,100). The stamp lands at bitmap (100,100), which renders at doc (-100,-50), so it is off-canvas and invisible. The same happens after any move, scale (`size ≠ intrinsic`), rotate or flip. It also hits the magic wand seed (`floodFillFromBitmap(layer.bitmap, pt.x, pt.y…)`) and mask strokes, which breaks inpaint-mask prep on any moved layer.
- **Fix:** add one `docToLayer(pt, transform, intrinsicW, intrinsicH)` helper. It should subtract the centre, un-rotate, un-flip, and scale by `intrinsic/size`. Call it at the single point in CanvasViewport where `pt` is computed for pixel tools, and scale the brush radius by the same factor. One helper covers the brush, eraser, clone, mask and wand paths.

**C2. Crop is not undoable, commits on mouse-up, and only shifts top-level image layers (V).**
- **Where:** `SelectionEngine.ts:91-98` dispatches `CROP_DOCUMENT` directly, with no `pushCommand`. `store.ts:296-308` maps only `l.type === 'image'` at the top level.
- **Scenarios:**
  - An accidental drag with `C` crops permanently. Ctrl+Z does nothing, and there is no canvas-size feature to undo it with.
  - Text and shape layers keep their old coordinates, so after a crop every text overlay sits in the wrong place in the view *and* in the new drawLayer export.
  - Image layers inside groups are not shifted.
  - The ToolHeader hint says "drag handles, press Enter to apply" (`ToolHeader.tsx:28`), but none of that exists.
- **Fix:** wrap the crop in a HistoryCommand holding the previous `{width,height,layers}`. Shift every layer type recursively through groups. Add a pending crop rect that commits on Enter and cancels on Esc.

**C3. Autosave stores layers as JPEG, which destroys alpha, and silently drops masks (V).**
- **Where:** `AutosaveService.ts:28,117-124`. Masks are omitted by design at `:31-33` ("no current producer"). That comment is stale: `LayerManager.addMask` (`:170`) and the LayersPanel "+M" button now produce masks.
- **Scenario:** A transparent document holds a cut-out PNG layer over a background. The page reloads and the user clicks Restore. The top layer's transparent pixels come back opaque black (browsers flatten JPEG to black; the lead's new comment at FileIO.ts:138 confirms this). Everything beneath is covered, and all masks are gone. That is data loss inside the feature whose purpose is preventing data loss.
- **Fix:** encode `image/png` (or lossless webp). Serialize `mask.bitmap` and the mask flags. Bump `DB_VERSION`, or tag the record with a format version and discard old JPEG records.

### High

**H1. "Save" in the unsaved-changes modal discards work even when the save did not happen (V).**
- **Where:** `ImageEditorPage.tsx:300-305` awaits `handleSaveToGallery()`, which returns `void` on the JPG-confirm Cancel (`:163`), on `isSaving` (`:157`), and in the error branch (`:178`). It then runs `action()` anyway.
- **Scenario:** JPG conversion is on. The user presses New, chooses Save, then Cancel on the confirm. The document is replaced. It can only be recovered through the autosave prompt on the next mount, and C3 applies to that.
- **Fix:** make `handleSaveToGallery` return `boolean` and run the action only on `true`.

**H2. History is never cleared when the document changes (V).**
- **Where:** the `SET_DOCUMENT` reducer (`store.ts:76-89`) keeps `history`/`historyIndex`, and there is no caller of `clearHistory()` (grep). `ADD_LAYER` does not check for an existing id (`:148-162`).
- **Scenario:** In doc A the user adds a text layer. They open doc B, press Ctrl+Z (a no-op against B, though isDirty becomes true), then Ctrl+Shift+Z. Doc A's layer is inserted into doc B. The same happens after an autosave Restore and after the new Open Image flow.
- **Fix:** reset `history: [], historyIndex: -1` inside `SET_DOCUMENT` itself. Note that `renameDocument` (`EditorToolbar.tsx:26-37`) misuses SET_DOCUMENT for renames and would then wipe history. Give renames a dedicated `SET_TITLE` action.

**H3. Undo keeps full bitmaps and never frees them (V for the code; S for the numbers).**
- **Where:** every stroke, clone stroke and adjustment command closes over two full-layer `ImageBitmap`s (`BrushEngine.ts:135-144`, `CloneStampTool.ts:101-108`, `AdjustmentEngine.ts:83-89`). `MAX_HISTORY = 50` (`store.ts:327`). No `.close()` is ever called on an evicted or redo-dropped command (grep: `.close()` appears only in the preview and thumbnail caches).
- **Scale:** a 4096² layer is 64 MB decoded, so 50 strokes is about 3.2 GB. Engineering plan §8 (`:334`) names full-snapshot history as the thing that is "non-negotiable" to avoid.
- **Fix:**
  - *Short term:* cap history by bytes (for example 512 MB), and close bitmaps from dropped commands when the current document no longer references them.
  - *Plan-aligned:* dirty-rect diffs, storing the stroke's bbox crop before and after.

**H4. Brush, eraser, clone and mask strokes have no live preview (V).**
- **Where:** `BrushEngine.ts:3-4,147-148`. The renderer never draws the stroke canvas, and pixels only appear after `createImageBitmap` on pointerup.
- **Effect:** users paint blind.
- **Fix:** expose the in-progress OffscreenCanvas. In `drawImageLayer`, use it in place of `layer.bitmap` for `_layerId` (or the mask equivalent), and call `scheduleFrame()` from `addPoint`.

**H5. Strokes come out dotted (V).**
- **Where:** one stamp per pointer event. The Catmull-Rom step emits a single point per event (`BrushEngine.ts:108-115`), and CloneStamp has no interpolation at all.
- **Scenario:** at size 5, a fast stroke gives a string of dots.
- **Fix:** stamp along each segment at `spacing = max(1, radius*0.25)`.

**H6. Clone Stamp is wrong in three ways (V).**
- The radius is hard-coded to `size/2 * 0.5` (`CloneStampTool.ts:33`), which is half the cursor ring (`CanvasRenderer.ts:188`).
- Pressure is ignored.
- The source bitmap is captured at Alt-click and never refreshed or disposed. Nothing calls `CloneStampTool.dispose()` (grep). **Scenario:** set a source on image 1, open image 2, and clone. The tool paints image 1's pixels into image 2.
- **Fix:** use `brush.size/2 * pressure`, read the source layer bitmap at `beginStroke`, and dispose all tool singletons on document change or unmount (see M12).

**H7. Selections have no effect on anything (V).**
- **Where:** grep for `state.selection` finds readers only in the overlay (`CanvasRenderer.ts:207`) and the ToolHeader "has selection" flags.
- **Effect:** brush, eraser, clone, gradient and adjustments all ignore the selection. That misses the M4 acceptance criterion "Brush/adjustments clip to exact selection shape".
- **Related problems:**
  - The "Hold Shift to add" hint (`ToolHeader.tsx:146`) is not implemented.
  - `invertSelection` just deselects (`SelectionEngine.ts:116-121`).
  - A raster (wand) selection draws only its bounding rectangle as marching ants (`CanvasRenderer.ts:211-246`).
- **Fix:** add one `getSelectionClip(layerSpace)` that returns a Path2D (rect/ellipse/polygon) or a mask bitmap (raster). Apply it with `clip()` in `paintStamp`. For adjustments, lerp the original and adjusted results by the mask at commit.

**H8. The layer opacity slider floods history (V).**
- **Where:** each `onChange` calls `setLayerOpacity`, which calls `pushCommand` (`LayersPanel.tsx:388-391`, `LayerManager.ts:92-103`).
- **Scenario:** one drag from 100 to 0 creates dozens of commands. That evicts the 50-slot stack, so the user can no longer undo their brush work.
- **Related:** `TransformControls` W/H/° edits dispatch `UPDATE_LAYER` with no history at all (`ToolHeader.tsx:117-119`).
- **Fix:** dispatch `UPDATE_LAYER` live and push one command on commit (pointerup/blur), the same pattern TransformEngine already uses.

**H9. Text and shape layers cannot be moved, resized, rotated or re-edited, and default text is invisible (V).**
- **Where:** the gizmo and TransformEngine are image-only (`TransformEngine.ts:184`, `CanvasViewport.tsx:250`, `CanvasRenderer.ts:368`, `ToolHeader.tsx:113`). There is no path to edit an existing text layer. Text bounds are estimated as `len*size*0.6` (`LayerManager.ts:264`), not measured.
- **Default colour:** type colour defaults to `#ffffff` (`TypeTool.ts:27`) and new documents default to a white background (`NewDocumentModal.tsx:32`). The first text a user types is therefore invisible.
- **Fix:** the transform math has no image-specific parts, so drop the `type !== 'image'` guards for text and shape. Default the type colour to `colors.foreground`. Double-clicking a text layer should reopen TypeInput with its text. Measure bounds with `measureText`.

**H10. Save to Gallery loses the title and lineage and duplicates items (V).**
- **Title:** gallery imports are titled `'Untitled'` (`FileIO.ts:102`, pre-refactor), and `getSourceItemMeta` returns only category and tags (`GalleryBridge.ts:33-40`). Every edited image is saved as "Untitled".
- **Lineage:** `generationId: doc.sourceGalleryItemId` (`ImageEditorPage.tsx:171`) writes a *gallery item id* into a field documented as "Link to the Generation record" (`utils/galleryStorage.ts:170-171`). Lineage lookups by generationId will miss or mismatch. The source's own `generationId` and `prompt` are dropped.
- **Duplicates:** every Save calls `addItemToGallery`, which always creates a new id (`galleryStorage.ts:194`). Pressing Ctrl+S twice gives two items. The frontend plan's "Save as New / Update Original" choice (`image-editor-frontend-plan.md:293`) is missing.
- **JPEG prompt mismatch:** `willConvertToJpeg` defaults Drive to `?? true` (`GalleryBridge.ts:46`), but `addItemToGallery` uses the raw setting, so `undefined` means no conversion (`galleryStorage.ts:204-208`). Drive users with the setting unset get a warning about something that won't happen.
- **Confirm copy:** it asks "Save as PNG instead?" and then maps OK to "Save Anyway" (`ImageEditorPage.tsx:161`). No PNG option exists.
- **Fix:**
  - `getSourceItemMeta` should return `{title, categoryId, tags, generationId, prompt}`. Pass the source's `generationId` and set the title from the source.
  - Record `savedItemId` after the first save. Offer Update Original (`updateItemInGallery`) or Save as New.
  - Share one `shouldConvertToJpg()` helper between both call sites.
  - Replace `window.confirm` with the app's modal and real choices.

**H11. There is no way to add a blank layer (V).**
- **Where:** "+" opens a file picker (`LayersPanel.tsx:314-319`).
- **Effect:** users cannot paint a correction or an inpaint mask on its own layer, which is the standard non-destructive touch-up workflow. Only the gradient, text and shape tools create layers.
- **Fix:** make "+" create a transparent document-sized layer. Move "Place image…" to its own button.

**H12. Delete, duplicate and ungroup only work on top-level layers (V).**
- **Where:** `LayerManager.removeLayer` looks up `doc.layers.findIndex` (`:58`), and `duplicateLayer` does the same (`:146`).
- **Scenario:** group two layers, select a child, click the trash button. Nothing happens and there is no feedback. (Duplicate is not exposed in the UI anyway.)
- **Fix:** use `findLayerById` and `removeLayerById` from `layerTree.ts`, recording the parent and index for undo.

**H13. Import and create errors are swallowed, and there is no size guard (V).**
- **Swallowed errors:** `handleImport` and `handleCreateDocument` (`ImageEditorPage.tsx:186-201`) and `LayersPanel.handleAddLayer` (`:314-319`) have no try/catch. HEIC in Chrome and Firefox fails `createImageBitmap`, and `importImage` rethrows "Unsupported format: image/heic" (`FileIO.ts` importImage) as an unhandled rejection with no toast.
- **No size guard:** the NewDocumentModal `max=8192` is only an HTML attribute; `handleCreate` checks only `>= 1` (`:38`). Entering 30000 makes the OffscreenCanvas throw silently. Imports have no dimension cap at all: a 12k image is accepted, and then every brush stroke allocates a full-size canvas (`BrushEngine.ts:95`) and every eyedropper click a doc-size one (`CanvasViewport.tsx:190`).
- **Fix:** add a `MAX_DIM` constant (8192, and check `gl.MAX_TEXTURE_SIZE` for the GPU paths). Validate in `importImage` and `createBlankDocument`, and route errors to `showGlobalFeedback`. For HEIC, say "HEIC isn't supported by this browser — convert via Converter tab".

### Medium

- **M1. Magic Wand freezes on large regions (V code; S magnitude).** `queue.shift()` makes the BFS O(n²), and it allocates a 4-element array per pixel on the main thread (`FloodFill.ts:56,67-72`). The **Contiguous** checkbox isn't wired (`ToolHeader.tsx:238`, while `CanvasViewport.tsx:181` hard-codes `true`). A click outside the layer is clamped to the edge and selects an edge region. **Fix:** use an index-pointer queue on an `Int32Array`, wire the checkbox, and ignore out-of-bounds clicks.
- **M2. Resizing a rotated layer goes the wrong way (V).** `applyHandle` applies doc-space dx/dy without rotating them into the layer frame (`TransformEngine.ts:128-163`). **Scenario:** on a layer rotated 90°, dragging the right handle grows the wrong axis and the layer drifts. **Fix:** rotate the delta by `-rotation` and keep the opposite handle anchored.
- **M3. Curves preview is not what gets applied (V).** The shader approximates Curves as Levels built from only the first and last points (`AdjustmentPreview.ts:212-223`), so middle control points have no effect on the preview. **Fix:** upload a 256×1 LUT texture built by the existing kernels.
- **M4. Adjustment preview stutters (V).** `MARK_LAYER_DIRTY` is a no-op while the id is already dirty (`store.ts:239`). During async thumbnail regeneration, slider updates therefore don't notify the renderer. **Fix:** have the preview path call the renderer's `scheduleFrame` directly, or bump a `previewVersion`.
- **M5. Adjustments can only be opened by shortcut (V).** Ctrl+L/M/U/E is the only entry point (grep `OPEN_ADJUSTMENT`), with no menu or button. Ctrl+E clashes with the plan's Merge Down (`frontend-plan.md:160`). A panel opened on a text or shape layer silently does nothing, because `sourceRef` is null (`LevelsPanel.tsx:62-64`).
- **M6. Histograms run on the main thread (V).** They do a full-resolution `getImageData` on every channel click (`LevelsPanel.tsx:15-30`), which is about 256 MB at 8k. **Fix:** downsample to at most 512 px before counting.
- **M7. Eyedropper is wrong and expensive (V).** It allocates a document-sized canvas per click, draws only image layers, and ignores rotation, flip and masks. It also passes `'normal'` as a `globalCompositeOperation`, which is invalid (`CanvasViewport.tsx:188-207`). **Fix:** reuse the new drawLayer export compositor on a 1×1 canvas translated to the point, or read the on-screen canvas pixel.
- **M8. Shortcuts fire behind modals, and Space re-clicks focused buttons (V code; S browser default).** `useEditorShortcuts` has no modal guard, so tool keys, Ctrl+Z and Ctrl+S act behind the New Document, Export and Recovery modals. The Space-to-pan handler doesn't call `preventDefault` (`CanvasViewport.tsx:100-104`). **Scenario:** click Undo or Flip H, then hold Space to pan. The keyup fires the focused button again, which undoes or flips again. Ctrl+Y (Windows redo) is not bound.
- **M9. Every pointer move re-renders the whole page (V).** `onCursorMove={setCursorPos}` lives in ImageEditorPage state (`:90,277,282`), so each move re-renders the toolbar, rail, header, viewport and layers panel, including during strokes. **Fix:** give the StatusBar its own tiny cursor emitter.
- **M10. Autosave has cost and race problems (V code; S cost).**
  - It re-encodes every layer at full resolution 2 s after any dirty change (`AutosaveService.ts:220-237`), on the main thread.
  - An in-flight `saveDocument` can finish after `clearSavedDocument` and resurrect the record, causing a spurious recovery prompt.
  - Discard in the unsaved modal doesn't clear autosave, so the next session offers to recover work the user threw away.
- **M11. The recovery modal can replace a just-opened image (V).** It is checked unconditionally on mount (`ImageEditorPage.tsx:141-145`), so it appears over a Gallery-opened image, and Restore replaces that image silently (`:238-246`). `sourceMetaRef` still points at the gallery item, so a later save inherits the wrong category. Restore also doesn't call fitToViewport. **Fix:** when `openPayload` is present, show a non-blocking "Recover previous session?" banner, and confirm before replacing.
- **M12. Module singletons are never disposed (V).** `BrushEngine`, `CloneStampTool`, `AdjustmentEngine` (worker, WebGL context, preview map), `BlendCompositor`, and SelectionEngine's lasso and poly state all survive unmount and document switches. Only ThumbnailCache is disposed (`CanvasRenderer.ts:99`). **Fix:** call a single `disposeTools()` from the unmount and SET_DOCUMENT paths.
- **M13. The gradient has no live preview (V).** The pointermove branch is gated by `SelectionEngine.isDragging()` (`CanvasViewport.tsx:275,285`), so `updateGradient` never runs and the preview line stays a dot. The gradient also ignores the selection, and the plan's foreground-to-transparent mode is missing. **Fix:** move the gradient branch outside the SelectionEngine gate.
- **M14. Wheel `preventDefault` probably doesn't work (S; standard React behaviour).** React attaches `onWheel` as passive, so `e.preventDefault()` at `CanvasViewport.tsx:117-120` is ignored. Ctrl+wheel and trackpad pinch then zoom the browser page instead of the canvas. **Fix:** a native `addEventListener('wheel', h, {passive:false})` on the container.
- **M15. Undo and redo always mark the document dirty (V).** `store.ts:339,345` set `isDirty: true` even when the stack returns to the saved state.

### Low

- The layer lock toggle is stored but never enforced by any tool (grep `locked`).
- The mask chip is a static checkerboard with no mask thumbnail. REMOVE_LAYER never calls `ThumbnailCache.invalidate`.
- Group opacity and blend mode are not composited. This is documented, and the UI disables them, so it is coherent.
- **Adjustment layers:** the `'adjustment'` type exists, and autosave serializes it, but the renderer skips it (`CanvasRenderer.ts:491-500`) and nothing creates one. That matches the plan (V2, engineering `:277`), so there is no user-visible no-op; it is just dead branches. Adjustments are destructive and panel-only, which is coherent with the M3 plan text.

### Things the in-flight fixes must also handle

**Export via drawLayer:**
1. `drawImageLayer` substitutes `AdjustmentEngine.getPreviewBitmap(layer.id)` (`CanvasRenderer.ts:577`). An export taken while an adjustment panel is open would bake in the *uncommitted* preview. Pass an `{ export: true }` flag that forces `layer.bitmap`.
2. The manual blend path reuses `this.soloScratch` and `this.blendCompositor`, sized to the target canvas (`:518-538`). An export at document size resizes the on-screen scratch, then the next frame resizes it back. Use a separate compositor instance for export. Large exports can also exceed `MAX_TEXTURE_SIZE`: catch that and fall back to source-over with a warning.
3. Crop (C2): text and shape layers aren't shifted, so a correct drawLayer export will now faithfully render them misplaced.
4. Point the eyedropper (M7) and Save to Gallery at the same compositor.

**Open Image / drop / Ctrl+O:**
1. Clear history (H2), dispose tool singletons (H6/M12), set the title from the filename, set `sourceMetaRef = null`, and suppress or resolve the recovery modal (M11).
2. Wrap the flow in try/catch that surfaces HEIC and oversize errors (H13), and route it through `runWithUnsavedGuard` when the current document is dirty.
3. The existing `handleImport` adds layers with a raw `dispatch({type:'ADD_LAYER'})` (`ImageEditorPage.tsx:190`), which is **not undoable**. LayersPanel uses the undoable `LayerManager.addLayer`. A drop onto an open document should use `LayerManager.addLayer`.
4. A dropped image larger than the document lands at (0,0) unscaled. Offer fit-to-canvas, and centre it.
5. Paste (Ctrl+V, clipboard image) should share the same path; it is absent today.

---

## 2. Milestone completeness (engineering plan §9)

| Planned feature | Status | Evidence |
|---|---|---|
| **M1** Gallery → Edit opens the image | broken (lead fixing) | App.tsx payload clear; FileIO.ts importFromPayload |
| M1 Zoom (wheel, cursor-anchored) and pan (space and hand) | done, with a caveat | CanvasRenderer.ts:103-136. Wheel is passive (M14); two-finger pan is missing (wheel always zooms) |
| M1 PNG/JPEG export | partial (lead fixing) | FileIO exportToBlob; ExportModal.tsx |
| M1 Save to Vault round-trip | partial | GalleryBridge.ts; title, lineage and duplicates wrong (H10) |
| **M2** Import multiple images as layers | done | LayersPanel.tsx:314-319 |
| M2 Drag reorder, visibility, opacity, 16 native blend modes | done, with caveats | LayersPanel.tsx:396-434. Top level only; opacity floods history (H8) |
| M2 Undo/redo of structural ops | partial | LayerManager wraps ops; crop not undoable (C2); history persists across documents (H2) |
| M2 Command stack with dirty-rect diffs | missing (full snapshots) | BrushEngine.ts:135-144; plan §8 :334 (H3) |
| M2 Layer thumbnails | done | ThumbnailCache.ts; CanvasRenderer.ts:689-699 |
| M2 Crash and reload recovery | broken | JPEG alpha loss, masks dropped (C3); modal over an open image (M11) |
| M2 Groups with recursive compositing | partial | Organizational only (LayerManager.ts:192-197); child delete broken (H12) |
| **M3** Levels, Curves, Hue-Sat, Exposure: GPU preview plus worker commit, undoable | partial | Works; Curves preview wrong (M3); shortcut-only entry (M5); ignores selection (H7) |
| M3 Kernel tests | done | __tests__/AdjustmentKernels.test.ts (16 pass) |
| M3 Brush/Erase smooth, with pressure, one undo per stroke | partial | Undo per stroke works; no live preview (H4); dotted strokes (H5); wrong coordinates (C1); not on a worker as planned |
| **M3.5** Mask painting | partial | Works on untransformed layers; coordinates (C1); lost on autosave (C3) |
| M3.5 Gradient linear/radial | partial | Works; no live preview (M13); no fg-to-transparent; ignores selection |
| M3.5 Shape rect/ellipse, editable | partial | Created; cannot be moved or edited afterwards (H9); no stroke UI |
| M3.5 Type with inline editing, font, size, colour, alignment | partial | Create only; no re-edit or move (H9); no alignment control; invisible default (H9) |
| **M4** Marquee rect/ellipse | partial | Draws ants; no add/subtract; no effect on tools (H7) |
| M4 Lasso freehand and polygonal | partial | Draws polygon; no effect (H7) |
| M4 Magic wand with tolerance | partial | O(n²) (M1); contiguous not wired; coordinates (C1); no effect (H7) |
| M4 "Brush/adjustments clip to selection" | missing | Nothing reads `state.selection` (H7) |
| M4 Move, scale, rotate, flip gizmo, non-destructive | partial | Image layers only (H9); rotated resize wrong (M2) |
| M4 Crop | broken | Not undoable, misses non-image layers (C2) |
| M4 Gallery lineage (generationId) and category/tag passthrough | partial | Category and tags done; generationId wrong (H10) |
| (§6) 9 manual WebGL2 blend modes, which §11 recommended deferring | done | BlendCompositor.ts |
| Clone Stamp, eyedropper, colour picker (not in the M1–M4 text) | partial | CloneStamp (H6); eyedropper (M7); ColorPicker.tsx is fine |
| Merge down, flatten, layer context menu, duplicate (frontend plan :160,201,204) | missing | grep "merge" / "flatten": no implementation |
| Cut, copy, paste (frontend plan :158) | missing | grep "paste": none |

---

## 3. Day-one gaps for a Photoshop/Photopea user, prioritized for the AI-image workflow

AI-image workflow means touch-up, inpaint-mask prep, crop and resize for upload, and text overlays.

| Pri | Capability | Status | Evidence / note |
|---|---|---|---|
| P0 | Open file / drag-drop | lead adding | — |
| P0 | Brush and eraser that paint where you click, visibly | broken | C1, H4, H5 |
| P0 | Undo crop / crop with confirm | absent | C2 |
| P0 | Resize image (resample to W×H for upload) | absent | No action or UI anywhere |
| P0 | New blank layer | absent | H11 |
| P0 | Paint confined to a selection | absent | H7 |
| P1 | Paste image from clipboard (Ctrl+V) | absent | Common for AI outputs copied from other tools |
| P1 | Canvas size (extend or outpaint-prep padding) | absent | — |
| P1 | Crop to selection | absent | — |
| P1 | Export mask as black/white PNG (inpaint prep) | absent | Masks exist but can't be exported on their own |
| P1 | Move, resize and re-edit text | absent | H9 |
| P1 | Brush size `[` `]`, hardness `Shift+[` `]` | absent | useEditorShortcuts.ts has no bracket keys |
| P1 | Merge down / flatten | absent | Planned (frontend plan :160,201) |
| P1 | Fill selection / paint bucket (Shift+F5, Alt+Backspace) | absent | — |
| P2 | Rotate canvas 90° / flip canvas | absent | Per-layer flip only (ToolHeader.tsx:133-134); no document-level rotate |
| P2 | Delete key clears selection / deletes layer | absent | — |
| P2 | Copy/cut selection to a new layer (Ctrl+J, Ctrl+C) | absent | — |
| P2 | X swap / D default colours | partial | Buttons exist (ToolRail.tsx:65-72); no hotkeys |
| P2 | Stroke selection | absent | — |
| P2 | History panel | absent | Labels exist on commands, so it would be cheap to add |
| P3 | Zoom 100% (Ctrl+1), fit (Ctrl+0), zoom in/out | present | useEditorShortcuts.ts:59-75 |
| P3 | Undo/redo Ctrl+Z / Ctrl+Shift+Z | present | Ctrl+Y missing |
| P3 | Layer flip H/V | present | TransformEngine.ts:236-260 |
| P3 | WebP export | absent | Only png and jpeg (ExportModal.tsx:56) |

---

## 4. Recommended M5 scope: "make editing real"

This is not new tools. The sequence runs roughly from cheapest and highest-value to more involved:

1. **Correctness foundation**
   - `docToLayer` mapping for all pixel tools (C1).
   - Clear history in `SET_DOCUMENT` plus a `SET_TITLE` action (H2).
   - `disposeTools()` (M12).
   - Crop as a HistoryCommand that shifts every layer type, with confirm/cancel (C2).
2. **Brush that feels right:** live stroke preview (H4), spaced stamping (H5), a correct clone radius and pressure and a fresh source (H6).
3. **Selection clipping** for brush, eraser, clone, gradient, fill and adjustments (H7), plus fill selection and delete-in-selection. This single feature is what turns the four existing selection tools from decoration into function.
4. **Autosave integrity:** PNG blobs and mask serialization (C3). Make the unsaved-modal Save return a boolean (H1). Non-blocking recovery when a payload is present (M11).
5. **Layer basics:**
   - New blank layer (H11) and nested delete (H12).
   - Merge down and flatten, using the new drawLayer compositor.
   - One history entry per slider drag (H8).
6. **Upload workflow:**
   - Image Size (resample) and Canvas Size dialogs, plus crop to selection.
   - Paste from clipboard.
   - Export mask as PNG.
   - A max-dimension guard with a HEIC error message (H13).
7. **Gallery round-trip:** carry title, generationId and prompt through, and add Update Original vs Save as New (H10).
8. **Text and shape usability:** make them movable and re-editable, and default text to the foreground colour (H9).
9. **Tests:** the plan's E2E flow (Gallery → Edit → brush → Levels → Save) plus unit tests for `docToLayer`, crop undo, and autosave round-trip alpha. No test today would catch C1 to C3.

**Explicitly defer** until these land: more blend modes, adjustment layers, a history panel, and polishing Wand and Lasso beyond the flood-fill performance fix.

**Main risk to M5:** H3 (memory). Doing dirty-rect history properly touches every pixel tool. Do the byte-capped and `close()` short-term fix inside M5, and schedule the diff history right after, before anyone opens 8k documents routinely.
