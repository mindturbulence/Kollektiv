import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOllamaModels } from './ollamaService';
import type { LLMSettings } from '../types';

const baseSettings = (overrides: Partial<LLMSettings> = {}): LLMSettings =>
    ({
        geminiApiKey: '',
        llmModel: 'gemini-2.0-flash',
        activeLLM: 'ollama',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
        openrouterApiKey: '',
        openrouterModel: '',
        llamacppBaseUrl: 'http://localhost:8080',
        llamacppModel: 'default',
        llamacppApiKey: '',
        ollamaCloudBaseUrl: 'https://your-remote-ollama.com',
        ollamaCloudModel: '',
        ollamaCloudApiKey: '',
        ollamaCloudUseGoogleAuth: false,
        mcpServers: [],
        ...overrides,
    }) as LLMSettings;

describe('fetchOllamaModels', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('skips the fetch entirely when the base URL points at the public ollama.com registry', async () => {
        const settings = baseSettings({ ollamaBaseUrl: 'https://ollama.com/api/' });

        const models = await fetchOllamaModels(settings, false);

        expect(models).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips the fetch for ollama.com subdomains too (cloud variant)', async () => {
        const settings = baseSettings({ ollamaCloudBaseUrl: 'https://sub.ollama.com' });

        const models = await fetchOllamaModels(settings, true);

        expect(models).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('still fetches from a real cloud endpoint', async () => {
        fetchSpy.mockResolvedValue({
            ok: true,
            json: async () => ({ models: [{ name: 'llama3' }, { name: 'mistral' }] }),
        });
        const settings = baseSettings({ ollamaCloudBaseUrl: 'https://ollama.example.com' });

        const models = await fetchOllamaModels(settings, true);

        expect(models).toEqual(['llama3', 'mistral']);
        expect(fetchSpy).toHaveBeenCalledWith('https://ollama.example.com/api/tags', expect.anything());
    });

    it('routes a localhost:11434 base URL through the /ollama-local dev proxy', async () => {
        fetchSpy.mockResolvedValue({
            ok: true,
            json: async () => ({ models: [{ name: 'llama3' }] }),
        });

        const models = await fetchOllamaModels(baseSettings(), false);

        expect(models).toEqual(['llama3']);
        expect(fetchSpy).toHaveBeenCalledWith('/ollama-local/api/tags', expect.anything());
    });

    it('returns [] without throwing when the fetch fails (e.g. Ollama not running)', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const settings = baseSettings({ ollamaBaseUrl: 'http://127.0.0.1:11434' });

        const models = await fetchOllamaModels(settings, false);

        expect(models).toEqual([]);
    });
});
