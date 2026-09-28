// ─── Kollektiv Image Editor — Selection clip geometry ────────────────────────
// Bridges the selection (document space) into a paint tool's bitmap space.
//
// The selection is authored in document coordinates, but brush/clone stamps
// land in the *layer's bitmap* coordinates (see docToLayer.ts for the mapping).
// To clip a stroke to the selection, the selection Path2D must be re-expressed
// in bitmap space: doc → layer centre → un-rotate → un-flip → scale to
// intrinsic — the exact inverse of the render transform in LayerPainter.
//
// A Path2D cannot be transformed after construction, so the clip is built by
// replaying path commands through a 2×3 affine transform (Path2D has no
// matrix API; DOMMatrix round-trips through addPath with a DOMMatrix argument
// are supported in modern browsers and are used when available).

import { SelectionEngine } from '../selection/SelectionEngine';
import type { LayerTransform } from '../types';

/** Affine matrix representation (a b c d e f, canvas order). */
type Mat = [number, number, number, number, number, number];

function multiply(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Matrix mapping doc-space points into the layer's bitmap space — the same
 * math as docToLayer but as an affine matrix (docToLayer is per-point and
 * bounds-checks; the matrix is what Path2D replay needs).
 */
export function docToBitmapMatrix(
  { transform, intrinsicWidth, intrinsicHeight }: {
    transform: LayerTransform;
    intrinsicWidth: number;
    intrinsicHeight: number;
  },
): Mat {
  const { origin, size, rotation, flipH, flipV } = transform;
  // Canvas matrix order: [a c e; b d f]. Build doc→bitmap as:
  // translate(intrinsic/2) · scale(intrinsic/size) · unflip · rotate(-θ) ·
  // translate(-(origin + size/2)).
  const sx = size.width !== 0 ? intrinsicWidth / size.width : 1;
  const sy = size.height !== 0 ? intrinsicHeight / size.height : 1;
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Unflip in the layer's local frame: flipH negates local x, flipV local y.
  const fx = flipH ? -1 : 1;
  const fy = flipV ? -1 : 1;
  // translate(-(origin+size/2)) then rotate then flip then scale then translate(+/2)
  const t1: Mat = [1, 0, 0, 1, -(origin.x + size.width / 2), -(origin.y + size.height / 2)];
  const rot: Mat = [cos, sin, -sin, cos, 0, 0];
  const flip: Mat = [fx, 0, 0, fy, 0, 0];
  const scale: Mat = [sx, 0, 0, sy, 0, 0];
  const t2: Mat = [1, 0, 0, 1, intrinsicWidth / 2, intrinsicHeight / 2];
  return multiply(t2, multiply(scale, multiply(flip, multiply(rot, t1))));
}

/**
 * Returns the active selection as a Path2D expressed in the layer's bitmap
 * space (ready for ctx.clip before stamping), or null when there is no
 * selection (paint unclipped).
 */
export function selectionClipInBitmapSpace(layer: {
  transform: LayerTransform;
  intrinsicWidth: number;
  intrinsicHeight: number;
}): Path2D | null {
  // Selection built in doc space (no offset).
  const docPath = SelectionEngine.getSelectionClip();
  if (!docPath) return null;

  const m = docToBitmapMatrix(layer);

  // DOMMatrix + Path2D.addPath — the browser transforms the path. DOMMatrix is
  // baseline (all browsers since 2019); if it's somehow missing, degrade to
  // unclipped painting rather than a wrong clip.
  if (typeof DOMMatrix === 'undefined') return null;
  const dm = new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]);
  const out = new Path2D();
  out.addPath(docPath, dm);
  return out;
}
