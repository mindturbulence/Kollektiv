// ─── Kollektiv Image Editor — SelectionEngine ────────────────────────────────
// Manages the current selection state. M4 scope: rect + ellipse marquee.
// Lasso / Magic Wand deferred.
//
// Live drag state is module-scoped so CanvasRenderer can read it without
// going through the store on every pointermove. Committed selection lands
// in the store via dispatch({ type: 'SET_SELECTION' }).
//
// No React imports.

import { dispatch } from '../store';
import type { Rect, Point, Selection } from '../types';

// ─── Internal drag state ─────────────────────────────────────────────────────

let _dragStart:  Point | null = null;
let _liveBounds: Rect  | null = null;

// ─── Lasso state ─────────────────────────────────────────────────────────────

let _lassoPoints: Point[] = [];
let _lassoActive  = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize two corners into a Rect (positive width/height). */
function normalizeRect(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x:      Math.min(ax, bx),
    y:      Math.min(ay, by),
    width:  Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const SelectionEngine = {
  // ── Marquee ────────────────────────────────────────────────────────────────

  beginMarquee(docX: number, docY: number): void {
    _dragStart = { x: docX, y: docY };
    _liveBounds = { x: docX, y: docY, width: 0, height: 0 };
  },

  updateMarquee(docX: number, docY: number): void {
    if (!_dragStart) return;
    _liveBounds = normalizeRect(_dragStart.x, _dragStart.y, docX, docY);
  },

  endMarquee(docX: number, docY: number, kind: 'rect' | 'ellipse'): void {
    if (!_dragStart) return;
    const bounds = normalizeRect(_dragStart.x, _dragStart.y, docX, docY);
    _dragStart  = null;
    _liveBounds = null;

    if (bounds.width < 2 || bounds.height < 2) {
      dispatch({ type: 'SET_SELECTION', selection: null });
      return;
    }

    const selection: Selection = {
      shape:  kind === 'rect'
        ? { kind: 'rect', bounds }
        : { kind: 'ellipse', bounds },
      bounds,
      feather: 0,
    };
    dispatch({ type: 'SET_SELECTION', selection });
  },

  // ── Crop rectangle ─────────────────────────────────────────────────────────
  // Crop reuses the same live-drag machinery; endCrop commits via CROP_DOCUMENT.

  beginCrop(docX: number, docY: number): void {
    _dragStart  = { x: docX, y: docY };
    _liveBounds = { x: docX, y: docY, width: 0, height: 0 };
  },

  updateCrop(docX: number, docY: number): void {
    if (!_dragStart) return;
    _liveBounds = normalizeRect(_dragStart.x, _dragStart.y, docX, docY);
  },

  commitCrop(docX: number, docY: number): void {
    if (!_dragStart) return;
    const rect = normalizeRect(_dragStart.x, _dragStart.y, docX, docY);
    _dragStart  = null;
    _liveBounds = null;
    if (rect.width < 4 || rect.height < 4) return;
    dispatch({ type: 'CROP_DOCUMENT', rect });
  },

  cancelDrag(): void {
    _dragStart  = null;
    _liveBounds = null;
  },

  // ── State reads ────────────────────────────────────────────────────────────

  /** Live drag rect during marquee/crop drag (document space). Null when not dragging. */
  getLiveBounds(): Rect | null { return _liveBounds; },

  isDragging(): boolean { return _dragStart !== null; },

  // ── Convenience dispatch wrappers ──────────────────────────────────────────

  deselect(): void { dispatch({ type: 'SET_SELECTION', selection: null }); },

  invertSelection(docWidth: number, docHeight: number): void {
    // M4: simple rect inversion only
    dispatch({ type: 'SET_SELECTION', selection: null });
    // Full inversion (raster mask) deferred
    void docWidth; void docHeight;
  },

  // ── Lasso freehand ─────────────────────────────────────────────────────────

  beginLasso(docX: number, docY: number): void {
    _lassoPoints = [{ x: docX, y: docY }];
    _lassoActive = true;
  },

  addLassoPoint(docX: number, docY: number): void {
    if (!_lassoActive) return;
    const last = _lassoPoints[_lassoPoints.length - 1];
    // Thin — skip if too close to last point (< 2px)
    if (last && Math.hypot(docX - last.x, docY - last.y) < 2) return;
    _lassoPoints.push({ x: docX, y: docY });
  },

  endLasso(): void {
    if (!_lassoActive || _lassoPoints.length < 3) {
      _lassoPoints = [];
      _lassoActive = false;
      dispatch({ type: 'SET_SELECTION', selection: null });
      return;
    }
    const points = [..._lassoPoints];
    _lassoPoints = [];
    _lassoActive = false;

    // Compute bounding box of the polygon
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

    dispatch({
      type: 'SET_SELECTION',
      selection: { shape: { kind: 'polygon', points }, bounds, feather: 0 },
    });
  },

  getLassoPoints(): Point[] { return _lassoPoints; },
  isLassoActive(): boolean { return _lassoActive; },
  cancelLasso(): void { _lassoPoints = []; _lassoActive = false; },
};
