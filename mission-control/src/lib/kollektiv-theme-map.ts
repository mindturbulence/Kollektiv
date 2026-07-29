/**
 * Maps Kollektiv's DaisyUI 4 palette onto this app's Tailwind 4 theme tokens.
 *
 * Kollektiv publishes OKLCH component triplets (`65.69% 0.196 275.75`).
 * Tailwind 4 compiles the `@theme` block in app/globals.css to real custom
 * properties on :root, so overriding `--color-*` at runtime restyles every
 * utility that references them. Wrapping the triplet in `oklch()` avoids any
 * colour-space conversion — the values are used exactly as DaisyUI computed them.
 */

export const KOLLEKTIV_THEME_MESSAGE_TYPE = 'kollektiv:theme'

export type KollektivThemeMessage = {
  type: typeof KOLLEKTIV_THEME_MESSAGE_TYPE
  theme: string
  tokens: Record<string, string>
}

/** DaisyUI token name -> Mission Control CSS variable names it feeds. */
const TOKEN_MAP: Record<string, string[]> = {
  p: ['--color-primary'],
  pc: ['--color-primary-foreground'],
  s: ['--color-secondary'],
  sc: ['--color-secondary-foreground'],
  a: ['--color-accent'],
  ac: ['--color-accent-foreground'],
  b1: ['--color-background', '--color-surface-0'],
  b2: ['--color-card', '--color-popover', '--color-surface-1'],
  b3: ['--color-border', '--color-input', '--color-surface-2', '--color-muted'],
  bc: ['--color-foreground', '--color-card-foreground', '--color-popover-foreground', '--color-muted-foreground'],
  in: ['--color-info'],
  su: ['--color-success'],
  wa: ['--color-warning'],
  er: ['--color-destructive'],
}

/**
 * An OKLCH triplet: three space-separated numbers, the first a percentage,
 * optionally with a trailing alpha. Anything else is discarded rather than
 * interpolated into a style declaration.
 */
const SAFE_TRIPLET = /^-?[\d.]+%?\s+-?[\d.]+\s+-?[\d.]+(\s*\/\s*[\d.]+%?)?$/

export function mapDaisyTokensToMcVars(tokens: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [daisyName, cssVarNames] of Object.entries(TOKEN_MAP)) {
    const value = tokens[daisyName]
    if (!value || !SAFE_TRIPLET.test(value.trim())) continue
    for (const cssVar of cssVarNames) {
      vars[cssVar] = `oklch(${value.trim()})`
    }
  }
  return vars
}

export function isKollektivThemeMessage(data: unknown): data is KollektivThemeMessage {
  if (typeof data !== 'object' || data === null) return false
  const msg = data as Record<string, unknown>
  return (
    msg.type === KOLLEKTIV_THEME_MESSAGE_TYPE &&
    typeof msg.theme === 'string' &&
    typeof msg.tokens === 'object' &&
    msg.tokens !== null &&
    !Array.isArray(msg.tokens)
  )
}
