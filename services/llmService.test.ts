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

    it('keeps "- " bullets that follow a "Label:" line (Sora Actions)', () => {
        const raw = 'Scene text\nActions:\n- she turns\n- he nods\n- third\nMood: calm\n- stray';
        expect(cleanLLMResponse(raw)).toBe('Scene text\nActions:\n- she turns\n- he nods\n- third\nMood: calm\nstray');
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

    it('only includes voice/acoustics/mood fields when isAudio is true', () => {
        const mods: PromptModifiers = { voiceGender: 'Female', voiceTone: 'Warm', audioEnvironment: 'Studio', audioMood: 'Calm' };
        expect(buildContextForEnhancer(mods, false)).toBe('');
        const out = buildContextForEnhancer(mods, true);
        expect(out).toContain('Voice: Female');
        expect(out).toContain('Mood: Calm');
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

describe("enhancePromptStream — video Director's Script", () => {
    const settings = { activeLLM: 'gemini' } as LLMSettings;
    const run = async (model: string, modifiers: PromptModifiers, reply: string[]) => {
        let sys = '';
        vi.mocked(enhancePromptGeminiStream).mockImplementation(async function* (_p: string, _c: string, _s: unknown, system: string) {
            sys = system;
            for (const c of reply) yield c;
        });
        const out = await collect(enhancePromptStream('a woman crosses a street', '', 'Medium', model, modifiers, settings));
        return { sys, out };
    };

    it('timestamps dialect: header first, labeled beats in the system prompt, output untouched', async () => {
        const { sys, out } = await run('Kling 3.0 Pro / Turbo / Omni', { videoDuration: '6', aspectRatio: '9:16' }, ['0–3s: walks\n', '3–6s: stops\n']);
        expect(sys).toContain("DIRECTOR'S SCRIPT — TIMESTAMPED");
        expect(sys).not.toContain('STRICTLY FORBIDDEN in the output: timestamps');
        expect(out.startsWith('9:16 cinematic video. Total duration 6 seconds.\n0–3s: walks')).toBe(true);
    });

    it('prose dialect strips leaked labels from the stream', async () => {
        const { out } = await run('Google Veo 3.1', {}, ['Keyframe 2s: she turns\n', '0–3s: then smiles']);
        expect(out).toBe('she turns\nthen smiles');
    });

    it('a general video model gets the timestamp dialect, not the legacy ban', async () => {
        const { sys, out } = await run('Default (General Video)', { videoDuration: '10', videoAudio: 'direct', videoDialogue: 'Maya: "Go."' }, ['0–3s: x']);
        expect(sys).toContain("DIRECTOR'S SCRIPT — TIMESTAMPED");
        expect(sys).toContain('Maya: "Go."');
        expect(sys).not.toContain('[MOTION TIMELINE RULES]');
        expect(out.startsWith('cinematic video. Total duration 10 seconds.\n0–3s: x')).toBe(true);
    });

    it('non-video targets never get a director', async () => {
        const { sys } = await run('Stable Diffusion XL', { videoDuration: '10' }, ['x']);
        expect(sys).not.toContain("DIRECTOR'S SCRIPT");
    });
});

describe('enhancePromptStream — speech dialogue and narration rules', () => {
    const settings = { activeLLM: 'gemini' } as LLMSettings;
    const sysFor = async (model: string, audioType?: string) => {
        let sys = '';
        vi.mocked(enhancePromptGeminiStream).mockImplementation(async function* (_p: string, _c: string, _s: unknown, system: string) {
            sys = system;
            yield 'x';
        });
        await collect(enhancePromptStream('two friends argue', '', 'Medium', model, { audioType }, settings));
        return sys;
    };

    it('ElevenLabs dialogue uses named speakers with bracket tags', async () => {
        const sys = await sysFor('ElevenLabs v3 (TTS)', 'Dialogue / Speech');
        expect(sys).toContain('[DIALOGUE SCENE RULES]');
        expect(sys).toContain("'Name: [delivery tag] spoken words'");
    });
    it('Vibe Voice uses speaker ids, Kokoro-style plain models one block per speaker', async () => {
        expect(await sysFor('Vibe Voice', 'Dialogue / Speech')).toContain('Speaker 1:');
        expect(await sysFor('OpenAI Voice Engine', 'Dialogue / Speech')).toContain('one voice per request');
    });
    it('narration type gets the narration rule', async () => {
        expect(await sysFor('ElevenLabs v3 (TTS)', 'Narration / Voiceover')).toContain('[NARRATION RULES]');
    });
    it('no audio type, music and sfx models keep the generic rules', async () => {
        expect(await sysFor('ElevenLabs v3 (TTS)')).toContain('[SPEECH SCRIPT RULES]');
        expect(await sysFor('Suno v5 (Music)', 'Dialogue / Speech')).toContain('[MUSIC STRUCTURE RULES]');
        expect(await sysFor('MMAudio v2 (Sound FX)', 'Dialogue / Speech')).toContain('[SOUND DESIGN RULES]');
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
