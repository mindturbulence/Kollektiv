/**
 * Real-implementation tests for the token-validity logic (ISSUE-44).
 * Deliberately does NOT mock ./googleAuth or ./settingsStorage — every other
 * suite mocks both, so nothing else exercises the actual code path.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isGoogleAuthValid, isTokenExpired, markGoogleTokenInvalid } from './googleAuth';
import { loadLLMSettings, saveLLMSettings } from './settingsStorage';

const connectedIdentity = () => ({
  isConnected: true as const,
  email: 'test@example.com',
  accessToken: 'live-token',
  connectedAt: Date.now(),
  expiresAt: Date.now() + 3600_000,
});

describe('isTokenExpired', () => {
  it('treats expiresAt: 0 as expired-at-epoch, not as "unset"', () => {
    // Regression: a falsy check here fell through to the connectedAt heuristic,
    // so a freshly-connected identity read as still valid after invalidation.
    expect(isTokenExpired({ ...connectedIdentity(), expiresAt: 0 })).toBe(true);
  });

  it('falls back to connectedAt only when expiresAt is genuinely absent', () => {
    expect(isTokenExpired({ isConnected: true, connectedAt: Date.now() })).toBe(false);
    expect(isTokenExpired({ isConnected: true, connectedAt: Date.now() - 60 * 60_000 })).toBe(true);
  });
});

describe('markGoogleTokenInvalid', () => {
  beforeEach(() => localStorage.clear());

  it('makes a live-looking identity read as invalid', async () => {
    saveLLMSettings({ ...loadLLMSettings(), googleIdentity: connectedIdentity() });
    expect(isGoogleAuthValid(loadLLMSettings().googleIdentity)).toBe(true);

    await markGoogleTokenInvalid();

    expect(isGoogleAuthValid(loadLLMSettings().googleIdentity)).toBe(false);
  });

  it('keeps isConnected true so silent refresh is still attempted', async () => {
    saveLLMSettings({ ...loadLLMSettings(), googleIdentity: connectedIdentity() });
    await markGoogleTokenInvalid();
    expect(loadLLMSettings().googleIdentity?.isConnected).toBe(true);
  });
});
