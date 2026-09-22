// ─── Kollektiv Image Editor — Layer Manager ────────────────────────────────
// Pure data operations that dispatch through EditorStore. No direct React
// imports — components call these from event handlers.
//
// Every mutating operation here is wrapped in a HistoryCommand and applied
// via HistoryManager.pushCommand, so all layer edits are undoable.

import { dispatch, getSnapshot } from '../store';
import { pushCommand } from '../history/HistoryManager';
import type { BlendMode, HistoryCommand, ImageLayer, Layer } from '../types';

function findLayer(layerId: string): Layer | undefined {
  return getSnapshot().document?.layers.find(l => l.id === layerId);
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
