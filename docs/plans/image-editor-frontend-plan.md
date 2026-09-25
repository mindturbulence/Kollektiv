# Kollektiv Image Editor — Frontend UI/UX Plan

> Source: Compositor (MIT), https://github.com/robbietilton/Compositor  
> Generated: 2026-09-22  
> Grounded in: `types.ts`, `tailwind.config.js`, `index.css`, `components/icons.tsx`, `components/transitions/routeFx.ts`, `components/ImageCard.tsx`, `components/ImageGallery.tsx`, `components/ComposerPage.tsx`, `utils/galleryStorage.ts`, `contexts/BusyContext.tsx`  
> Status: Planning — no code written

---

## 1. Layout Architecture

The editor is a single full-viewport tab body (`image_editor` in `ActiveTab`), a fixed-height flex column that owns 100% of the content area below `Header` — matching how `ComposerPage`/`LoraEditorPage` take over the page.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ EditorToolbar  (h-11 / 44px)  — file · undo/redo · zoom · doc name · Save│
├───┬─────────────────────────────────────────────────────────────────────┤
│   │ ToolHeader (h-9 / 36px) — context controls for active tool          │
│ T ├──────────────────────────────────────────────────────────┬──────────┤
│ o │                                                           │  Layers  │
│ o │                                                           │  Panel   │
│ l │              CanvasViewport                               │  (252px  │
│   │         (scrollable, checkerboard, rulers V2)            │  resiz-  │
│ R │                                                           │  able)   │
│ a │                                                           │          │
│ i │                                                           │          │
│ l │                                                           │          │
│44 │                                                           │          │
│px │                                                           │          │
├───┴──────────────────────────────────────────────────────────┴──────────┤
│ StatusBar (h-7 / 28px) — zoom % · cursor X,Y · canvas WxH · busy dot    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Region sizing (mirrors Compositor's chrome, mapped to Tailwind)

| Region | Size | Notes |
|---|---|---|
| `EditorToolbar` | `h-11` (44px) | Fixed, spans full width |
| `ToolHeader` | `h-9` (36px) | Fixed; content swaps per active tool |
| `ToolRail` | `w-11` (44px) | Fixed, full height between toolbar and status bar |
| `LayersPanel` | 252px default, `min-w-[200px] max-w-[420px]` | User-resizable via left-edge drag handle |
| `StatusBar` | `h-7` (28px) | Fixed, spans full width |
| `CanvasViewport` | `flex-1` | Fills remaining space; internally scrollable |

**Resizable panel**: `LayersPanel` gets a 4px drag handle on its left edge (`cursor-col-resize`, `hover:bg-primary/30`), mirroring Compositor's `PanelResizeEdge`. Width tracked in component state + `useLocalStorage('imageEditor.layersPanelWidth', 252)`. Implemented with `pointermove`/`pointerup` — same primitive used for carousel drag in `ItemDetailView.tsx`.

**Floating modals**: Levels, Curves, Hue/Saturation are NOT docked — they are `FloatingPanel` instances (`position: fixed`), draggable, with a resize corner. They default-position over the right-third of the canvas so the image stays visible while adjusting.

**Scrollable canvas**: `overflow-auto` with `overscroll-contain`. Custom scrollbar styling (`::-webkit-scrollbar` thin, `bg-base-content/10` thumb) matches the thin scrollbars in `ImageGallery.tsx`.

**Full-screen mode**: Toolbar `ExpandIcon` → `document.documentElement.requestFullscreen()` + auto-hide `ToolHeader` non-essentials + `LayersPanel` collapses to hover-reveal edge strip. `Escape` restores.

---

## 2. Component Tree

```
ImageEditorPage                         # tab entry; owns EditorSession + all editor state
├── EditorToolbar
│   ├── DocumentTitle (inline-rename)
│   ├── UndoRedoGroup
│   ├── ZoomControl (dropdown + fit/100% buttons)
│   └── SaveExportGroup (Save to Gallery, Export)
├── ToolRail
│   ├── ToolButton × N               # one per tool, see §3
│   └── ForegroundBackgroundSwatches # color chips + swap/reset glyphs
├── ToolHeader                        # renders ONE of the following based on activeTool
│   ├── SelectionToolHeader
│   ├── BrushControls
│   ├── TransformInspector
│   ├── ShapeControls
│   ├── TypeControls
│   └── GenericToolHeader             # eyedropper/hand/zoom: minimal hints only
├── EditorBody (flex-row, flex-1)
│   ├── CanvasViewport
│   │   ├── EditorCanvas              # composited raster <canvas> (WASM/Worker writes here)
│   │   ├── OverlayCanvas             # selection marching ants, transform handles, brush cursor
│   │   ├── GuideLayer                # ruler-dragged guides (V2)
│   │   └── RulerCorner / RulerTop / RulerLeft  (V2, Ctrl+R)
│   └── LayersPanel
│       ├── LayersToolbar (+, trash, merge, group buttons)
│       ├── LayerList (virtualized if >30 rows)
│       │   └── LayerRow × N
│       │       ├── LayerThumbnail
│       │       ├── LayerMaskThumbnail (conditional)
│       │       ├── VisibilityToggle
│       │       ├── LockToggle
│       │       └── LayerNameInline (dbl-click to rename)
│       ├── BlendModeSelect
│       ├── OpacitySlider
│       └── LayerContextMenu (right-click portal)
├── FloatingPanelHost                 # portal root; renders 0..N FloatingPanel instances
│   ├── FloatingPanel (generic: title bar drag, resize corner, OK/Cancel footer)
│   │   ├── LevelsPanel
│   │   ├── CurvesPanel
│   │   └── HueSaturationPanel
│   └── ColorPicker (also uses FloatingPanel chrome)
├── StatusBar
│   ├── ZoomReadout
│   ├── CursorCoordinates
│   ├── CanvasDimensions
│   └── BusyIndicator (reads useBusy())
└── modals (portal, conditional)
    ├── NewDocumentModal
    ├── ExportModal
    └── UnsavedChangesModal
```

**State ownership** *(revised — supersedes the earlier React-context wording; matches engineering plan §2)*: the source of truth is a plain module-scoped `EditorStore` object with `getSnapshot()` / `subscribe()`. `CanvasRenderer` subscribes to it imperatively so the paint loop never touches React. `ToolRail` / `ToolHeader` / `LayersPanel` read it via `useSyncExternalStore` (React 19 built-in — still no new dependency). A page-scoped context is *not* used for editor state: context propagates a re-render through the tree on every update, and pointer-driven tool state updates at 120Hz. Context remains fine for the one genuinely static value (the store handle itself), if prop-drilling that becomes tedious.

`EditorCanvas` and `OverlayCanvas` are stacked absolutely (`absolute inset-0`) inside `CanvasViewport`. The overlay never touches pixel data — only draws UI chrome (marching ants via `requestAnimationFrame` dash-offset, transform handles, brush-size ring).

---

## 3. Tool Rail Design

`ToolRail` is a 44px-wide column of `ToolButton`s (44×44 each), 2px left-border accent (`border-primary`) when active — matching `active bg-primary/10 text-primary` treatment used in `ImageGallery.tsx` view-mode toggles.

Icons: new additions to `components/icons.tsx`, hand-drawn in the existing Tabler-Icons-derived 24×24 / `strokeWidth:1.5` style. **No new icon-library dependency** — Lucide/Phosphor used only as visual reference when authoring SVGs.

| Tool | New icon name | Shortcut | Group | Sub-modes |
|---|---|---|---|---|
| Move | `MoveIcon` (4-way arrow) | `V` | Transform | — |
| Marquee | `SquareDashedIcon` | `M` | Selection | Rectangle / Ellipse — `Shift+M` cycles |
| Lasso | `LassoIcon` | `L` | Selection | Freehand / Polygonal — `Shift+L` cycles |
| Magic Wand | `WandIcon` | `W` | Selection | Wand / Object (V2, ML) — `Tab` cycles |
| Crop | `CropIcon` | `C` | Transform | — |
| Brush/Erase | `BrushIcon` / `EraserIcon` | `B` / `E` | Paint | Brush + Erase share one rail slot; `E` jumps to Erase, `B` back to Brush |
| Clone Stamp | `StampIcon` | `S` | Paint (V2) | — |
| Blur/Smear | `DropletIcon` | `R` | Paint (V2) | Blur / Smear — `Shift+R` cycles |
| Gradient | `GradientIcon` | `G` | Fill | Linear / Radial — `Shift+G` cycles |
| Shape | `ShapeIcon` | `U` | Vector | Rectangle / Ellipse — `Shift+U` cycles |
| Type | `TypeIcon` | `T` | Vector | — |
| Eyedropper | `EyedropperIcon` | `I` | Utility | — |
| Hand | `HandIcon` | `H` | Utility | — |
| Zoom | `ZoomIcon` | `Z` | Utility | click = zoom in; `Alt+click` = zoom out |

Below the tool list, a **swatch cluster** (foreground/background color chips, Photoshop-style overlapping squares) opens `ColorPicker` on click, with `X` swap and `D` reset-to-black/white glyphs, `sticky bottom-0`.

Tooltips: DaisyUI `data-tip="Brush (B)"` on every `ToolButton`.

---

## 4. Keyboard Shortcuts

Implemented in a single `useEditorShortcuts` hook (page-scoped, mounted once in `ImageEditorPage`, does not collide with global `CommandPalette`). Disabled when any text input has focus or the Type tool is editing a text layer.

Modifier resolved at runtime: `event.ctrlKey` on Windows (this workstation), `event.metaKey` on macOS.

| Action | Shortcut | Notes |
|---|---|---|
| Move / Marquee / Lasso / Wand / Crop / Brush / Erase / Clone / Blur / Gradient / Shape / Type / Eyedropper / Hand / Zoom | `V M L W C B E S R G U T I H Z` | Single-letter, no modifier |
| Fit to window | `Ctrl+0` | |
| 100% | `Ctrl+1` | |
| Zoom in / out | `Ctrl+=` / `Ctrl+-` | Centered on viewport center; `Ctrl+Wheel` centers on cursor |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` | |
| Copy / Paste / Cut | `Ctrl+C` / `Ctrl+V` / `Ctrl+X` | Operates on active selection or active layer |
| New layer | `Ctrl+Shift+N` | |
| Merge down | `Ctrl+E` | |
| Group layers | `Ctrl+G` | Requires ≥2 selected layer rows |
| Levels | `Ctrl+L` | Opens `LevelsPanel` as `FloatingPanel` |
| Curves | `Ctrl+M` | |
| Hue/Saturation | `Ctrl+U` | |
| Deselect | `Ctrl+D` | |
| Invert selection | `Ctrl+Shift+I` | |
| Save to gallery | `Ctrl+S` | |
| Export | `Ctrl+Shift+S` | Opens `ExportModal` |
| Import | `Ctrl+O` | Native file picker |

macOS-menu-only Compositor shortcuts intentionally omitted — every action has an on-screen equivalent (toolbar button, panel action, or context menu).

---

## 5. Layers Panel Design

### Layer row anatomy (height: 28px fixed, matches Compositor)

```
┌──┬────────┬──────────────────────────┬──────┬───┬───┐
│⠿ │ [thumb]│ Layer Name       [msk]   │  👁  │ 🔒│   │
└──┴────────┴──────────────────────────┴──────┴───┴───┘
  drag  24×24 px                          vis   lock
  handle
```

- **Thumbnail**: 24×24, checkerboard background for transparency, `1px border-base-content/10`.
- **Drag-to-reorder**: native HTML5 drag (`draggable`, `onDragStart/Over/Drop`) with a 1px primary-colored insertion-line indicator. Reuse pattern from `PromptCrafter.tsx` wildcard-tree reordering.
- **Selection**: single-click selects (`bg-primary/10`); `Ctrl/Shift+click` multi-selects for group/merge/delete-multiple.
- **Inline rename**: double-click → borderless `<input>` (`autoFocus`, `onBlur`/`Enter` commits, `Escape` cancels) — same interaction as `ItemDetailView.tsx` title editing.
- **Mask thumbnail**: 24×24, grayscale preview, shown only when layer has a mask.
  - Click → selects mask for painting (ring `ring-1 ring-primary` swaps from RGB thumb to mask thumb)
  - `Shift+click` → toggles mask disabled (red diagonal strike, canvas re-renders ignoring mask)
  - `Alt+click` → toggles "view mask as grayscale" on main canvas (`Esc` to exit)
- **Adjustment-layer rows**: thumbnail replaced by small colored glyph badge (`accent/20` bg, `text-accent` `#7B5CFF`) + name in `text-accent`. Identifies adjustment layers at a glance.
- **Group rows**: folder icon + chevron to toggle expand/collapse; nested rows indented `pl-4` with `border-l border-base-content/10` guide line.

### Panel chrome

- Header: `.panel-header` class (reused verbatim), "LAYERS" in `font-display` uppercase tracking-widest, `h-9`.
- Footer: `.panel-footer` class (`h-9`): **Add (+)**, **Delete (trash)**, **Merge Down (chain-link)**, **Group (folder+)** — icon-only buttons with tooltips.
- **Blend mode**: `<select class="select select-xs select-bordered">` listing the 16 native Canvas2D blend modes. Appears above the layer list, applies to the active layer.
- **Opacity**: `<input type=range>` paired with a `<input type=number>` (0–100), same row as blend mode. Styled matching existing slider treatments in `MediaAnalyzer.tsx`/`PromptCrafter.tsx`.
- **Right-click context menu**: portal-rendered menu (reuse `CommandPalette.tsx` floating-list pattern). Items: Duplicate Layer, Delete Layer, Flatten Image, Add Layer Mask, Delete Layer Mask, Merge Down, Layer Properties.

---

## 6. Viewport & Canvas UX

- **Zoom**: Mouse wheel over `CanvasViewport` zooms (no modifier — browser Ctrl+scroll reserved for OS page zoom). Anchored on cursor: viewport scroll offset recalculated so the pixel under the cursor stays fixed. Standard Photoshop stop table: 12.5, 25, 33.3, 50, 66.7, 100, 150, 200, 300, 400, 600, 800, 1200, 1600%.
- **Pan**: `Space`+drag temporarily activates pan-drag regardless of active tool. Hand tool (`H`) makes it permanent. Two-finger trackpad scroll pans natively via `overflow-auto` container (no custom handling needed).
- **Pixel grid**: at zoom ≥ 800%, `OverlayCanvas` draws 1px grid aligned to pixel boundaries (`rgba(255,255,255,0.08)`), toggled automatically by zoom level.
- **Canvas bounds shadow**: `box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 24px 48px -12px rgba(0,0,0,0.8)` so the document edge reads clearly against the dark viewport background.
- **Rulers** (V2, `Ctrl+R`): 20px-thick `RulerTop`/`RulerLeft` strips, tick marks on `<canvas>` synced to zoom/scroll. Dragging from a ruler spawns a guide line. `RulerCorner` (20×20) = "reset guides" click target.
- **Transparency checkerboard**: CSS `background-image` on `EditorCanvas`'s wrapper — `repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 0 0/16px 16px`. No JS cost.

---

## 7. Adjustment Panels (Floating)

All three panels share `FloatingPanel` chrome: 36px title bar (drag handle, `cursor-move`), 20×20 close/cancel button, resize handle (bottom-right corner), `.panel-footer`-styled action row with **Cancel** / **OK** (`.form-btn` / `.form-btn-primary`). Default position: centered over the right-third of the canvas.

Live preview applies to the canvas as controls change (debounced via `requestAnimationFrame`). **OK** commits to history; **Cancel**/**Esc** discards preview.

### LevelsPanel (`Ctrl+L`)
- Channel selector: DaisyUI `tabs` — RGB / R / G / B
- Histogram: 256×100 `<canvas>`, log-scaled bar heights, redrawn on channel change
- Three draggable triangle handles: black-point, gamma/midtone (0.1–9.99), white-point — `<div>` triangles positioned via `left: %`, dragged with `pointermove`
- Output range: thin second gradient bar with its own black/white sliders
- Numeric readouts (editable `<input type=number>`) for all 5 slider values
- **Auto** button: clips 0.5% at each histogram tail

### CurvesPanel (`Ctrl+M`)
- 256×256 `<canvas>` graph: diagonal identity line, 4×4 background grid, faint histogram silhouette
- Channel selector: RGB/R/G/B tabs
- Click empty space → add control point; drag → move; double-click or Delete → remove (endpoints immovable horizontally)
- Catmull-Rom/cubic spline interpolation through control points, clamped to [0,255]
- Point coordinate readout (`Input: 128  Output: 96`) near the dragged point

### HueSaturationPanel (`Ctrl+U`)
- Three sliders: **Hue** (−180…180), **Saturation** (−100…100), **Lightness** (−100…100); numeric inputs; colored gradient track backgrounds
- Targeted range selector: DaisyUI `select` — Master + 6 named ranges (Reds/Yellows/Greens/Cyans/Blues/Magentas). Named range shows a color-ramp strip with two falloff handles
- **Colorize** toggle: tints whole image to one hue; disables range selector

---

## 8. Kollektiv Theme Integration

Colors taken entirely from the active DaisyUI CSS variables — no hardcoded values; correctly re-skins when user switches themes.

| Surface | Token / value | Source |
|---|---|---|
| Editor page background | `bg-base-100` (`#0F120C`) | `tailwind.config.js` Kollektiv theme |
| `ToolRail` / `EditorToolbar` / `StatusBar` | `bg-base-100/85` + `backdrop-blur-md`, `border-b/t border-base-content/5` | mirrors `.panel-header`/`.panel-footer` treatment |
| `LayersPanel` | `bg-base-200` (`#1C2018`) | visually separated from canvas surround |
| `FloatingPanel` body / title bar | `bg-base-300` (`#22261D`) / `bg-base-100/90` | raised feel over base page |
| Active tool / active layer row | `bg-primary/10 text-primary` (`#C0F04C` lime) | matches view-mode/mediaTypeFilter toggles in `ImageGallery.tsx` |
| Adjustment-layer accent | `text-accent / bg-accent/20` (`#7B5CFF` purple) | distinct from pixel layers at a glance |
| Panel/rail hairlines | `border-base-content/5` to `/10` | matches existing `[data-theme] .panel-footer { border-top }` rule |
| Buttons | `.form-btn` / `.form-btn-primary` / `.btn-snake` / `.btn-snake-primary` verbatim | `index.css` |
| Panel titles | `font-display` (`Space Grotesk` under Kollektiv theme) | matches all other panel headers |
| Body/UI text | `font-sans` (`Nunito`) | `tailwind.config.js` |
| Numeric readouts (coords, zoom %, HSL) | `font-mono` (`JetBrains Mono`) | matches `ID#{item.id}` badges |

**GSAP transition**: Add `'image_editor'` to `TOOL_GROUP` in `components/transitions/routeFx.ts` (reuses existing `'tool-mount'` FX: `shards` geometry, 220ms hold) for consistency with other tools. If a bespoke "aperture" feel is wanted, add `FxKind: 'aperture-open'` to `FX_META` (`{ geometry: 'iris', hold: 260 }`) and wire `if (to === 'image_editor') return 'aperture-open';` into `resolveFx` — one-line addition, no new transition primitive.

**Loading states**: All async engine work (image decode, WASM init, export encode) goes through `useBusy()`/`setIsBusy()` from `contexts/BusyContext.tsx`. `StatusBar`'s `BusyIndicator` shows a pulsing dot + "PROCESSING". Long operations (initial open, large export) show a thin indeterminate `progress progress-primary` bar under `EditorToolbar` — editor never becomes unresponsive to tool switching while a Worker runs.

---

## 9. Gallery Integration UX

### Entry from Gallery
`ImageCard.tsx` gains an **"EDIT"** pill button in the hover-overlay action row (uppercase, `font-mono`, `text-primary`, same `opacity-0 group-hover:opacity-100 transition-opacity` pattern already in `ImageCard.tsx`). Click emits `appEventBus.emit('openInEditor', { galleryItemId, url })` → `App.tsx` sets `activeTab = 'image_editor'` and passes the payload to `ImageEditorPage`.

### Entry from Composer
`ComposerPage.tsx` gains an **"Edit in Editor"** button alongside Save/Export. Calls `generateFinalCanvas()`, converts via `canvas.toBlob()`, emits `appEventBus.emit('openInEditor', { blob })`. Same ingestion path as Gallery entry.

### Entry with no payload: "Open or Create" (revised 2026-09-24)
> **Why revised:** the original spec made the no-payload entry blank-canvas-only, so an *image* editor opened from the Studio menu could not open an image. The Gallery→EDIT path also failed (a payload race, and vault-relative URLs that were `fetch`ed). See [2026-09-24 review §1](2026-09-24-app-review-and-revision-plan.md).

Navigating to `image_editor` with no payload, or pressing **New** in `EditorToolbar`, opens `NewDocumentModal` titled **"Open or Create"**:
- **Primary: "Open image…"**. This is a dashed drop zone that is also a button (native file picker, `image/*`), with the hint "or drop a file here · Ctrl+O". A picked or dropped file becomes a document sized to the image, titled from the filename.
- Divider: "or start blank".
- Blank canvas: width × height, presets (1024², 1920×1080, 512²), background White / Transparent. The button reads **"Create Blank"**.
- *Still to do:* a lock-aspect toggle, a "Foreground" background choice, and **"Recent from Vault"**: the last 6 gallery images as thumbnails, one click to open (reuse `ImageCard` thumbnail loading via `GalleryBridge.loadGalleryImage`).

**Drop anywhere on the editor.** With no document, the file becomes the document. With a document open, it is placed as a new top layer through the undoable `LayerManager.addLayer`. **Ctrl+O** follows the same rule. Errors (HEIC in Chromium/Firefox, oversize, corrupt) surface through `showGlobalFeedback`; they are never swallowed.

**Vault images** are resolved by `GalleryBridge.loadGalleryImage(url)`: data:/http/blob: URLs are fetched, and anything else is read through `fileSystemManager.getFileAsBlob`. `core/io/FileIO` never touches the vault.

**Recovery prompt.** *Current:* a blocking "Unsaved Work Found" dialog at z-1100 (above the start modal). *Target:* when the editor opened with a payload (Gallery/Composer/Assets), show a non-blocking banner, "Recover previous session?", and confirm before replacing the opened image.

**Adjustments entry (new).** Adjustments open only by shortcut today (Ctrl+L/M/U/E). Add an **Adjust** menu in `EditorToolbar` listing Levels, Curves, Hue/Saturation and Exposure with their shortcuts. Disable it with a tooltip when the active layer isn't an image layer (today a panel opened on text or shape silently does nothing). Ctrl+E conflicts with Merge Down (§4), so move Exposure to Ctrl+Shift+E.

### Exit — Save to Gallery
Top-right of `EditorToolbar`: primary **"Save to Gallery"** button (`.form-btn-primary`) flattens composite → `canvas.toBlob()` → `GalleryBridge.saveToGallery(...)` → global feedback toast ("Saved to library.") → `setActiveTab('gallery')`. Always route through `GalleryBridge` rather than calling `addItemToGallery` directly — see engineering plan §7 for the `generationId` options-bag form and the JPG-conversion guard.

**⚠️ Transparency warning UI required.** `addItemToGallery` silently re-encodes to JPEG when the active storage provider's conversion flag is on (default `true` for Drive, `false` for local — `utils/settingsStorage.ts:92,97-98`). When conversion is active, the Save flow must warn before writing (warn unconditionally on the conversion flag — do *not* alpha-scan the composite to decide, that is 16M reads at 4096²) ("Vault JPG conversion is enabled, so transparent areas will be flattened. Save anyway?" — the old "save as PNG instead?" copy offered a choice that did not exist). *Target:* the app modal, not `window.confirm`, not fail silently. This is an M1 blocker, not polish.

If the document originated from an existing gallery item: offer a small dropdown next to Save — **"Save as New"** *(not yet built — every save currently creates a new item; Phase 1 E8)* (new `GalleryItem`) vs **"Update Original"** (replaces in place via `updateItemInGallery`).

### Export
Secondary **"Export"** button opens `ExportModal`: format radio (PNG / JPEG), quality slider (JPEG only, 0–100, with estimated file-size readout), **Download** button → `URL.createObjectURL` + `<a download>` (matches `ComposerPage.tsx`'s existing download flow).

### Unsaved changes guard
`ImageEditorPage` tracks `isDirty` (flips true on any history stack push, resets on Save). Tab switch away from `image_editor` while `isDirty` → `UnsavedChangesModal` (Save / Discard / Cancel) blocks the transition. Consistent with `ConfirmationModal` pattern used in `ComposerPage.tsx`.

---

## 10. Mobile / Responsive Considerations

The editor is explicitly a **desktop-first power tool** for V1 (matching Compositor's own scope as a macOS app):

- **Minimum width: 1024px**. Below that, `image_editor` renders a full-screen `MinWidthNotice` instead of the editor shell: "The Image Editor requires a larger screen. Please use a desktop or maximize your browser window."
- **Panel collapse at 1024–1279px**: `LayersPanel` auto-collapses to a 36px icon rail (layer count badge) with a toggle button in `EditorToolbar` to expand it as an `absolute`-positioned overlay — preserves canvas real estate without losing layer access.
- **Touch (tablet/trackpad)**: two-finger pinch-zoom and two-finger pan work via standard `touchstart/move/end` (maps to existing wheel-zoom/scroll-pan logic). Single-finger tool painting is NOT touch-optimized in V1.
- **Shortcut discoverability fallback**: every `ToolButton` tooltip always shows the shortcut label (`data-tip="Brush (B)"`), so touch users who have no keyboard can still discover shortcuts without a hover-only affordance.

---

## Cross-Cutting Design Decisions

- **No new UI-kit or icon-library dependency.** Panels, buttons, and icons all extend existing repo conventions (`.form-btn`/`.btn-snake` CSS, hand-authored Tabler-style SVGs in `components/icons.tsx`, DaisyUI primitives). No `react-rnd`, `lucide-react`, or similar.
- **`FloatingPanel` is a new, small, purpose-built component** (title-bar drag via `pointermove`, corner resize) — the one genuinely new interaction primitive the editor needs. Scoped narrowly, no windowing library.
- **Editor state is page-scoped**, not global context — matches `ComposerPage.tsx`/`PromptCrafter.tsx` ownership pattern. The editor only *reads* `useBusy()`, it doesn't add providers wrapping the whole app.
