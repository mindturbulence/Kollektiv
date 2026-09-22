// ─── Kollektiv Image Editor — CanvasRenderer ─────────────────────────────────
// Pure Canvas2D compositor. No React. Subscribes imperatively to EditorStore
// and re-composites via requestAnimationFrame whenever the store notifies.
//
// Coordinate spaces:
//   - "client" — browser viewport coords (event.clientX/Y).
//   - "CSS px" — canvas-local coords, origin at canvas top-left, DPR-independent.
//   - "document" — coords inside the open EditorDocument, origin at its top-left.
//
// Viewport.panX/panY are CSS-px offsets of the document center from the
// canvas center. Viewport.zoom maps document px → CSS px.

import type { EditorState, ImageLayer, Layer } from '../types';
import { getSnapshot, subscribe, dispatch } from '../store';
import { NATIVE_BLEND_MODES, ZOOM_STOPS } from '../types';
import * as ThumbnailCache from '../thumbnails/ThumbnailCache';
import { AdjustmentEngine } from '../adjust/AdjustmentEngine';

const EMPTY_BG = '#0F120C';
const ZOOM_MIN = 0.125;
const ZOOM_MAX = 16.0;
const ZOOM_STOP_TOLERANCE = 0.02;

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;

  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private lastState: EditorState | null = null;

  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.overlayCanvas = overlayCanvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasRenderer: failed to acquire 2d context on main canvas');
    this.ctx = ctx;

    const overlayCtx = overlayCanvas.getContext('2d');
    if (!overlayCtx) throw new Error('CanvasRenderer: failed to acquire 2d context on overlay canvas');
    this.overlayCtx = overlayCtx;
  }

  start(): void {
    this.unsubscribe = subscribe(this.onStoreChange);
    this.syncSize();

    const container = this.canvas.parentElement;
    if (container && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncSize();
        // Canvas dimensions changed but store state reference didn't —
        // force the next frame to re-render regardless of the dirty check.
        this.lastState = null;
        this.scheduleFrame();
      });
      this.resizeObserver.observe(container);
    }

    this.scheduleFrame();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    ThumbnailCache.dispose();
  }

  /** Zoom anchored on a client-space point (e.g. wheel event coords). */
  zoomAt(delta: number, clientX: number, clientY: number): void {
    const { viewport } = getSnapshot();
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Offset (in document px) of the cursor from the document center, before zoom.
    const anchorX = (cssX - centerX - viewport.panX) / viewport.zoom;
    const anchorY = (cssY - centerY - viewport.panY) / viewport.zoom;

    const factor = delta > 0 ? 1 / 1.1 : 1.1;
    let nextZoom = viewport.zoom * factor;

    for (const stop of ZOOM_STOPS) {
      if (Math.abs(nextZoom - stop) / stop < ZOOM_STOP_TOLERANCE) {
        nextZoom = stop;
        break;
      }
    }
    nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));

    // Re-solve pan so the same document point stays under the cursor.
    const nextPanX = cssX - centerX - anchorX * nextZoom;
    const nextPanY = cssY - centerY - anchorY * nextZoom;

    dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: nextZoom, panX: nextPanX, panY: nextPanY } });
  }

  panBy(dx: number, dy: number): void {
    const { viewport } = getSnapshot();
    dispatch({ type: 'SET_VIEWPORT', viewport: { panX: viewport.panX + dx, panY: viewport.panY + dy } });
  }

  fitToViewport(): void {
    const { document } = getSnapshot();
    if (!document) return;

    const rect = this.canvas.getBoundingClientRect();
    const availW = rect.width * 0.9;
    const availH = rect.height * 0.9;
    const rawZoom = Math.min(availW / document.width, availH / document.height);
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rawZoom));

    dispatch({ type: 'SET_VIEWPORT', viewport: { zoom, panX: 0, panY: 0 } });
  }

  /** Convert browser client coords to document-space pixel coords. */
  getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const { viewport, document } = getSnapshot();
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const halfW = document ? document.width / 2 : 0;
    const halfH = document ? document.height / 2 : 0;

    return {
      x: (cssX - centerX - viewport.panX) / viewport.zoom + halfW,
      y: (cssY - centerY - viewport.panY) / viewport.zoom + halfH,
    };
  }

  /** Draws UI chrome (brush cursor ring) on the overlay canvas. cursorX/Y are canvas-local CSS px. */
  drawOverlay(cursorX: number, cursorY: number): void {
    const ctx = this.overlayCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    const state = getSnapshot();
    if (state.activeTool !== 'brush' && state.activeTool !== 'eraser') return;

    const radius = (state.brush.size / 2) * state.viewport.zoom;
    if (radius <= 0) return;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, radius, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, radius, 0, Math.PI * 2);
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.stroke();
    ctx.restore();
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private onStoreChange = (): void => {
    this.scheduleFrame();
  };

  private scheduleFrame(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.rafId = null;
    const state = getSnapshot();
    if (state === this.lastState) return;
    this.lastState = state;
    this.render(state);
  };

  private render(state: EditorState): void {
    const ctx = this.ctx;
    const canvas = this.canvas;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const document = state.document;
    if (!document) {
      ctx.fillStyle = EMPTY_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const { viewport } = state;
    const viewportCenterX = this.cssWidth / 2;
    const viewportCenterY = this.cssHeight / 2;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(viewportCenterX + viewport.panX, viewportCenterY + viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    // Shift so (0,0) in this frame is the document's top-left corner.
    ctx.translate(-document.width / 2, -document.height / 2);

    // index 0 = topmost → draw last.
    for (let i = document.layers.length - 1; i >= 0; i--) {
      this.drawLayer(ctx, document.layers[i]);
    }

    ctx.restore();

    if (state.dirtyLayerIds.size > 0) {
      this.regenerateDirtyThumbnails(state);
    }
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
    if (!layer.visible) return;

    if (layer.type === 'group') {
      for (let i = layer.children.length - 1; i >= 0; i--) {
        this.drawLayer(ctx, layer.children[i]);
      }
      return;
    }

    // M1 only composites raster image layers; other layer types are no-ops for now.
    if (layer.type !== 'image') return;
    this.drawImageLayer(ctx, layer);
  }

  private drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer): void {
    // Use preview bitmap if an adjustment panel has an active preview for this layer
    const bitmap = AdjustmentEngine.getPreviewBitmap(layer.id) ?? layer.bitmap;
    if (!bitmap || bitmap.width === 0 || bitmap.height === 0) return;

    const transform = layer.transform;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
    ctx.globalCompositeOperation = (NATIVE_BLEND_MODES as readonly string[]).includes(layer.blendMode)
      ? (layer.blendMode as GlobalCompositeOperation)
      : 'source-over';

    ctx.translate(
      transform.origin.x + transform.size.width / 2,
      transform.origin.y + transform.size.height / 2,
    );
    ctx.rotate((transform.rotation * Math.PI) / 180);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);

    try {
      ctx.drawImage(
        bitmap,
        -transform.size.width / 2,
        -transform.size.height / 2,
        transform.size.width,
        transform.size.height,
      );
    } catch {
      // Bitmap closed mid-frame (race with GC/teardown) — skip silently.
    }

    ctx.restore();
  }

  /**
   * Regenerates cached thumbnails for every layer in `dirtyLayerIds`, then
   * dispatches CLEAR_DIRTY_LAYERS for the IDs it processed. Fire-and-forget —
   * never awaited from the RAF loop so thumbnail work never blocks painting.
   * The dirty set is snapshotted up front so IDs marked dirty again mid-flight
   * (e.g. another edit while a thumbnail is still regenerating) survive the clear.
   */
  private regenerateDirtyThumbnails(state: EditorState): void {
    const dirtyIds = new Set(state.dirtyLayerIds);
    void (async () => {
      for (const layerId of dirtyIds) {
        const layer = state.document?.layers.find(l => l.id === layerId);
        if (!layer || layer.type !== 'image' || !layer.bitmap || layer.bitmap.width === 0) continue;
        await ThumbnailCache.regenerate(layerId, layer.bitmap, layer.transform);
      }
      dispatch({ type: 'CLEAR_DIRTY_LAYERS', layerIds: dirtyIds });
    })();
  }

  private syncSize(): void {
    const container = this.canvas.parentElement;
    const cssWidth = container ? container.clientWidth : this.canvas.clientWidth;
    const cssHeight = container ? container.clientHeight : this.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    this.dpr = dpr;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

    const deviceWidth = Math.round(cssWidth * dpr);
    const deviceHeight = Math.round(cssHeight * dpr);

    for (const c of [this.canvas, this.overlayCanvas]) {
      if (c.width !== deviceWidth) c.width = deviceWidth;
      if (c.height !== deviceHeight) c.height = deviceHeight;
      c.style.width = `${cssWidth}px`;
      c.style.height = `${cssHeight}px`;
    }
  }
}
