// ─── Kollektiv Image Editor — Selection-masked adjustments (E5 remainder) ───
// Bridges the active selection into the two-tier adjustment pipeline:
//   • Commit tier: a per-pixel coverage map (0..1, layer bitmap space) that
//     LERPs between original and adjusted pixels — selection pixels get the
//     full adjustment, everything outside keeps the original.
//   • Preview tier: the same selection as a bitmap-space Path2D the GPU
//     preview composites through, so what you see is what OK will produce.
// The doc→bitmap transform is the exact inverse-layer matrix the brush clip
// uses (geometry/selectionClip.ts), so moved/scaled/rotated layers mask where
// the marching ants show.
//
// No React imports.

import { selectionClipInBitmapSpace } from '../geometry/selectionClip';
import { findLayerById } from '../layers/layerTree';
import { getSnapshot } from '../store';

interface ImageLayerRef {
  transform: import('../types').LayerTransform;
}

/** Resolves the adjustment's target layer from the store (needed for the
 *  doc→bitmap matrix). Returns null when the layer is gone or not an image
 *  layer — callers then run unmasked (previous behaviour). */
function findImageLayer(layerId: string): ImageLayerRef | null {
  const doc = getSnapshot().document;
  const layer = doc ? findLayerById(doc.layers, layerId) : undefined;
  return layer && layer.type === 'image' ? layer : null;
}

/**
 * The active selection as a Path2D in the target layer's bitmap space, or
 * null when there is no selection (adjustments run unmasked), the layer is
 * missing, or the clip geometry is unavailable (no DOMMatrix).
 */
export function buildSelectionClip(layerId: string, width: number, height: number): Path2D | null {
  const layer = findImageLayer(layerId);
  if (!layer) return null;
  return selectionClipInBitmapSpace({
    transform: layer.transform,
    intrinsicWidth: width,
    intrinsicHeight: height,
  });
}

/**
 * Per-pixel selection coverage for the commit tier: 1 = fully inside the
 * selection (full adjustment), 0 = outside (keep original). Built by
 * rasterizing the selection clip into an offscreen mask and reading its alpha.
 * `feather` softens the edge by blurring the filled path (degrades to a hard
 * edge when the canvas filter API is unavailable).
 */
export function buildSelectionCoverage(layerId: string, width: number, height: number): Float32Array | null {
  const clip = buildSelectionClip(layerId, width, height);
  if (!clip) return null;
  const feather = getSnapshot().selection?.feather ?? 0;

  const oc = new OffscreenCanvas(width, height);
  const ctx = oc.getContext('2d');
  if (!ctx) return null;

  if (feather > 0) {
    // Soft edge: blur the filled path instead of clipping — the blur widens
    // the transition band symmetrically around the selection boundary.
    try { ctx.filter = `blur(${Math.max(0.5, feather)}px)`; } catch { /* hard edge */ }
    ctx.fillStyle = '#ffffff';
    ctx.fill(clip);
    ctx.filter = 'none';
  } else {
    ctx.save();
    ctx.clip(clip);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const data = ctx.getImageData(0, 0, width, height).data;
  const coverage = new Float32Array(width * height);
  for (let p = 0; p < coverage.length; p++) coverage[p] = data[p * 4 + 3] / 255;
  return coverage;
}

/**
 * In-place lerp of the worker's adjusted pixels toward the originals, weighted
 * by the selection coverage. t=1 keeps the adjusted pixel, t=0 restores the
 * original, in-between blends every channel (alpha included — the color
 * kernels preserve alpha, so channel-wise blending is exact there).
 */
export function lerpPixelsInto(adjusted: Uint8ClampedArray, original: Uint8ClampedArray, coverage: Float32Array): void {
  const n = Math.min(coverage.length, adjusted.length >> 2);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const t = coverage[p];
    if (t >= 1) continue; // fully selected — keep the adjustment
    if (t <= 0) {
      adjusted[i]     = original[i];
      adjusted[i + 1] = original[i + 1];
      adjusted[i + 2] = original[i + 2];
      adjusted[i + 3] = original[i + 3];
      continue;
    }
    adjusted[i]     = original[i]     + (adjusted[i]     - original[i])     * t;
    adjusted[i + 1] = original[i + 1] + (adjusted[i + 1] - original[i + 1]) * t;
    adjusted[i + 2] = original[i + 2] + (adjusted[i + 2] - original[i + 2]) * t;
    adjusted[i + 3] = original[i + 3] + (adjusted[i + 3] - original[i + 3]) * t;
  }
}
