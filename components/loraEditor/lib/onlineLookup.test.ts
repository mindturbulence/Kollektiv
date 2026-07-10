import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCivitAiData, getArcEnCielData, getModelDataByHash, isProxyAvailable } from './onlineLookup';

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('getCivitAiData', () => {
    it('returns null when hash is empty', async () => {
        expect(await getCivitAiData('')).toBeNull();
    });

    it('fetches by-hash then the model, and assembles a LookupResult', async () => {
        const byHash = { modelId: 111, id: 222 };
        const model = { name: 'Test Model' };
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => byHash })
            .mockResolvedValueOnce({ ok: true, json: async () => model }) as any;

        const result = await getCivitAiData('abc123');
        expect(result?.source).toBe('CivitAI');
        expect(result?.data.model).toEqual(model);
        expect(result?.modelUrl).toBe('https://civitai.com/models/111?modelVersionId=222');
    });

    it('returns null when the by-hash lookup 404s', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;
        expect(await getCivitAiData('abc123')).toBeNull();
    });
});

describe('getArcEnCielData', () => {
    it('returns null when hash is empty', async () => {
        expect(await getArcEnCielData('', null)).toBeNull();
    });

    it('routes through the proxy URL when provided', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 5 }] }) }) as any;
        await getArcEnCielData('abc123', 'https://proxy.example/?url=');
        const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
        expect(calledUrl.startsWith('https://proxy.example/?url=')).toBe(true);
        expect(calledUrl).toContain('arcenciel.io');
    });
});

describe('getModelDataByHash', () => {
    it('falls back to the secondary source when the primary finds nothing', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: false }) // civ by-hash miss
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 9 }] }) }) as any; // aec hit
        const result = await getModelDataByHash('hash', 'civ', 'aec', null);
        expect(result?.source).toBe('Arc En Ciel');
    });

    it('returns null when both lookups are disabled', async () => {
        const result = await getModelDataByHash('hash', '', '', null);
        expect(result).toBeNull();
    });
});

describe('isProxyAvailable', () => {
    it('returns true when the proxy responds ok', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
        expect(await isProxyAvailable('https://proxy.example/?url=')).toBe(true);
    });
    it('returns false on network error', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;
        expect(await isProxyAvailable('https://proxy.example/?url=')).toBe(false);
    });
});
