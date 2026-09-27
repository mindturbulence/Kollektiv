import { describe, expect, it } from 'vitest'
import { createWebGpuRenderer } from './webgpu-renderer'

describe('createWebGpuRenderer', () => {
  it('returns null when navigator.gpu is unavailable (jsdom has no WebGPU)', async () => {
    expect((navigator as { gpu?: unknown }).gpu).toBeUndefined()
    const canvas = document.createElement('canvas')
    const renderer = await createWebGpuRenderer(canvas)
    expect(renderer).toBeNull()
  })
})
