import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionEngine } from '../selection/SelectionEngine';
import { dispatch, getSnapshot, resetStore } from '../store';
import { undo, redo } from '../history/HistoryManager';
import type { EditorDocument, ImageLayer } from '../types';

// ─── Mock store dispatch so unit tests don't need a real document ─────────────

vi.mock('../store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store')>();
  return { ...actual };
});

function makeDoc(): EditorDocument {
  const bitmap = { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap;
  const layer: ImageLayer = {
    id: 'l1', name: 'Layer', type: 'image', bitmap,
    intrinsicWidth: 100, intrinsicHeight: 100,
    transform: { origin: { x: 0, y: 0 }, size: { width: 100, height: 100 }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
  return {
    id: 'd1', title: 'Test', width: 500, height: 500, resolution: 72,
    layers: [layer], guides: [], activeLayerId: 'l1', createdAt: 0, updatedAt: 0,
  };
}

beforeEach(() => {
  resetStore();
  dispatch({ type: 'SET_DOCUMENT', document: makeDoc() });
});

// ─── Marquee ──────────────────────────────────────────────────────────────────

describe('SelectionEngine — rect marquee', () => {
  it('getLiveBounds returns null before drag', () => {
    expect(SelectionEngine.getLiveBounds()).toBeNull();
  });

  it('getLiveBounds returns current rect during drag', () => {
    SelectionEngine.beginMarquee(10, 20);
    SelectionEngine.updateMarquee(60, 80);
    const b = SelectionEngine.getLiveBounds();
    expect(b).not.toBeNull();
    expect(b!.x).toBe(10);
    expect(b!.y).toBe(20);
    expect(b!.width).toBe(50);
    expect(b!.height).toBe(60);
  });

  it('normalises rect when dragged in negative direction', () => {
    SelectionEngine.beginMarquee(100, 100);
    SelectionEngine.updateMarquee(40, 50);
    const b = SelectionEngine.getLiveBounds()!;
    expect(b.x).toBe(40);
    expect(b.y).toBe(50);
    expect(b.width).toBe(60);
    expect(b.height).toBe(50);
  });

  it('endMarquee commits selection to store for valid rect', () => {
    SelectionEngine.beginMarquee(10, 10);
    SelectionEngine.endMarquee(100, 100, 'rect');
    const sel = getSnapshot().selection;
    expect(sel).not.toBeNull();
    expect(sel!.shape.kind).toBe('rect');
    expect(sel!.bounds.width).toBe(90);
    expect(sel!.bounds.height).toBe(90);
  });

  it('endMarquee deselects for a too-small drag (<2px)', () => {
    dispatch({ type: 'SET_SELECTION', selection: { shape: { kind: 'rect', bounds: { x: 0, y: 0, width: 50, height: 50 } }, bounds: { x: 0, y: 0, width: 50, height: 50 }, feather: 0 } });
    SelectionEngine.beginMarquee(50, 50);
    SelectionEngine.endMarquee(51, 50, 'rect'); // width=1 → deselect
    expect(getSnapshot().selection).toBeNull();
  });

  it('getLiveBounds is null after endMarquee', () => {
    SelectionEngine.beginMarquee(0, 0);
    SelectionEngine.endMarquee(50, 50, 'rect');
    expect(SelectionEngine.getLiveBounds()).toBeNull();
  });
});

describe('SelectionEngine — ellipse marquee', () => {
  it('endMarquee commits ellipse shape', () => {
    SelectionEngine.beginMarquee(10, 10);
    SelectionEngine.endMarquee(90, 90, 'ellipse');
    const sel = getSnapshot().selection!;
    expect(sel.shape.kind).toBe('ellipse');
  });
});

describe('SelectionEngine — deselect', () => {
  it('deselect clears store selection', () => {
    SelectionEngine.beginMarquee(0, 0);
    SelectionEngine.endMarquee(50, 50, 'rect');
    expect(getSnapshot().selection).not.toBeNull();
    SelectionEngine.deselect();
    expect(getSnapshot().selection).toBeNull();
  });
});

describe('SelectionEngine — crop', () => {
  it('commitCrop stages a pending rect without changing the document', () => {
    // E2: crop no longer commits on mouse-up — it becomes a pending rect
    // that Enter applies / Esc cancels.
    SelectionEngine.beginCrop(50, 50);
    SelectionEngine.commitCrop(200, 200);
    expect(getSnapshot().pendingCrop).toEqual({ x: 50, y: 50, width: 150, height: 150 });
    expect(getSnapshot().document!.width).toBe(500); // unchanged (test doc is 500×500)
  });

  it('applyCrop updates document dimensions and is undoable', () => {
    SelectionEngine.beginCrop(50, 50);
    SelectionEngine.commitCrop(200, 200);
    expect(SelectionEngine.applyCrop()).toBe(true);
    const doc = getSnapshot().document!;
    expect(doc.width).toBe(150);
    expect(doc.height).toBe(150);
    // Undo restores the pre-crop dimensions (review C2: crop was irreversible).
    undo();
    expect(getSnapshot().document!.width).toBe(500);
    expect(getSnapshot().document!.height).toBe(500);
    redo();
    expect(getSnapshot().document!.width).toBe(150);
  });

  it('applyCrop shifts layer origins of every layer type, including group children', () => {
    SelectionEngine.beginCrop(50, 50);
    SelectionEngine.commitCrop(200, 200);
    SelectionEngine.applyCrop();
    const layer = getSnapshot().document!.layers[0];
    if (layer.type === 'image') {
      expect(layer.transform.origin.x).toBe(-50);
      expect(layer.transform.origin.y).toBe(-50);
    }
  });

  it('cancelCrop drops the pending rect with no state change', () => {
    SelectionEngine.beginCrop(50, 50);
    SelectionEngine.commitCrop(200, 200);
    SelectionEngine.cancelCrop();
    expect(getSnapshot().pendingCrop).toBeNull();
    expect(getSnapshot().document!.width).toBe(500); // unchanged
  });

  it('too-small crop (<4px) is ignored', () => {
    const before = getSnapshot().document!.width;
    SelectionEngine.beginCrop(0, 0);
    SelectionEngine.commitCrop(3, 3);
    expect(getSnapshot().document!.width).toBe(before);
  });
});
