// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { THEMES } from '../constants/themes';

// tailwind.config.js calls require() inside an ESM module, so parse it as text.
const configSrc = readFileSync(fileURLToPath(new URL('../tailwind.config.js', import.meta.url)), 'utf8');

// Later definitions win, matching DaisyUI's merge order.
const themeDefs = new Map<string, string>();
for (const m of configSrc.matchAll(/\{\s*"?([A-Za-z]+)"?:\s*\{([^{}]*)\}\s*,?\s*\}/g)) {
  themeDefs.set(m[1], m[2]);
}

// ponytail: hex only; oklch/hsl or missing tokens are skipped, not failed.
function hexToken(body: string, key: string): string | undefined {
  return body.match(new RegExp(`"?${key}"?:\\s*"(#[0-9a-fA-F]{6})"`))?.[1];
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linearize = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Ratchet: these currently fail primary vs base-100. Fixing one makes its
// "still fails" assertion break, forcing removal from this list.
const KNOWN_PRIMARY_FAILURES = new Set(['business', 'dark', 'MindTurbulence']);

const CHECKS = [
  { fg: 'primary', min: 4.5 },
  { fg: 'base-content', min: 7 },
] as const;

describe('theme contrast (WCAG)', () => {
  it('parses a definition for every selectable theme', () => {
    expect(THEMES.filter(t => !themeDefs.has(t))).toEqual([]);
  });

  for (const theme of THEMES) {
    for (const { fg, min } of CHECKS) {
      const body = themeDefs.get(theme) ?? '';
      const fgHex = hexToken(body, fg);
      const bgHex = hexToken(body, 'base-100');
      const knownFailure = fg === 'primary' && KNOWN_PRIMARY_FAILURES.has(theme);

      it.skipIf(!fgHex || !bgHex)(`${theme}: ${fg} on base-100 ${knownFailure ? `< ${min} (known)` : `>= ${min}`}`, () => {
        const ratio = contrastRatio(fgHex!, bgHex!);
        if (knownFailure) expect(ratio).toBeLessThan(min);
        else expect(ratio).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

// The page-scoped light theme of the Web Design Library: applied by data-theme="paper", never selectable.
describe('paper theme (Web Design Library) contrast', () => {
  const body = themeDefs.get('paper') ?? '';
  const token = (key: string) => hexToken(body, key) ?? '';
  const base = token('base-100');

  // What `text-base-content/60` renders as on the surface (alpha blend per channel).
  const mix = (fg: string, bg: string, alpha: number) =>
    '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');

  it('is defined, light, and not offered in the theme picker', () => {
    expect(body).toContain('"color-scheme": "light"');
    expect(base).toBe('#fcfcfc');
    expect(THEMES).not.toContain('paper');
  });

  it('base-content on base-100 >= 7', () => {
    expect(contrastRatio(token('base-content'), base)).toBeGreaterThanOrEqual(7);
  });

  it('primary-content on primary >= 7 (black primary button)', () => {
    expect(contrastRatio(token('primary-content'), token('primary'))).toBeGreaterThanOrEqual(7);
  });

  it('muted text (base-content at 60%) on base-100 and on base-200 >= 4.5', () => {
    expect(contrastRatio(mix(token('base-content'), base, 0.6), base)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mix(token('base-content'), token('base-200'), 0.6), token('base-200'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['info', 'success', 'warning', 'error'])('%s text on base-100 >= 4.5', (key) => {
    expect(contrastRatio(token(key), base)).toBeGreaterThanOrEqual(4.5);
  });
});
