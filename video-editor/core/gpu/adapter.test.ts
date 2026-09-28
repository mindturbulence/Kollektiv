import { describe, expect, it } from 'vitest'
import type { Effect, TransitionType } from '../types'
import { resolveGpuEffect, resolveGpuEffectParams, resolveGpuTransition } from './adapter'
import { GPU_EFFECT_REGISTRY } from './effects/registry'
import { GPU_TRANSITION_REGISTRY } from './transitions/registry'

function makeEffect(type: string, params: Effect['params'] = {}): Effect {
  return { id: 'e1', type, params, enabled: true }
}

describe('gpu effect registry', () => {
  it('registers every effect with non-empty WGSL and valid default params', () => {
    expect(GPU_EFFECT_REGISTRY.size).toBeGreaterThan(0)
    for (const [id, def] of GPU_EFFECT_REGISTRY) {
      expect(def.id).toBe(id)
      expect(typeof def.shader).toBe('string')
      expect(def.shader.trim().length).toBeGreaterThan(0)
      expect(def.shader).toContain(def.entryPoint)
      for (const [key, param] of Object.entries(def.params)) {
        expect(param.default).not.toBeUndefined()
        expect(['number', 'boolean', 'select', 'color', 'point', 'json', 'text']).toContain(param.type)
        void key
      }
    }
  })
})

describe('gpu transition registry', () => {
  it('registers every transition with non-empty WGSL and packUniforms', () => {
    expect(GPU_TRANSITION_REGISTRY.size).toBeGreaterThan(0)
    for (const [id, def] of GPU_TRANSITION_REGISTRY) {
      expect(def.id).toBe(id)
      expect(def.shader.trim().length).toBeGreaterThan(0)
      expect(def.shader).toContain(def.entryPoint)
      const uniforms = def.packUniforms(0.5, 100, 100, 0, {})
      expect(uniforms).toBeInstanceOf(Float32Array)
      expect(uniforms.byteLength).toBeLessThanOrEqual(def.uniformSize)
    }
  })
})

describe('resolveGpuEffect', () => {
  it('maps bare registry keys to gpu-prefixed ids', () => {
    expect(resolveGpuEffect(makeEffect('brightness'))?.id).toBe('gpu-brightness')
    expect(resolveGpuEffect(makeEffect('vignette'))?.id).toBe('gpu-vignette')
    expect(resolveGpuEffect(makeEffect('lut'))?.id).toBe('gpu-lut')
  })

  it('applies documented aliases for ambiguous or renamed types', () => {
    expect(resolveGpuEffect(makeEffect('blur'))?.id).toBe('gpu-gaussian-blur')
    expect(resolveGpuEffect(makeEffect('chromaKey'))?.id).toBe('gpu-chroma-key')
    expect(resolveGpuEffect(makeEffect('grayscale'))?.id).toBe('gpu-grayscale')
  })

  it('returns undefined for unknown effect types', () => {
    expect(resolveGpuEffect(makeEffect('not-a-real-effect'))).toBeUndefined()
  })

  it('fills in missing params from the gpu effect defaults', () => {
    const params = resolveGpuEffectParams(makeEffect('brightness', {}))
    expect(params.amount).not.toBeUndefined()
  })

  it('lets explicit params override defaults', () => {
    const params = resolveGpuEffectParams(makeEffect('brightness', { amount: 0.75 }))
    expect(params.amount).toBe(0.75)
  })
})

describe('resolveGpuTransition', () => {
  const types: TransitionType[] = [
    'crossfade',
    'dip-black',
    'dip-white',
    'wipe-left',
    'wipe-right',
    'slide-left',
    'slide-right',
  ]

  it('maps every TransitionType to a registered freecut transition', () => {
    for (const type of types) {
      const resolved = resolveGpuTransition(type)
      expect(resolved, `expected a mapping for ${type}`).toBeDefined()
      expect(GPU_TRANSITION_REGISTRY.has(resolved!.def.id)).toBe(true)
    }
  })

  it('dips to black and white via dipToColorDissolve color properties', () => {
    expect(resolveGpuTransition('dip-black')?.properties?.color).toEqual([0, 0, 0])
    expect(resolveGpuTransition('dip-white')?.properties?.color).toEqual([1, 1, 1])
  })

  it('carries direction for wipe and slide variants', () => {
    expect(resolveGpuTransition('wipe-left')?.direction).toBe('from-left')
    expect(resolveGpuTransition('wipe-right')?.direction).toBe('from-right')
    expect(resolveGpuTransition('slide-left')?.direction).toBe('from-left')
    expect(resolveGpuTransition('slide-right')?.direction).toBe('from-right')
  })
})
