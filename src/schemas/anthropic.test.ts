import { describe, it, expect } from 'vitest';
import { AnthropicRequestSchema } from './anthropic';

const base = { messages: [{ role: 'user' as const, content: 'hi' }] };

describe('AnthropicRequestSchema maxTokens', () => {
  it('accepts payloads without maxTokens', () => {
    const r = AnthropicRequestSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.maxTokens).toBeUndefined();
  });
  it('accepts valid maxTokens', () => {
    for (const maxTokens of [1, 8192, 16000]) {
      const r = AnthropicRequestSchema.safeParse({ ...base, maxTokens });
      expect(r.success && r.data.maxTokens).toBe(maxTokens);
    }
  });
  it('rejects 0, 99999 and non-integers', () => {
    for (const maxTokens of [0, 99999, 1.5]) {
      expect(AnthropicRequestSchema.safeParse({ ...base, maxTokens }).success).toBe(false);
    }
  });
});
