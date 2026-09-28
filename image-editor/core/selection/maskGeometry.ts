// ─── Kollektiv Image Editor — raster selection geometry ──────────────────────
// Turns a raster (magic wand) selection mask into the two vector forms the
// editor needs: pixel-exact row runs (clip region for paint/fill/adjust) and
// boundary edges (marching-ants outline). Pure — no DOM — so it's unit-tested.

export interface MaskGeometry {
  /** Selected spans, flat [x, y, length, …] — one entry per run per row. */
  runs: number[];
  /** Boundary segments between selected and unselected pixels, flat
   *  [x1, y1, x2, y2, …] on pixel-corner coordinates; collinear edges merged. */
  edges: number[];
}

/**
 * @param rgba   RGBA pixels of a w×h region of the mask (alpha > 127 = selected)
 * @param ox,oy  document offset of that region (added to every coordinate)
 */
export function maskGeometry(rgba: Uint8ClampedArray, w: number, h: number, ox = 0, oy = 0): MaskGeometry {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3] > 127;
  const runs: number[] = [];
  const edges: number[] = [];

  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const v = x < w && on(x, y);
      if (v && start < 0) start = x;
      if (!v && start >= 0) { runs.push(ox + start, oy + y, x - start); start = -1; }
    }
  }

  // Horizontal edges live on grid line y (between rows y-1 and y).
  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && on(x, y - 1) !== on(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) { edges.push(ox + start, oy + y, ox + x, oy + y); start = -1; }
    }
  }
  // Vertical edges live on grid line x (between columns x-1 and x).
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const edge = y < h && on(x - 1, y) !== on(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) { edges.push(ox + x, oy + start, ox + x, oy + y); start = -1; }
    }
  }
  return { runs, edges };
}

/** RGBA image of the selection's edge pixels (selected, with an unselected
 *  4-neighbour), alternating black/white every 4px like static ants. Used for
 *  outlines too complex to stroke as a path every frame (noisy wand masks). */
export function edgePixels(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3] > 127;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y) || (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1))) continue;
      const v = ((x + y) >> 2) & 1 ? 255 : 0;
      const i = (y * w + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return out;
}
