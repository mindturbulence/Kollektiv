import { describe, it, expect } from 'vitest';
import { readDaisyTokens, DAISY_TOKEN_NAMES } from './daisyThemeTokens';

describe('readDaisyTokens', () => {
  it('reads DaisyUI OKLCH triplets off an element', () => {
    const el = document.createElement('div');
    el.style.setProperty('--p', '65.69% 0.196 275.75');
    el.style.setProperty('--b1', '100% 0 0');
    document.body.appendChild(el);

    const tokens = readDaisyTokens(el);

    expect(tokens.p).toBe('65.69% 0.196 275.75');
    expect(tokens.b1).toBe('100% 0 0');
  });

  it('omits tokens the active theme does not define', () => {
    const el = document.createElement('div');
    el.style.setProperty('--p', '50% 0.1 200');
    document.body.appendChild(el);

    const tokens = readDaisyTokens(el);

    expect(tokens.p).toBe('50% 0.1 200');
    expect('wa' in tokens).toBe(false);
  });

  it('covers every DaisyUI semantic slot the bridge maps', () => {
    expect(DAISY_TOKEN_NAMES).toContain('bc');
    expect(DAISY_TOKEN_NAMES).toContain('er');
    expect(DAISY_TOKEN_NAMES).toHaveLength(16);
  });
});
