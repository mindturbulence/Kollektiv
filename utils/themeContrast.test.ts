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
