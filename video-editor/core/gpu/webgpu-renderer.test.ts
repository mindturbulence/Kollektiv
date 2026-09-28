import { describe, expect, it } from 'vitest'
import { createWebGpuRenderer, drawTransformedLayer } from './webgpu-renderer'

describe('createWebGpuRenderer', () => {
  it('returns null when navigator.gpu is unavailable (jsdom has no WebGPU)', async () => {
    expect((navigator as { gpu?: unknown }).gpu).toBeUndefined()
    const canvas = document.createElement('canvas')
    const renderer = await createWebGpuRenderer(canvas)
    expect(renderer).toBeNull()
  })
})

describe('drawTransformedLayer', () => {
  it('fits, offsets, rotates, scales and clamps opacity like the Canvas2D renderer', () => {
    const calls: Array<[string, unknown[]]> = []
    const record = (name: string) => (...args: unknown[]) => { calls.push([name, args]) }
    const ctx = {
      globalAlpha: 1,
      save: record('save'), restore: record('restore'), translate: record('translate'),
      rotate: record('rotate'), scale: record('scale'), drawImage: record('drawImage'),
    } as unknown as CanvasRenderingContext2D
    // 320x180 source contained in a 1080x1920 canvas → 1080x607.5.
    const source = { width: 320, height: 180 } as ImageBitmap
    const layer = {
      source,
      transform: { x: 10, y: -20, scale: 2, rotation: 90, opacity: 1.7, fit: 'contain' as const },
      effects: [],
    }
    drawTransformedLayer(ctx, layer, source, 1080, 1920)
    expect(ctx.globalAlpha).toBe(1)
    expect(calls.find(c => c[0] === 'translate')?.[1]).toEqual([550, 940])
    expect(calls.find(c => c[0] === 'rotate')?.[1][0]).toBeCloseTo(Math.PI / 2)
    expect(calls.find(c => c[0] === 'scale')?.[1]).toEqual([2, 2])
    expect(calls.find(c => c[0] === 'drawImage')?.[1]).toEqual([source, -540, -303.75, 1080, 607.5])
  })
})
