// ─── Kollektiv Image Editor — FloodFill ──────────────────────────────────────
// Synchronous TS flood-fill (BFS) over a pixel buffer.
// Returns a 1-bit mask (Uint8Array, 1=selected, 0=not) same size as the image.
// floodFill itself is pure TS; magicWandSelect wraps it for the editor.

import { getSnapshot } from '../store';
import { findLayerById } from '../layers/layerTree';
import { rasterizeLayersToCanvas } from '../renderer/LayerPainter';
import { preloadLuts } from '../looks/lutRegistry';
import type { Selection } from '../types';

export interface FloodFillResult {
  mask:   Uint8Array;  // length = width * height
  width:  number;
  height: number;
  /** Tight bounding box of the filled region. */
  bounds: { x: number; y: number; width: number; height: number };
}

/** Largest per-channel RGBA difference — "tolerance 32" means every channel is
 *  within 32 levels of the seed (the Photoshop semantic; a Euclidean distance
 *  made the slider's 0–255 range mean something different per hue). */
function colorDist(
  pixels: Uint8ClampedArray,
  idx: number,
  tr: number, tg: number, tb: number, ta: number,
): number {
  return Math.max(
    Math.abs(pixels[idx]     - tr),
    Math.abs(pixels[idx + 1] - tg),
    Math.abs(pixels[idx + 2] - tb),
    Math.abs(pixels[idx + 3] - ta),
  );
}

/**
 * BFS flood-fill starting at (seedX, seedY).
 * tolerance: 0–255. contiguous: only fill connected pixels.
 */
export function floodFill(
  pixels: Uint8ClampedArray,
  width:  number,
  height: number,
  seedX:  number,
  seedY:  number,
  tolerance: number,
  contiguous = true,
): FloodFillResult {
  const mask = new Uint8Array(width * height);

  const sx = Math.floor(Math.max(0, Math.min(width  - 1, seedX)));
  const sy = Math.floor(Math.max(0, Math.min(height - 1, seedY)));
  const si = (sy * width + sx) * 4;
  const tr = pixels[si], tg = pixels[si + 1], tb = pixels[si + 2], ta = pixels[si + 3];

  let minX = sx, maxX = sx, minY = sy, maxY = sy;

  if (contiguous) {
    // BFS — 4-connected. Typed-array queue with a head index: each pixel is
    // enqueued at most once (visited), and Array.shift() was O(n) per pop.
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;
    queue[tail++] = sy * width + sx;
    const visited = new Uint8Array(width * height);
    visited[sy * width + sx] = 1;

    while (head < tail) {
      const pos = queue[head++];
      const px = pos % width;
      const py = Math.floor(pos / width);

      if (colorDist(pixels, pos * 4, tr, tg, tb, ta) <= tolerance) {
        mask[pos] = 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;

        if (px > 0          && !visited[pos - 1])     { visited[pos - 1] = 1;     queue[tail++] = pos - 1; }
        if (px < width - 1  && !visited[pos + 1])     { visited[pos + 1] = 1;     queue[tail++] = pos + 1; }
        if (py > 0          && !visited[pos - width]) { visited[pos - width] = 1; queue[tail++] = pos - width; }
        if (py < height - 1 && !visited[pos + width]) { visited[pos + width] = 1; queue[tail++] = pos + width; }
      }
    }
  } else {
    // Global — all matching pixels regardless of connectivity
    const total = width * height;
    for (let i = 0; i < total; i++) {
      if (colorDist(pixels, i * 4, tr, tg, tb, ta) <= tolerance) {
        mask[i] = 1;
        const px = i % width;
        const py = Math.floor(i / width);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }

  return {
    mask, width, height,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/** Magic Wand options — module state so the ToolHeader controls and the
 *  viewport's click handler share one source of truth across remounts. */
export const wandSettings = {
  tolerance: 32,
  contiguous: true,
  /** Sample the visible composite instead of only the active layer — a wand
   *  click on a blank paint layer otherwise selects the entire canvas. */
  sampleAllLayers: true,
};

/**
 * Magic Wand: flood-fills at a document-space point and returns a doc-space
 * raster Selection (mask is document-sized, like every other selection). The
 * source is rendered through the layer transforms first, so moved/scaled/
 * rotated layers select where the user clicked — sampling the raw layer
 * bitmap put the mask in bitmap space. Returns null for a click outside the doc.
 */
export async function magicWandSelect(docX: number, docY: number): Promise<Selection | null> {
  const { document: doc, activeLayerId } = getSnapshot();
  if (!doc || docX < 0 || docY < 0 || docX >= doc.width || docY >= doc.height) return null;
  let layers = doc.layers;
  if (!wandSettings.sampleAllLayers) {
    const active = activeLayerId ? findLayerById(doc.layers, activeLayerId) : undefined;
    if (!active) return null;
    layers = [active];
  }
  await preloadLuts(layers);
  const oc = rasterizeLayersToCanvas(layers, doc.width, doc.height);
  const ctx = oc?.getContext('2d', { willReadFrequently: true });
  if (!oc || !ctx) return null;
  const { data } = ctx.getImageData(0, 0, doc.width, doc.height);
  return selectionFromMask(
    floodFill(data, doc.width, doc.height, docX, docY, wandSettings.tolerance, wandSettings.contiguous),
  );
}

/** Wraps a 1-bit flood-fill mask as a raster Selection (white = selected). */
async function selectionFromMask(result: FloodFillResult): Promise<Selection> {
  const { width, height } = result;
  const maskData = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < result.mask.length; i++) {
    const v = result.mask[i] ? 255 : 0;
    maskData[i * 4]     = v;
    maskData[i * 4 + 1] = v;
    maskData[i * 4 + 2] = v;
    maskData[i * 4 + 3] = v ? 255 : 0;
  }
  const maskBitmap = await createImageBitmap(
    new ImageData(maskData, width, height),
  );

  return {
    shape:  { kind: 'raster', mask: maskBitmap },
    bounds: result.bounds,
    feather: 0,
  };
}
