import { describe, it, expect, vi } from 'vitest';

vi.mock('./geminiService');
vi.mock('./ollamaService');
vi.mock('./llamacppService');

import {
    cleanLLMResponse,
    buildMidjourneyParams,
    buildContextForEnhancer,
    getActiveProvider,
    stripReasoningTags,
    enhancePromptStream,
} from './llmService';
import { enhancePromptGeminiStream } from './geminiService';
import type { LLMSettings, PromptModifiers } from '../types';

async function* chunks(arr: string[]): AsyncGenerator<string> {
    for (const c of arr) yield c;
}

const collect = async (gen: AsyncGenerator<string>): Promise<string> => {
    let out = '';
    for await (const c of gen) out += c;
    return out;
};

describe('cleanLLMResponse', () => {
    it('strips <think> blocks and boilerplate opener lines', () => {
        const raw = '<think>internal reasoning</think>Here is your prompt:\nA neon city at dusk';
        expect(cleanLLMResponse(raw)).toBe('A neon city at dusk');
    });

    it('unwraps fenced code blocks and removes backticks', () => {
        const raw = '```json\n{"subject":"cat"}\n```';
        expect(cleanLLMResponse(raw)).toBe('{"subject":"cat"}');
    });

    it('strips leading list markers per line', () => {
        const raw = '1. first idea\n- second idea\n* third idea';
        expect(cleanLLMResponse(raw)).toBe('first idea\nsecond idea\nthird idea');
    });

    it('drops empty lines', () => {
        const raw = 'line one\n\n\nline two';
        expect(cleanLLMResponse(raw)).toBe('line one\nline two');
    });
});

describe('buildMidjourneyParams', () => {
    it('emits only non-default params, in canonical order', () => {
        const modifiers: PromptModifiers = {
            mjAspectRatio: '16:9',
            mjChaos: '0',        // default -> omitted
            mjStylize: '250',    // non-default -> included
            mjTile: true,
        };
        expect(buildMidjourneyParams(modifiers)).toBe('--ar 16:9 --s 250 --tile');
    });

    it('returns empty string for no modifiers', () => {
        expect(buildMidjourneyParams({})).toBe('');
    });
});

describe('buildContextForEnhancer', () => {
    it('returns empty string when no modifiers are set', () => {
        expect(buildContextForEnhancer({})).toBe('');
    });

    it('builds an [Architectural Constraints] block with labeled lines', () => {
        const out = buildContextForEnhancer({ artStyle: 'Cubism', lighting: 'Studio Lighting' });
        expect(out).toContain('[Architectural Constraints]');
        expect(out).toContain('Movement: Cubism');
        expect(out).toContain('Lighting: Studio Lighting');
    });

    it('describes film stock as authentic analog load only for analog cameras', () => {
        const analog = buildContextForEnhancer({ cameraType: 'Analog Film Camera', filmStock: 'Kodak Portra 400' });
        expect(analog).toContain('Authentic Analog Load: Kodak Portra 400 film stock');
        const digital = buildContextForEnhancer({ cameraType: 'DSLR', filmStock: 'Kodak Portra 400' });
        expect(digital).toContain('Digital Capture Post-Processed to Emulate: Kodak Portra 400 aesthetic');
    });

    it('only includes music fields when isAudio is true', () => {
        const mods: PromptModifiers = { musicGenre: 'Synthwave' };
        expect(buildContextForEnhancer(mods, false)).toBe('');
        expect(buildContextForEnhancer(mods, true)).toContain('Music Genre: Synthwave');
    });

    it('applies a modifier weight to the value on a weighting-capable target model', () => {
        const out = buildContextForEnhancer(
            { artStyle: 'Teal & Orange Blockbuster' },
            false,
            { artStyle: 1.35 },
            'Stable Diffusion XL',
        );
        expect(out).toContain('Movement: (Teal & Orange Blockbuster:1.35)');
    });

    it('leaves the value plain on a model with no token weighting (e.g. Flux)', () => {
        const out = buildContextForEnhancer(
            { artStyle: 'Teal & Orange Blockbuster' },
            false,
            { artStyle: 1.35 },
            'Flux.1 Dev',
        );
        expect(out).toContain('Movement: Teal & Orange Blockbuster');
        expect(out).not.toContain('1.35');
    });

    it('leaves the value plain when no weight was set for that modifier', () => {
        const out = buildContextForEnhancer({ artStyle: 'Cubism' }, false, {}, 'SDXL');
        expect(out).toContain('Movement: Cubism');
        expect(out).not.toMatch(/\(Cubism:/);
    });

    it('does not weight fields that have no slider (e.g. aspectRatio, zImageStyle)', () => {
        const out = buildContextForEnhancer(
            { aspectRatio: '16:9', zImageStyle: 'Vivid' },
            false,
            { aspectRatio: 1.5, zImageStyle: 1.5 },
            'SDXL',
        );
        expect(out).toContain('Aspect Ratio: 16:9');
        expect(out).toContain('Z-Image Variant: Vivid');
        expect(out).not.toContain('1.5');
    });
});

describe('enhancePromptStream — modifier weight wiring', () => {
    const settings = { activeLLM: 'gemini' } as LLMSettings;

    it('carries modifierWeights all the way into the text sent to the provider', async () => {
        vi.mocked(enhancePromptGeminiStream).mockImplementation(async function* (prompt: string) {
            yield prompt;
        });

        const stream = enhancePromptStream(
            'a city street',
            '',
            'Medium',
            'Stable Diffusion XL',
            { artStyle: 'Teal & Orange Blockbuster' },
            settings,
            undefined,
            undefined,
            undefined,
            { artStyle: 1.35 },
        );
        const out = await collect(stream);
        expect(out).toContain('(Teal & Orange Blockbuster:1.35)');
    });

    it('sends the plain token when no modifierWeights are passed (back-compat call sites)', async () => {
        vi.mocked(enhancePromptGeminiStream).mockImplementation(async function* (prompt: string) {
            yield prompt;
        });

        const stream = enhancePromptStream(
            'a city street',
            '',
            'Medium',
            'Stable Diffusion XL',
            { artStyle: 'Teal & Orange Blockbuster' },
            settings,
        );
        const out = await collect(stream);
        expect(out).toContain('Movement: Teal & Orange Blockbuster');
        expect(out).not.toContain('1.35');
    });
});

describe('getActiveProvider', () => {
    const base = { activeLLM: 'gemini' } as LLMSettings;
    it('collapses ollama_cloud to ollama', () => {
        expect(getActiveProvider({ ...base, activeLLM: 'ollama_cloud' })).toBe('ollama');
    });
    it('defaults to gemini', () => {
        expect(getActiveProvider(base)).toBe('gemini');
    });
    it('passes through anthropic, openrouter, llamacpp', () => {
        expect(getActiveProvider({ ...base, activeLLM: 'anthropic' })).toBe('anthropic');
        expect(getActiveProvider({ ...base, activeLLM: 'openrouter' })).toBe('openrouter');
        expect(getActiveProvider({ ...base, activeLLM: 'llamacpp' })).toBe('llamacpp');
    });
});

describe('stripReasoningTags', () => {
    it('removes a think block contained in a single chunk', async () => {
        const out = await collect(stripReasoningTags(chunks(['<think>x</think>result'])));
        expect(out).toBe('result');
    });

    it('removes a think block spanning multiple chunks', async () => {
        const out = await collect(stripReasoningTags(chunks(['<think>a', 'b</think>', 'result'])));
        expect(out).toBe('result');
    });

    it('passes through chunks without tags untouched', async () => {
        const out = await collect(stripReasoningTags(chunks(['hello ', 'world'])));
        expect(out).toBe('hello world');
    });
});
