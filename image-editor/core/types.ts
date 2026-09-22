// ─── Kollektiv Image Editor — Core Types ───────────────────────────────────
// All types in this file are plain JSON-compatible (except ImageBitmap refs).
// ImageBitmap refs are NOT serialized to IDB — only the encoded blob bytes are.

// ─── Geometry ───────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

// ─── Blend Modes ────────────────────────────────────────────────────────────

// 16 modes supported natively by Canvas2D globalCompositeOperation.
// The 9 Photoshop-only modes (dissolve, linear-burn, etc.) are deferred to V2
// (require WebGL2 fragment shaders). Kept in the type for spec completeness.
export type BlendMode =
  // Canvas2D native (16 modes):
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
  // V2 — manual WebGL2 shaders (not implemented in V1):
  | 'dissolve' | 'linear-burn' | 'linear-dodge' | 'vivid-light'
  | 'linear-light' | 'pin-light' | 'hard-mix' | 'darker-color' | 'lighter-color';

export const NATIVE_BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

// ─── Layer Transforms ───────────────────────────────────────────────────────

export interface LayerTransform {
  /** Origin point in document coordinates (top-left of layer bbox). */
  origin: Point;
  size: { width: number; height: number };
  rotation: number;   // degrees
  flipH: boolean;
  flipV: boolean;
}

// ─── Layer Mask ─────────────────────────────────────────────────────────────

export interface LayerMask {
  /** 8-bit grayscale bitmap, same intrinsic size as layer bbox. Not serialized directly. */
  bitmap: ImageBitmap;
  enabled: boolean;
  invert: boolean;
  feather: number;
}

// ─── Layers ─────────────────────────────────────────────────────────────────

export type LayerType = 'image' | 'group' | 'adjustment' | 'shape' | 'text';

interface LayerBase {
  id: string;
  name: string;
  type: LayerType;
  transform: LayerTransform;
  opacity: number;        // 0–100
  blendMode: BlendMode;
  visible: boolean;
  locked?: boolean;
  mask?: LayerMask;       // V2
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  /** Runtime pixel data — NOT included in history snapshots or IDB serialization. */
  bitmap: ImageBitmap;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

export interface GroupLayer extends LayerBase {
  type: 'group';
  children: Layer[];
}

export interface AdjustmentLayer extends LayerBase {
  type: 'adjustment';
  adjustment: AdjustmentDef;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  fill: string;
  stroke?: { color: string; width: number };
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  font: { family: string; size: number; weight: number };
  color: string;
}

export type Layer = ImageLayer | GroupLayer | AdjustmentLayer | ShapeLayer | TextLayer;

// ─── Adjustments ────────────────────────────────────────────────────────────

export type AdjustmentChannel = 'rgb' | 'r' | 'g' | 'b';

export interface LevelsAdjustment {
  kind: 'levels';
  channel: AdjustmentChannel;
  inBlack: number;    // 0–255
  inWhite: number;    // 0–255
  gamma: number;      // 0.1–9.99
  outBlack: number;   // 0–255
  outWhite: number;   // 0–255
}

export interface CurvesControlPoint { x: number; y: number; }

export interface CurvesAdjustment {
  kind: 'curves';
  channel: AdjustmentChannel;
  points: CurvesControlPoint[];
}

export interface HueSaturationAdjustment {
  kind: 'hue-saturation';
  hue: number;        // -180 … 180
  saturation: number; // -100 … 100
  lightness: number;  // -100 … 100
  colorize: boolean;
}

export interface ExposureAdjustment {
  kind: 'exposure';
  exposure: number;   // stops
  offset: number;
  gammaCorrection: number;
}

export type AdjustmentDef =
  | LevelsAdjustment
  | CurvesAdjustment
  | HueSaturationAdjustment
  | ExposureAdjustment;

// ─── Selection ──────────────────────────────────────────────────────────────

export type SelectionShape =
  | { kind: 'rect'; bounds: Rect }
  | { kind: 'ellipse'; bounds: Rect }
  | { kind: 'polygon'; points: Point[] }
  | { kind: 'raster'; mask: ImageBitmap };

export interface Selection {
  shape: SelectionShape;
  bounds: Rect;
  feather: number;
}

// ─── Document ───────────────────────────────────────────────────────────────

export interface Guide {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number;
}

export interface EditorDocument {
  id: string;
  title: string;
  width: number;
  height: number;
  resolution: number;     // px/inch metadata only, default 72
  layers: Layer[];        // index 0 = topmost
  guides: Guide[];
  activeLayerId: string | null;
  createdAt: number;
  updatedAt: number;
  sourceGalleryItemId?: string;
}

// ─── Tool IDs ───────────────────────────────────────────────────────────────

export type ToolId =
  | 'move'
  | 'marquee-rect' | 'marquee-ellipse'
  | 'lasso-freehand' | 'lasso-poly'
  | 'magic-wand'
  | 'crop'
  | 'brush' | 'eraser'
  | 'clone-stamp'
  | 'blur' | 'smear'
  | 'gradient'
  | 'shape-rect' | 'shape-ellipse'
  | 'type'
  | 'eyedropper'
  | 'hand'
  | 'zoom';

// ─── Viewport ───────────────────────────────────────────────────────────────

export interface Viewport {
  zoom: number;   // 0.125 – 16.0 (12.5% – 1600%)
  panX: number;   // canvas CSS px offset from viewport center
  panY: number;
}

/** Standard Photoshop-style zoom stops in ascending order. */
export const ZOOM_STOPS = [
  0.125, 0.25, 0.333, 0.5, 0.667,
  1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0,
] as const;

// ─── Tool Settings ──────────────────────────────────────────────────────────

export interface BrushSettings {
  size: number;       // px
  hardness: number;   // 0–1
  opacity: number;    // 0–100
  flow: number;       // 0–100
  smoothing: number;  // 0–100 (Catmull-Rom interpolation weight)
}

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;   // 0–1 (Pointer Events API)
  timestamp: number;
}

// ─── Foreground / Background Color ──────────────────────────────────────────

export interface ColorPair {
  foreground: string;  // CSS hex, e.g. '#000000'
  background: string;
}

// ─── Open Payload ────────────────────────────────────────────────────────────

/** How the editor is opened from outside (Gallery, Composer, or blank). */
export type EditorOpenPayload =
  | { kind: 'gallery'; galleryItemId: string; url: string }
  | { kind: 'blob'; blob: Blob; title?: string }
  | { kind: 'blank'; width: number; height: number; background: 'white' | 'transparent' | 'foreground' };

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryCommand {
  id: string;
  label: string;
  timestamp: number;
  /** Mutates EditorStore document + pixel buffers. */
  do(): void;
  /** Exact inverse — restores before-state. */
  undo(): void;
}

// ─── Editor Actions (dispatched to EditorStore) ───────────────────────────────

export type EditorAction =
  | { type: 'SET_DOCUMENT'; document: EditorDocument | null }
  | { type: 'SET_ACTIVE_LAYER'; layerId: string | null }
  | { type: 'SET_ACTIVE_TOOL'; tool: ToolId }
  | { type: 'SET_VIEWPORT'; viewport: Partial<Viewport> }
  | { type: 'SET_SELECTION'; selection: Selection | null }
  | { type: 'SET_COLORS'; colors: Partial<ColorPair> }
  | { type: 'SET_BRUSH'; brush: Partial<BrushSettings> }
  | { type: 'SET_DIRTY'; dirty: boolean }
  | { type: 'UPDATE_LAYER'; layerId: string; patch: Partial<Omit<ImageLayer, 'bitmap' | 'id' | 'type'>> }
  | { type: 'ADD_LAYER'; layer: Layer; insertAfterIndex?: number }
  | { type: 'REMOVE_LAYER'; layerId: string }
  | { type: 'REORDER_LAYERS'; orderedIds: string[] }
  | { type: 'MARK_LAYER_DIRTY'; layerId: string }
  | { type: 'CLEAR_DIRTY_LAYERS'; layerIds: Set<string> }
  // M3 — pixel replace + adjustment panel state
  | { type: 'REPLACE_LAYER_BITMAP'; layerId: string; bitmap: ImageBitmap }
  | { type: 'OPEN_ADJUSTMENT'; panel: AdjustmentPanel }
  | { type: 'CLOSE_ADJUSTMENT'; panel: AdjustmentPanel }
  // History
  | { type: 'PUSH_HISTORY'; command: HistoryCommand }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_HISTORY' };

// ─── Editor State ─────────────────────────────────────────────────────────────

export interface EditorState {
  document: EditorDocument | null;
  /** Whether the document has unsaved changes. */
  isDirty: boolean;
  viewport: Viewport;
  activeTool: ToolId;
  activeLayerId: string | null;
  selection: Selection | null;
  colors: ColorPair;
  brush: BrushSettings;
  /** Layer IDs with stale thumbnails that need regeneration. */
  dirtyLayerIds: Set<string>;
  /** Command stack — index 0 is oldest. */
  history: HistoryCommand[];
  /** Index of the last applied command; -1 = nothing applied / all undone. */
  historyIndex: number;
  /** Which adjustment floating panels are currently open. */
  openAdjustments: Set<AdjustmentPanel>;
}

/** Adjustment panel identifiers. */
export type AdjustmentPanel = 'levels' | 'curves' | 'hue-sat';
