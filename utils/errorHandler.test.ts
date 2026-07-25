import { describe, it, expect } from 'vitest';
import {
  AppError,
  NetworkError,
  AuthError,
  ProviderError,
  StorageError,
  getErrorCode,
  getSuggestion,
  isRetryable,
  handleGeminiError,
} from './errorHandler';

describe('AppError class hierarchy', () => {
  it('AppError carries code, suggestion, retryable', () => {
    const err = new AppError('Something broke', 'MY_CODE', 'Try this', true);
    expect(err.message).toBe('Something broke');
    expect(err.code).toBe('MY_CODE');
    expect(err.suggestion).toBe('Try this');
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('AppError defaults to UNKNOWN_ERROR code', () => {
    const err = new AppError('msg');
    expect(err.code).toBe('UNKNOWN_ERROR');
    expect(err.suggestion).toBeUndefined();
    expect(err.retryable).toBeUndefined();
  });

  it('NetworkError is retryable by default', () => {
    const err = new NetworkError('fetch failed');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.retryable).toBe(true);
    expect(err).toBeInstanceOf(AppError);
  });

  it('AuthError is non-retryable by default', () => {
    const err = new AuthError('invalid key');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.retryable).toBe(false);
  });

  it('ProviderError is retryable by default', () => {
    const err = new ProviderError('model error');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('StorageError is non-retryable by default', () => {
    const err = new StorageError('disk full');
    expect(err.code).toBe('STORAGE_ERROR');
    expect(err.retryable).toBe(false);
  });
});

describe('getErrorCode', () => {
  it('returns AppError.code for AppError instances', () => {
    expect(getErrorCode(new AppError('x', 'MY_CODE'))).toBe('MY_CODE');
  });

  it('returns NETWORK_ERROR for fetch failures', () => {
    expect(getErrorCode(new Error('Failed to fetch'))).toBe('NETWORK_ERROR');
    expect(getErrorCode(new Error('NetworkError'))).toBe('NETWORK_ERROR');
    expect(getErrorCode(new Error('network error occurred'))).toBe('NETWORK_ERROR');
  });

  it('returns AUTH_ERROR for auth-related messages', () => {
    expect(getErrorCode(new Error('API key not valid'))).toBe('AUTH_ERROR');
    expect(getErrorCode(new Error('API key is missing'))).toBe('AUTH_ERROR');
    expect(getErrorCode(new Error('unauthorized'))).toBe('AUTH_ERROR');
  });

  it('returns RATE_LIMIT for quota/rate messages', () => {
    expect(getErrorCode(new Error('quota exceeded'))).toBe('RATE_LIMIT');
    expect(getErrorCode(new Error('rate limit'))).toBe('RATE_LIMIT');
    expect(getErrorCode(new Error('Too many requests'))).toBe('RATE_LIMIT');
  });

  it('returns TIMEOUT for timeout messages', () => {
    expect(getErrorCode(new Error('request timed out'))).toBe('TIMEOUT');
  });

  it('returns CONTENT_BLOCKED for safety messages', () => {
    expect(getErrorCode(new Error('content is blocked'))).toBe('CONTENT_BLOCKED');
    expect(getErrorCode(new Error('safety settings'))).toBe('CONTENT_BLOCKED');
  });

  it('returns PARSE_ERROR for JSON/parse messages', () => {
    expect(getErrorCode(new Error('JSON parse error'))).toBe('PARSE_ERROR');
    expect(getErrorCode(new Error('invalid response'))).toBe('PARSE_ERROR');
  });

  it('returns UNKNOWN_ERROR for unrecognized errors', () => {
    expect(getErrorCode(new Error('something else'))).toBe('UNKNOWN_ERROR');
    expect(getErrorCode('string error')).toBe('UNKNOWN_ERROR');
    expect(getErrorCode(42)).toBe('UNKNOWN_ERROR');
    expect(getErrorCode(null)).toBe('UNKNOWN_ERROR');
  });
});

describe('getSuggestion', () => {
  it('returns AppError.suggestion when present', () => {
    expect(getSuggestion(new AppError('x', 'C', 'Do this'))).toBe('Do this');
  });

  it('returns undefined for AppError without suggestion', () => {
    expect(getSuggestion(new AppError('x'))).toBeUndefined();
  });

  it('returns suggestion for known network errors', () => {
    const sug = getSuggestion(new Error('Failed to fetch'));
    expect(sug).toBeTruthy();
    expect(sug!.length).toBeGreaterThan(5);
  });

  it('returns undefined for unrecognized errors', () => {
    expect(getSuggestion(new Error('weird thing'))).toBeUndefined();
    expect(getSuggestion('hello')).toBeUndefined();
  });
});

describe('isRetryable', () => {
  it('uses AppError.retryable when defined', () => {
    expect(isRetryable(new AppError('x', 'C', undefined, true))).toBe(true);
    expect(isRetryable(new AppError('x', 'C', undefined, false))).toBe(false);
  });

  it('returns true for network/timeout/parse errors', () => {
    expect(isRetryable(new Error('Failed to fetch'))).toBe(true);
    expect(isRetryable(new Error('timed out'))).toBe(true);
    expect(isRetryable(new Error('json parse'))).toBe(true);
  });

  it('returns false for auth/content-blocked errors', () => {
    expect(isRetryable(new Error('API key not valid'))).toBe(false);
    expect(isRetryable(new Error('content is blocked'))).toBe(false);
  });

  it('defaults to false for unrecognized errors', () => {
    expect(isRetryable(new Error('weird thing'))).toBe(false);
  });
});

describe('handleGeminiError', () => {
  it('returns a regular Error with a user-friendly message', () => {
    const result = handleGeminiError(new Error('quota exceeded'), 'generating images');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('quota');
  });

  it('returns a context-aware network error for Ollama', () => {
    const result = handleGeminiError(new Error('failed to fetch'), 'connecting to ollama');
    expect(result.message).toContain('OLLAMA_ORIGINS');
  });

  it('returns a context-aware network error for Gemini', () => {
    const result = handleGeminiError(new Error('failed to fetch'), 'gemini api call');
    expect(result.message).toContain('Gemini API Key');
  });
});
