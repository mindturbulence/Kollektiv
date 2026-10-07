import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMSettings } from '../types';

const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generateContent };
  },
}));
vi.mock('../utils/settingsStorage', () => ({ trackTokenUsage: vi.fn() }));

import { generateDesignSpecGemini } from './geminiService';

const settings = { activeLLM: 'gemini', geminiApiKey: 'test-key' } as LLMSettings;

describe('generateDesignSpecGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends every image with its own MIME type, then the instruction, with 8192 output tokens and no thinking', async () => {
    sdk.generateContent.mockResolvedValue({ text: '---\nname: x\n---' });
    const out = await generateDesignSpecGemini(
      [{ data: 'AAA', mimeType: 'image/jpeg' }, { data: 'BBB', mimeType: 'image/png' }],
      'SYSTEM PROMPT',
      settings,
    );
    expect(out).toBe('---\nname: x\n---');
    const req = sdk.generateContent.mock.calls[0][0];
    expect(req.contents).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } },
      { inlineData: { mimeType: 'image/png', data: 'BBB' } },
      { text: expect.any(String) },
    ]);
    expect(req.config).toEqual({ systemInstruction: 'SYSTEM PROMPT', maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } });
  });

  it('returns empty text as empty (the caller rejects it) and maps SDK errors to thrown Errors', async () => {
    sdk.generateContent.mockResolvedValue({});
    await expect(generateDesignSpecGemini([], 'S', settings)).resolves.toBe('');
    sdk.generateContent.mockRejectedValue(new Error('quota exceeded'));
    await expect(generateDesignSpecGemini([], 'S', settings)).rejects.toThrow(/quota/i);
  });

  it('throws an actionable error when no Gemini key is set', async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(generateDesignSpecGemini([], 'S', { activeLLM: 'gemini', geminiApiKey: '' } as LLMSettings))
        .rejects.toThrow('Failed to extract a design spec with Gemini: GEMINI_API_KEY is missing. Add it in Setup -> LLM -> Gemini API Key');
      expect(sdk.generateContent).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });
});
