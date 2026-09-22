import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatch, getSnapshot, subscribe, resetStore } from '../store';
import type { EditorDocument, ImageLayer, Layer, Selection, HistoryCommand } from '../types';

function makeLayer(name = 'bg'): ImageLayer {
  const bitmap = { width: 100, height: 100, close: () => {} } as unknown as ImageBitmap;
  return {
    id: crypto.randomUUID(), name, type: 'image', bitmap,
    intrinsicWidth: 100, intrinsicHeight: 100,
    transform: { origin: { x: 0, y: 0 }, size: { width: 100, height: 100 }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeDoc(layers: Layer[] = []): EditorDocument {
  return {
    id: 'doc1', title: 'Test', width: 100, height: 100, resolution: 72,
    layers, guides: [], activeLayerId: layers[0]?.id ?? null,
    createdAt: 0, updatedAt: 0,
  };
}

function makeSelection(): Selection {
  return {
    shape: { kind: 'rect', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    feather: 0,
  };
}

function makeHistoryCommand(label = 'cmd'): HistoryCommand {
  return { id: crypto.randomUUID(), label, timestamp: Date.now(), do: () => {}, undo: () => {} };
}

describe('EditorStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('SET_DOCUMENT', () => {
    it('sets document and resets navigation state', () => {
      const layer = makeLayer();
      const doc = makeDoc([layer]);
      dispatch({ type: 'SET_DOCUMENT', document: doc });
      expect(getSnapshot().document).toBe(doc);
      expect(getSnapshot().activeLayerId).toBe(layer.id);
      expect(getSnapshot().viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
      expect(getSnapshot().isDirty).toBe(false);
    });

    it('clears the current selection', () => {
      dispatch({ type: 'SET_SELECTION', selection: makeSelection() });
      expect(getSnapshot().selection).not.toBeNull();
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([makeLayer()]) });
      expect(getSnapshot().selection).toBeNull();
    });

    it('marks every layer ID dirty', () => {
      const layer1 = makeLayer('a');
      const layer2 = makeLayer('b');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1, layer2]) });
      expect(getSnapshot().dirtyLayerIds).toEqual(new Set([layer1.id, layer2.id]));
    });

    it('sets activeLayerId to null and dirtyLayerIds empty for a null document', () => {
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([makeLayer()]) });
      dispatch({ type: 'SET_DOCUMENT', document: null });
      expect(getSnapshot().document).toBeNull();
      expect(getSnapshot().activeLayerId).toBeNull();
      expect(getSnapshot().dirtyLayerIds).toEqual(new Set());
    });
  });

  describe('SET_ACTIVE_LAYER', () => {
    it('updates activeLayerId', () => {
      const layer1 = makeLayer('a');
      const layer2 = makeLayer('b');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1, layer2]) });
      dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer2.id });
      expect(getSnapshot().activeLayerId).toBe(layer2.id);
    });

    it('no-ops when the value is unchanged (stable snapshot reference)', () => {
      const layer = makeLayer();
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
      const before = getSnapshot();
      dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id });
      expect(getSnapshot()).toBe(before);
    });
  });

  describe('SET_VIEWPORT', () => {
    it('clamps zoom to [0.125, 16.0]', () => {
      dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 100 } });
      expect(getSnapshot().viewport.zoom).toBe(16.0);

      dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 0.0001 } });
      expect(getSnapshot().viewport.zoom).toBe(0.125);
    });

    it('applies partial updates while preserving other fields', () => {
      dispatch({ type: 'SET_VIEWPORT', viewport: { panX: 50, panY: 25 } });
      expect(getSnapshot().viewport).toEqual({ zoom: 1, panX: 50, panY: 25 });

      dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 2 } });
      expect(getSnapshot().viewport).toEqual({ zoom: 2, panX: 50, panY: 25 });
    });
  });

  describe('ADD_LAYER', () => {
    it('inserts at the correct index, activates the new layer, and marks dirty', () => {
      const layer1 = makeLayer('a');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1]) });
      const layer2 = makeLayer('b');
      dispatch({ type: 'ADD_LAYER', layer: layer2, insertAfterIndex: 0 });

      const snap = getSnapshot();
      expect(snap.document!.layers.map(l => l.id)).toEqual([layer1.id, layer2.id]);
      expect(snap.activeLayerId).toBe(layer2.id);
      expect(snap.isDirty).toBe(true);
    });

    it('inserts at index 0 when insertAfterIndex is omitted', () => {
      const layer1 = makeLayer('a');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1]) });
      const layer2 = makeLayer('b');
      dispatch({ type: 'ADD_LAYER', layer: layer2 });

      expect(getSnapshot().document!.layers.map(l => l.id)).toEqual([layer2.id, layer1.id]);
    });
  });

  describe('REMOVE_LAYER', () => {
    it('removes the layer and re-selects the next remaining layer when active layer is deleted', () => {
      const layer1 = makeLayer('a');
      const layer2 = makeLayer('b');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1, layer2]) });
      dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer1.id });

      dispatch({ type: 'REMOVE_LAYER', layerId: layer1.id });

      const snap = getSnapshot();
      expect(snap.document!.layers.map(l => l.id)).toEqual([layer2.id]);
      expect(snap.activeLayerId).toBe(layer2.id);
      expect(snap.isDirty).toBe(true);
    });

    it('preserves activeLayerId when the removed layer is not active', () => {
      const layer1 = makeLayer('a');
      const layer2 = makeLayer('b');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1, layer2]) });

      dispatch({ type: 'REMOVE_LAYER', layerId: layer2.id });

      expect(getSnapshot().activeLayerId).toBe(layer1.id);
    });
  });

  describe('REORDER_LAYERS', () => {
    it('reorders layers without dropping or duplicating IDs', () => {
      const layer1 = makeLayer('a');
      const layer2 = makeLayer('b');
      const layer3 = makeLayer('c');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1, layer2, layer3]) });

      dispatch({ type: 'REORDER_LAYERS', orderedIds: [layer3.id, layer1.id, layer2.id] });

      const snap = getSnapshot();
      expect(snap.document!.layers.map(l => l.id)).toEqual([layer3.id, layer1.id, layer2.id]);
      expect(snap.isDirty).toBe(true);
    });

    it('no-ops when the order is unchanged', () => {
      const layer1 = makeLayer('a');
      const layer2 = makeLayer('b');
      dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer1, layer2]) });

      const before = getSnapshot();
      dispatch({ type: 'REORDER_LAYERS', orderedIds: [layer1.id, layer2.id] });

      expect(getSnapshot()).toBe(before);
    });
  });

  describe('PUSH_HISTORY', () => {
    it('increments historyIndex and adds the command to history', () => {
      const cmd = makeHistoryCommand();
      dispatch({ type: 'PUSH_HISTORY', command: cmd });

      const snap = getSnapshot();
      expect(snap.history).toEqual([cmd]);
      expect(snap.historyIndex).toBe(0);
    });

    it('clears the redo branch when pushing after an undo', () => {
      const cmd1 = makeHistoryCommand('a');
      const cmd2 = makeHistoryCommand('b');
      dispatch({ type: 'PUSH_HISTORY', command: cmd1 });
      dispatch({ type: 'PUSH_HISTORY', command: cmd2 });
      dispatch({ type: 'UNDO' });

      const cmd3 = makeHistoryCommand('c');
      dispatch({ type: 'PUSH_HISTORY', command: cmd3 });

      const snap = getSnapshot();
      expect(snap.history).toEqual([cmd1, cmd3]);
      expect(snap.historyIndex).toBe(1);
    });
  });

  describe('UNDO', () => {
    it('decrements historyIndex and stops at -1', () => {
      dispatch({ type: 'PUSH_HISTORY', command: makeHistoryCommand() });
      dispatch({ type: 'UNDO' });
      expect(getSnapshot().historyIndex).toBe(-1);

      const before = getSnapshot();
      dispatch({ type: 'UNDO' });
      expect(getSnapshot()).toBe(before);
      expect(getSnapshot().historyIndex).toBe(-1);
    });
  });

  describe('REDO', () => {
    it('increments historyIndex and stops at history.length - 1', () => {
      dispatch({ type: 'PUSH_HISTORY', command: makeHistoryCommand() });
      dispatch({ type: 'UNDO' });
      dispatch({ type: 'REDO' });
      expect(getSnapshot().historyIndex).toBe(0);

      const before = getSnapshot();
      dispatch({ type: 'REDO' });
      expect(getSnapshot()).toBe(before);
      expect(getSnapshot().historyIndex).toBe(0);
    });
  });

  describe('subscribe / getSnapshot', () => {
    it('calls subscribers when state changes', () => {
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);

      dispatch({ type: 'SET_ACTIVE_TOOL', tool: 'brush' });

      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('does not call subscribers when an early-return guard fires', () => {
      dispatch({ type: 'SET_ACTIVE_TOOL', tool: 'brush' });

      const listener = vi.fn();
      const unsubscribe = subscribe(listener);

      dispatch({ type: 'SET_ACTIVE_TOOL', tool: 'brush' });

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
