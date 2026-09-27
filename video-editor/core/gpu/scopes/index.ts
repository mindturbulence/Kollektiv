/// <reference types="@webgpu/types" />
// Thin wrapper over the ported freecut ScopeRenderer, exposing an ImageBitmap-in,
// canvas-out API instead of the raw GPUTexture/GPUCanvasContext plumbing.
import { ScopeRenderer } from './scope-renderer'

export type ScopeMode = number

export interface Scopes {
  /** Upload a new source frame. Call before any render*() call for that frame. */
  setSource(bitmap: ImageBitmap): void
  /** Draw the waveform scope into `canvas` (its own GPUCanvasContext is configured internally). */
  renderWaveform(canvas: HTMLCanvasElement | OffscreenCanvas, mode?: ScopeMode): boolean
  renderVectorscope(canvas: HTMLCanvasElement | OffscreenCanvas): boolean
  renderHistogram(canvas: HTMLCanvasElement | OffscreenCanvas, mode?: ScopeMode): boolean
  dispose(): void
}

// ponytail: one shared 2D scratch canvas to blit an ImageBitmap before GPU upload;
// resized in place rather than reallocated per frame.
class ScopesImpl implements Scopes {
  private scratch: OffscreenCanvas | null = null
  private scratchCtx: OffscreenCanvasRenderingContext2D | null = null
  private contexts = new WeakMap<HTMLCanvasElement | OffscreenCanvas, GPUCanvasContext>()

  constructor(private renderer: ScopeRenderer) {}

  private ctxFor(canvas: HTMLCanvasElement | OffscreenCanvas): GPUCanvasContext | null {
    let ctx = this.contexts.get(canvas)
    if (ctx) return ctx
    if (!(canvas instanceof HTMLCanvasElement)) return null
    ctx = this.renderer.configureCanvas(canvas) ?? undefined
    if (!ctx) return null
    this.contexts.set(canvas, ctx)
    return ctx
  }

  setSource(bitmap: ImageBitmap): void {
    if (!this.scratch || this.scratch.width !== bitmap.width || this.scratch.height !== bitmap.height) {
      this.scratch = new OffscreenCanvas(bitmap.width, bitmap.height)
      this.scratchCtx = this.scratch.getContext('2d')
    }
    if (!this.scratchCtx || !this.scratch) return
    this.scratchCtx.drawImage(bitmap, 0, 0)
    this.renderer.uploadFromCanvas(this.scratch)
  }

  renderWaveform(canvas: HTMLCanvasElement | OffscreenCanvas, mode: ScopeMode = 0): boolean {
    const ctx = this.ctxFor(canvas)
    if (!ctx) return false
    this.renderer.renderWaveforms([{ ctx, mode }])
    return true
  }

  renderVectorscope(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    const ctx = this.ctxFor(canvas)
    if (!ctx) return false
    this.renderer.renderVectorscope(ctx)
    return true
  }

  renderHistogram(canvas: HTMLCanvasElement | OffscreenCanvas, mode: ScopeMode = 0): boolean {
    const ctx = this.ctxFor(canvas)
    if (!ctx) return false
    this.renderer.renderHistogram(ctx, mode)
    return true
  }

  dispose(): void {
    this.renderer.destroy()
    this.scratch = null
    this.scratchCtx = null
  }
}

export async function createScopes(): Promise<Scopes | null> {
  const renderer = await ScopeRenderer.create()
  if (!renderer) return null
  return new ScopesImpl(renderer)
}
