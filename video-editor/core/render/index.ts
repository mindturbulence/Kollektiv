// Canvas2D baseline renderer. Draws a ComposedFrame (background, layers,
// transitions) into whatever canvas it was built with. Transition blend
// logic is ported from openreel@5f3c85e
// packages/core/src/video/transition-engine.ts (crossfade/dip/wipe/slide
// cases only — MIT, (c) 2024-2026 Augustus Otu and Contributors). Modified
// for Kollektiv: transitions blend two already-transformed RenderLayers
// drawn straight onto the destination canvas instead of pre-rendered
// CanvasImageSource frames on a scratch canvas.
import type { ComposedFrame, Effect, Renderer, RenderLayer, TextStyle, Transform } from '../types';
import { resolvePixelEffects, applyPixelEffectSteps, resolveFitDimensions } from './pixel-effects';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function getContext2D(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D | null {
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    return canvas.getContext('2d', { willReadFrequently: true });
  }
  return (canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true });
}

/** Lazily-created, resized-as-needed scratch canvas for the colorGrade/chromaKey
 *  pixel path — one per Canvas2DRenderer instance, reused across layers and
 *  frames (never created in the constructor: jsdom's getContext returns null). */
interface ScratchCanvas {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: Ctx2D;
}

function getScratchCanvas(holder: { current: ScratchCanvas | null }, width: number, height: number): Ctx2D | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (holder.current && holder.current.canvas.width === w && holder.current.canvas.height === h) {
    return holder.current.ctx;
  }
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = getContext2D(canvas);
  if (!ctx) {
    holder.current = null;
    return null;
  }
  holder.current = { canvas, ctx };
  return ctx;
}

// Canvas2D-expressible effects only; unknown types (e.g. future GPU-only
// effects) are skipped here and picked up by the WebGPU renderer later.
const EFFECT_FILTERS: Record<string, (amount: number) => string> = {
  brightness: (a) => `brightness(${a})`,
  contrast: (a) => `contrast(${a})`,
  saturation: (a) => `saturate(${a})`,
  hue: (a) => `hue-rotate(${a}deg)`,
  blur: (a) => `blur(${a}px)`,
  grayscale: (a) => `grayscale(${a})`,
  sepia: (a) => `sepia(${a})`,
  invert: (a) => `invert(${a})`,
};

export function buildFilter(effects: Effect[]): string {
  const parts: string[] = [];
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const build = EFFECT_FILTERS[effect.type];
    if (!build) continue;
    const amount = effect.params.amount;
    parts.push(build(typeof amount === 'number' ? amount : 1));
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function isTextSource(source: RenderLayer['source']): source is { text: string; style: TextStyle } {
  return typeof source === 'object' && source !== null && 'text' in source;
}

function drawBitmap(
  ctx: Ctx2D,
  bitmap: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  fit: Transform['fit'],
  effects: Effect[],
  scratch: { current: ScratchCanvas | null },
): void {
  const { width, height } = resolveFitDimensions(fit, bitmap.width, bitmap.height, canvasWidth, canvasHeight);
  const steps = resolvePixelEffects(effects);

  if (steps.length === 0) {
    ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
    return;
  }

  const sctx = getScratchCanvas(scratch, width, height);
  if (!sctx || !scratch.current) {
    // No 2D context available for the scratch canvas — draw unprocessed
    // rather than dropping the layer.
    ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
    return;
  }

  const w = scratch.current.canvas.width;
  const h = scratch.current.canvas.height;
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(bitmap, 0, 0, w, h);
  const imageData = sctx.getImageData(0, 0, w, h);
  applyPixelEffectSteps(imageData, steps);
  sctx.putImageData(imageData, 0, 0);

  ctx.drawImage(scratch.current.canvas, -width / 2, -height / 2, width, height);
}

function drawText(ctx: Ctx2D, text: string, style: TextStyle): void {
  const lines = text.split('\n');
  ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.align;
  ctx.textBaseline = 'middle';

  const lineHeight = style.fontSize * 1.2;
  const totalHeight = lineHeight * lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = (i + 0.5) * lineHeight - totalHeight / 2;

    if (style.background) {
      const lineWidth = ctx.measureText(line).width;
      const pad = style.fontSize * 0.2;
      const boxX = style.align === 'left' ? 0 : style.align === 'right' ? -lineWidth : -lineWidth / 2;
      ctx.save();
      ctx.fillStyle = style.background;
      ctx.fillRect(boxX - pad, y - lineHeight / 2, lineWidth + pad * 2, lineHeight);
      ctx.restore();
    }

    if (style.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = style.fontSize * 0.15;
      ctx.shadowOffsetX = style.fontSize * 0.05;
      ctx.shadowOffsetY = style.fontSize * 0.05;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.fillStyle = style.color;
    ctx.fillText(line, 0, y);

    if (style.strokeColor && style.strokeWidth) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeText(line, 0, y);
    }
  }
}

function drawLayer(
  ctx: Ctx2D,
  layer: RenderLayer,
  canvasWidth: number,
  canvasHeight: number,
  scratch: { current: ScratchCanvas | null },
  extraAlpha = 1,
): void {
  const { source, transform, effects } = layer;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity)) * extraAlpha;
  ctx.filter = buildFilter(effects);
  ctx.translate(canvasWidth / 2 + transform.x, canvasHeight / 2 + transform.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  if (isTextSource(source)) drawText(ctx, source.text, source.style);
  else drawBitmap(ctx, source, canvasWidth, canvasHeight, transform.fit, effects, scratch);
  ctx.restore();
}

function drawTransition(
  ctx: Ctx2D,
  entry: ComposedFrame['transitions'][number],
  canvasWidth: number,
  canvasHeight: number,
  scratch: { current: ScratchCanvas | null },
): void {
  const { type, from, to } = entry;
  const p = Math.max(0, Math.min(1, entry.progress));
  const w = canvasWidth;
  const h = canvasHeight;

  switch (type) {
    case 'crossfade':
      drawLayer(ctx, from, w, h, scratch, 1 - p);
      drawLayer(ctx, to, w, h, scratch, p);
      break;

    case 'dip-black':
    case 'dip-white': {
      const color = type === 'dip-black' ? '#000000' : '#ffffff';
      if (p < 0.5) {
        drawLayer(ctx, from, w, h, scratch, 1 - p * 2);
        ctx.save();
        ctx.globalAlpha = p * 2;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 1 - (p - 0.5) * 2;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        drawLayer(ctx, to, w, h, scratch, (p - 0.5) * 2);
      }
      break;
    }

    case 'wipe-left':
    case 'wipe-right': {
      drawLayer(ctx, from, w, h, scratch, 1);
      ctx.save();
      ctx.beginPath();
      if (type === 'wipe-left') ctx.rect(0, 0, w * p, h);
      else ctx.rect(w * (1 - p), 0, w * p, h);
      ctx.clip();
      drawLayer(ctx, to, w, h, scratch, 1);
      ctx.restore();
      break;
    }

    case 'slide-left':
    case 'slide-right': {
      drawLayer(ctx, from, w, h, scratch, 1);
      const dx = type === 'slide-left' ? w * (1 - p) : -w * (1 - p);
      ctx.save();
      ctx.translate(dx, 0);
      drawLayer(ctx, to, w, h, scratch, 1);
      ctx.restore();
      break;
    }
  }
}

class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly ctx: Ctx2D;
  // Reusable colorGrade/chromaKey scratch canvas, lazily created on first use
  // and resized per layer as needed (see getScratchCanvas).
  private readonly scratch: { current: ScratchCanvas | null } = { current: null };

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, ctx: Ctx2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  drawFrame(frame: ComposedFrame): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = frame.background;
    ctx.fillRect(0, 0, width, height);

    for (const layer of frame.layers) drawLayer(ctx, layer, width, height, this.scratch);
    for (const transition of frame.transitions) drawTransition(ctx, transition, width, height, this.scratch);

    ctx.restore();
  }

  dispose(): void {
    // ponytail: the RAF loop and any listeners live outside this module; the
    // scratch canvas is GC'd with this instance, nothing to explicitly release.
    this.scratch.current = null;
  }
}

export function createRenderer(canvas: HTMLCanvasElement | OffscreenCanvas): Renderer {
  const ctx = getContext2D(canvas);
  if (!ctx) throw new Error('video-editor: failed to acquire a 2d context');
  return new Canvas2DRenderer(canvas, ctx);
}

export interface CreatePreferredRendererOptions {
  /** Try WebGPU first (default true). Set false to force Canvas2D. */
  preferWebGpu?: boolean;
}

/**
 * Tries WebGPU first (dynamically imported so the WGSL effect/transition
 * registries stay out of bundles that only need Canvas2D, e.g. export),
 * falling back to Canvas2D when unsupported, adapter/device creation fails,
 * or `preferWebGpu` is false.
 */
export async function createPreferredRenderer(
  canvas: HTMLCanvasElement,
  opts: CreatePreferredRendererOptions = {},
): Promise<Renderer> {
  const preferWebGpu = opts.preferWebGpu ?? true;
  if (preferWebGpu) {
    try {
      const { createWebGpuRenderer } = await import('../gpu/webgpu-renderer');
      const gpuRenderer = await createWebGpuRenderer(canvas);
      if (gpuRenderer) return gpuRenderer;
    } catch {
      // Fall through to Canvas2D below.
    }
  }
  return createRenderer(canvas);
}
