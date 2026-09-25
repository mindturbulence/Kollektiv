import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  historyBytes,
  collectDocumentBitmaps,
  trimHistoryToCap,
  closeDroppedHistoryBitmaps,
} from '../history/bitmapAccounting';
import { dispatch, getSnapshot, resetStore } from '../store';
import type { EditorDocument, HistoryCommand, ImageLayer, Layer } from '../types';

/** A fake ImageBitmap — jsdom has none, and we need to observe close(). */
function fakeBitmap(width: number, height: number): ImageBitmap & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  return { width, height, close } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

function makeCommand(bitmaps: ImageBitmap[], label = 'cmd'): HistoryCommand & { bitmapRefs: Record<string, ImageBitmap> } {
  const bitmapRefs: Record<string, ImageBitmap> = {};
  bitmaps.forEach((b, i) => { bitmapRefs[`slot${i}`] = b; });
  return {
    id: crypto.randomUUID(), label, timestamp: Date.now(),
    do: () => {}, undo: () => {},
    bitmapRefs,
  };
}

function makeLayerWithBitmap(bitmap: ImageBitmap, name = 'bg'): ImageLayer {
  return {
    id: crypto.randomUUID(), name, type: 'image', bitmap,
    intrinsicWidth: bitmap.width, intrinsicHeight: bitmap.height,
    transform: { origin: { x: 0, y: 0 }, size: { width: bitmap.width, height: bitmap.height }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}

function makeDoc(layers: Layer[]): EditorDocument {
  return {
    id: 'd', title: 'T', width: 100, height: 100, resolution: 72,
    layers, guides: [], activeLayerId: layers[0]?.id ?? null, createdAt: 0, updatedAt: 0,
  };
}

beforeEach(() => resetStore());

describe('historyBytes', () => {
  it('counts unique bitmaps once (shared refs are not double-counted)', () => {
    const shared = fakeBitmap(100, 100); // 100*100*4 = 40,000 bytes
    const a = makeCommand([shared]);
    const b = makeCommand([shared]);
    expect(historyBytes([a, b])).toBe(40_000);
  });

  it('sums distinct bitmaps', () => {
    const a = makeCommand([fakeBitmap(100, 100)]);
    const b = makeCommand([fakeBitmap(50, 50)]); // 10,000 bytes
    expect(historyBytes([a, b])).toBe(50_000);
  });

  it('counts 0 for structural commands without bitmapRefs', () => {
    const structural: HistoryCommand = { id: 'x', label: 'move', timestamp: 0, do: () => {}, undo: () => {} };
    expect(historyBytes([structural])).toBe(0);
  });

  it('finds bitmaps nested in arrays/objects', () => {
    const nested = fakeBitmap(10, 10); // 10*10*4 = 400 bytes
    const cmd = {
      id: 'x', label: 'crop', timestamp: 0, do: () => {}, undo: () => {},
      bitmapRefs: { pair: { before: nested, after: null } },
    } as unknown as HistoryCommand;
    expect(historyBytes([cmd])).toBe(400);
  });
});

describe('trimHistoryToCap', () => {
  it('evicts oldest-first until the byte cap fits, closing exclusively-owned bitmaps', () => {
    const b1 = fakeBitmap(1000, 1000); // 4,000,000 bytes each
    const b2 = fakeBitmap(1000, 1000);
    const b3 = fakeBitmap(1000, 1000);
    const c1 = makeCommand([b1], 'c1');
    const c2 = makeCommand([b2], 'c2');
    const c3 = makeCommand([b3], 'c3');

    // Cap fits exactly 2.5 of these — c1 must go.
    const kept = trimHistoryToCap([c1, c2, c3], [c1, c2, c3], new Set(), 10_000_000);
    expect(kept.map(c => c.label)).toEqual(['c2', 'c3']);
    expect(b1.close).toHaveBeenCalledTimes(1); // evicted → closed
    expect(b2.close).not.toHaveBeenCalled();
    expect(b3.close).not.toHaveBeenCalled();
  });

  it('never closes a bitmap the live document still references', () => {
    const liveBitmap = fakeBitmap(1000, 1000);
    const layer = makeLayerWithBitmap(liveBitmap);
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });

    // The undo command holds the layer's CURRENT bitmap (pre-stroke state).
    const undoCmd = makeCommand([liveBitmap], 'stroke1');
    const fresh = fakeBitmap(1000, 1000);
    const stroke2 = makeCommand([fresh], 'stroke2');

    const live = collectDocumentBitmaps(getSnapshot().document);
    const kept = trimHistoryToCap([undoCmd, stroke2], [undoCmd, stroke2], live, 4_000_000);

    expect(kept.map(c => c.label)).toEqual(['stroke2']);
    expect(liveBitmap.close).not.toHaveBeenCalled(); // document holds it
    expect(fresh.close).not.toHaveBeenCalled(); // kept command holds it
  });

  it('closes bitmaps from dropped redo-branch commands', () => {
    const redoBitmap = fakeBitmap(1000, 1000);
    const redoCmd = makeCommand([redoBitmap], 'redo-branch');
    const keptCmd = makeCommand([fakeBitmap(10, 10)], 'kept');

    // previousHistory includes the redo command; kept does not — it was dropped
    // by PUSH_HISTORY's redo-branch trim.
    const kept = trimHistoryToCap([keptCmd], [keptCmd, redoCmd], new Set(), 1_000_000);
    expect(kept).toEqual([keptCmd]);
    expect(redoBitmap.close).toHaveBeenCalledTimes(1);
    expect(keptCmd.bitmapRefs['slot0'].close).not.toHaveBeenCalled();
  });

  it('keeps a bitmap referenced by both a kept command and a dropped one', () => {
    // 100×100 = 40,000 bytes — small enough that the kept command fits the cap
    // (with a too-small cap BOTH commands evict and closing would be correct).
    const shared = fakeBitmap(100, 100);
    const dropped = makeCommand([shared], 'dropped');
    const kept = makeCommand([shared], 'kept');

    const result = trimHistoryToCap([kept], [kept, dropped], new Set(), 1_000_000);
    expect(result).toEqual([kept]);
    expect(shared.close).not.toHaveBeenCalled(); // kept command still needs it
  });

  it('evicts even zero-byte structural commands under byte pressure from neighbours', () => {
    const big = fakeBitmap(1250, 1000); // 5,000,000 bytes
    const c1: HistoryCommand = { id: 's', label: 'structural', timestamp: 0, do: () => {}, undo: () => {} };
    const c2 = makeCommand([big], 'big');

    // Cap 4 MB: c2 alone exceeds it → everything drops to reach an empty stack.
    const kept = trimHistoryToCap([c1, c2], [c1, c2], new Set(), 4_000_000);
    expect(kept).toHaveLength(0);
    expect(big.close).toHaveBeenCalledTimes(1);
  });
});

describe('closeDroppedHistoryBitmaps (CLEAR_HISTORY / resetStore path)', () => {
  it('closes bitmaps not referenced by the live document', () => {
    const b1 = fakeBitmap(100, 100);
    const b2 = fakeBitmap(100, 100);
    const cmd1 = makeCommand([b1]);
    const cmd2 = makeCommand([b2]);

    closeDroppedHistoryBitmaps([cmd1, cmd2], new Set());
    expect(b1.close).toHaveBeenCalledTimes(1);
    expect(b2.close).toHaveBeenCalledTimes(1);
  });

  it('leaves bitmaps the document holds', () => {
    const liveBitmap = fakeBitmap(100, 100);
    const layer = makeLayerWithBitmap(liveBitmap);
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });

    const cmd = makeCommand([liveBitmap]);
    closeDroppedHistoryBitmaps([cmd], collectDocumentBitmaps(getSnapshot().document));
    expect(liveBitmap.close).not.toHaveBeenCalled();
  });
});

describe('store integration — CLEAR_HISTORY closes dropped bitmaps', () => {
  it('clearing history closes a stroke bitmap that is no longer the layer bitmap', () => {
    const originalBitmap = fakeBitmap(100, 100);
    const layer = makeLayerWithBitmap(originalBitmap);
    dispatch({ type: 'SET_DOCUMENT', document: makeDoc([layer]) });

    const strokeBitmap = fakeBitmap(100, 100);
    const strokeCmd = makeCommand([strokeBitmap], 'stroke');
    dispatch({ type: 'PUSH_HISTORY', command: strokeCmd });

    dispatch({ type: 'CLEAR_HISTORY' });
    expect(strokeBitmap.close).toHaveBeenCalledTimes(1);
    expect(originalBitmap.close).not.toHaveBeenCalled(); // layer still holds it
  });
});
