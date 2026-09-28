// ─── Kollektiv Image Editor — LayerPainter ───────────────────────────────────
// Draws layers (image/text/shape, groups, masks, native + WebGL2 manual blend
// modes) into any 2D context. Shared by CanvasRenderer (on-screen, viewport-
// transformed) and FileIO.exportToBlob (offscreen, document-space) so export is
// guaranteed to match what the user sees.

import type { ImageLayer, Layer, TextLayer, ShapeLayer, LookLayer } from '../types';
import { NATIVE_BLEND_MODES } from '../types';
import { AdjustmentEngine } from '../adjust/AdjustmentEngine';
import { BlendCompositor, MANUAL_BLEND_MODES, type ManualBlendMode } from './BlendCompositor';
import { BrushEngine } from '../paint/BrushEngine';
import { CloneStampTool } from '../paint/CloneStampTool';
import { LookRenderer } from '../looks/LookRenderer';
import { lutRegistryVersion } from '../looks/lutRegistry';
import { getSnapshot } from '../store';

/** Renders `layers` (index 0 = topmost, drawn bottom-up) into a width×height
 *  document-space canvas with committed pixels only (no adjustment previews).
 *  Shared by merge/flatten and the magic wand so both see what the viewport shows. */
export function rasterizeLayersToCanvas(layers: Layer[], width: number, height: number): OffscreenCanvas | null {
  const oc = new OffscreenCanvas(width, height);
  const ctx = oc.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const painter = new LayerPainter(false);
  try {
    painter.drawLayers(ctx as unknown as CanvasRenderingContext2D, layers);
  } finally {
    painter.dispose();
  }
  return oc;
}

export class LayerPainter {
  // Scratch canvas reused across frames for mask alpha-compositing — resized
  // on demand rather than allocated per layer per frame.
  private maskScratch: OffscreenCanvas = new OffscreenCanvas(1, 1);

  // Manual (WebGL2) blend modes — lazily created only if a document actually
  // uses one, so documents with only native modes never pay for this.
  private soloScratch: OffscreenCanvas = new OffscreenCanvas(1, 1);
  private blendCompositor: BlendCompositor | null = null;

  // Looks: renderer created on first use (undefined = not tried, null = no WebGL2).
  private lookRenderer: LookRenderer | null | undefined;
  // On-screen look cache (plan §3.4): the composite up to and including the
  // topmost look, reused while nothing below it changes — painting ABOVE a
  // look then costs one drawImage instead of a full re-shade every repaint.
  private lookCache: OffscreenCanvas | null = null;
  private lookCacheKey: unknown[] | null = null;

  /** @param showAdjustmentPreviews on-screen only — export must flatten committed
   *  pixels, never an adjustment panel's unapplied live preview. */
  constructor(private readonly showAdjustmentPreviews = true) {}

  dispose(): void {
    this.blendCompositor?.dispose();
    this.blendCompositor = null;
    this.lookRenderer?.dispose();
    this.lookRenderer = undefined;
    this.lookCache = null;
    this.lookCacheKey = null;
  }

  /** Draws `layers` (index 0 = topmost) bottom-up. The on-screen painter
   *  (showAdjustmentPreviews) caches the result up to the topmost look. */
  drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[]): void {
    let top = -1; // index of the topmost visible look (smallest index)
    if (this.showAdjustmentPreviews) {
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'look' && layers[i].visible) { top = i; break; }
      }
    }
    if (top < 0) {
      for (let i = layers.length - 1; i >= 0; i--) this.drawLayer(ctx, layers[i]);
      return;
    }

    const w = ctx.canvas.width, h = ctx.canvas.height;
    const key = this.lookKey(ctx, layers.slice(top));
    if (key && this.lookCache && this.lookCacheKey && sameKey(key, this.lookCacheKey)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(this.lookCache, 0, 0);
      ctx.restore();
    } else {
      for (let i = layers.length - 1; i >= top; i--) this.drawLayer(ctx, layers[i]);
      if (key) {
        if (!this.lookCache || this.lookCache.width !== w || this.lookCache.height !== h) this.lookCache = new OffscreenCanvas(w, h);
        const cctx = this.lookCache.getContext('2d');
        if (cctx) {
          cctx.globalCompositeOperation = 'copy';
          cctx.drawImage(ctx.canvas, 0, 0);
        }
      }
      this.lookCacheKey = key;
    }
    for (let i = top - 1; i >= 0; i--) this.drawLayer(ctx, layers[i]);
  }

  /** Everything that decides the composite up to the topmost look, by identity
   *  (store layers are immutable), or null when it can't be cached: a live
   *  brush/clone stroke on a layer below repaints pixels without changing its
   *  layer object. */
  private lookKey(ctx: CanvasRenderingContext2D, stack: Layer[]): unknown[] | null {
    const t = ctx.getTransform();
    const key: unknown[] = [ctx.canvas.width, ctx.canvas.height, t.a, t.b, t.c, t.d, t.e, t.f, lutRegistryVersion()];
    const walk = (list: Layer[]): boolean => {
      for (const l of list) {
        key.push(l);
        if (l.type === 'group' && !walk(l.children)) return false;
        if (l.type === 'image') {
          if ((BrushEngine.isStroking && BrushEngine.activeLayerId === l.id) ||
              (CloneStampTool.isStroking && CloneStampTool.activeLayerId === l.id)) return false;
          key.push(AdjustmentEngine.getPreviewBitmap(l.id));
        }
      }
      return true;
    };
    return walk(stack) ? key : null;
  }

  /** Shades everything already drawn on ctx.canvas with the layer's recipe
   *  (strength = opacity) and writes the result back — the same
   *  read/shade/copy pattern as drawWithManualBlend. */
  private drawLookLayer(ctx: CanvasRenderingContext2D, layer: LookLayer): void {
    const canvasEl = ctx.canvas;
    const w = canvasEl.width, h = canvasEl.height;
    if (w === 0 || h === 0 || layer.opacity <= 0 || layer.recipe.components.every(c => !c.enabled)) return;
    if (this.lookRenderer === undefined) {
      try { this.lookRenderer = new LookRenderer(); } catch { this.lookRenderer = null; }
    }
    if (!this.lookRenderer) return; // no WebGL2: the look is skipped, never faked
    const doc = getSnapshot().document;
    const inv = ctx.getTransform().inverse();
    const result = this.lookRenderer.render(
      canvasEl, w, h, layer.recipe, layer.opacity / 100,
      [inv.a, inv.b, inv.c, inv.d, inv.e, inv.f], doc?.width ?? w, doc?.height ?? h,
    );
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.drawImage(result, 0, 0);
    ctx.restore();
  }

  drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
    if (!layer.visible) return;

    if (layer.type === 'group') {
      for (let i = layer.children.length - 1; i >= 0; i--) {
        this.drawLayer(ctx, layer.children[i]);
      }
      return;
    }

    if (layer.type === 'look') {
      this.drawLookLayer(ctx, layer);
      return;
    }

    if ((MANUAL_BLEND_MODES as readonly string[]).includes(layer.blendMode)) {
      this.drawWithManualBlend(ctx, layer);
      return;
    }

    // Route to per-type draw methods (M3.5 adds text + shape rendering).
    if      (layer.type === 'image') this.drawImageLayer(ctx, layer);
    else if (layer.type === 'text')  this.drawTextLayer(ctx, layer);
    else if (layer.type === 'shape') this.drawShapeLayer(ctx, layer);
    // group and look handled above
  }

  /** Renders a single image/text/shape layer through the WebGL2 manual-blend
   *  compositor (§6 — the 9 modes Canvas2D has no globalCompositeOperation for).
   *
   *  Works directly against whatever `ctx` is currently drawing into (on-screen
   *  viewport-transformed canvas, or an offscreen one): everything below this
   *  layer in paint order is already on `ctx.canvas` (layers draw bottom-up),
   *  so that canvas IS the "base" texture — no separate accumulator needed.
   *  This layer is re-rendered alone (normal blend, full opacity) onto a
   *  same-size, same-transform scratch canvas to get the "blend" texture,
   *  then the shader's result replaces `ctx.canvas`'s current pixels. */
  private drawWithManualBlend(ctx: CanvasRenderingContext2D, layer: ImageLayer | TextLayer | ShapeLayer): void {
    const canvasEl = ctx.canvas;
    const w = canvasEl.width, h = canvasEl.height;
    if (w === 0 || h === 0) return;

    if (this.soloScratch.width !== w || this.soloScratch.height !== h) {
      this.soloScratch = new OffscreenCanvas(w, h);
    }
    // OffscreenCanvasRenderingContext2D and CanvasRenderingContext2D aren't
    // related by the DOM lib's type hierarchy, but drawImageLayer/etc. only
    // use the (identical) subset both implement.
    const sctx = this.soloScratch.getContext('2d') as unknown as CanvasRenderingContext2D;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.setTransform(ctx.getTransform());

    const soloLayer = { ...layer, opacity: 100, blendMode: 'normal' } as typeof layer;
    if      (soloLayer.type === 'image') this.drawImageLayer(sctx, soloLayer);
    else if (soloLayer.type === 'text')  this.drawTextLayer(sctx, soloLayer);
    else                                  this.drawShapeLayer(sctx, soloLayer);

    if (!this.blendCompositor) {
      this.blendCompositor = new BlendCompositor(w, h);
    } else if (this.blendCompositor.needsResize(w, h)) {
      this.blendCompositor.resize(w, h);
    }
    const result = this.blendCompositor.render(
      canvasEl,
      this.soloScratch,
      layer.blendMode as ManualBlendMode,
      layer.opacity / 100,
    );

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.drawImage(result, 0, 0);
    ctx.restore();
  }

  /** Alpha-multiplies `bitmap` by `mask.bitmap` into the reused scratch canvas via
   *  destination-in (or destination-out when inverted), with optional feather blur. */
  private applyMask(bitmap: ImageBitmap, mask: NonNullable<ImageLayer['mask']>): ImageBitmap | OffscreenCanvas {
    const w = bitmap.width, h = bitmap.height;
    if (this.maskScratch.width !== w || this.maskScratch.height !== h) {
      this.maskScratch = new OffscreenCanvas(w, h);
    }
    const mctx = this.maskScratch.getContext('2d');
    if (!mctx) return bitmap;

    mctx.clearRect(0, 0, w, h);
    mctx.globalCompositeOperation = 'source-over';
    mctx.filter = 'none';
    mctx.drawImage(bitmap, 0, 0);
    mctx.globalCompositeOperation = mask.invert ? 'destination-out' : 'destination-in';
    mctx.filter = mask.feather > 0 ? `blur(${mask.feather}px)` : 'none';
    mctx.drawImage(mask.bitmap, 0, 0);
    mctx.filter = 'none';
    return this.maskScratch;
  }

  private drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer): void {
    // Live stroke preview (review H4): while a brush or clone stroke is in
    // flight on this layer, draw the stroke's scratch canvas instead of the
    // committed bitmap — pixels appear as they're painted, not on pointerup.
    // Mask-target strokes preview the raw color bitmap too (mask compositing
    // happens at composite time, so previewing the source is honest enough
    // for stroke placement; the committed mask is applied on endStroke).
    const liveStroke =
      (BrushEngine.isStroking && BrushEngine.activeLayerId === layer.id ? BrushEngine.getScratchBitmap() : null) ??
      (CloneStampTool.isStroking && CloneStampTool.activeLayerId === layer.id ? CloneStampTool.getScratchCanvas() : null);

    let bitmap: ImageBitmap | OffscreenCanvas = liveStroke ??
      ((this.showAdjustmentPreviews ? AdjustmentEngine.getPreviewBitmap(layer.id) : null) ?? layer.bitmap);
    if (!bitmap || bitmap.width === 0 || bitmap.height === 0) return;
    // Masks are NOT applied during a live stroke on this layer: the stroke is
    // already in bitmap space and the mask pass would need the un-stroked mask
    // bitmap — skip so the preview matches what the stroke is doing.
    if (layer.mask?.enabled && !liveStroke) {
      bitmap = this.applyMask(bitmap as ImageBitmap, layer.mask);
    }

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
  private drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
    if (!layer.text.trim()) return;
    const { transform, font, color, opacity, blendMode } = layer;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100));
    ctx.globalCompositeOperation = (NATIVE_BLEND_MODES as readonly string[]).includes(blendMode)
      ? (blendMode as GlobalCompositeOperation) : 'source-over';

    // Centre-of-layer transform (matches drawImageLayer convention)
    ctx.translate(
      transform.origin.x + transform.size.width  / 2,
      transform.origin.y + transform.size.height / 2,
    );
    ctx.rotate((transform.rotation * Math.PI) / 180);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);

    ctx.font = `${font.weight} ${font.size}px "${font.family}", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign   = (layer as TextLayer & { alignment?: CanvasTextAlign }).alignment ?? 'left';
    ctx.textBaseline = 'top';

    const lineH = font.size * 1.25;
    layer.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, -transform.size.width / 2, -transform.size.height / 2 + i * lineH);
    });

    ctx.restore();
  }

  private drawShapeLayer(ctx: CanvasRenderingContext2D, layer: ShapeLayer): void {
    const { transform, shape, fill, stroke, opacity, blendMode } = layer;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100));
    ctx.globalCompositeOperation = (NATIVE_BLEND_MODES as readonly string[]).includes(blendMode)
      ? (blendMode as GlobalCompositeOperation) : 'source-over';

    ctx.translate(
      transform.origin.x + transform.size.width  / 2,
      transform.origin.y + transform.size.height / 2,
    );
    ctx.rotate((transform.rotation * Math.PI) / 180);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);

    const hw = transform.size.width  / 2;
    const hh = transform.size.height / 2;

    ctx.fillStyle = fill;
    ctx.beginPath();
    if (shape === 'rect') {
      ctx.rect(-hw, -hh, transform.size.width, transform.size.height);
    } else {
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    if (stroke) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth   = stroke.width;
      ctx.stroke();
    }

    ctx.restore();
  }
}

function sameKey(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
