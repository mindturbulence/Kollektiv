// ─── Kollektiv Image Editor — selectionMask tests (E5 remainder) ───────────
// Selection-masked adjustment commits: coverage map, bitmap-space clip, and
// the per-pixel lerp between original and adjusted pixels.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSelectionClip, buildSelectionCoverage, lerpPixelsInto } from '../adjust/selectionMask';
import { dispatch, resetStore } from '../store';
import type { EditorDocument, ImageLayer, Layer, Selection } from '../types';

// jsdom lacks OffscreenCanvas/Path2D/DOMMatrix — structural fakes: the code
// under test only calls methods and reads the alpha channel of getImageData.
class Fake2DCtx {
  private _filter = 'none';
  filterHistory: string[] = [];
  fillStyle = '';
  ops: string[] = [];
  get filter() { return this._filter; }
  set filter(v: string) { this._filter = v; this.filterHistory.push(v); }
  drawImage() { this.ops.push('drawImage'); }
  save() { this.ops.push('save'); }
  restore() { this.ops.push('restore'); }
  clip() { this.ops.push('clip'); }
  fill() { this.ops.push('fill'); }
  fillRect() { this.ops.push('fillRect'); }
  // Uniform opaque alpha simulates "selection covers the whole layer".
  getImageData(_x: number, _y: number, w: number, h: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) data[p * 4 + 3] = 255;
    return { data };
  }
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
  added: unknown[] = [];
  rect(): void {}
  ellipse(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  addPath(_path: FakePath2D, _matrix?: unknown) { this.added.push(1); }
}

class FakeDOMMatrix {
  constructor(_m: number[]) {}
}

function fakeBitmap(width = 32, height = 32): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function makeLayer(width = 32, height = 32): ImageLayer {
  return {
    id: crypto.randomUUID(), name: 'bg', type: 'image', bitmap: fakeBitmap(width, height),
    intrinsicWidth: width, intrinsicHeight: height,
    transform: { origin: { x: 0, y: 0 }, size: { width, height }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeDoc(layers: Layer[]): EditorDocument {
  return {
    id: 'd', title: 'T', width: 64, height: 64, resolution: 72,
    layers, guides: [], activeLayerId: layers[0]?.id ?? null, createdAt: 0, updatedAt: 0,
  };
}

function rectSelection(feather = 0): Selection {
  const bounds = { x: 4, y: 4, width: 16, height: 16 };
  return { shape: { kind: 'rect', bounds }, bounds, feather };
}

beforeEach(() => {
  resetStore();
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('Path2D', FakePath2D);
  vi.stubGlobal('DOMMatrix', FakeDOMMatrix);
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeOffscreenCanvas.lastCtx = null;
});

describe('buildSelectionClip', () => {
  it('returns null without a document or a selection', () => {
    expect(buildSelectionClip('x', 32, 32)).toBeNull(); // no document

    const layer = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id });
    expect(buildSelectionClip(layer.id, 32, 32)).toBeNull(); // no selection
  });

  it('returns a bitmap-space clip for the active layer when a selection exists', () => {
    const layer = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection() });

    const clip = buildSelectionClip(layer.id, 32, 32);
    expect(clip).toBeInstanceOf(FakePath2D);
    // The doc-space selection was replayed through the layer matrix.
    expect((clip as unknown as FakePath2D).added).toHaveLength(1);
  });
});

describe('buildSelectionCoverage', () => {
  it('returns null when there is no selection', () => {
    const layer = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id });
    expect(buildSelectionCoverage(layer.id, 32, 32)).toBeNull();
  });

  it('rasterizes the selection into a 0..1 coverage map (feather 0 → clip path)', () => {
    const layer = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection(0) });

    const coverage = buildSelectionCoverage(layer.id, 32, 32);
    expect(coverage).toBeInstanceOf(Float32Array);
    expect(coverage!.length).toBe(32 * 32);
    // Fake alpha is 255 everywhere → full coverage inside the selection.
    expect(coverage![0]).toBe(1);

    const ctx = FakeOffscreenCanvas.lastCtx!;
    expect(ctx.ops).toContain('clip');
    expect(ctx.ops).not.toContain('fill');
  });

  it('uses a blurred fill for feathered selections', () => {
    const layer = makeLayer();
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id });
    dispatch({ type: 'SET_SELECTION', selection: rectSelection(5) });

    buildSelectionCoverage(layer.id, 32, 32);

    const ctx = FakeOffscreenCanvas.lastCtx!;
    expect(ctx.filterHistory).toContain('blur(5px)');
    expect(ctx.filter).toBe('none'); // reset after the fill
    expect(ctx.ops).toContain('fill');
    expect(ctx.ops).not.toContain('clip');
  });
});

describe('lerpPixelsInto', () => {
  function pixels(...vals: Array<[number, number, number, number]>): Uint8ClampedArray {
    const out = new Uint8ClampedArray(vals.length * 4);
    vals.forEach(([r, g, b, a], i) => out.set([r, g, b, a], i * 4));
    return out;
  }

  it('t=1 keeps the adjusted pixel', () => {
    const adjusted = pixels([200, 100, 50, 255]);
    const original = pixels([10, 20, 30, 255]);
    lerpPixelsInto(adjusted, original, new Float32Array([1]));
    expect([...adjusted]).toEqual([200, 100, 50, 255]);
  });

  it('t=0 restores the original pixel (all channels)', () => {
    const adjusted = pixels([200, 100, 50, 128]);
    const original = pixels([10, 20, 30, 255]);
    lerpPixelsInto(adjusted, original, new Float32Array([0]));
    expect([...adjusted]).toEqual([10, 20, 30, 255]);
  });

  it('t=0.5 blends every channel', () => {
    const adjusted = pixels([200, 100, 50, 255]);
    const original = pixels([0, 0, 0, 255]);
    lerpPixelsInto(adjusted, original, new Float32Array([0.5]));
    expect([...adjusted]).toEqual([100, 50, 25, 255]);
  });

  it('stops at the coverage length (short maps leave trailing pixels untouched)', () => {
    const adjusted = pixels([200, 200, 200, 255], [30, 30, 30, 255]);
    const original = pixels([10, 10, 10, 255], [40, 40, 40, 255]);
    lerpPixelsInto(adjusted, original, new Float32Array([0]));
    // First pixel restored, second untouched (no coverage entry).
    expect([...adjusted]).toEqual([10, 10, 10, 255, 30, 30, 30, 255]);
  });
});
