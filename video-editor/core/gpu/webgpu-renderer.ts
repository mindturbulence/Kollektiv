/// <reference types="@webgpu/types" />
// New code (not a freecut port): wires the ported gpu/effects and gpu/transitions
// pipelines into the Renderer interface from core/types.ts.
//
// gpu-compositor is intentionally not ported: layer positioning (transform,
// opacity) and transition blending are handled here with a 2D compositing
// pass over GPU-processed layer bitmaps, which is far less code than porting
// freecut's full render-graph compositor for a single blit-with-transform use
// case. GPU effects/transitions still run on the GPU; only the final
// layer-stacking step uses Canvas2D. ponytail: revisit with a WGSL compositor
// pass if per-layer blend modes or masks are needed later.
import type { ComposedFrame, Effect, Renderer, RenderLayer, TextStyle } from '../types'
import { EffectsPipeline } from './effects/effects-pipeline'
import type { GpuEffectInstance } from './effects/types'
import { TransitionPipeline } from './transitions/transition-pipeline'
import { resolveGpuEffect, resolveGpuEffectParams, resolveGpuTransition } from './adapter'
import { COLOR_GRADE, CHROMA_KEY } from '../effect-params'
import { resolvePixelEffects, applyPixelEffectSteps, resolveFitDimensions } from '../render/pixel-effects'

// 'colorGrade' and 'chromaKey' are always handled by the CPU path below
// (applyPixelEffectsToCanvas), never by the freecut GPU registry:
//   - colorGrade has no GPU mapping — its wheels/curves/HSL params.value JSON
//     doesn't match any gpu-effects/color.ts shader's flat param shape.
//   - chromaKey has an adapter mapping ('gpu-chroma-key'), but that shader
//     only supports two preset key colors (green/blue, via a 'select' param)
//     and reads `softness`, not our `edgeSoftness` — it can't render our
//     arbitrary-RGB ChromaKeySettings, so using it would silently diverge
//     from the Canvas2D output. See core/render/pixel-effects.ts.
function toGpuEffectInstances(effects: Effect[]): GpuEffectInstance[] {
  const instances: GpuEffectInstance[] = []
  for (const effect of effects) {
    if (!effect.enabled) continue
    if (effect.type === COLOR_GRADE || effect.type === CHROMA_KEY) continue
    const def = resolveGpuEffect(effect)
    if (!def) continue
    instances.push({
      id: effect.id,
      type: def.id,
      name: def.name,
      enabled: true,
      params: resolveGpuEffectParams(effect),
    })
  }
  return instances
}

/** Runs colorGrade/chromaKey on `source` via a fresh canvas (never reused —
 *  transitions hold `from` and `to` sources alive at the same time, so a
 *  shared scratch canvas would let one overwrite the other). Returns `source`
 *  unchanged if no 2D context is available. */
function applyPixelEffectsToCanvas(
  source: OffscreenCanvas,
  effects: Effect[],
): OffscreenCanvas {
  const steps = resolvePixelEffects(effects)
  if (steps.length === 0) return source
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  const imageData = ctx.getImageData(0, 0, source.width, source.height)
  applyPixelEffectSteps(imageData, steps)
  ctx.putImageData(imageData, 0, 0)
  return source
}

function rasterizeText(text: string, style: TextStyle, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const weight = style.bold ? 'bold ' : '';
  const slant = style.italic ? 'italic ' : '';
  ctx.font = `${slant}${weight}${style.fontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.align === 'left' ? 'start' : style.align === 'right' ? 'end' : 'center';
  ctx.textBaseline = 'middle';
  if (style.background) {
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const x = style.align === 'left' ? 0 : style.align === 'right' ? canvas.width : canvas.width / 2;
  const y = canvas.height / 2;
  if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
  }
  if (style.strokeColor && style.strokeWidth) {
    ctx.lineWidth = style.strokeWidth;
    ctx.strokeStyle = style.strokeColor;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(text, x, y);
  return canvas;
}

type LayerSource = ImageBitmap | OffscreenCanvas;

function sourceDims(source: RenderLayer['source'], fallbackW: number, fallbackH: number): { w: number; h: number } {
  if ('text' in source) return { w: fallbackW, h: fallbackH };
  return { w: source.width, h: source.height };
}

class WebGpuRenderer implements Renderer {
  readonly kind = 'webgpu' as const;
  private ctx2d: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private effects: EffectsPipeline,
    private transitions: TransitionPipeline,
    ctx2d: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  ) {
    this.ctx2d = ctx2d;
    // Device loss is handled by EffectsPipeline's cached device: its `device.lost`
    // handler clears the cache, so the next createWebGpuRenderer() call requests a
    // fresh device instead of reusing the dead one.
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private processLayer(layer: RenderLayer): LayerSource | null {
    const { w, h } = sourceDims(layer.source, this.canvas.width, this.canvas.height);
    const rasterized: OffscreenCanvas | ImageBitmap = 'text' in layer.source
      ? rasterizeText(layer.source.text, layer.source.style, w, h)
      : layer.source;

    const pixelSteps = resolvePixelEffects(layer.effects);
    const gpuEffects = toGpuEffectInstances(layer.effects);
    if (pixelSteps.length === 0 && gpuEffects.length === 0) return rasterized;

    let asCanvas = rasterized instanceof OffscreenCanvas ? rasterized : bitmapToCanvas(rasterized, w, h);
    if (pixelSteps.length > 0) asCanvas = applyPixelEffectsToCanvas(asCanvas, layer.effects);
    if (gpuEffects.length === 0) return asCanvas;
    const out = this.effects.applyEffectsToCanvas(asCanvas, gpuEffects);
    return out ?? asCanvas;
  }

  private drawLayer(layer: RenderLayer, source: LayerSource): void {
    const ctx = this.ctx2d;
    const t = layer.transform;
    // Match Canvas2D: clamp opacity and fit the source into the canvas box
    // per transform.fit instead of drawing at native source dimensions —
    // native-size drawing put every non-canvas-sized clip at the wrong scale.
    const { width, height } = resolveFitDimensions(t.fit, source.width, source.height, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity));
    ctx.translate(this.canvas.width / 2 + t.x, this.canvas.height / 2 + t.y);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale, t.scale);
    ctx.drawImage(source, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  drawFrame(frame: ComposedFrame): void {
    const ctx = this.ctx2d;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = frame.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    for (const layer of frame.layers) {
      const source = this.processLayer(layer);
      if (source) this.drawLayer(layer, source);
    }

    for (const transition of frame.transitions) {
      const resolved = resolveGpuTransition(transition.type);
      if (!resolved) continue;
      const fromSource = this.processLayer(transition.from);
      const toSource = this.processLayer(transition.to);
      if (!fromSource || !toSource) continue;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const fromCanvas = fromSource instanceof OffscreenCanvas ? fromSource : bitmapToCanvas(fromSource, w, h);
      const toCanvas = toSource instanceof OffscreenCanvas ? toSource : bitmapToCanvas(toSource, w, h);
      const blended = this.transitions.render(
        resolved.def.id,
        fromCanvas,
        toCanvas,
        transition.progress,
        w,
        h,
        resolved.direction,
        resolved.properties,
      );
      if (blended) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.drawImage(blended, 0, 0, w, h);
        ctx.restore();
      }
    }
  }

  dispose(): void {
    this.effects.destroy();
    this.transitions.destroy();
  }
}

function bitmapToCanvas(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Creates the WebGPU renderer, or null when WebGPU is unavailable (callers
 * fall back to Canvas2D). Also returns null if the GPU device is lost by the
 * time init reaches the pipeline-creation step; a fresh call after a device
 * loss re-requests the adapter/device.
 */
export async function createWebGpuRenderer(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  if (typeof navigator === 'undefined' || !navigator.gpu) return null;
  const effects = await EffectsPipeline.create();
  if (!effects) return null;
  const transitions = TransitionPipeline.create(effects.getDevice());
  if (!transitions) {
    effects.destroy();
    return null;
  }
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) {
    effects.destroy();
    transitions.destroy();
    return null;
  }
  return new WebGpuRenderer(canvas, effects, transitions, ctx2d);
}
