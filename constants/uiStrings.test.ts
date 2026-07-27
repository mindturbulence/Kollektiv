import { describe, it, expect } from 'vitest';
import { UI_STRINGS } from './uiStrings';

describe('uiStrings', () => {
  it('exposes canonical user-facing messages', () => {
    expect(UI_STRINGS.googleNotConnected).toMatch(/Google Identity/);
    expect(UI_STRINGS.googleSessionExpired).toMatch(/Google session/i);
    expect(UI_STRINGS.googleConnectFirst).toMatch(/Google account/i);
    expect(UI_STRINGS.proxyTargetNotAllowed).toMatch(/allowlist/i);
  });

  it('all values are non-empty strings', () => {
    for (const [key, value] of Object.entries(UI_STRINGS)) {
      expect(typeof value, `${key} is a string`).toBe('string');
      expect(value.length, `${key} is non-empty`).toBeGreaterThan(0);
    }
  });
});
