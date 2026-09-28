// ─── Kollektiv Image Editor — LayerPainter ───────────────────────────────────
// Draws layers (image/text/shape, groups, masks, native + WebGL2 manual blend
// modes) into any 2D context. Shared by CanvasRenderer (on-screen, viewport-
// transformed) and FileIO.exportToBlob (offscreen, document-space) so export is
// guaranteed to match what the user sees.

import type { ImageLayer, Layer, TextLayer, ShapeLayer } from '../types';
import { NATIVE_BLEND_MODES } from '../types';
import { AdjustmentEngine } from '../adjust/AdjustmentEngine';
import { BlendCompositor, MANUAL_BLEND_MODES, type ManualBlendMode } from './BlendCompositor';
import { BrushEngine } from '../paint/BrushEngine';
import { CloneStampTool } from '../paint/CloneStampTool';

export class LayerPainter {
  // Scratch canvas reused across frames for mask alpha-compositing — resized
  // on demand rather than allocated per layer per frame.
  private maskScratch: OffscreenCanvas = new OffscreenCanvas(1, 1);

  // Manual (WebGL2) blend modes — lazily created only if a document actually
  // uses one, so documents with only native modes never pay for this.
  private soloScratch: OffscreenCanvas = new OffscreenCanvas(1, 1);
  private blendCompositor: BlendCompositor | null = null;

  /** @param showAdjustmentPreviews on-screen only — export must flatten committed
   *  pixels, never an adjustment panel's unapplied live preview. */
  constructor(private readonly showAdjustmentPreviews = true) {}

  dispose(): void {
    this.blendCompositor?.dispose();
    this.blendCompositor = null;
  }

  drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
    if (!layer.visible) return;

    if (layer.type === 'group') {
      for (let i = layer.children.length - 1; i >= 0; i--) {
        this.drawLayer(ctx, layer.children[i]);
      }
      return;
    }

    if (layer.type !== 'adjustment' && (MANUAL_BLEND_MODES as readonly string[]).includes(layer.blendMode)) {
      this.drawWithManualBlend(ctx, layer);
      return;
    }

    // Route to per-type draw methods (M3.5 adds text + shape rendering).
    if      (layer.type === 'image') this.drawImageLayer(ctx, layer);
    else if (layer.type === 'text')  this.drawTextLayer(ctx, layer);
    else if (layer.type === 'shape') this.drawShapeLayer(ctx, layer);
    // adjustment / group handled above
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
