import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOllamaModels, generateDesignSpecOllama } from './ollamaService';
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

describe('generateDesignSpecOllama', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    const images = [{ data: 'AAA', mimeType: 'image/jpeg' }, { data: 'BBB', mimeType: 'image/png' }];
    const fail = (status: number, body: string) => ({ ok: false, status, text: async () => body });

    beforeEach(() => {
        fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('posts all images to the configured model with 8192 output tokens', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'SPEC' } }) });
        const out = await generateDesignSpecOllama(images, 'SYS', baseSettings({ ollamaModel: 'qwen2.5vl:7b' }));
        expect(out).toBe('SPEC');
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('/ollama-local/api/chat');
        const body = JSON.parse(init.body);
        expect(body.model).toBe('qwen2.5vl:7b');
        expect(body.stream).toBe(false);
        expect(body.options.num_predict).toBe(8192);
        expect(body.options.num_ctx).toBeGreaterThanOrEqual(16384);
        expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
        expect(body.messages[1].images).toEqual(['AAA', 'BBB']);
        expect(body.messages[1].content).toBeTruthy();
    });

    it('tells the user to pick a vision model when the model cannot take images', async () => {
        fetchSpy.mockResolvedValue(fail(500, JSON.stringify({ error: 'this model is missing data required for image input' })));
        await expect(generateDesignSpecOllama(images, 'SYS', baseSettings())).rejects.toThrow(/"llama3" cannot read images\. Pick a vision-capable model/);
    });

    it('keeps the real message for other failures, e.g. a model that is not pulled', async () => {
        fetchSpy.mockResolvedValue(fail(404, JSON.stringify({ error: 'model "llama3.2-vision" not found, try pulling it first' })));
        await expect(generateDesignSpecOllama(images, 'SYS', baseSettings())).rejects.toThrow('Ollama returned 404: model "llama3.2-vision" not found, try pulling it first');
    });

    it('fails before any request when no model is configured', async () => {
        await expect(generateDesignSpecOllama(images, 'SYS', baseSettings({ ollamaModel: '' }))).rejects.toThrow(/not configured/);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('maps a network failure to an actionable message', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(generateDesignSpecOllama(images, 'SYS', baseSettings())).rejects.toThrow(/network error.*Ollama/i);
    });
});
