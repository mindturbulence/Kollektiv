import { describe, it, expect } from 'vitest';
import { THEMES, getNextTheme } from './themes';

describe('getNextTheme', () => {
  it('returns the following theme in THEMES', () => {
    expect(getNextTheme(THEMES[0])).toBe(THEMES[1]);
  });

  it('wraps from the last theme back to the first', () => {
    expect(getNextTheme(THEMES[THEMES.length - 1])).toBe(THEMES[0]);
  });
});
