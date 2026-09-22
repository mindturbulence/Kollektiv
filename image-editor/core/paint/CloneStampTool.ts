// ─── Kollektiv Image Editor — Clone Stamp Tool ───────────────────────────────
// Alt+click to set source point; drag to paint copied pixels from source.
// Same OffscreenCanvas approach as BrushEngine but reads from source bitmap.
// No React imports.

import { getSnapshot, dispatch } from '../store';
import { pushCommand } from '../history/HistoryManager';
import type { HistoryCommand, ImageLayer } from '../types';

// ─── State ───────────────────────────────────────────────────────────────────

let _sourceBitmap:  ImageBitmap  | null = null;
let _sourcePoint:   { x: number; y: number } | null = null; // doc coords

let _destLayerId:  string | null = null;
let _destCanvas:   OffscreenCanvas | null = null;
let _destCtx:      OffscreenCanvasRenderingContext2D | null = null;
let _prevBitmap:   ImageBitmap | null = null;
let _strokeStart:  { x: number; y: number } | null = null; // pointer at stroke start
let _isStroking    = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paintStamp(destX: number, destY: number): void {
  if (!_destCtx || !_sourceBitmap || !_sourcePoint || !_strokeStart) return;
  const { brush } = getSnapshot();

  // Clone offset: (destX - strokeStartX) applied to source origin
  const srcX = _sourcePoint.x + (destX - _strokeStart.x);
  const srcY = _sourcePoint.y + (destY - _strokeStart.y);

  const radius = Math.max(0.5, (brush.size / 2) * Math.max(0.1, 0.5));
  const alpha  = (brush.opacity / 100) * (brush.flow / 100);

  _destCtx.save();
  _destCtx.globalAlpha = alpha;
  _destCtx.globalCompositeOperation = 'source-over';

  // Clip to a circle, then draw the source bitmap shifted so (srcX, srcY) appears at (destX, destY)
  _destCtx.beginPath();
  _destCtx.arc(destX, destY, radius, 0, Math.PI * 2);
  _destCtx.clip();
  _destCtx.drawImage(_sourceBitmap, destX - srcX, destY - srcY);

  _destCtx.restore();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const CloneStampTool = {
  get isStroking(): boolean { return _isStroking; },
  get sourcePoint(): { x: number; y: number } | null { return _sourcePoint; },

  /** Alt+click to define the source point (clamps to within the active layer). */
  setSource(docX: number, docY: number): void {
    const { activeLayerId, document: doc } = getSnapshot();
    if (!activeLayerId || !doc) return;
    const layer = doc.layers.find(l => l.id === activeLayerId);
    if (!layer || layer.type !== 'image') return;

    _sourceBitmap  = layer.bitmap;
    _sourcePoint   = { x: docX, y: docY };
  },

  beginStroke(destLayerId: string): void {
    if (!_sourceBitmap || !_sourcePoint) return;
    const { document: doc } = getSnapshot();
    const destLayer = doc?.layers.find(l => l.id === destLayerId) as ImageLayer | undefined;
    if (!destLayer || destLayer.type !== 'image') return;

    _destLayerId = destLayerId;
    _prevBitmap  = destLayer.bitmap;
    _destCanvas  = new OffscreenCanvas(destLayer.intrinsicWidth, destLayer.intrinsicHeight);
    _destCtx     = _destCanvas.getContext('2d')!;
    _destCtx.drawImage(destLayer.bitmap, 0, 0);
    _strokeStart = null; // set on first addPoint
    _isStroking  = true;
  },

  addPoint(x: number, y: number, _pressure = 0.5): void {
    if (!_isStroking) return;
    if (!_strokeStart) _strokeStart = { x, y };
    paintStamp(x, y);
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

    createImageBitmap(canvas).then(newBitmap => {
      const cmd: HistoryCommand = {
        id: crypto.randomUUID(), label: 'Clone stamp stroke', timestamp: Date.now(),
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
    _destCanvas    = null;
    _destCtx       = null;
    _destLayerId   = null;
    _prevBitmap    = null;
    _strokeStart   = null;
  },
};
