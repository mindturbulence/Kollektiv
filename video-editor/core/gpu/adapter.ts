// Maps Kollektiv's Effect/TransitionType (core/types.ts) onto the ported
// freecut gpu-effects/gpu-transitions registries. Not itself a port of any
// single freecut file — new code for this repo.
import type { Effect, TransitionType } from '../types'
import { getGpuEffect, getGpuEffectDefaultParams } from './effects/registry'
import { getGpuTransition } from './transitions/registry'
import type { GpuEffectDefinition } from './effects/types'
import type { GpuTransitionDefinition } from './transitions/types'

/**
 * Effect.type -> freecut gpu effect id. Kollektiv's Effect.type is a bare
 * registry key (see core/types.ts Effect doc comment, e.g. 'brightness',
 * 'blur', 'lut'); freecut prefixes every id with `gpu-`. Names that don't
 * match a freecut effect 1:1 are picked deliberately below (documented);
 * anything else falls through to the `gpu-${type}` guess, which resolves
 * correctly for exact matches (e.g. 'gaussian-blur' -> 'gpu-gaussian-blur').
 */
const EFFECT_TYPE_ALIASES: Record<string, string> = {
  blur: 'gpu-gaussian-blur',
  chromaKey: 'gpu-chroma-key',
  'chroma-key': 'gpu-chroma-key',
  hue: 'gpu-hue-shift',
  hueShift: 'gpu-hue-shift',
  grayscale: 'gpu-grayscale',
  greyscale: 'gpu-grayscale',
}

export function resolveGpuEffect(effect: Effect): GpuEffectDefinition | undefined {
  const id = EFFECT_TYPE_ALIASES[effect.type] ?? `gpu-${effect.type}`
  return getGpuEffect(id) ?? getGpuEffect(effect.type)
}

/** Effect params merged onto the freecut definition's defaults (missing keys filled in). */
export function resolveGpuEffectParams(effect: Effect): Record<string, number | boolean | string> {
  const def = resolveGpuEffect(effect)
  if (!def) return effect.params
  const defaults = getGpuEffectDefaultParams(def.id)
  return { ...defaults, ...effect.params }
}

export interface ResolvedTransition {
  def: GpuTransitionDefinition
  direction?: string
  properties?: Record<string, unknown>
}

/**
 * TransitionType -> freecut gpu transition id + params. Kollektiv only has 7
 * built-in transition types (core/types.ts TransitionType); every one maps to
 * an existing freecut transition, so there are no unmapped types to report.
 *   - crossfade            -> dissolve (freecut's plain cross-dissolve)
 *   - dip-black / dip-white -> dipToColorDissolve with properties.color = [0,0,0] / [1,1,1]
 *   - wipe-left / wipe-right -> wipe with direction 'from-left' / 'from-right'
 *   - slide-left / slide-right -> slide with direction 'from-left' / 'from-right'
 */
export function resolveGpuTransition(type: TransitionType): ResolvedTransition | undefined {
  switch (type) {
    case 'crossfade': {
      const def = getGpuTransition('dissolve')
      return def ? { def } : undefined
    }
    case 'dip-black': {
      const def = getGpuTransition('dipToColorDissolve')
      return def ? { def, properties: { color: [0, 0, 0] } } : undefined
    }
    case 'dip-white': {
      const def = getGpuTransition('dipToColorDissolve')
      return def ? { def, properties: { color: [1, 1, 1] } } : undefined
    }
    case 'wipe-left': {
      const def = getGpuTransition('wipe')
      return def ? { def, direction: 'from-left' } : undefined
    }
    case 'wipe-right': {
      const def = getGpuTransition('wipe')
      return def ? { def, direction: 'from-right' } : undefined
    }
    case 'slide-left': {
      const def = getGpuTransition('slide')
      return def ? { def, direction: 'from-left' } : undefined
    }
    case 'slide-right': {
      const def = getGpuTransition('slide')
      return def ? { def, direction: 'from-right' } : undefined
    }
    default:
      return undefined
  }
}
