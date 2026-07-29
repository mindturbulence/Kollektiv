import { describe, it, expect } from 'vitest'
import {
  mapDaisyTokensToMcVars,
  isKollektivThemeMessage,
  KOLLEKTIV_THEME_MESSAGE_TYPE,
} from '../kollektiv-theme-map'

describe('mapDaisyTokensToMcVars', () => {
  it('wraps DaisyUI triplets in oklch() under Mission Control token names', () => {
    const vars = mapDaisyTokensToMcVars({ p: '65.69% 0.196 275.75' })
    expect(vars['--color-primary']).toBe('oklch(65.69% 0.196 275.75)')
  })

  it('maps the base surfaces to background, card and surface tokens', () => {
    const vars = mapDaisyTokensToMcVars({ b1: '100% 0 0', b2: '96% 0 0', b3: '92% 0 0' })
    expect(vars['--color-background']).toBe('oklch(100% 0 0)')
    expect(vars['--color-surface-0']).toBe('oklch(100% 0 0)')
    expect(vars['--color-surface-1']).toBe('oklch(96% 0 0)')
    expect(vars['--color-card']).toBe('oklch(96% 0 0)')
    expect(vars['--color-border']).toBe('oklch(92% 0 0)')
  })

  it('maps base-content to foreground', () => {
    const vars = mapDaisyTokensToMcVars({ bc: '27% 0.02 256' })
    expect(vars['--color-foreground']).toBe('oklch(27% 0.02 256)')
  })

  it('maps status colours', () => {
    const vars = mapDaisyTokensToMcVars({ er: '71% 0.22 22', su: '64% 0.15 160', wa: '84% 0.19 83', in: '72% 0.19 231' })
    expect(vars['--color-destructive']).toBe('oklch(71% 0.22 22)')
    expect(vars['--color-success']).toBe('oklch(64% 0.15 160)')
    expect(vars['--color-warning']).toBe('oklch(84% 0.19 83)')
    expect(vars['--color-info']).toBe('oklch(72% 0.19 231)')
  })

  it('emits nothing for tokens the theme did not define', () => {
    const vars = mapDaisyTokensToMcVars({ p: '50% 0.1 200' })
    expect(vars['--color-background']).toBeUndefined()
    expect(Object.keys(vars)).toEqual(['--color-primary'])
  })

  it('rejects values containing CSS injection characters', () => {
    const vars = mapDaisyTokensToMcVars({ p: '50% 0.1 200; background: url(evil)' })
    expect(vars['--color-primary']).toBeUndefined()
  })

  it('keeps muted-foreground legible on light DaisyUI themes (base-content, not neutral-content)', () => {
    // Light-theme-like input: near-white page background, dark body text, and a
    // near-white "neutral-content" (nc) — the DaisyUI role this used to be
    // wired to, which is unreadable against a light b1 background.
    const vars = mapDaisyTokensToMcVars({
      b1: '100% 0 0',
      bc: '27% 0.02 256',
      nc: '89.5% 0 0',
    })
    // muted-foreground must resolve from bc (dark, readable against b1), never nc.
    expect(vars['--color-muted-foreground']).toBe('oklch(27% 0.02 256)')
    expect(vars['--color-muted-foreground']).not.toBe('oklch(89.5% 0 0)')
  })
})

describe('isKollektivThemeMessage', () => {
  it('accepts a well-formed message', () => {
    expect(isKollektivThemeMessage({
      type: KOLLEKTIV_THEME_MESSAGE_TYPE,
      theme: 'pipboy',
      tokens: { p: '50% 0.1 200' },
    })).toBe(true)
  })

  it('rejects other message shapes', () => {
    expect(isKollektivThemeMessage({ type: 'something-else' })).toBe(false)
    expect(isKollektivThemeMessage(null)).toBe(false)
    expect(isKollektivThemeMessage({ type: KOLLEKTIV_THEME_MESSAGE_TYPE, tokens: 'nope' })).toBe(false)
  })
})
