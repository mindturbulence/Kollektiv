// ─── Kollektiv Image Editor — M5 leftovers tests ───────────────────────────
// SET_TITLE rename, fill/delete-in-selection, gradient selection clip, and
// double-click text re-edit (TypeTool existing-layer path + updateTextLayer).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dispatch, getSnapshot, resetStore } from '../store';
import * as LayerManager from '../layers/LayerManager';
import { undo } from '../history/HistoryManager';
import { GradientTool } from '../gradient/GradientTool';
import { TypeTool } from '../text/TypeTool';
import type { EditorDocument, ImageLayer, Layer, Selection, TextLayer } from '../types';

function fakeBitmap(width = 64, height = 64): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function makeLayer(name = 'bg', width = 64, height = 64): ImageLayer {
  return {
    id: crypto.randomUUID(), name, type: 'image', bitmap: fakeBitmap(width, height),
    intrinsicWidth: width, intrinsicHeight: height,
    transform: { origin: { x: 0, y: 0 }, size: { width, height }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeTextLayer(text: string): TextLayer {
  return {
    id: crypto.randomUUID(), name: 'Text', type: 'text', text,
    font: { family: 'sans-serif', size: 48, weight: 400 }, color: '#112233',
    transform: { origin: { x: 10, y: 10 }, size: { width: 100, height: 60 }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeDoc(layers: Layer[]): EditorDocument {
  return {
    id: 'd', title: 'Old Title', width: 200, height: 200, resolution: 72,
    layers, guides: [], activeLayerId: layers[0]?.id ?? null, createdAt: 0, updatedAt: 0,
  };
}

function rectSelection(): Selection {
  const bounds = { x: 10, y: 10, width: 40, height: 40 };
  return { shape: { kind: 'rect', bounds }, bounds, feather: 0 };
}

// jsdom lacks OffscreenCanvas / Path2D / DOMMatrix / createImageBitmap —
// structural fakes are enough: the code paths under test only call methods.
class Fake2DCtx {
  calls: Array<{ op: string; args: unknown[] }> = [];
  globalCompositeOperation = 'source-over';
  fillStyle = '';
  font = '';
  drawImage(...args: unknown[]) { this.calls.push({ op: 'drawImage', args }); }
  save() { this.calls.push({ op: 'save', args: [] }); }
  clip(...args: unknown[]) { this.calls.push({ op: 'clip', args }); }
  fillRect(...args: unknown[]) { this.calls.push({ op: 'fillRect', args }); }
  restore() { this.calls.push({ op: 'restore', args: [] }); }
  measureText(text: string) { return { width: text.length * 10 }; }
  createLinearGradient(...args: unknown[]) {
    this.calls.push({ op: 'createLinearGradient', args });
    return { addColorStop: () => {} };
  }
  fill(...args: unknown[]) { this.calls.push({ op: 'fill', args }); }
}

class FakeOffscreenCanvas {
  width: number; height: number;
  static lastCtx: Fake2DCtx | null = null;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(kind: string): Fake2DCtx | null {
    if (kind !== '2d') return null;
    const ctx = new Fake2DCtx();
    FakeOffscreenCanvas.lastCtx = ctx;
    return ctx;
  }
}

class FakePath2D {
  static last: FakePath2D | null = null;
  added: Array<{ path: FakePath2D; matrix: unknown }> = [];
  rectCalls: unknown[][] = [];
  constructor() { FakePath2D.last = this; }
  rect(...args: unknown[]) { this.rectCalls.push(args); }
  ellipse(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  addPath(path: FakePath2D, matrix?: unknown) { this.added.push({ path, matrix }); }
}

class FakeDOMMatrix {
  m: number[];
  constructor(m: number[]) { this.m = m; }
}

function stubCanvasGlobals(): void {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('Path2D', FakePath2D);
  vi.stubGlobal('DOMMatrix', FakeDOMMatrix);
  vi.stubGlobal('createImageBitmap', vi.fn(async (oc: { width: number; height: number }) =>
    fakeBitmap(oc.width, oc.height)));
}

beforeEach(() => {
  resetStore();
  stubCanvasGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeOffscreenCanvas.lastCtx = null;
});

describe('SET_TITLE — rename without side effects', () => {
  it('renames the title and marks dirty', () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });

    dispatch({ type: 'SET_TITLE', title: '  Renamed  ' });

    const doc = getSnapshot().document!;
    expect(doc.title).toBe('Renamed');
    expect(getSnapshot().isDirty).toBe(true);
  });

  it('preserves viewport, selection, active layer and paint target', () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });
    dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 2, panX: 11, panY: 22 } });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection() });
    dispatch({ type: 'SET_PAINT_TARGET', target: 'mask' });

    dispatch({ type: 'SET_TITLE', title: 'Renamed' });

    const s = getSnapshot();
    expect(s.viewport.zoom).toBe(2);
    expect(s.viewport.panX).toBe(11);
    expect(s.selection).not.toBeNull();
    expect(s.activeLayerId).toBe(bg.id);
    expect(s.paintTarget).toBe('mask');
  });

  it('ignores blank or unchanged titles', () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });

    dispatch({ type: 'SET_TITLE', title: '   ' });
    expect(getSnapshot().document!.title).toBe('Old Title');

    dispatch({ type: 'SET_TITLE', title: 'Old Title' });
    expect(getSnapshot().isDirty).toBe(false);
  });
});

describe('fillSelection / deleteInSelection', () => {
  it('returns false without a selection', async () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });

    await expect(LayerManager.fillSelection()).resolves.toBe(false);
    await expect(LayerManager.deleteInSelection()).resolves.toBe(false);
  });

  it('returns false when the active layer is not an image layer', async () => {
    const text = makeTextLayer('hi');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([text]) });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection() });

    await expect(LayerManager.fillSelection()).resolves.toBe(false);
  });

  it('fills through the selection clip with the foreground colour and is undoable', async () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });
    dispatch({ type: 'SET_COLORS', colors: { foreground: '#ff8800' } });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection() });

    const ok = await LayerManager.fillSelection();
    expect(ok).toBe(true);

    const ctx = FakeOffscreenCanvas.lastCtx!;
    expect(ctx.fillStyle).toBe('#ff8800');
    // The clip must be a (transformed) selection Path2D, not an absent one.
    const clipCall = ctx.calls.find(c => c.op === 'clip');
    expect(clipCall).toBeDefined();
    expect((clipCall!.args[0] as FakePath2D).added.length).toBe(1);

    // History: one REPLACE_LAYER_BITMAP entry, undo restores.
    expect((getSnapshot().document!.layers[0] as ImageLayer).bitmap).not.toBe(bg.bitmap);
    undo();
    expect((getSnapshot().document!.layers[0] as ImageLayer).bitmap).toBe(bg.bitmap);
  });

  it('delete-in-selection clears through the clip (destination-out) and is undoable', async () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection() });

    const ok = await LayerManager.deleteInSelection();
    expect(ok).toBe(true);

    const ctx = FakeOffscreenCanvas.lastCtx!;
    const clipCall = ctx.calls.find(c => c.op === 'clip');
    expect(clipCall).toBeDefined();
    expect(ctx.globalCompositeOperation).toBe('destination-out');

    undo();
    expect((getSnapshot().document!.layers[0] as ImageLayer).bitmap).toBe(bg.bitmap);
  });
});

describe('GradientTool — selection clip', () => {
  it('applies the doc-space selection clip when a selection exists', async () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection() });

    GradientTool.setKind('linear');
    GradientTool.beginGradient(0, 0);
    GradientTool.updateGradient(100, 100);
    await GradientTool.commitGradient(100, 100);

    // destination-in pass drew the clip path.
    const ctx = FakeOffscreenCanvas.lastCtx!;
    const fillCall = ctx.calls.find(c => c.op === 'fill');
    expect(fillCall).toBeDefined();
    expect(fillCall!.args[0]).toBeInstanceOf(FakePath2D);
    // The layer was still added on top.
    expect(getSnapshot().document!.layers[0].name).toBe('Linear Gradient');
    expect(getSnapshot().document!.layers[0].type).toBe('image');
  });

  it('adds an unclipped gradient when nothing is selected', async () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });

    GradientTool.beginGradient(0, 0);
    await GradientTool.commitGradient(50, 50);

    const ctx = FakeOffscreenCanvas.lastCtx!;
    expect(ctx.calls.find(c => c.op === 'fill')).toBeUndefined();
    expect(getSnapshot().document!.layers).toHaveLength(2);
  });
});

describe('text re-edit — TypeTool existing-layer path', () => {
  it('beginEditExisting seeds settings from the layer; commit updates it in place', () => {
    const text = makeTextLayer('Hello');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([text]) });

    TypeTool.beginEditExisting(text.id, 50, 30);
    expect(TypeTool.isEditing).toBe(true);
    expect(TypeTool.existingLayerId).toBe(text.id);
    expect(TypeTool.settings.color).toBe('#112233');
    expect(TypeTool.settings.fontSize).toBe(48);

    TypeTool.commit('Hello edited');
    expect(TypeTool.isEditing).toBe(false);

    const layer = getSnapshot().document!.layers[0] as TextLayer;
    expect(layer.id).toBe(text.id);            // same layer — no new one added
    expect(layer.text).toBe('Hello edited');
    expect(getSnapshot().document!.layers).toHaveLength(1);

    // Undo restores the original text.
    undo();
    const restored = getSnapshot().document!.layers[0] as TextLayer;
    expect(restored.text).toBe('Hello');
    expect(restored.color).toBe('#112233');
  });

  it('commit with an empty string keeps the existing layer untouched', () => {
    const text = makeTextLayer('Keep me');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([text]) });

    TypeTool.beginEditExisting(text.id, 0, 0);
    TypeTool.commit('   ');

    const layer = getSnapshot().document!.layers[0] as TextLayer;
    expect(layer.text).toBe('Keep me');
  });

  it('beginEditExisting refuses non-text layers', () => {
    const bg = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([bg]) });

    TypeTool.beginEditExisting(bg.id, 0, 0);
    expect(TypeTool.isEditing).toBe(false);
  });

  it('updateTextLayer re-measures bounds around the kept origin', () => {
    const text = makeTextLayer('short');
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([text]) });

    const ok = LayerManager.updateTextLayer(text.id, {
      text: 'a much longer piece of text',
      color: '#445566', fontFamily: 'sans-serif', fontSize: 24, fontWeight: 700,
    });
    expect(ok).toBe(true);

    const layer = getSnapshot().document!.layers[0] as TextLayer;
    expect(layer.text).toBe('a much longer piece of text');
    expect(layer.font).toEqual({ family: 'sans-serif', size: 24, weight: 700 });
    // Origin is preserved; only the size grew to fit.
    expect(layer.transform.origin).toEqual({ x: 10, y: 10 });
    expect(layer.transform.size.width).toBeGreaterThan(100);
    expect(LayerManager.updateTextLayer('missing', { text: 'x', color: '#000', fontFamily: 'sans-serif', fontSize: 12, fontWeight: 400 })).toBe(false);
  });
});
