import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransformEngine } from '../transform/TransformEngine';
import { dispatch, getSnapshot, resetStore } from '../store';
import type { EditorDocument, ImageLayer } from '../types';

function makeLayer(id = 'l1'): ImageLayer {
  const bitmap = { width: 200, height: 200, close: vi.fn() } as unknown as ImageBitmap;
  return {
    id, name: 'Test', type: 'image', bitmap,
    intrinsicWidth: 200, intrinsicHeight: 200,
    transform: {
      origin:   { x: 50, y: 50 },
      size:     { width: 200, height: 200 },
      rotation: 0, flipH: false, flipV: false,
    },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeDoc(layer = makeLayer()): EditorDocument {
  return {
    id: 'd1', title: 'T', width: 500, height: 500, resolution: 72,
    layers: [layer], guides: [], activeLayerId: layer.id, createdAt: 0, updatedAt: 0,
  };
}

beforeEach(() => {
  resetStore();
  dispatch({ type: 'SET_DOCUMENT', document: makeDoc() });
});

// ─── flipHorizontal ───────────────────────────────────────────────────────────

describe('TransformEngine.flipHorizontal', () => {
  it('toggles flipH and creates an undoable command', () => {
    const before = (getSnapshot().document!.layers[0] as ImageLayer).transform.flipH;
    expect(before).toBe(false);

    TransformEngine.flipHorizontal('l1');

    const after = (getSnapshot().document!.layers[0] as ImageLayer).transform.flipH;
    expect(after).toBe(true);
    expect(getSnapshot().historyIndex).toBe(0);
  });
  it('is undoable — command is pushed to history', () => {
    TransformEngine.flipHorizontal('l1');
    expect(getSnapshot().historyIndex).toBe(0);
    expect(getSnapshot().history.length).toBe(1);
  });

  it('calling twice toggles back', () => {
    TransformEngine.flipHorizontal('l1');
    TransformEngine.flipHorizontal('l1');
    const layer = getSnapshot().document!.layers[0] as ImageLayer;
    expect(layer.transform.flipH).toBe(false);
  });
});

// ─── flipVertical ─────────────────────────────────────────────────────────────

describe('TransformEngine.flipVertical', () => {
  it('toggles flipV', () => {
    TransformEngine.flipVertical('l1');
    const layer = getSnapshot().document!.layers[0] as ImageLayer;
    expect(layer.transform.flipV).toBe(true);
  });
});

// ─── resetRotation ────────────────────────────────────────────────────────────

describe('TransformEngine.resetRotation', () => {
  it('sets rotation to 0 when non-zero', () => {
    dispatch({ type: 'UPDATE_LAYER', layerId: 'l1', patch: { transform: { ...makeLayer().transform, rotation: 45 } } });
    TransformEngine.resetRotation('l1');
    const layer = getSnapshot().document!.layers[0] as ImageLayer;
    expect(layer.transform.rotation).toBe(0);
  });
});

// ─── beginDrag / updateDrag / endDrag ─────────────────────────────────────────

describe('TransformEngine drag lifecycle', () => {
  it('isDragging() false before beginDrag', () => {
    expect(TransformEngine.isDragging()).toBe(false);
  });

  it('isDragging() true after beginDrag', () => {
    TransformEngine.beginDrag('body', 'l1', { x: 100, y: 100 });
    expect(TransformEngine.isDragging()).toBe(true);
  });

  it('body drag moves layer origin', () => {
    TransformEngine.beginDrag('body', 'l1', { x: 100, y: 100 });
    TransformEngine.updateDrag({ x: 130, y: 115 });
    const layer = getSnapshot().document!.layers[0] as ImageLayer;
    expect(layer.transform.origin.x).toBeCloseTo(80, 0); // 50 + 30
    expect(layer.transform.origin.y).toBeCloseTo(65, 0); // 50 + 15
  });

  it('endDrag clears dragging state and pushes command', () => {
    TransformEngine.beginDrag('body', 'l1', { x: 100, y: 100 });
    TransformEngine.updateDrag({ x: 150, y: 150 });
    TransformEngine.endDrag();
    expect(TransformEngine.isDragging()).toBe(false);
    expect(getSnapshot().historyIndex).toBe(0);
  });

  it('cancelDrag restores original transform', () => {
    const original = (getSnapshot().document!.layers[0] as ImageLayer).transform;
    TransformEngine.beginDrag('body', 'l1', { x: 100, y: 100 });
    TransformEngine.updateDrag({ x: 200, y: 200 });
    TransformEngine.cancelDrag();
    const restored = (getSnapshot().document!.layers[0] as ImageLayer).transform;
    expect(restored.origin.x).toBe(original.origin.x);
    expect(restored.origin.y).toBe(original.origin.y);
    expect(TransformEngine.isDragging()).toBe(false);
  });

  it('br handle scales width and height', () => {
    TransformEngine.beginDrag('br', 'l1', { x: 250, y: 250 }); // layer bottom-right
    TransformEngine.updateDrag({ x: 300, y: 280 });
    const layer = getSnapshot().document!.layers[0] as ImageLayer;
    expect(layer.transform.size.width).toBeGreaterThan(200);  // 200 + 50
    expect(layer.transform.size.height).toBeGreaterThan(200); // 200 + 30
  });
});
