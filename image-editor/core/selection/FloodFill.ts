// ─── Kollektiv Image Editor — FloodFill ──────────────────────────────────────
// Synchronous TS flood-fill (BFS) over a pixel buffer.
// Returns a 1-bit mask (Uint8Array, 1=selected, 0=not) same size as the image.
// No DOM, no workers — pure TypeScript. Worker path can be added post-M3.5.

export interface FloodFillResult {
  mask:   Uint8Array;  // length = width * height
  width:  number;
  height: number;
  /** Tight bounding box of the filled region. */
  bounds: { x: number; y: number; width: number; height: number };
}

/** Euclidean color distance in RGBA space (alpha-weighted). */
function colorDist(
  pixels: Uint8ClampedArray,
  idx: number,
  tr: number, tg: number, tb: number, ta: number,
): number {
  const dr = pixels[idx]     - tr;
  const dg = pixels[idx + 1] - tg;
  const db = pixels[idx + 2] - tb;
  const da = pixels[idx + 3] - ta;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
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
    // BFS — 4-connected
    const queue: number[] = [sy * width + sx];
    const visited = new Uint8Array(width * height);
    visited[sy * width + sx] = 1;

    while (queue.length > 0) {
      const pos = queue.shift()!;
      const px = pos % width;
      const py = Math.floor(pos / width);

      if (colorDist(pixels, pos * 4, tr, tg, tb, ta) <= tolerance) {
        mask[pos] = 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;

        const neighbours = [
          px > 0          ? pos - 1     : -1,
          px < width - 1  ? pos + 1     : -1,
          py > 0          ? pos - width : -1,
          py < height - 1 ? pos + width : -1,
        ];
        for (const n of neighbours) {
          if (n >= 0 && !visited[n]) {
            visited[n] = 1;
            queue.push(n);
          }
        }
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

/**
 * Runs floodFill on the active layer's bitmap and returns a Selection.
 * Caller is responsible for sourcing the ImageBitmap from the store.
 */
export async function floodFillFromBitmap(
  bitmap:    ImageBitmap,
  docX:      number,
  docY:      number,
  tolerance: number,
  contiguous = true,
): Promise<import('../types').Selection> {
  const oc  = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = oc.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  const result = floodFill(data, bitmap.width, bitmap.height, docX, docY, tolerance, contiguous);

  // Build a raster ImageBitmap mask (grayscale: white = selected)
  const maskData = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
  for (let i = 0; i < result.mask.length; i++) {
    const v = result.mask[i] ? 255 : 0;
    maskData[i * 4]     = v;
    maskData[i * 4 + 1] = v;
    maskData[i * 4 + 2] = v;
    maskData[i * 4 + 3] = v ? 255 : 0;
  }
  const maskBitmap = await createImageBitmap(
    new ImageData(maskData, bitmap.width, bitmap.height),
  );

  return {
    shape:  { kind: 'raster', mask: maskBitmap },
    bounds: result.bounds,
    feather: 0,
  };
}
