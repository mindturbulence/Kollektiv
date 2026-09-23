// ─── Kollektiv Image Editor — Layer Manager ────────────────────────────────
// Pure data operations that dispatch through EditorStore. No direct React
// imports — components call these from event handlers.
//
// Every mutating operation here is wrapped in a HistoryCommand and applied
// via HistoryManager.pushCommand, so all layer edits are undoable.

import { dispatch, getSnapshot } from '../store';
import { pushCommand } from '../history/HistoryManager';
import { findLayerById } from './layerTree';
import type { BlendMode, HistoryCommand, ImageLayer, Layer, LayerMask, TextLayer, ShapeLayer, Rect } from '../types';

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

/** Removes the given layer, restoring it at its original position on undo. */
export function removeLayer(layerId: string): void {
  const { document: doc } = getSnapshot();
  if (!doc) return;
  const idx = doc.layers.findIndex(l => l.id === layerId);
  if (idx < 0) return;
  const layer = doc.layers[idx];
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Delete layer "${layer.name}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'REMOVE_LAYER', layerId }),
    undo: () => dispatch({
      type: 'ADD_LAYER',
      layer,
      insertAfterIndex: idx > 0 ? idx - 1 : undefined,
    }),
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

/** Duplicates a layer, sharing the same ImageBitmap reference (M1: no bitmap cloning). */
export function duplicateLayer(layerId: string): void {
  const { document: doc } = getSnapshot();
  if (!doc) return;
  const source = doc.layers.find(l => l.id === layerId);
  if (!source || source.type !== 'image') return;

  const clone: ImageLayer = {
    ...(source as ImageLayer),
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
  };
  const insertAfterIndex = doc.layers.findIndex(l => l.id === layerId);
  const cmd: HistoryCommand = {
    id: crypto.randomUUID(),
    label: `Duplicate layer "${source.name}"`,
    timestamp: Date.now(),
    do: () => dispatch({ type: 'ADD_LAYER', layer: clone, insertAfterIndex }),
    undo: () => dispatch({ type: 'REMOVE_LAYER', layerId: clone.id }),
  };
  pushCommand(cmd);
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
  const { document: doc, activeLayerId } = getSnapshot();
  if (!doc) return '';

  const fs     = opts.fontSize   ?? 48;
  const family = opts.fontFamily ?? 'sans-serif';
  // Estimate text bounds (actual measurement requires canvas.measureText)
  const estWidth  = opts.text.length * fs * 0.6;
  const estHeight = fs * 1.4;

  const layer: TextLayer = {
    id:        crypto.randomUUID(),
    name:      'Text',
    type:      'text',
    text:      opts.text,
    font:      { family, size: fs, weight: opts.fontWeight ?? 400 },
    color:     opts.color ?? '#ffffff',
    transform: {
      origin:   { x: opts.x - estWidth / 2, y: opts.y - estHeight / 2 },
      size:     { width: Math.max(100, estWidth), height: Math.max(40, estHeight) },
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
