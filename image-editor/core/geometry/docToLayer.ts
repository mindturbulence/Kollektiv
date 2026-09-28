// ─── Kollektiv Image Editor — docToLayer ─────────────────────────────────────
// Maps a document-space point into a layer's bitmap-space pixel coordinates.
//
// Pixel tools receive pointer positions in *document* space (getCanvasPoint),
// but they stamp into the layer's *bitmap*, which is rendered through the
// layer transform (origin offset → centre rotation → flip → size scaling, in
// that order — see LayerPainter.drawImageLayer). Stamping doc coords straight
// into the bitmap therefore paints in the wrong place whenever a layer has
// been moved, scaled, rotated or flipped (review C1), and after a crop shifted
// the document origin.
//
// This helper inverts the transform: subtract the origin, convert to
// centre-relative coords, un-rotate, un-flip, then scale by
// intrinsic/size to land in intrinsic bitmap pixels. Returns null when the
// point falls outside the layer's bounds (callers skip the stamp — a brush
// stroke on empty document space must not paint into a distant corner of a
// moved layer's bitmap).

import type { LayerTransform } from '../types';

export interface DocToLayerContext {
  transform: LayerTransform;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

export function docToLayer(
  docX: number,
  docY: number,
  { transform, intrinsicWidth, intrinsicHeight }: DocToLayerContext,
): { x: number; y: number } | null {
  const { origin, size, rotation, flipH, flipV } = transform;

  // Guard degenerate transforms (a zero-size layer has no pixel space).
  if (size.width <= 0 || size.height <= 0) return null;

  // 1. Doc space → space where the layer centre is the origin.
  let cx = docX - (origin.x + size.width / 2);
  let cy = docY - (origin.y + size.height / 2);

  // 2. Un-rotate (rotation stored in degrees, clockwise positive).
  if (rotation !== 0) {
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = cx * cos - cy * sin;
    const ry = cx * sin + cy * cos;
    cx = rx;
    cy = ry;
  }

  // 3. Un-flip (flips are applied around the layer centre before rotation).
  if (flipH) cx = -cx;
  if (flipV) cy = -cy;

  // 4. Rendered size → intrinsic bitmap pixels.
  const scaleX = intrinsicWidth / size.width;
  const scaleY = intrinsicHeight / size.height;
  const bx = cx * scaleX + intrinsicWidth / 2;
  const by = cy * scaleY + intrinsicHeight / 2;

  if (bx < 0 || by < 0 || bx >= intrinsicWidth || by >= intrinsicHeight) return null;

  return { x: bx, y: by };
}
