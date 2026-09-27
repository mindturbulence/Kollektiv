// Ported from freecut@4d62e80 src/infrastructure/gpu-transitions/types.ts — MIT, (c) 2025 FreeCut. Modified for Kollektiv.
// TransitionCategory inlined locally (freecut's `@/types/transition` is not part of this port).
export type TransitionCategory =
  | 'basic'
  | 'dissolve'
  | 'motion'
  | 'wipe'
  | 'slide'
  | 'flip'
  | 'mask'
  | 'iris'
  | 'shape'
  | 'light'
  | 'chromatic'
  | 'custom'

export interface GpuTransitionDefinition {
  id: string
  name: string
  category: TransitionCategory
  shader: string
  entryPoint: string
  /** Total uniform buffer size in bytes (must be multiple of 16) */
  uniformSize: number
  hasDirection: boolean
  directions?: string[]
  /** Pack progress + custom params into a Float32Array for the uniform buffer */
  packUniforms: (
    progress: number,
    width: number,
    height: number,
    direction: number,
    properties?: Record<string, unknown>,
  ) => Float32Array
}
