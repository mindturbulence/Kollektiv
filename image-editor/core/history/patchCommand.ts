// ─── Kollektiv Image Editor — dirty-rect history commands ───────────────────
// A paint stroke changes a small area of a large bitmap. Holding the full
// before/after bitmaps per stroke (review H3) let 8 strokes on a 4096² layer
// fill the 512 MB history cap. A patch command keeps only the changed
// rectangle, before and after, and rebuilds the layer bitmap from the CURRENT
// bitmap plus the patch on do/undo. That is exact because history is linear:
// when this command runs, the layer is in the state it left (undo) or found
// (redo) it in. transferToImageBitmap is synchronous, so do/undo stay sync.

import { dispatch, getSnapshot } from '../store';
import { findLayerById } from '../layers/layerTree';
import type { HistoryCommand, Rect } from '../types';

export type PatchTarget = 'color' | 'mask';

/** Integer rect covering stamp bounds [minX,minY]–[maxX,maxY] (inclusive of
 *  `pad`), clamped to a w×h bitmap. Null when nothing is inside. */
export function dirtyRect(
  minX: number, minY: number, maxX: number, maxY: number, pad: number, w: number, h: number,
): Rect | null {
  const x0 = Math.max(0, Math.floor(minX - pad));
  const y0 = Math.max(0, Math.floor(minY - pad));
  const x1 = Math.min(w, Math.ceil(maxX + pad));
  const y1 = Math.min(h, Math.ceil(maxY + pad));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

function currentBitmap(layerId: string, target: PatchTarget): ImageBitmap | null {
  const doc = getSnapshot().document;
  const layer = doc ? findLayerById(doc.layers, layerId) : undefined;
  if (!layer || layer.type !== 'image') return null;
  return target === 'mask' ? layer.mask?.bitmap ?? null : layer.bitmap;
}

function applyPatch(layerId: string, target: PatchTarget, rect: Rect, patch: ImageBitmap): void {
  const base = currentBitmap(layerId, target);
  if (!base) return;
  const oc = new OffscreenCanvas(base.width, base.height);
  const ctx = oc.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(base, 0, 0);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.drawImage(patch, rect.x, rect.y);
  const bitmap = oc.transferToImageBitmap();
  dispatch(target === 'mask'
    ? { type: 'REPLACE_LAYER_MASK_BITMAP', layerId, bitmap }
    : { type: 'REPLACE_LAYER_BITMAP', layerId, bitmap });
}

/**
 * Builds an undoable command from the before/after state of one stroke.
 * `before` is the layer's pre-stroke bitmap; `after` the finished stroke canvas.
 * Falls back to whole-bitmap swaps when there is no dirty rect.
 */
export async function makePatchCommand(opts: {
  label: string;
  layerId: string;
  target: PatchTarget;
  rect: Rect | null;
  before: ImageBitmap;
  after: OffscreenCanvas;
}): Promise<HistoryCommand> {
  const { label, layerId, target, rect, before, after } = opts;
  const replace = (bitmap: ImageBitmap) => dispatch(target === 'mask'
    ? { type: 'REPLACE_LAYER_MASK_BITMAP', layerId, bitmap }
    : { type: 'REPLACE_LAYER_BITMAP', layerId, bitmap });

  if (!rect) {
    const full = await createImageBitmap(after);
    return {
      id: crypto.randomUUID(), label, timestamp: Date.now(),
      bitmapRefs: { 'new (do)': full, 'prev (undo)': before },
      do: () => replace(full),
      undo: () => replace(before),
    };
  }

  const { x, y, width, height } = rect;
  const [prevPatch, nextPatch] = await Promise.all([
    createImageBitmap(before, x, y, width, height),
    createImageBitmap(after, x, y, width, height),
  ]);
  return {
    id: crypto.randomUUID(), label, timestamp: Date.now(),
    bitmapRefs: { 'patch (do)': nextPatch, 'patch (undo)': prevPatch },
    do: () => applyPatch(layerId, target, rect, nextPatch),
    undo: () => applyPatch(layerId, target, rect, prevPatch),
  };
}
