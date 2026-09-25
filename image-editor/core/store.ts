// ─── Kollektiv Image Editor — EditorStore ────────────────────────────────────
// Plain module-scoped store (no Zustand, no React context).
//
// CanvasRenderer subscribes imperatively — no React involvement in the paint loop.
// React components read via useSyncExternalStore (React 19 built-in, zero deps).
//
// Pattern: getSnapshot() / subscribe(fn) / dispatch(action)

import type { EditorState, EditorAction, Viewport, BrushSettings, ColorPair, Layer, GroupLayer } from './types';
import { findLayerById, updateLayerById, removeLayerById } from './layers/layerTree';
import { trimHistoryToCap, closeDroppedHistoryBitmaps, collectDocumentBitmaps } from './history/bitmapAccounting';

// ─── Default State ────────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT: Viewport = { zoom: 1.0, panX: 0, panY: 0 };

const DEFAULT_BRUSH: BrushSettings = {
  size: 20,
  hardness: 0.8,
  opacity: 100,
  flow: 100,
  smoothing: 50,
};

const DEFAULT_COLORS: ColorPair = {
  foreground: '#000000',
  background: '#ffffff',
};

function createDefaultState(): EditorState {
  return {
    document: null,
    isDirty: false,
    viewport: { ...DEFAULT_VIEWPORT },
    activeTool: 'move',
    activeLayerId: null,
    selection: null,
    colors: { ...DEFAULT_COLORS },
    brush: { ...DEFAULT_BRUSH },
    dirtyLayerIds: new Set(),
    history: [],
    historyIndex: -1,
    openAdjustments: new Set(),
    pendingCrop: null,
    paintTarget: 'color',
    colorPickerTarget: null,
  };
}

// ─── Store Implementation ─────────────────────────────────────────────────────

let _state: EditorState = createDefaultState();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach(fn => fn());
}

/** Returns the current editor state snapshot (stable reference until state changes). */
export function getSnapshot(): EditorState {
  return _state;
}

/**
 * Subscribe to store changes. Returns an unsubscribe function.
 * Pass to useSyncExternalStore in React components.
 */
export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Dispatch an action to mutate editor state. Notifies all subscribers. */
export function dispatch(action: EditorAction): void {
  const prev = _state;

  switch (action.type) {
    case 'SET_DOCUMENT':
      _state = {
        ...prev,
        document: action.document,
        isDirty: false,
        activeLayerId: action.document?.layers[0]?.id ?? null,
        selection: null,
        viewport: { ...DEFAULT_VIEWPORT },
        dirtyLayerIds: action.document
          ? new Set(action.document.layers.map(l => l.id))
          : new Set(),
        paintTarget: 'color',
      };
      break;

    case 'SET_TITLE': {
      // M5 leftover: rename = title-only mutation. No viewport/selection/
      // paintTarget resets (those belong to SET_DOCUMENT / opening a doc).
      if (!prev.document) return;
      const title = action.title.trim();
      if (!title || title === prev.document.title) return;
      _state = {
        ...prev,
        isDirty: true,
        document: { ...prev.document, title, updatedAt: Date.now() },
      };
      break;
    }

    case 'SET_ACTIVE_LAYER':
      if (prev.activeLayerId === action.layerId) return;
      _state = { ...prev, activeLayerId: action.layerId, paintTarget: 'color' };
      break;

    case 'SET_PAINT_TARGET':
      if (prev.paintTarget === action.target) return;
      _state = { ...prev, paintTarget: action.target };
      break;

    case 'SET_ACTIVE_TOOL':
      if (prev.activeTool === action.tool) return;
      _state = { ...prev, activeTool: action.tool };
      break;

    case 'SET_VIEWPORT': {
      const nextViewport: Viewport = { ...prev.viewport, ...action.viewport };
      // Clamp zoom
      nextViewport.zoom = Math.max(0.125, Math.min(16.0, nextViewport.zoom));
      _state = { ...prev, viewport: nextViewport };
      break;
    }

    case 'SET_SELECTION':
      _state = { ...prev, selection: action.selection };
      break;

    case 'SET_COLORS':
      _state = { ...prev, colors: { ...prev.colors, ...action.colors } };
      break;

    case 'SET_COLOR_PICKER_TARGET':
      if (prev.colorPickerTarget === action.target) return;
      _state = { ...prev, colorPickerTarget: action.target };
      break;

    case 'SET_BRUSH':
      _state = { ...prev, brush: { ...prev.brush, ...action.brush } };
      break;

    case 'SET_DIRTY':
      if (prev.isDirty === action.dirty) return;
      _state = { ...prev, isDirty: action.dirty };
      break;

    case 'UPDATE_LAYER': {
      if (!prev.document) return;
      const layers = patchLayer(prev.document.layers, action.layerId, action.patch);
      if (layers === prev.document.layers) return;
      _state = {
        ...prev,
        isDirty: true,
        document: { ...prev.document, layers },
      };
      break;
    }

    case 'ADD_LAYER': {
      if (!prev.document) return;
      const layers = [...prev.document.layers];
      // `insertAfterIndex` means "insert at the active layer's index" — the new
      // layer lands ABOVE it (index 0 = topmost), not below. The old `+ 1` put
      // new blank layers underneath the active one, so painting on them showed
      // nothing (caught by the H11 unit test).
      const insertAt = action.insertAfterIndex !== undefined
        ? action.insertAfterIndex
        : 0;
      layers.splice(insertAt, 0, action.layer);
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: action.layer.id,
        document: { ...prev.document, layers },
        dirtyLayerIds: new Set([...prev.dirtyLayerIds, action.layer.id]),
      };
      break;
    }

    case 'REMOVE_LAYER': {
      if (!prev.document) return;
      const layers = removeLayer(prev.document.layers, action.layerId);
      const nextActiveId = layers[0]?.id ?? null;
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: prev.activeLayerId === action.layerId ? nextActiveId : prev.activeLayerId,
        document: { ...prev.document, layers },
      };
      break;
    }

    case 'INSERT_LAYER_AT': {
      // M5 item 5 / review H12. Two modes, discriminated by the snapshot:
      // - Restore (remove-undo): the layer being inserted IS at `index` in the
      //   pre-removal snapshot — reinstate the snapshot verbatim.
      // - Insert (duplicate): the layer is NEW — splice it into the snapshot
      //   at `index`, pushing the current occupant down.
      if (!prev.document) return;
      const { layer, parentId, index, siblingsSnapshot } = action;
      const isRestore = siblingsSnapshot[index]?.id === layer.id;
      const nextSiblings = isRestore
        ? siblingsSnapshot
        : (() => {
            const arr = [...siblingsSnapshot];
            arr.splice(Math.min(index, arr.length), 0, layer);
            return arr;
          })();
      const layers = parentId === null
        ? nextSiblings
        : rebuildGroupChildren(prev.document.layers, parentId, nextSiblings);
      if (!layers) return; // stale group id — refuse
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: layer.id,
        document: { ...prev.document, layers },
        dirtyLayerIds: new Set([...prev.dirtyLayerIds, layer.id]),
      };
      break;
    }

    case 'SET_LAYERS': {
      // M5 item 5: flatten swaps the whole top-level stack (undo restores it).
      if (!prev.document) return;
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: action.layers[0]?.id ?? null,
        document: { ...prev.document, layers: action.layers },
        dirtyLayerIds: new Set(action.layers.flatMap(l => l.type === 'image' ? [l.id] : [])),
      };
      break;
    }

    case 'REPLACE_TOP_LEVEL_PAIR': {
      // M5 item 5: merge-down replaces [upper, below] with one rasterized layer.
      if (!prev.document) return;
      const idx = prev.document.layers.findIndex(l => l.id === action.upperId);
      const belowIdx = prev.document.layers.findIndex(l => l.id === action.belowId);
      if (idx < 0 || belowIdx !== idx + 1) return; // pair no longer adjacent
      const layers = [...prev.document.layers];
      layers.splice(idx, 2, action.mergedLayer);
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: action.mergedLayer.id,
        document: { ...prev.document, layers },
        dirtyLayerIds: new Set([...prev.dirtyLayerIds, action.mergedLayer.id]),
      };
      break;
    }

    case 'RESTORE_TOP_LEVEL_PAIR': {
      if (!prev.document) return;
      const layers = [...prev.document.layers];
      // After do() the merged layer sits exactly where the pair was — remove it,
      // then splice the original pair back at that index.
      if (layers[action.index]?.id === action.upper.id) return; // already restored (stale redo)
      layers.splice(action.index, 1);
      const insertAt = Math.min(action.index, layers.length);
      layers.splice(insertAt, 0, action.upper, action.below);
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: action.upper.id,
        document: { ...prev.document, layers },
        dirtyLayerIds: new Set([
          ...prev.dirtyLayerIds,
          ...(action.upper.type === 'image' ? [action.upper.id] : []),
          ...(action.below.type === 'image' ? [action.below.id] : []),
        ]),
      };
      break;
    }

    case 'REORDER_LAYERS': {
      if (!prev.document) return;
      const reordered = action.orderedIds
        .map(id => prev.document!.layers.find(l => l.id === id))
        .filter((l): l is Layer => l !== undefined);
      // Only update if order actually changed
      if (reordered.every((l, i) => l.id === prev.document!.layers[i]?.id)) return;
      _state = {
        ...prev,
        isDirty: true,
        document: { ...prev.document, layers: reordered },
      };
      break;
    }

    case 'GROUP_LAYERS': {
      if (!prev.document) return;
      const layers = prev.document.layers;
      const idSet = new Set(action.layerIds);
      const selected = layers.filter(l => idSet.has(l.id));
      if (selected.length === 0) return;
      const remaining = layers.filter(l => !idSet.has(l.id));
      const group: GroupLayer = {
        id: action.groupId,
        name: action.groupName,
        type: 'group',
        children: selected,
        transform: { origin: { x: 0, y: 0 }, size: { width: prev.document.width, height: prev.document.height }, rotation: 0, flipH: false, flipV: false },
        opacity: 100,
        blendMode: 'normal',
        visible: true,
      };
      const insertAt = Math.min(action.insertIndex, remaining.length);
      const newLayers = [...remaining];
      newLayers.splice(insertAt, 0, group);
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: group.id,
        document: { ...prev.document, layers: newLayers },
      };
      break;
    }

    case 'UNGROUP_LAYER': {
      if (!prev.document) return;
      const layers = prev.document.layers;
      const idx = layers.findIndex(l => l.id === action.groupId && l.type === 'group');
      if (idx < 0) return;
      const group = layers[idx] as GroupLayer;
      const newLayers = [...layers.slice(0, idx), ...group.children, ...layers.slice(idx + 1)];
      _state = {
        ...prev,
        isDirty: true,
        activeLayerId: group.children[0]?.id ?? prev.activeLayerId,
        document: { ...prev.document, layers: newLayers },
      };
      break;
    }

    case 'MARK_LAYER_DIRTY': {
      if (prev.dirtyLayerIds.has(action.layerId)) return;
      const next = new Set(prev.dirtyLayerIds);
      next.add(action.layerId);
      _state = { ...prev, dirtyLayerIds: next };
      break;
    }

    case 'CLEAR_DIRTY_LAYERS': {
      if (action.layerIds.size === 0) return;
      const next = new Set(prev.dirtyLayerIds);
      for (const id of action.layerIds) next.delete(id);
      if (next.size === prev.dirtyLayerIds.size) return;
      _state = { ...prev, dirtyLayerIds: next };
      break;
    }

    case 'REPLACE_LAYER_BITMAP': {
      if (!prev.document) return;
      const layers = updateLayerById(prev.document.layers, action.layerId, { bitmap: action.bitmap } as Partial<Layer>);
      if (layers === prev.document.layers) return;
      const dirty = new Set(prev.dirtyLayerIds);
      dirty.add(action.layerId);
      _state = { ...prev, isDirty: true, document: { ...prev.document, layers }, dirtyLayerIds: dirty };
      break;
    }

    case 'REPLACE_LAYER_MASK_BITMAP': {
      if (!prev.document) return;
      const target = findLayerById(prev.document.layers, action.layerId);
      if (!target || target.type !== 'image' || !target.mask) return;
      const layers = updateLayerById(prev.document.layers, action.layerId, {
        mask: { ...target.mask, bitmap: action.bitmap },
      } as Partial<Layer>);
      if (layers === prev.document.layers) return;
      _state = { ...prev, isDirty: true, document: { ...prev.document, layers } };
      break;
    }

    case 'OPEN_ADJUSTMENT': {
      if (prev.openAdjustments.has(action.panel)) return;
      const next = new Set(prev.openAdjustments);
      next.add(action.panel);
      _state = { ...prev, openAdjustments: next };
      break;
    }

    case 'CLOSE_ADJUSTMENT': {
      if (!prev.openAdjustments.has(action.panel)) return;
      const next = new Set(prev.openAdjustments);
      next.delete(action.panel);
      _state = { ...prev, openAdjustments: next };
      break;
    }

    case 'APPLY_CROP': {
      if (!prev.document) return;
      const { rect } = action;
      // Shift EVERY layer type recursively through groups (review C2): the old
      // code moved only top-level image layers, so text and shape overlays sat
      // in the wrong place after a crop and group children never moved at all.
      const layers = shiftLayersBy(prev.document.layers, rect.x, rect.y);
      _state = {
        ...prev,
        isDirty: true,
        document: {
          ...prev.document,
          width: rect.width,
          height: rect.height,
          layers,
          updatedAt: Date.now(),
        },
        selection: null,
      };
      break;
    }

    case 'RESTORE_CROP': {
      if (!prev.document) return;
      _state = {
        ...prev,
        isDirty: true,
        document: {
          ...prev.document,
          width: action.width,
          height: action.height,
          layers: action.layers,
          updatedAt: Date.now(),
        },
        selection: null,
      };
      break;
    }

    case 'SET_PENDING_CROP': {
      const next = action.rect;
      if (prev.pendingCrop === next) return;
      _state = { ...prev, pendingCrop: next };
      break;
    }

    case 'RESAMPLE_LAYER': {
      // M5 item 6 — Image Size: swap one image layer's bitmap for a resampled
      // one. size (rendered size) follows the resample so the layer's doc-space
      // footprint matches its new intrinsic pixels 1:1.
      if (!prev.document) return;
      const target = findLayerById(prev.document.layers, action.layerId);
      if (!target || target.type !== 'image') return;
      const layers = updateLayerById(prev.document.layers, action.layerId, {
        bitmap: action.bitmap,
        intrinsicWidth: action.intrinsicWidth,
        intrinsicHeight: action.intrinsicHeight,
        transform: {
          ...target.transform,
          size: { ...action.size },
        },
      } as Partial<Layer>);
      if (layers === prev.document.layers) return;
      const dirty = new Set(prev.dirtyLayerIds);
      dirty.add(action.layerId);
      _state = { ...prev, isDirty: true, document: { ...prev.document, layers }, dirtyLayerIds: dirty };
      break;
    }

    case 'RESIZE_CANVAS': {
      // M5 item 6 — Canvas Size: change document dimensions and shift every
      // layer so the anchored edge stays put. dx/dy = how far the content
      // origin moves (anchorOffset); shiftLayersBy SUBTRACTS, so pass the
      // negation to move content BY dx/dy.
      if (!prev.document) return;
      const layers = shiftLayersBy(prev.document.layers, -action.dx, -action.dy);
      _state = {
        ...prev,
        isDirty: true,
        document: {
          ...prev.document,
          width: action.width,
          height: action.height,
          layers,
          updatedAt: Date.now(),
        },
        selection: null,
      };
      break;
    }

    case 'PUSH_HISTORY': {
      // Drop any redo branch (commands after current index) — its bitmaps that
      // nothing else holds are closed by the accounting module (review H3):
      // trimHistoryToCap sees the FULL previous stack, so redo-dropped commands
      // are treated the same as byte-evicted ones.
      const trimmed = prev.history.slice(0, prev.historyIndex + 1);
      const afterAppend = [...trimmed, action.command];
      // Byte cap, not just count (review H3): 50 full-bitmap commands on a 4k
      // layer ≈ 3.2 GB. Cap by unique decoded bytes; evict oldest-first, close
      // evicted/dropped bitmaps that neither surviving commands nor the live
      // document reference.
      const live = collectDocumentBitmaps(prev.document);
      const clamped = trimHistoryToCap(afterAppend, prev.history, live);
      _state = {
        ...prev,
        history: clamped,
        historyIndex: clamped.length - 1,
      };
      break;
    }

    case 'UNDO': {
      if (prev.historyIndex < 0) return;
      _state = { ...prev, historyIndex: prev.historyIndex - 1, isDirty: true };
      break;
    }

    case 'REDO': {
      if (prev.historyIndex >= prev.history.length - 1) return;
      _state = { ...prev, historyIndex: prev.historyIndex + 1, isDirty: true };
      break;
    }

    case 'CLEAR_HISTORY': {
      if (prev.history.length === 0) return;
      closeDroppedHistoryBitmaps(prev.history, collectDocumentBitmaps(prev.document));
      _state = { ...prev, history: [], historyIndex: -1 };
      break;
    }
  }

  if (_state !== prev) notify();
}

/** Reset store to initial state (call when unmounting ImageEditorPage).
 *  History bitmaps that the document no longer holds are closed (review H3). */
export function resetStore(): void {
  closeDroppedHistoryBitmaps(_state.history, collectDocumentBitmaps(_state.document));
  _state = createDefaultState();
  notify();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function patchLayer(layers: Layer[], id: string, patch: Partial<Layer>): Layer[] {
  return updateLayerById(layers, id, patch);
}

function removeLayer(layers: Layer[], id: string): Layer[] {
  return removeLayerById(layers, id);
}

/** Recursively offsets the origin of every layer (all types, through groups)
 *  by (dx, dy). Pure — returns new objects, does not mutate. */
function shiftLayersBy(layers: Layer[], dx: number, dy: number): Layer[] {
  return layers.map(layer =>
    layer.type === 'group'
      ? { ...layer, children: shiftLayersBy(layer.children, dx, dy) }
      : {
          ...layer,
          transform: {
            ...layer.transform,
            origin: { x: layer.transform.origin.x - dx, y: layer.transform.origin.y - dy },
          },
        },
  );
}

/** Replaces group `groupId`'s children with `children` (INSERT_LAYER_AT undo).
 *  Returns null when the group no longer exists (stale undo — refuse). */
function rebuildGroupChildren(layers: Layer[], groupId: string, children: Layer[]): Layer[] | null {
  let found = false;
  const result = layers.map((layer) => {
    if (layer.id === groupId && layer.type === 'group') {
      found = true;
      return { ...layer, children };
    }
    if (layer.type === 'group') {
      const nested = rebuildGroupChildren(layer.children, groupId, children);
      if (nested) {
        found = true;
        return { ...layer, children: nested };
      }
    }
    return layer;
  });
  return found ? result : null;
}
