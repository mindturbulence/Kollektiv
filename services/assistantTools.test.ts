import { describe, it, expect, vi } from 'vitest';
import { ASSISTANT_TOOLS, geminiToolDeclarations, ollamaToolDeclarations, fallbackProtocolPrompt } from './assistantTools';

describe('ASSISTANT_TOOLS', () => {
    it('includes get_weather tool', () => {
        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather');
        expect(tool).toBeDefined();
        expect(tool!.description).toContain('weather');
        expect(tool!.parameters.required).toContain('city');
        expect(tool!.parameters.properties.city).toBeDefined();
    });

    it('get_weather returns weather for a valid city', async () => {
        const mockResponse = '☀️ +22°C 15km/h 45%';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockResponse),
        });
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        const result = await tool.execute({ city: 'Tokyo' }, {} as any);
        expect(result).toContain('Tokyo');
        expect(result).toContain('☀️');
        expect(result).toContain('22°C');
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('wttr.in/Tokyo')
        );

        vi.unstubAllGlobals();
    });

    it('get_weather handles HTTP errors', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
        });
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        const result = await tool.execute({ city: 'Nowhere' }, {} as any);
        expect(result).toContain('Could not retrieve weather for Nowhere');

        vi.unstubAllGlobals();
    });

    it('get_weather handles network failures', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        const result = await tool.execute({ city: 'London' }, {} as any);
        expect(result).toContain('failed');
        expect(result).toContain('London');

        vi.unstubAllGlobals();
    });

    it('get_weather encodes special characters in city names', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('☁️ +10°C'),
        });
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        await tool.execute({ city: 'São Paulo,BR' }, {} as any);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(encodeURIComponent('São Paulo,BR'))
        );
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('wttr.in')
        );

        vi.unstubAllGlobals();
    });
});

describe('geminiToolDeclarations', () => {
    it('includes get_weather in Gemini declarations', () => {
        const decls = geminiToolDeclarations();
        const weather = decls.find(d => d.name === 'get_weather');
        expect(weather).toBeDefined();
        expect(weather!.description).toContain('weather');
        expect(weather!.parameters.type).toBe('OBJECT');
        expect(weather!.parameters.properties.city).toBeDefined();
        expect(weather!.parameters.required).toContain('city');
    });
});

describe('ollamaToolDeclarations', () => {
    it('includes get_weather in Ollama declarations', () => {
        const decls = ollamaToolDeclarations();
        const weather = decls.find(d => d.function.name === 'get_weather');
        expect(weather).toBeDefined();
        expect(weather!.function.description).toContain('weather');
    });
});

describe('fallbackProtocolPrompt', () => {
    it('lists get_weather in fallback prompt', () => {
        const prompt = fallbackProtocolPrompt('test persona');
        expect(prompt).toContain('get_weather');
        expect(prompt).toContain('city');
    });
});
