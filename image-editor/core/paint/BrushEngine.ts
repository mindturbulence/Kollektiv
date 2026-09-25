// ─── Kollektiv Image Editor — BrushEngine ───────────────────────────────────
// Main-thread TS-first brush/erase engine.
// M3 scope: no worker — commit happens synchronously via createImageBitmap on pointerup.
// Live-stroke preview is deferred (TODO: worker + live REPLACE_LAYER_BITMAP updates).
//
// No React imports.

import { getSnapshot, dispatch } from '../store';
import { pushCommand } from '../history/HistoryManager';
import { findLayerById } from '../layers/layerTree';
import { selectionClipInBitmapSpace } from '../geometry/selectionClip';
import type { BrushPoint, HistoryCommand, ImageLayer } from '../types';

// ─── Internal state ──────────────────────────────────────────────────────────

let _layerId:    string | null = null;
let _target:     'color' | 'mask' = 'color';
let _canvas:     OffscreenCanvas | null = null;
let _ctx:        OffscreenCanvasRenderingContext2D | null = null;
let _prevBitmap: ImageBitmap | null = null;   // layer bitmap (or mask bitmap) before stroke, for undo
let _points:     BrushPoint[] = [];
let _isStroking  = false;
let _docScale   = 1;   // bitmap px per doc px — scales the brush radius (E1)
let _lastStamp:  { x: number; y: number } | null = null; // for spaced stamping (H5)
let _clipPath:   Path2D | null = null; // active selection, in bitmap space (E5)

/** Frame pump: the active CanvasRenderer registers scheduleFrame so stroke
 *  stamps (which mutate an OffscreenCanvas, not the store) repaint live. */
let _requestFrame: (() => void) | null = null;

// ─── Catmull-Rom helpers ──────────────────────────────────────────────────────

function catmullRom(
  p0: BrushPoint, p1: BrushPoint, p2: BrushPoint, p3: BrushPoint, t: number,
): { x: number; y: number } {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
       (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
       (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
       (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
       (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// ─── Stamp helper ─────────────────────────────────────────────────────────────

function paintStamp(x: number, y: number, pressure: number, isEraser: boolean): void {
  if (!_ctx) return;
  const { brush, colors } = getSnapshot();

  // Brush size is authored in document px; the stamp lands in bitmap px, so
  // scale the radius by the layer's bitmap/doc ratio (E1).
  const radius = Math.max(0.5, (brush.size / 2) * _docScale * Math.max(0.1, pressure));
  const alpha  = (brush.opacity / 100) * (brush.flow / 100) * Math.max(0.1, pressure);

  // Mask painting only ever reads the alpha channel at composite time (destination-in
  // in CanvasRenderer), so the RGB fill is irrelevant there — only whether this stroke
  // adds opacity (reveal) or removes it (hide) matters. "Brush" hides, "Eraser" reveals.
  // Color target: brush=source-over, eraser=destination-out.
  // Mask target: inverted — brush HIDES (destination-out), eraser REVEALS (source-over).
  const subtracting = _target === 'mask' ? !isEraser : isEraser;
  const compositeOp = subtracting ? 'destination-out' : 'source-over';
  const fillColor = _target === 'mask' ? '#000000' : (isEraser ? 'black' : colors.foreground);

  _ctx.save();
  _ctx.globalAlpha = alpha;
  _ctx.globalCompositeOperation = compositeOp;
  // Clip to the active selection (E5) — captured at beginStroke in bitmap space.
  if (_clipPath) _ctx.clip(_clipPath);

  if (brush.hardness >= 0.99) {
    _ctx.fillStyle = fillColor;
    _ctx.beginPath();
    _ctx.arc(x, y, radius, 0, Math.PI * 2);
    _ctx.fill();
  } else {
    const innerR = radius * brush.hardness;
    const grad = _ctx.createRadialGradient(x, y, innerR, x, y, radius);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, 'transparent');
    _ctx.fillStyle = grad;
    _ctx.beginPath();
    _ctx.arc(x, y, radius, 0, Math.PI * 2);
    _ctx.fill();
  }
  _ctx.restore();
}  /** Stamps along the segment from the last stamp to (x,y) at fixed spacing
 *  (review H5): one stamp per pointer event leaves dotted gaps on fast strokes.
 *  Spacing = max(1, r·0.25), with the radius in bitmap px. */
function stampSpaced(x: number, y: number, pressure: number, isEraser: boolean): void {
  const { brush } = getSnapshot();
  const radius = Math.max(0.5, (brush.size / 2) * _docScale * Math.max(0.1, pressure));
  const spacing = Math.max(1, radius * 0.25);

  if (!_lastStamp) {
    paintStamp(x, y, pressure, isEraser);
    _lastStamp = { x, y };
    _requestFrame?.(); // repaint the live stroke preview (H4)
    return;
  }

  const dx = x - _lastStamp.x;
  const dy = y - _lastStamp.y;
  const dist = Math.hypot(dx, dy);
  if (dist < spacing) return; // too close — skip (keeps slow strokes even)

  const steps = Math.floor(dist / spacing);
  for (let i = 1; i <= steps; i++) {
    const t = (i * spacing) / dist;
    paintStamp(_lastStamp.x + dx * t, _lastStamp.y + dy * t, pressure, isEraser);
  }
  // Carry the remainder so the next segment continues from where we stopped.
  const covered = steps * spacing;
  _lastStamp = { x: _lastStamp.x + (dx * covered) / dist, y: _lastStamp.y + (dy * covered) / dist };
  _requestFrame?.(); // repaint the live stroke preview (H4)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const BrushEngine = {
  get isStroking(): boolean { return _isStroking; },

  /** Layer id currently being painted — the viewport maps doc coords into this
   *  layer's bitmap space before calling addPoint. Null between strokes. */
  get activeLayerId(): string | null { return _layerId; },

  beginStroke(layerId: string, target: 'color' | 'mask' = 'color', docScale = 1): void {
    const { document: doc } = getSnapshot();
    const layer = (doc && findLayerById(doc.layers, layerId)) as ImageLayer | undefined;
    if (!layer || layer.type !== 'image') return;
    if (target === 'mask' && !layer.mask) return; // caller must add a mask first (LayerManager.addMask)

    const sourceBitmap = target === 'mask' ? layer.mask!.bitmap : layer.bitmap;

    _layerId    = layerId;
    _target     = target;
    _docScale   = docScale > 0 ? docScale : 1;
    _prevBitmap = sourceBitmap;
    _canvas     = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height);
    _ctx        = _canvas.getContext('2d');
    _ctx?.drawImage(sourceBitmap, 0, 0);
    _points     = [];
    _lastStamp  = null;
    // Capture the selection clip in bitmap space once per stroke (E5) — the
    // selection is doc-space; transform it through the layer matrix.
    _clipPath   = selectionClipInBitmapSpace({
      transform: layer.transform,
      intrinsicWidth: layer.intrinsicWidth,
      intrinsicHeight: layer.intrinsicHeight,
    });
    _isStroking = true;
  },

  addPoint(x: number, y: number, pressure: number, isEraser = false): void {
    if (!_isStroking) return;

    const pt: BrushPoint = { x, y, pressure, timestamp: Date.now() };
    _points.push(pt);

    // Apply Catmull-Rom smoothing once we have 4 points
    if (_points.length >= 4) {
      const i = _points.length - 1;
      const smoothed = catmullRom(_points[i - 3], _points[i - 2], _points[i - 1], _points[i], 0.5);
      stampSpaced(smoothed.x, smoothed.y, pressure, isEraser);
    } else {
      stampSpaced(x, y, pressure, isEraser);
    }
  },

  endStroke(): void {
    if (!_isStroking || !_canvas || !_layerId || !_prevBitmap) return;
    _isStroking = false;

    const layerId    = _layerId;
    const target     = _target;
    const prevBitmap = _prevBitmap;
    const canvas     = _canvas;

    // Reset stroke state before async createImageBitmap
    _layerId    = null;
    _canvas     = null;
    _ctx        = null;
    _prevBitmap = null;
    _points     = [];
    _lastStamp  = null;
    _clipPath   = null;

    const actionType = target === 'mask' ? 'REPLACE_LAYER_MASK_BITMAP' : 'REPLACE_LAYER_BITMAP';
    createImageBitmap(canvas).then((newBitmap) => {
      const cmd: HistoryCommand = {
        id:        crypto.randomUUID(),
        label:     target === 'mask' ? 'Mask stroke' : 'Brush stroke',
        timestamp: Date.now(),
        // H3: declare held bitmaps so the byte-cap can account and free them.
        bitmapRefs: { 'new (do)': newBitmap, 'prev (undo)': prevBitmap },
        do:   () => dispatch({ type: actionType, layerId, bitmap: newBitmap }),
        undo: () => dispatch({ type: actionType, layerId, bitmap: prevBitmap }),
      };
      pushCommand(cmd);
    });
  },

  /** Registers the renderer's frame pump so stamps repaint the live preview.
   *  Pass null to unregister (renderer stop). */
  setRequestFrame(fn: (() => void) | null): void { _requestFrame = fn; },

  /** Live stroke preview (review H4): the in-progress stroke canvas, in the
   *  layer's bitmap space. The renderer draws it in place of layer.bitmap for
   *  the stroking layer so users see pixels as they paint, not only on
   *  pointerup. Null when no stroke is active. */
  getScratchBitmap(): OffscreenCanvas | null { return _isStroking ? _canvas : null; },

  dispose(): void {
    _isStroking = false;
    _canvas     = null;
    _ctx        = null;
    _layerId    = null;
    _target     = 'color';
    _prevBitmap = null;
    _points     = [];
    _lastStamp  = null;
    _clipPath   = null;
    _docScale   = 1;
  },
};
