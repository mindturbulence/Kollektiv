// ─── Kollektiv Image Editor — Layer Manager ────────────────────────────────
// Pure data operations that dispatch through EditorStore. No direct React
// imports — components call these from event handlers.
//
// Every mutating operation here is wrapped in a HistoryCommand and applied
// via HistoryManager.pushCommand, so all layer edits are undoable.

import { dispatch, getSnapshot } from '../store';
import { pushCommand } from '../history/HistoryManager';
import { findLayerById, findLayerLocation } from './layerTree';
import type { BlendMode, HistoryCommand, ImageLayer, Layer, LayerMask, TextLayer, ShapeLayer, Rect } from '../types';
import { LayerPainter } from '../renderer/LayerPainter';
import { resampleBitmap } from '../io/FileIO';
import { selectionClipInBitmapSpace } from '../geometry/selectionClip';

function findLayer(layerId: string): Layer | undefined {
  const layers = getSnapshot().document?.layers;
  return layers ? findLayerById(layers, layerId) : undefined;
}

type LayerPatch = Partial<Omit<ImageLayer, 'bitmap' | 'id' | 'type'>>;

function makeLayerUpdateCmd(
  label: string,
  layerId: string,
  before: LayerPatch,
  after: LayerPatch,
): HistoryCommand {
  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'UPDATE_LAYER', layerId, patch: after }),
    undo: () => dispatch({ type: 'UPDATE_LAYER', layerId, patch: before }),
  };
}

/** Adds a layer immediately above the currently active layer (or at the top if none). */
export function addLayer(layer: Layer): void {
  const { document: doc, activeLayerId } = getSnapshot();
  if (!doc) return;
  const insertAfterIndex = doc.layers.findIndex(l => l.id === activeLayerId);
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Add layer "${layer.name}"`,
    timestamp: Date.now(),
    do: () => dispatch({
      type: 'ADD_LAYER',
      layer,
      insertAfterIndex: insertAfterIndex >= 0 ? insertAfterIndex : undefined,
    }),
    undo: () => dispatch({ type: 'REMOVE_LAYER', layerId: layer.id }),
  };
  pushCommand(cmd);
}

/** Removes the given layer from wherever it lives in the tree (top-level or
 *  inside a group — review H12: the old top-level `findIndex` made deleting a
 *  nested layer silently do nothing), restoring it to its exact parent + index
 *  on undo. */
export function removeLayer(layerId: string): void {
  const { document: doc } = getSnapshot();
  if (!doc) return;
  const loc = findLayerLocation(doc.layers, layerId);
  if (!loc) return;
  const { layer, parentId, index, siblings } = loc;
  const siblingsSnapshot = siblings; // pre-removal array, for exact undo
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Delete layer "${layer.name}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'REMOVE_LAYER', layerId }),
    undo: () => dispatch({ type: 'INSERT_LAYER_AT', layer, parentId, index, siblingsSnapshot }),
  };
  pushCommand(cmd);
}

/** Removes the currently active layer, if any. */
export function removeActiveLayer(): void {
  const { activeLayerId } = getSnapshot();
  if (activeLayerId) removeLayer(activeLayerId);
}

export function setLayerVisibility(layerId: string, visible: boolean): void {
  const layer = findLayer(layerId);
  if (!layer || layer.visible === visible) return;
  pushCommand(makeLayerUpdateCmd(
    visible ? `Show layer "${layer.name}"` : `Hide layer "${layer.name}"`,
    layerId,
    { visible: layer.visible },
    { visible },
  ));
}

/** H8: live drag path — dispatches UPDATE_LAYER directly (NO history) so the
 *  slider drags smoothly without flooding the 50-slot command stack. Call
 *  `commitLayerOpacity` once on pointerup/blur to record one undoable entry. */
export function setLayerOpacityLive(layerId: string, opacity: number): void {
  const clamped = Math.max(0, Math.min(100, opacity));
  dispatch({ type: 'UPDATE_LAYER', layerId, patch: { opacity: clamped } });
}

/** H8: records the single undoable history entry for an opacity drag. */
export function commitLayerOpacity(layerId: string, beforeOpacity: number): void {
  const layer = findLayer(layerId);
  if (!layer || layer.opacity === beforeOpacity) return;
  pushCommand(makeLayerUpdateCmd(
    `Set opacity for "${layer.name}"`,
    layerId,
    { opacity: beforeOpacity },
    { opacity: layer.opacity },
  ));
}

/** One-shot opacity set (keyboard/exact value) — one history command. */
export function setLayerOpacity(layerId: string, opacity: number): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  const clamped = Math.max(0, Math.min(100, opacity));
  if (layer.opacity === clamped) return;
  pushCommand(makeLayerUpdateCmd(
    `Set opacity for "${layer.name}"`,
    layerId,
    { opacity: layer.opacity },
    { opacity: clamped },
  ));
}

export function setLayerBlendMode(layerId: string, blendMode: BlendMode): void {
  const layer = findLayer(layerId);
  if (!layer || layer.blendMode === blendMode) return;
  pushCommand(makeLayerUpdateCmd(
    `Set blend mode for "${layer.name}"`,
    layerId,
    { blendMode: layer.blendMode },
    { blendMode },
  ));
}

export function renameLayer(layerId: string, name: string): void {
  const layer = findLayer(layerId);
  if (!layer || layer.name === name) return;
  pushCommand(makeLayerUpdateCmd(
    `Rename layer to "${name}"`,
    layerId,
    { name: layer.name },
    { name },
  ));
}

export function reorderLayers(orderedIds: string[]): void {
  const { document: doc } = getSnapshot();
  if (!doc) return;
  const prevIds = doc.layers.map(l => l.id);
  if (prevIds.join(',') === orderedIds.join(',')) return;
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: 'Reorder layers',
    timestamp: Date.now(),
    do: () => dispatch({ type: 'REORDER_LAYERS', orderedIds }),
    undo: () => dispatch({ type: 'REORDER_LAYERS', orderedIds: prevIds }),
  };
  pushCommand(cmd);
}

/** Adds a transparent document-sized image layer (review H11 — "+" used to
 *  open a file picker, so the standard touch-up workflow of painting a
 *  correction on its own layer was impossible). Inserted above the active
 *  layer. Returns the new layer id, or '' when there is no document. */
export function addBlankLayer(): Promise<string> {
  const { document: doc } = getSnapshot();
  if (!doc) return Promise.resolve('');

  const oc = new OffscreenCanvas(doc.width, doc.height);
  const ctx = oc.getContext('2d');
  if (!ctx) return Promise.resolve('');
  // Fully transparent — nothing to fill.
  return createImageBitmap(oc).then((bitmap): string => {
    const layer: ImageLayer = {
      id: crypto.randomUUID(),
      name: nextLayerName(doc.layers, 'Layer'),
      type: 'image',
      bitmap,
      intrinsicWidth: doc.width,
      intrinsicHeight: doc.height,
      transform: {
        origin: { x: 0, y: 0 },
        size: { width: doc.width, height: doc.height },
        rotation: 0, flipH: false, flipV: false,
      },
      opacity: 100,
      blendMode: 'normal',
      visible: true,
    };
    addLayer(layer);
    return layer.id;
  });
}

/** First available "Layer N" name that doesn't collide with existing layers. */
function nextLayerName(layers: Layer[], base: string): string {
  const names = new Set<string>();
  const collect = (ls: Layer[]) => {
    for (const l of ls) {
      names.add(l.name);
      if (l.type === 'group') collect(l.children);
    }
  };
  collect(layers);
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Duplicates a layer — works for nested layers too (review H12: the old
 *  top-level `find` made duplicating a child silently do nothing). The clone
 *  is inserted into the SAME parent, directly above the source. Shares the
 *  same ImageBitmap reference (M1: no bitmap cloning); the mask is stripped so
 *  painting the copy's mask can't corrupt the source's. Returns the clone id. */
export function duplicateLayer(layerId: string): string {
  const { document: doc } = getSnapshot();
  if (!doc) return '';
  const loc = findLayerLocation(doc.layers, layerId);
  if (!loc || loc.layer.type !== 'image') return '';
  const source = loc.layer as ImageLayer;

  const clone: ImageLayer = {
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
    mask: undefined,
  };
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Duplicate layer "${source.name}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'INSERT_LAYER_AT', layer: clone, parentId: loc.parentId, index: loc.index, siblingsSnapshot: loc.siblings }),
    undo: () => dispatch({ type: 'REMOVE_LAYER', layerId: clone.id }),
  };
  pushCommand(cmd);
  return clone.id;
}

// ─── Merge down / Flatten (M5 item 5 — via LayerPainter so the result is
// pixel-identical to what the viewport shows, including text/shape layers,
// masks and manual WebGL2 blend modes). Both rasterize into a new image layer
// that replaces the merged pair / whole stack, with full undo.

/** Renders `layers` (index 0 = topmost, drawn bottom-up) into a document-sized
 *  OffscreenCanvas using a private LayerPainter (no adjustment previews). */
async function rasterizeLayers(layers: Layer[]): Promise<ImageBitmap | null> {
  const { document: doc } = getSnapshot();
  if (!doc) return null;
  const oc = new OffscreenCanvas(doc.width, doc.height);
  const ctx = oc.getContext('2d');
  if (!ctx) return null;
  const painter = new LayerPainter(false);
  try {
    for (let i = layers.length - 1; i >= 0; i--) {
      painter.drawLayer(ctx as unknown as CanvasRenderingContext2D, layers[i]);
    }
  } finally {
    painter.dispose();
  }
  return createImageBitmap(oc);
}

/** Merges the active top-level layer into the one directly beneath it
 *  (planned since the frontend plan and never implemented — review §2).
 *  Top level only: groups are organizational in V1. */
export async function mergeDown(): Promise<boolean> {
  const { document: doc, activeLayerId } = getSnapshot();
  if (!doc || !activeLayerId) return false;
  const loc = findLayerLocation(doc.layers, activeLayerId);
  if (!loc || loc.parentId !== null) return false;
  // loc.index counts from the TOP of the array (index 0 = topmost).
  const below = doc.layers[loc.index + 1];
  if (!below || below.type === 'group') return false; // nothing mergeable beneath
  const upper = loc.layer;

  const merged = await rasterizeLayers([upper, below]);
  if (!merged) return false;

  const mergedLayer: ImageLayer = {
    id: crypto.randomUUID(),
    name: below.name,
    type: 'image',
    bitmap: merged,
    intrinsicWidth: doc.width,
    intrinsicHeight: doc.height,
    transform: {
      origin: { x: 0, y: 0 },
      size: { width: doc.width, height: doc.height },
      rotation: 0, flipH: false, flipV: false,
    },
    opacity: 100,
    blendMode: 'normal',
    visible: true,
  };

  const before = { index: loc.index, upper, below };
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Merge down "${upper.name}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'REPLACE_TOP_LEVEL_PAIR', mergedLayer, upperId: before.upper.id, belowId: before.below.id }),
    undo: () => dispatch({ type: 'RESTORE_TOP_LEVEL_PAIR', index: before.index, upper: before.upper, below: before.below }),
  };
  pushCommand(cmd);
  return true;
}

/** Flattens the entire document into one background layer. */
export async function flattenImage(): Promise<boolean> {
  const { document: doc } = getSnapshot();
  if (!doc || doc.layers.length === 0) return false;
  const oldLayers = doc.layers;
  if (oldLayers.length === 1 && oldLayers[0].type === 'image') return false; // already flat

  const merged = await rasterizeLayers(oldLayers);
  if (!merged) return false;

  const flatLayer: ImageLayer = {
    id: crypto.randomUUID(),
    name: 'Background',
    type: 'image',
    bitmap: merged,
    intrinsicWidth: doc.width,
    intrinsicHeight: doc.height,
    transform: {
      origin: { x: 0, y: 0 },
      size: { width: doc.width, height: doc.height },
      rotation: 0, flipH: false, flipV: false,
    },
    opacity: 100,
    blendMode: 'normal',
    visible: true,
  };

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: 'Flatten image',
    timestamp: Date.now(),
    do: () => dispatch({ type: 'SET_LAYERS', layers: [flatLayer] }),
    undo: () => dispatch({ type: 'SET_LAYERS', layers: oldLayers }),
  };
  pushCommand(cmd);
  return true;
}

// ─── Masks ───────────────────────────────────────────────────────────────────
// Painted via BrushEngine (paintTarget: 'mask') — see BrushEngine.ts. The mask
// alpha-multiplies the layer's color bitmap in CanvasRenderer.drawImageLayer.

/** Adds a fully-visible (opaque white) mask to an image layer, sized to its bitmap. */
export async function addMask(layerId: string): Promise<void> {
  const layer = findLayer(layerId);
  if (!layer || layer.type !== 'image' || layer.mask) return;

  const oc = new OffscreenCanvas(layer.intrinsicWidth, layer.intrinsicHeight);
  const ctx = oc.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, oc.width, oc.height);
  const bitmap = await createImageBitmap(oc);

  const mask: LayerMask = { bitmap, enabled: true, invert: false, feather: 0 };
  pushCommand(makeLayerUpdateCmd(`Add mask to "${layer.name}"`, layerId, { mask: undefined }, { mask }));
}

/** Removes an image layer's mask entirely. */
export function removeMask(layerId: string): void {
  const layer = findLayer(layerId);
  if (!layer || layer.type !== 'image' || !layer.mask) return;
  pushCommand(makeLayerUpdateCmd(`Remove mask from "${layer.name}"`, layerId, { mask: layer.mask }, { mask: undefined }));
}

// ─── Groups ────────────────────────────────────────────────────────────────
// V1 scope: only top-level layers can be grouped/ungrouped (no grouping a
// selection that already spans into an existing group). Group opacity/blend
// mode are NOT yet composited as a unit — CanvasRenderer draws children
// straight through — so grouping is organizational (visibility, collapse,
// bulk move) for now, not a non-destructive compositing unit.

// ─── Image Size / Canvas Size (M5 item 6) ────────────────────────────────────

/** Image Size: resamples the active image layer's bitmap to the target size
 *  (upload workflow — "resample to W×H for upload", review §3 P0). One undo
 *  entry restores the original bitmap, intrinsic size and rendered size. */
export async function resizeLayer(layerId: string, targetWidth: number, targetHeight: number): Promise<boolean> {
  const { document: doc } = getSnapshot();
  if (!doc) return false;
  const loc = findLayerLocation(doc.layers, layerId);
  if (!loc || loc.layer.type !== 'image') return false;
  const layer = loc.layer as ImageLayer;

  const resampled = await resampleBitmap(layer.bitmap, targetWidth, targetHeight);
  const prevBitmap = layer.bitmap;
  const prevIntrinsicW = layer.intrinsicWidth;
  const prevIntrinsicH = layer.intrinsicHeight;
  const prevSize = { ...layer.transform.size };

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Image size to ${targetWidth}×${targetHeight}`,
    timestamp: Date.now(),
    bitmapRefs: { resampled, prevBitmap },
    do: () => dispatch({
      type: 'RESAMPLE_LAYER',
      layerId,
      bitmap: resampled,
      intrinsicWidth: targetWidth,
      intrinsicHeight: targetHeight,
      size: { width: targetWidth, height: targetHeight },
    }),
    undo: () => dispatch({
      type: 'RESAMPLE_LAYER',
      layerId,
      bitmap: prevBitmap,
      intrinsicWidth: prevIntrinsicW,
      intrinsicHeight: prevIntrinsicH,
      size: prevSize,
    }),
  };
  pushCommand(cmd);
  return true;
}

export type CanvasAnchor =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

/** How far the content origin shifts for a canvas resize anchored at `anchor`.
 *  Anchored at top-left, content stays put (dx=dy=0); anchored center, content
 *  moves by half the size delta; anchored bottom-right, content moves the full
 *  delta. Content that ends up outside the new bounds is clipped by the render
 *  clip (canvas can't grow content that was shrunk away). */
export function anchorOffset(anchor: CanvasAnchor, dWidth: number, dHeight: number): { dx: number; dy: number } {
  const fx = anchor === 'top-left' || anchor === 'left' || anchor === 'bottom-left' ? 0
    : anchor === 'top' || anchor === 'center' || anchor === 'bottom' ? 0.5 : 1;
  const fy = anchor === 'top-left' || anchor === 'top' || anchor === 'top-right' ? 0
    : anchor === 'left' || anchor === 'center' || anchor === 'right' ? 0.5 : 1;
  return { dx: Math.round(dWidth * fx), dy: Math.round(dHeight * fy) };
}

/** Canvas Size: grows or shrinks the document. Every layer shifts by the
 *  anchor offset so the anchored edge stays put (outpaint-prep padding is
 *  'center' + larger size). One undo entry restores everything. */
export async function resizeCanvas(targetWidth: number, targetHeight: number, anchor: CanvasAnchor): Promise<boolean> {
  const { document: doc } = getSnapshot();
  if (!doc) return false;
  const w = Math.round(targetWidth);
  const h = Math.round(targetHeight);
  if (w < 1 || h < 1) return false;
  if (w === doc.width && h === doc.height) return false;

  const { dx, dy } = anchorOffset(anchor, w - doc.width, h - doc.height);
  const prevWidth = doc.width;
  const prevHeight = doc.height;
  const prevLayers = doc.layers;

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Canvas size to ${w}×${h}`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'RESIZE_CANVAS', width: w, height: h, dx, dy, prevWidth, prevHeight, prevLayers }),
    // Undo: restore dimensions and shift the (shifted) layers back by -dx/-dy.
    // prevWidth/prevHeight are unused on this path; prevLayers is the current
    // (already-shifted) tree — RESIZE_CANVAS ignores it, it shifts in place.
    undo: () => dispatch({ type: 'RESIZE_CANVAS', width: prevWidth, height: prevHeight, dx: -dx, dy: -dy, prevWidth: w, prevHeight: h, prevLayers: [] }),
  };
  pushCommand(cmd);
  return true;
}

/** Crop to the active selection (review §3 P1): stages the selection bounds as
 *  the pending crop rect — Enter confirms, Esc cancels, same as a dragged crop. */
export function cropToSelection(): boolean {
  const { selection } = getSnapshot();
  if (!selection) return false;
  const b = selection.bounds;
  dispatch({ type: 'SET_PENDING_CROP', rect: { x: b.x, y: b.y, width: b.width, height: b.height } });
  return true;
}

// ─── Fill / Delete in selection (M5 leftover, review §3 P1) ──────────────────

/** Paints the foreground colour through the active selection into the active
 *  image layer's bitmap (Shift+F5). Selection is clipped in the layer's bitmap
 *  space — the same transform the brush uses — so moved/scaled/rotated layers
 *  fill exactly where the marching ants show. One undo entry restores the
 *  previous bitmap. Returns false when there is nothing to fill. */
export async function fillSelection(color?: string): Promise<boolean> {
  const { document: doc, activeLayerId, colors, selection } = getSnapshot();
  if (!doc || !activeLayerId || !selection) return false;
  const loc = findLayerLocation(doc.layers, activeLayerId);
  if (!loc || loc.layer.type !== 'image') return false;
  const layer = loc.layer as ImageLayer;
  const layerId = activeLayerId;

  const prevBitmap = layer.bitmap;
  const oc = new OffscreenCanvas(layer.intrinsicWidth, layer.intrinsicHeight);
  const ctx = oc.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(prevBitmap, 0, 0);

  const clip = selectionClipInBitmapSpace(layer);
  if (!clip) return false; // selection vanished between read and paint
  ctx.save();
  ctx.clip(clip);
  ctx.fillStyle = color ?? colors.foreground;
  ctx.fillRect(0, 0, layer.intrinsicWidth, layer.intrinsicHeight);
  ctx.restore();

  const newBitmap = await createImageBitmap(oc);

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Fill selection on "${layer.name}"`,
    timestamp: Date.now(),
    bitmapRefs: { 'new (do)': newBitmap, 'prev (undo)': prevBitmap },
    do: () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: newBitmap }),
    undo: () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: prevBitmap }),
  };
  pushCommand(cmd);
  return true;
}

/** Clears everything inside the active selection on the active image layer
 *  (Delete / Alt+Backspace): destination-out through the same selection clip
 *  as fillSelection. One undo entry restores the previous bitmap. */
export async function deleteInSelection(): Promise<boolean> {
  const { document: doc, activeLayerId, selection } = getSnapshot();
  if (!doc || !activeLayerId || !selection) return false;
  const loc = findLayerLocation(doc.layers, activeLayerId);
  if (!loc || loc.layer.type !== 'image') return false;
  const layer = loc.layer as ImageLayer;
  const layerId = activeLayerId;

  const prevBitmap = layer.bitmap;
  const oc = new OffscreenCanvas(layer.intrinsicWidth, layer.intrinsicHeight);
  const ctx = oc.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(prevBitmap, 0, 0);

  const clip = selectionClipInBitmapSpace(layer);
  if (!clip) return false;
  ctx.save();
  ctx.clip(clip);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(0, 0, layer.intrinsicWidth, layer.intrinsicHeight);
  ctx.restore();

  const newBitmap = await createImageBitmap(oc);

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Clear selection on "${layer.name}"`,
    timestamp: Date.now(),
    bitmapRefs: { 'new (do)': newBitmap, 'prev (undo)': prevBitmap },
    do: () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: newBitmap }),
    undo: () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: prevBitmap }),
  };
  pushCommand(cmd);
  return true;
}

/** Wraps the given top-level layers into a new group at the position of the
 *  topmost selected layer, preserving their relative order as children. */
export function groupLayers(layerIds: string[]): void {
  const { document: doc } = getSnapshot();
  if (!doc || layerIds.length === 0) return;
  const idSet = new Set(layerIds);
  const selected = doc.layers.filter(l => idSet.has(l.id));
  if (selected.length === 0) return;

  const insertIndex = doc.layers.reduce(
    (min, l, i) => (idSet.has(l.id) ? Math.min(min, i) : min),
    doc.layers.length,
  );
  const groupId = crypto.randomUUID();
  const groupName = selected.length === 1 ? `${selected[0].name} group` : 'Group';

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Group ${selected.length} layer${selected.length > 1 ? 's' : ''}`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'GROUP_LAYERS', layerIds, groupId, groupName, insertIndex }),
    undo: () => dispatch({ type: 'UNGROUP_LAYER', groupId }),
  };
  pushCommand(cmd);
}

/** Splices a group's children back into its parent's position, in order. */
export function ungroupLayer(groupId: string): void {
  const { document: doc } = getSnapshot();
  if (!doc) return;
  const group = doc.layers.find(l => l.id === groupId);
  if (!group || group.type !== 'group') return;
  const layerIds = group.children.map(c => c.id);
  const insertIndex = doc.layers.findIndex(l => l.id === groupId);
  const groupName = group.name;

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Ungroup "${groupName}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'UNGROUP_LAYER', groupId }),
    undo: () => dispatch({ type: 'GROUP_LAYERS', layerIds, groupId, groupName, insertIndex }),
  };
  pushCommand(cmd);
}

// ─── Text layer factory ───────────────────────────────────────────────────────

export interface AddTextLayerOptions {
  text:     string;
  x:        number;
  y:        number;
  fontFamily?: string;
  fontSize?:   number;
  fontWeight?: number;
  color?:      string;
}

export function addTextLayer(opts: AddTextLayerOptions): string {
  const { document: doc, activeLayerId, colors } = getSnapshot();
  if (!doc) return '';

  const fs     = opts.fontSize   ?? 48;
  const family = opts.fontFamily ?? 'sans-serif';
  const weight = opts.fontWeight ?? 400;

  // Measure real text bounds (review H9: `len*size*0.6` guessed wide for
  // narrow text and clipped wide glyphs). OffscreenCanvas + measureText.
  const measure = new OffscreenCanvas(1, 1);
  const mctx = measure.getContext('2d');
  let estWidth = 0;
  let estHeight = 0;
  if (mctx) {
    mctx.font = `${weight} ${fs}px "${family}", sans-serif`;
    const lines = opts.text.split('\n');
    for (const line of lines) {
      const w = mctx.measureText(line).width;
      if (w > estWidth) estWidth = w;
    }
    estHeight = lines.length * fs * 1.25; // LayerPainter's line height
  } else {
    estWidth  = opts.text.length * fs * 0.6;
    estHeight = fs * 1.4;
  }

  const layer: TextLayer = {
    id:        crypto.randomUUID(),
    name:      'Text',
    type:      'text',
    text:      opts.text,
    font:      { family, size: fs, weight },
    // Default to the foreground colour (review H9: white-on-white default was
    // invisible on the default white document).
    color:     opts.color ?? colors.foreground,
    transform: {
      origin:   { x: opts.x - estWidth / 2, y: opts.y - estHeight / 2 },
      size:     { width: Math.max(20, estWidth), height: Math.max(fs, estHeight) },
      rotation: 0, flipH: false, flipV: false,
    },
    opacity:   100,
    blendMode: 'normal',
    visible:   true,
  };

  const insertAfterIndex = doc.layers.findIndex(l => l.id === activeLayerId);
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(), label: 'Add text layer', timestamp: Date.now(),
    do:   () => dispatch({ type: 'ADD_LAYER', layer, insertAfterIndex: insertAfterIndex >= 0 ? insertAfterIndex : undefined }),
    undo: () => dispatch({ type: 'REMOVE_LAYER', layerId: layer.id }),
  };
  pushCommand(cmd);
  return layer.id;
}

// ─── Text layer re-edit (M5 leftover) ───────────────────────────────────────

/** Replaces a text layer's content (double-click re-edit). The transform,
 *  position and identity of the layer survive — only text/color/font change —
 *  with one undo entry. Returns false when `layerId` is not a text layer.
 *  Rotation/flip are not applied to the edit box: re-editing rotated text
 *  starts unrotated (an acceptable V1 simplification, same as the move tool's
 *  text editing in most lightweight editors). */
export function updateTextLayer(
  layerId: string,
  patch: { text: string; color: string; fontFamily: string; fontSize: number; fontWeight: number },
): boolean {
  const { document: doc } = getSnapshot();
  if (!doc) return false;
  const loc = findLayerLocation(doc.layers, layerId);
  if (!loc || loc.layer.type !== 'text') return false;
  const layer = loc.layer as TextLayer;

  // Re-measure bounds the same way addTextLayer does, but keep the layer's
  // transform (rotation/flip) and re-centre the new size on the old origin —
  // moving the user's text is not what re-editing promised.
  const measure = new OffscreenCanvas(1, 1);
  const mctx = measure.getContext('2d');
  let estWidth = 0;
  let estHeight = 0;
  if (mctx) {
    mctx.font = `${patch.fontWeight} ${patch.fontSize}px "${patch.fontFamily}", sans-serif`;
    for (const line of patch.text.split('\n')) {
      const w = mctx.measureText(line).width;
      if (w > estWidth) estWidth = w;
    }
    estHeight = patch.text.split('\n').length * patch.fontSize * 1.25;
  } else {
    estWidth = patch.text.length * patch.fontSize * 0.6;
    estHeight = patch.fontSize * 1.4;
  }
  const newWidth = Math.max(20, estWidth);
  const newHeight = Math.max(patch.fontSize, estHeight);

  const before = { text: layer.text, color: layer.color, font: { ...layer.font } };
  const after = {
    text: patch.text,
    color: patch.color,
    font: { family: patch.fontFamily, size: patch.fontSize, weight: patch.fontWeight },
    transform: {
      ...layer.transform,
      size: { width: newWidth, height: newHeight },
    },
  } as Partial<TextLayer> as Partial<Layer>;
  const beforePatch = before as unknown as Partial<Layer>;

  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Edit text "${patch.text.slice(0, 20)}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'UPDATE_LAYER', layerId, patch: after }),
    undo: () => dispatch({ type: 'UPDATE_LAYER', layerId, patch: beforePatch }),
  };
  pushCommand(cmd);
  return true;
}

// ─── Shape layer factory ──────────────────────────────────────────────────────

export interface AddShapeLayerOptions {
  shape:   'rect' | 'ellipse';
  bounds:  Rect;
  fill?:   string;
  stroke?: { color: string; width: number };
}

export function addShapeLayer(opts: AddShapeLayerOptions): string {
  const { document: doc, activeLayerId, colors } = getSnapshot();
  if (!doc) return '';

  const layer: ShapeLayer = {
    id:        crypto.randomUUID(),
    name:      opts.shape === 'rect' ? 'Rectangle' : 'Ellipse',
    type:      'shape',
    shape:     opts.shape,
    fill:      opts.fill ?? colors.foreground,
    stroke:    opts.stroke,
    transform: {
      origin:   { x: opts.bounds.x, y: opts.bounds.y },
      size:     { width: Math.max(1, opts.bounds.width), height: Math.max(1, opts.bounds.height) },
      rotation: 0, flipH: false, flipV: false,
    },
    opacity:   100,
    blendMode: 'normal',
    visible:   true,
  };

  const insertAfterIndex = doc.layers.findIndex(l => l.id === activeLayerId);
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(), label: `Add ${opts.shape}`, timestamp: Date.now(),
    do:   () => dispatch({ type: 'ADD_LAYER', layer, insertAfterIndex: insertAfterIndex >= 0 ? insertAfterIndex : undefined }),
    undo: () => dispatch({ type: 'REMOVE_LAYER', layerId: layer.id }),
  };
  pushCommand(cmd);
  return layer.id;
}
