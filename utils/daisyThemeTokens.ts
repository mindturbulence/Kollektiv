/**
 * DaisyUI 4 exposes each theme's palette as OKLCH component triplets
 * (e.g. `--p: 65.69% 0.196 275.75`), consumed in CSS as `oklch(var(--p))`.
 * Reading the computed values lets any theme — all 43 registered in
 * tailwind.config.js — be forwarded without hand-porting definitions.
 */
export const DAISY_TOKEN_NAMES = [
  'p', 'pc',    // primary, primary-content
  's', 'sc',    // secondary, secondary-content
  'a', 'ac',    // accent, accent-content
  'n', 'nc',    // neutral, neutral-content
  'b1', 'b2', 'b3', // base surfaces, lightest to darkest
  'bc',         // base-content (body text)
  'in', 'su', 'wa', 'er', // info, success, warning, error
] as const;

export type DaisyTokens = Record<string, string>;

/**
 * Read the DaisyUI palette currently in effect on `el`.
 * Tokens the active theme leaves undefined are omitted rather than
 * emitted as empty strings, so consumers can fall back to their own defaults.
 */
export function readDaisyTokens(el: Element): DaisyTokens {
  const computed = getComputedStyle(el);
  const tokens: DaisyTokens = {};
  for (const name of DAISY_TOKEN_NAMES) {
    const value = computed.getPropertyValue(`--${name}`).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}
