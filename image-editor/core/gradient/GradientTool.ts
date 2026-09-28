// ─── Kollektiv Image Editor — GradientTool ───────────────────────────────────
// Drag from start → end to create a linear or radial gradient ImageLayer.
// The gradient fills a new ImageLayer matching the document dimensions.
// No React imports.

import { addLayer } from '../layers/LayerManager';
import { getSnapshot } from '../store';
import { SelectionEngine } from '../selection/SelectionEngine';
import type { Point, ImageLayer } from '../types';

export type GradientKind = 'linear' | 'radial';

// ─── State ───────────────────────────────────────────────────────────────────

let _start: Point | null = null;
let _end:   Point | null = null;
let _kind:  GradientKind = 'linear';

// ─── Public API ───────────────────────────────────────────────────────────────

export const GradientTool = {
  setKind(kind: GradientKind): void { _kind = kind; },
  getKind(): GradientKind { return _kind; },

  beginGradient(docX: number, docY: number): void {
    _start = { x: docX, y: docY };
    _end   = { x: docX, y: docY };
  },

  updateGradient(docX: number, docY: number): void {
    if (!_start) return;
    _end = { x: docX, y: docY };
  },

  getLiveStart(): Point | null { return _start; },
  getLiveEnd():   Point | null { return _end; },
  isDragging(): boolean { return _start !== null; },

  async commitGradient(docX: number, docY: number): Promise<void> {
    if (!_start) return;
    const end   = { x: docX, y: docY };
    const start = _start;
    const kind  = _kind;
    _start = null;
    _end   = null;

    const { document: doc, colors } = getSnapshot();
    if (!doc) return;

    // Build gradient on an OffscreenCanvas the same size as the document
    const oc  = new OffscreenCanvas(doc.width, doc.height);
    const ctx = oc.getContext('2d')!;

    let grad: CanvasGradient;
    if (kind === 'linear') {
      grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    } else {
      const radius = Math.hypot(end.x - start.x, end.y - start.y);
      grad = ctx.createRadialGradient(start.x, start.y, 0, start.x, start.y, Math.max(1, radius));
    }
    grad.addColorStop(0, colors.foreground);
    grad.addColorStop(1, colors.background);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, doc.width, doc.height);

    // Selection clip (M5 leftover): a gradient should only land inside the
    // active selection, like every other paint tool. The gradient canvas is    // document-sized, so the doc-space selection Path2D applies 1:1 — no    // bitmap-space transform needed. destination-in keeps only the pixels    // inside the clip (transparent outside); skipped when nothing is selected.
    const clip = SelectionEngine.getSelectionClip();
    if (clip) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#ffffff';
      ctx.fill(clip);
      ctx.globalCompositeOperation = 'source-over';
    }

    const bitmap = await createImageBitmap(oc);

    const layer: ImageLayer = {
      id:        crypto.randomUUID(),
      name:      `${kind === 'linear' ? 'Linear' : 'Radial'} Gradient`,
      type:      'image',
      bitmap,
      intrinsicWidth:  doc.width,
      intrinsicHeight: doc.height,
      transform: {
        origin:   { x: 0, y: 0 },
        size:     { width: doc.width, height: doc.height },
        rotation: 0, flipH: false, flipV: false,
      },
      opacity:   100,
      blendMode: 'normal',
      visible:   true,
    };

    addLayer(layer);
  },

  cancel(): void {
    _start = null;
    _end   = null;
  },
};
