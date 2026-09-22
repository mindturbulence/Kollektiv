// ─── Kollektiv Image Editor — EditorStore ────────────────────────────────────
// Plain module-scoped store (no Zustand, no React context).
//
// CanvasRenderer subscribes imperatively — no React involvement in the paint loop.
// React components read via useSyncExternalStore (React 19 built-in, zero deps).
//
// Pattern: getSnapshot() / subscribe(fn) / dispatch(action)

import type { EditorState, EditorAction, Viewport, BrushSettings, ColorPair, Layer } from './types';

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
      };
      break;

    case 'SET_ACTIVE_LAYER':
      if (prev.activeLayerId === action.layerId) return;
      _state = { ...prev, activeLayerId: action.layerId };
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
      const insertAt = action.insertAfterIndex !== undefined
        ? action.insertAfterIndex + 1
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
      const layers = prev.document.layers.map(l =>
        l.id === action.layerId && l.type === 'image'
          ? { ...l, bitmap: action.bitmap }
          : l
      );
      if (layers === prev.document.layers) return;
      const dirty = new Set(prev.dirtyLayerIds);
      dirty.add(action.layerId);
      _state = { ...prev, isDirty: true, document: { ...prev.document, layers }, dirtyLayerIds: dirty };
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

    case 'PUSH_HISTORY': {
      // Drop any redo branch (commands after current index)
      const trimmed = prev.history.slice(0, prev.historyIndex + 1);
      const MAX_HISTORY = 50;
      const clamped = trimmed.length >= MAX_HISTORY ? trimmed.slice(trimmed.length - MAX_HISTORY + 1) : trimmed;
      _state = {
        ...prev,
        history: [...clamped, action.command],
        historyIndex: clamped.length,
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
      _state = { ...prev, history: [], historyIndex: -1 };
      break;
    }
  }

  if (_state !== prev) notify();
}

/** Reset store to initial state (call when unmounting ImageEditorPage). */
export function resetStore(): void {
  _state = createDefaultState();
  notify();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function patchLayer(layers: Layer[], id: string, patch: Partial<Layer>): Layer[] {
  let changed = false;
  const result = layers.map(l => {
    if (l.id === id) {
      changed = true;
      return { ...l, ...patch } as Layer;
    }
    return l;
  });
  return changed ? result : layers;
}

function removeLayer(layers: Layer[], id: string): Layer[] {
  return layers.filter(l => l.id !== id);
}
