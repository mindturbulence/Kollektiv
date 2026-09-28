// ─── Kollektiv Image Editor — SelectionEngine ────────────────────────────────
// Manages the current selection state. M4 scope: rect + ellipse marquee.
// Lasso / Magic Wand deferred.
//
// Live drag state is module-scoped so CanvasRenderer can read it without
// going through the store on every pointermove. Committed selection lands
// in the store via dispatch({ type: 'SET_SELECTION' }).
//
// No React imports.

import { dispatch, getSnapshot } from '../store';
import { pushCommand } from '../history/HistoryManager';
import type { Rect, Point, Selection, HistoryCommand } from '../types';

// ─── Internal drag state ─────────────────────────────────────────────────────

let _dragStart:  Point | null = null;
let _liveBounds: Rect  | null = null;

// ─── Lasso state ─────────────────────────────────────────────────────────────

let _lassoPoints: Point[] = [];
let _lassoActive  = false;

// ─── Lasso polygonal state ────────────────────────────────────────────────────

let _polyPoints:  Point[] = [];
let _polyActive   = false;
let _polyRubber:  Point   = { x: 0, y: 0 }; // current cursor position

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

  // ── Crop rectangle ───────────────────────────────────────────────────────
  // Crop reuses the same live-drag machinery. The committed rect is held as a
  // *pending* rect that Enter (apply) / Esc (cancel) resolves — the ToolHeader
  // hint has promised this since M4 (review C2: crop committed irreversibly on
  // mouse-up).

  beginCrop(docX: number, docY: number): void {
    _dragStart  = { x: docX, y: docY };
    _liveBounds = { x: docX, y: docY, width: 0, height: 0 };
  },

  updateCrop(docX: number, docY: number): void {
    if (!_dragStart) return;
    _liveBounds = normalizeRect(_dragStart.x, _dragStart.y, docX, docY);
  },

  /** pointerup: keep the dragged rect pending instead of cropping immediately —
   *  an accidental drag with C was previously irreversible. */
  commitCrop(docX: number, docY: number): void {
    if (!_dragStart) return;
    const rect = normalizeRect(_dragStart.x, _dragStart.y, docX, docY);
    _dragStart  = null;
    _liveBounds = null;
    if (rect.width < 4 || rect.height < 4) return;
    dispatch({ type: 'SET_PENDING_CROP', rect });
  },

  /** Live pending rect (set by commitCrop, cleared on apply/cancel). The
   *  renderer draws its overlay from this instead of the live drag. */
  getPendingCrop(): Rect | null { return getSnapshot().pendingCrop; },

  /** Enter: apply the pending crop as one undoable HistoryCommand. */
  applyCrop(): boolean {
    const rect = getSnapshot().pendingCrop;
    const doc = getSnapshot().document;
    if (!rect || !doc) return false;

    // Clamp the rect to the document bounds so crop can't grow the canvas.
    const x = Math.max(0, Math.min(doc.width,  rect.x));
    const y = Math.max(0, Math.min(doc.height, rect.y));
    const w = Math.max(1, Math.min(doc.width  - x, rect.x + rect.width  - x));
    const h = Math.max(1, Math.min(doc.height - y, rect.y + rect.height - y));
    const clamped: Rect = { x, y, width: Math.round(w), height: Math.round(h) };

    const before = { width: doc.width, height: doc.height, layers: doc.layers };

    const cmd: HistoryCommand = {
      id: crypto.randomUUID(),
      label: `Crop to ${clamped.width}×${clamped.height}`,
      timestamp: Date.now(),
      do:   () => dispatch({ type: 'APPLY_CROP', rect: clamped }),
      undo: () => dispatch({ type: 'RESTORE_CROP', width: before.width, height: before.height, layers: before.layers }),
    };
    dispatch({ type: 'SET_PENDING_CROP', rect: null });
    pushCommand(cmd);
    return true;
  },

  /** Esc: drop the pending crop, no state change. */
  cancelCrop(): void {
    if (getSnapshot().pendingCrop) dispatch({ type: 'SET_PENDING_CROP', rect: null });
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

  /**
   * Builds a clip region for the active selection, in the given coordinate
   * space (review H7 — nothing read the selection before, so marquee/lasso/
   * wand were decoration). Callers `ctx.clip(path)` before stamping/painting.
   *
   * - rect / ellipse / polygon → a Path2D in `offset` space directly.
   * - raster (magic wand) → a Path2D of opaque mask *tiles* within the
   *   selection bounds at ~4px granularity: far cheaper than readback per
   *   stamp and exact enough for paint clipping.
   *
   * Returns null when there is no active selection (paint everywhere).
   */
  getSelectionClip(offset?: { x: number; y: number }): Path2D | null {
    const selection = getSnapshot().selection;
    if (!selection) return null;
    const ox = offset?.x ?? 0;
    const oy = offset?.y ?? 0;
    const path = new Path2D();

    switch (selection.shape.kind) {
      case 'rect': {
        const b = selection.shape.bounds;
        path.rect(b.x + ox, b.y + oy, b.width, b.height);
        break;
      }
      case 'ellipse': {
        const b = selection.shape.bounds;
        path.ellipse(
          b.x + ox + b.width / 2, b.y + oy + b.height / 2,
          Math.max(0.5, b.width / 2), Math.max(0.5, b.height / 2),
          0, 0, Math.PI * 2,
        );
        break;
      }
      case 'polygon': {
        const pts = selection.shape.points;
        if (pts.length < 3) return null;
        path.moveTo(pts[0].x + ox, pts[0].y + oy);
        for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x + ox, pts[i].y + oy);
        path.closePath();
        break;
      }
      case 'raster': {
        // Sample the wand mask into opaque-run rectangles (4px rows).
        const mask = selection.shape.mask;
        const b = selection.bounds;
        const TILE = 4;
        const oc = new OffscreenCanvas(mask.width, mask.height);
        const mctx = oc.getContext('2d');
        if (!mctx) return null;
        mctx.drawImage(mask, 0, 0);
        let row: ImageData;
        try {
          row = mctx.getImageData(b.x, b.y, Math.min(mask.width - b.x, b.width), Math.min(mask.height - b.y, b.height));
        } catch {
          return null;
        }
        const rw = row.width;
        for (let ty = 0; ty < row.height; ty += TILE) {
          let runStart = -1;
          const rowH = Math.min(TILE, row.height - ty);
          for (let x = 0; x <= rw; x++) {
            const alpha = x < rw ? row.data[(ty * rw + x) * 4 + 3] : 0;
            const on = alpha > 127;
            if (on && runStart < 0) runStart = x;
            if (!on && runStart >= 0) {
              path.rect(b.x + runStart + ox, b.y + ty + oy, x - runStart, rowH);
              runStart = -1;
            }
          }
        }
        break;
      }
    }
    return path;
  },

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

  // ── Lasso polygonal ────────────────────────────────────────────────────────

  beginPolyLasso(docX: number, docY: number): void {
    _polyPoints  = [{ x: docX, y: docY }];
    _polyActive  = true;
    _polyRubber  = { x: docX, y: docY };
  },

  addPolyVertex(docX: number, docY: number): void {
    if (!_polyActive) return;
    _polyPoints.push({ x: docX, y: docY });
  },

  updatePolyRubber(docX: number, docY: number): void {
    if (!_polyActive) return;
    _polyRubber = { x: docX, y: docY };
  },

  commitPolyLasso(): void {
    if (!_polyActive || _polyPoints.length < 3) {
      _polyPoints = []; _polyActive = false; return;
    }
    const points = [..._polyPoints];
    _polyPoints = []; _polyActive = false;

    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    dispatch({
      type: 'SET_SELECTION',
      selection: {
        shape:  { kind: 'polygon', points },
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        feather: 0,
      },
    });
  },

  cancelPolyLasso(): void { _polyPoints = []; _polyActive = false; },
  getPolyPoints():  Point[] { return _polyPoints; },
  getPolyRubber():  Point   { return _polyRubber; },
  isPolyActive():   boolean { return _polyActive; },
};
