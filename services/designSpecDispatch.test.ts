import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMSettings } from '../types';

const gemini = vi.hoisted(() => ({ generateDesignSpecGemini: vi.fn(async () => 'gemini-spec') }));
const ollama = vi.hoisted(() => ({ generateDesignSpecOllama: vi.fn(async () => 'ollama-spec') }));
vi.mock('./geminiService', () => gemini);
vi.mock('./ollamaService', () => ollama);
const chat = vi.hoisted(() => ({
  streamChatAnthropic: vi.fn<(...a: unknown[]) => AsyncGenerator<string>>(),
  streamChatOpenRouter: vi.fn<(...a: unknown[]) => AsyncGenerator<string>>(),
}));
vi.mock('./anthropicService', () => ({ streamChatAnthropic: chat.streamChatAnthropic }));
vi.mock('./openrouterService', () => ({ streamChatOpenRouter: chat.streamChatOpenRouter }));

import { generateDesignSpec, ProviderUnsupportedError } from './llmService';

const settingsFor = (activeLLM: LLMSettings['activeLLM']): LLMSettings => ({ activeLLM } as LLMSettings);
const images = [{ data: 'AAA', mimeType: 'image/jpeg' }];

describe('generateDesignSpec', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes Gemini to the Gemini helper with images, prompt and settings', async () => {
    const s = settingsFor('gemini');
    await expect(generateDesignSpec(images, 'SYS', s)).resolves.toBe('gemini-spec');
    expect(gemini.generateDesignSpecGemini).toHaveBeenCalledWith(images, 'SYS', s);
    expect(ollama.generateDesignSpecOllama).not.toHaveBeenCalled();
  });

  it.each(['ollama', 'ollama_cloud'] as const)('routes %s to the Ollama helper', async (p) => {
    await expect(generateDesignSpec(images, 'SYS', settingsFor(p))).resolves.toBe('ollama-spec');
    expect(gemini.generateDesignSpecGemini).not.toHaveBeenCalled();
  });

  it('rejects llamacpp with ProviderUnsupportedError naming the supported engines', async () => {
    const run = generateDesignSpec(images, 'SYS', settingsFor('llamacpp'));
    await expect(run).rejects.toBeInstanceOf(ProviderUnsupportedError);
    await expect(run).rejects.toThrow('Design spec is not available with the llamacpp engine (supported: gemini, ollama, anthropic, openrouter)');
    expect(gemini.generateDesignSpecGemini).not.toHaveBeenCalled();
    expect(ollama.generateDesignSpecOllama).not.toHaveBeenCalled();
  });
});

const gen = (...chunks: string[]) => async function* () { yield* chunks; };

describe('generateDesignSpec chat providers', () => {
  const expectedMessages = [
    { role: 'system', content: 'SYS' },
    {
      role: 'user',
      content: 'Extract the DESIGN.md as instructed.',
      attachments: [
        { data: 'data:image/jpeg;base64,AAA', mimeType: 'image/jpeg', fileName: 'reference-1' },
        { data: 'data:image/png;base64,BBB', mimeType: 'image/png', fileName: 'reference-2' },
      ],
    },
  ];
  const two = [{ data: 'AAA', mimeType: 'image/jpeg' }, { data: 'BBB', mimeType: 'image/png' }];
  const anthropicSettings = settingsFor('anthropic');
  const orSettings = (openrouterModel?: string) => ({ activeLLM: 'openrouter', openrouterModel } as LLMSettings);

  beforeEach(() => {
    chat.streamChatAnthropic.mockReset();
    chat.streamChatOpenRouter.mockReset();
  });

  it('anthropic: sends system+user with data-URL attachments and maxTokens 8192, concatenating chunks', async () => {
    chat.streamChatAnthropic.mockReturnValue(gen('# DE', 'SIGN')());
    await expect(generateDesignSpec(two, 'SYS', anthropicSettings)).resolves.toBe('# DESIGN');
    expect(chat.streamChatAnthropic).toHaveBeenCalledWith(expectedMessages, anthropicSettings, { maxTokens: 8192 });
    expect(gemini.generateDesignSpecGemini).not.toHaveBeenCalled();
  });

  it.each([
    ['System: Anthropic API Key is missing.', 'System: Anthropic API Key is missing.'],
    ['\n\n**Error calling Anthropic service:** boom', '**Error calling Anthropic service:** boom'],
    ['', 'The model returned no text for the design spec.'],
    ['  \n', 'The model returned no text for the design spec.'],
  ])('anthropic: provider error text %j throws instead of being returned as a spec', async (text, message) => {
    chat.streamChatAnthropic.mockReturnValue(gen(text)());
    await expect(generateDesignSpec(two, 'SYS', anthropicSettings)).rejects.toThrow(message);
  });

  it.each([undefined, '', '   ', 'openrouter/auto', ' OpenRouter/Auto '])('openrouter: refuses model %j before any stream call', async (model) => {
    await expect(generateDesignSpec(two, 'SYS', orSettings(model))).rejects.toThrow(/Pick a vision model.*Settings -> Integrations -> OpenRouter/);
    expect(chat.streamChatOpenRouter).not.toHaveBeenCalled();
  });

  it('openrouter: a specific model passes through with full data URLs and maxTokens 8192', async () => {
    const s = orSettings('google/gemini-2.5-flash');
    chat.streamChatOpenRouter.mockReturnValue(gen('# DE', 'SIGN')());
    await expect(generateDesignSpec(two, 'SYS', s)).resolves.toBe('# DESIGN');
    expect(chat.streamChatOpenRouter).toHaveBeenCalledWith(expectedMessages, s, { maxTokens: 8192 });
  });

  it('openrouter: System: and error text throw', async () => {
    const s = orSettings('google/gemini-2.5-flash');
    chat.streamChatOpenRouter.mockReturnValueOnce(gen('System: OpenRouter API Key is missing.')());
    await expect(generateDesignSpec(two, 'SYS', s)).rejects.toThrow('System: OpenRouter API Key is missing.');
    chat.streamChatOpenRouter.mockReturnValueOnce(gen('\n\n**Error calling OpenRouter:** 401')());
    await expect(generateDesignSpec(two, 'SYS', s)).rejects.toThrow('**Error calling OpenRouter:** 401');
  });
});
