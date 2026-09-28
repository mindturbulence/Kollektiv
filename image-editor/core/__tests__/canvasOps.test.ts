import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatch, getSnapshot, resetStore } from '../store';
import * as LayerManager from '../layers/LayerManager';
import { exceedsMaxDim, MAX_DIM } from '../io/FileIO';
import { SelectionEngine } from '../selection/SelectionEngine';
import { undo } from '../history/HistoryManager';
import type { EditorDocument, ImageLayer, Layer, Selection } from '../types';

function fakeBitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function makeLayer(name = 'bg', width = 100, height = 100): ImageLayer {
  return {
    id: crypto.randomUUID(), name, type: 'image', bitmap: fakeBitmap(width, height),
    intrinsicWidth: width, intrinsicHeight: height,
    transform: { origin: { x: 0, y: 0 }, size: { width, height }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeDoc(layers: Layer[]): EditorDocument {
  return {
    id: 'd', title: 'T', width: 200, height: 200, resolution: 72,
    layers, guides: [], activeLayerId: layers[0]?.id ?? null, createdAt: 0, updatedAt: 0,
  };
}

beforeEach(() => resetStore());

describe('H13 — MAX_DIM guard', () => {
  it('flags oversize dimensions', () => {
    expect(exceedsMaxDim(MAX_DIM, MAX_DIM)).toBe(false);
    expect(exceedsMaxDim(MAX_DIM + 1, 100)).toBe(true);
    expect(exceedsMaxDim(100, MAX_DIM + 1)).toBe(true);
    expect(exceedsMaxDim(100, 100)).toBe(false);
  });

  it('createBlankDocument throws with a clear message for oversize', async () => {
    const { createBlankDocument } = await import('../io/FileIO');
    // jsdom lacks OffscreenCanvas — the guard fires before any canvas use.
    await expect(createBlankDocument(30_000, 100, 'white')).rejects.toThrow(/supports up to/);
    await expect(createBlankDocument(0, 100, 'white')).rejects.toThrow(/at least 1px/);
  });
});

describe('Canvas Size — anchor offsets', () => {
  it('anchorOffset maps the anchor to a content shift', () => {
    expect(LayerManager.anchorOffset('top-left', 100, 50)).toEqual({ dx: 0, dy: 0 });
    expect(LayerManager.anchorOffset('center', 100, 50)).toEqual({ dx: 50, dy: 25 });
    expect(LayerManager.anchorOffset('bottom-right', 100, 50)).toEqual({ dx: 100, dy: 50 });
  });

  it('RESIZE_CANVAS grows the document and shifts layers by the anchor offset', () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });

    // Grow 200→300 wide, anchored center → content shifts +50 in x.
    dispatch({ type: 'RESIZE_CANVAS', width: 300, height: 200, dx: 50, dy: 0, prevWidth: 200, prevHeight: 200, prevLayers: [] });

    const doc = getSnapshot().document!;
    expect(doc.width).toBe(300);
    expect(doc.height).toBe(200);
    // Center anchor, growing right: content stays visually centered, so the
    // layer's origin moves +50 (half the width delta) in doc space.
    expect(doc.layers[0].transform.origin.x).toBe(50);
    expect(doc.layers[0].transform.origin.y).toBe(0);
  });

  it('RESIZE_CANVAS undo (via LayerManager.resizeCanvas) restores the previous dimensions and layer positions', async () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });

    // resizeCanvas builds the real HistoryCommand (do + undo pair).
    const ok = await LayerManager.resizeCanvas(300, 300, 'center');
    expect(ok).toBe(true);
    expect(getSnapshot().document!.width).toBe(300);
    expect(getSnapshot().document!.layers[0].transform.origin.x).toBe(50);

    undoViaManager();
    const doc = getSnapshot().document!;
    expect(doc.width).toBe(200);
    expect(doc.height).toBe(200);
    expect(doc.layers[0].transform.origin.x).toBe(0);
    expect(doc.layers[0].transform.origin.y).toBe(0);
  });
});

describe('Image Size — RESAMPLE_LAYER', () => {
  it('swaps the bitmap reference and intrinsic size, keeping the layer id', () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });

    const newBitmap = fakeBitmap(64, 64);
    dispatch({
      type: 'RESAMPLE_LAYER', layerId: layer.id, bitmap: newBitmap,
      intrinsicWidth: 64, intrinsicHeight: 64, size: { width: 64, height: 64 },
    });

    const updated = getSnapshot().document!.layers[0] as ImageLayer;
    expect(updated.id).toBe(layer.id);
    expect(updated.bitmap).toBe(newBitmap);
    expect(updated.intrinsicWidth).toBe(64);
    expect(updated.transform.size).toEqual({ width: 64, height: 64 });
    expect(getSnapshot().dirtyLayerIds.has(layer.id)).toBe(true);
  });
});

describe('Crop to selection', () => {
  it('stages the selection bounds as the pending crop rect', () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    const selection: Selection = {
      shape: { kind: 'rect', bounds: { x: 10, y: 20, width: 80, height: 60 } },
      bounds: { x: 10, y: 20, width: 80, height: 60 },
      feather: 0,
    };
    dispatch({ type: 'SET_SELECTION', selection });

    expect(LayerManager.cropToSelection()).toBe(true);
    expect(getSnapshot().pendingCrop).toEqual({ x: 10, y: 20, width: 80, height: 60 });
    // Enter applies it (same path as a dragged crop):
    expect(SelectionEngine.applyCrop()).toBe(true);
    expect(getSnapshot().document!.width).toBe(80);
    expect(getSnapshot().document!.height).toBe(60);
  });

  it('returns false with no selection', () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    expect(LayerManager.cropToSelection()).toBe(false);
    expect(getSnapshot().pendingCrop).toBeNull();
  });
});

describe('resizeLayer guard', () => {
  it('refuses non-image and missing layers', async () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    await expect(LayerManager.resizeLayer('nope', 50, 50)).resolves.toBe(false);
  });

  it('refuses oversize targets before touching any canvas', async () => {
    const layer = makeLayer('bg');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    await expect(LayerManager.resizeLayer(layer.id, MAX_DIM + 1, 50)).rejects.toThrow(/exceeds/);
  });
});

function undoViaManager(): void {
  undo();
}
