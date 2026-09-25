// ─── Kollektiv Image Editor — Clone Stamp Tool ───────────────────────────────
// Alt+click to set source point; drag to paint copied pixels from source.
// Same OffscreenCanvas approach as BrushEngine but reads from source bitmap.
// No React imports.

import { getSnapshot, dispatch } from '../store';
import { pushCommand } from '../history/HistoryManager';
import { findLayerById } from '../layers/layerTree';
import { selectionClipInBitmapSpace } from '../geometry/selectionClip';
import type { HistoryCommand, ImageLayer } from '../types';

// ─── State ───────────────────────────────────────────────────────────────────

let _sourceBitmap:  ImageBitmap  | null = null;
let _sourcePoint:   { x: number; y: number } | null = null; // layer bitmap coords
let _sourceScale   = 1; // bitmap px per doc px — scales radius + sample spacing (E1)

let _destLayerId:  string | null = null;
let _destCanvas:   OffscreenCanvas | null = null;
let _destCtx:      OffscreenCanvasRenderingContext2D | null = null;
let _prevBitmap:   ImageBitmap | null = null;
let _strokeStart:  { x: number; y: number } | null = null; // pointer at stroke start (bitmap coords)
let _lastStamp:    { x: number; y: number } | null = null;
let _clipPath:     Path2D | null = null; // active selection, in bitmap space (E5)
let _isStroking    = false;

/** Frame pump registered by the active CanvasRenderer (live preview, H4). */
let _requestFrame: (() => void) | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paintStamp(destX: number, destY: number, pressure: number): void {
  if (!_destCtx || !_sourceBitmap || !_sourcePoint || !_strokeStart) return;
  const { brush } = getSnapshot();

  // Clone offset: (destX - strokeStartX) applied to source origin
  const srcX = _sourcePoint.x + (destX - _strokeStart.x);
  const srcY = _sourcePoint.y + (destY - _strokeStart.y);

  // Radius tracks the cursor ring: brush.size/2 in doc px, scaled into bitmap
  // px, weighted by pressure (review H6 — was hard-coded 0.5 pressure).
  const radius = Math.max(0.5, (brush.size / 2) * _sourceScale * Math.max(0.1, pressure));
  const alpha  = (brush.opacity / 100) * (brush.flow / 100) * Math.max(0.1, pressure);

  _destCtx.save();
  _destCtx.globalAlpha = alpha;
  _destCtx.globalCompositeOperation = 'source-over';
  // Clip to the active selection first (E5), then to the stamp circle.
  if (_clipPath) _destCtx.clip(_clipPath);

  // Clip to a circle, then draw the source bitmap shifted so (srcX, srcY) appears at (destX, destY)
  _destCtx.beginPath();
  _destCtx.arc(destX, destY, radius, 0, Math.PI * 2);
  _destCtx.clip();
  _destCtx.drawImage(_sourceBitmap, destX - srcX, destY - srcY);

  _destCtx.restore();
}

/** Spaced stamping along the segment from the last stamp (same rule as the
 *  brush, review H5) — clone strokes on fast drags came out dotted. */
function stampSpaced(x: number, y: number, pressure: number): void {
  if (!_strokeStart) return;
  if (!_lastStamp) {
    paintStamp(x, y, pressure);
    _lastStamp = { x, y };
    _requestFrame?.(); // repaint the live stroke preview (H4)
    return;
  }
  const { brush } = getSnapshot();
  const radius = Math.max(0.5, (brush.size / 2) * _sourceScale * Math.max(0.1, pressure));
  const spacing = Math.max(1, radius * 0.25);
  const dx = x - _lastStamp.x;
  const dy = y - _lastStamp.y;
  const dist = Math.hypot(dx, dy);
  if (dist < spacing) return;
  const steps = Math.floor(dist / spacing);
  for (let i = 1; i <= steps; i++) {
    const t = (i * spacing) / dist;
    paintStamp(_lastStamp.x + dx * t, _lastStamp.y + dy * t, pressure);
  }
  const covered = steps * spacing;
  _lastStamp = { x: _lastStamp.x + (dx * covered) / dist, y: _lastStamp.y + (dy * covered) / dist };
  _requestFrame?.(); // repaint the live stroke preview (H4)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const CloneStampTool = {
  get isStroking(): boolean { return _isStroking; },
  get sourcePoint(): { x: number; y: number } | null { return _sourcePoint; },

  /** Layer id currently being cloned into — the viewport maps doc coords into
   *  this layer's bitmap space before calling addPoint. Null between strokes. */
  get activeLayerId(): string | null { return _destLayerId; },

  /** Registers the renderer's frame pump so stamps repaint the live preview.
   *  Pass null to unregister (renderer stop). */
  setRequestFrame(fn: (() => void) | null): void { _requestFrame = fn; },

  /** Live stroke preview (review H4): the in-progress clone canvas, in the
   *  destination layer's bitmap space. Null when no stroke is active. */
  getScratchCanvas(): OffscreenCanvas | null { return _isStroking ? _destCanvas : null; },

  /** Alt+click to define the source point, in the active layer's bitmap space
 *  (the viewport converts via docToLayer). docScale scales the radius (E1). */
  setSource(bitmapX: number, bitmapY: number, docScale = 1): void {
    const { activeLayerId, document: doc } = getSnapshot();
    if (!activeLayerId || !doc) return;
    const layer = findLayerById(doc.layers, activeLayerId);
    if (!layer || layer.type !== 'image') return;

    _sourceBitmap  = layer.bitmap;
    _sourcePoint   = { x: bitmapX, y: bitmapY };
    _sourceScale   = docScale > 0 ? docScale : 1;
  },

  beginStroke(destLayerId: string): void {
    if (!_sourceBitmap || !_sourcePoint) return;
    const { document: doc } = getSnapshot();
    const destLayer = (doc && findLayerById(doc.layers, destLayerId)) as ImageLayer | undefined;
    if (!destLayer || destLayer.type !== 'image') return;

    // Fresh source per stroke (review H6): capture the CURRENT bitmap of the
    // destination layer. The Alt+click capture alone let a stale source from a
    // previous document bleed into a new one; re-capture here and require the
    // source to still resolve to a live layer bitmap.
    _destLayerId = destLayerId;
    _prevBitmap  = destLayer.bitmap;
    _destCanvas  = new OffscreenCanvas(destLayer.intrinsicWidth, destLayer.intrinsicHeight);
    _destCtx     = _destCanvas.getContext('2d')!;
    _destCtx.drawImage(destLayer.bitmap, 0, 0);
    _strokeStart = null; // set on first addPoint
    _lastStamp   = null;
    // Capture the selection clip in bitmap space once per stroke (E5).
    _clipPath    = selectionClipInBitmapSpace({
      transform: destLayer.transform,
      intrinsicWidth: destLayer.intrinsicWidth,
      intrinsicHeight: destLayer.intrinsicHeight,
    });
    _isStroking  = true;
  },

  addPoint(x: number, y: number, pressure = 0.5): void {
    if (!_isStroking) return;
    if (!_strokeStart) _strokeStart = { x, y };
    stampSpaced(x, y, pressure);
  },

  endStroke(): void {
    if (!_isStroking || !_destCanvas || !_destLayerId || !_prevBitmap) return;
    _isStroking = false;

    const layerId    = _destLayerId;
    const prevBitmap = _prevBitmap;
    const canvas     = _destCanvas;

    _destLayerId = null;
    _destCanvas  = null;
    _destCtx     = null;
    _prevBitmap  = null;
    _strokeStart = null;
    _lastStamp   = null;
    _clipPath    = null;

    void createImageBitmap(canvas).then(newBitmap => {
      const cmd: HistoryCommand = {
        id: crypto.randomUUID(), label: 'Clone stamp stroke', timestamp: Date.now(),
        // H3: declare held bitmaps so the byte-cap can account and free them.
        bitmapRefs: { 'new (do)': newBitmap, 'prev (undo)': prevBitmap },
        do:   () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: newBitmap }),
        undo: () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: prevBitmap }),
      };
      pushCommand(cmd);
    });
  },

  dispose(): void {
    _isStroking    = false;
    _sourceBitmap  = null;
    _sourcePoint   = null;
    _sourceScale   = 1;
    _clipPath      = null;
    _destCanvas    = null;
    _destCtx       = null;
    _destLayerId   = null;
    _prevBitmap    = null;
    _strokeStart   = null;
    _lastStamp     = null;
  },
};
