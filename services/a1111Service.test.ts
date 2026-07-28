import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBackend, _clearBackends, registerBackend } from './generationBackend';
import { a1111Backend } from './a1111Service';

const MODELS_RESPONSE = [
  { title: 'SDXL\\eXcursion_XL.safetensors', model_name: 'SDXL_eXcursion_XL' },
  { title: 'Flux\\imzAITrinityQwen_v10.safetensors', model_name: 'Flux_imzAITrinityQwen_v10' },
];

describe('a1111Backend', () => {
  beforeEach(() => {
    _clearBackends();
    registerBackend(a1111Backend);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is registered in the backend registry', () => {
    expect(getBackend('a1111')).toBeDefined();
    expect(getBackend('a1111')?.id).toBe('a1111');
    expect(getBackend('a1111')?.label).toBe('A1111 / Forge Neo');
  });

  it('has the required interface methods', () => {
    const backend = getBackend('a1111')!;
    expect(typeof backend.isAvailable).toBe('function');
    expect(typeof backend.listModels).toBe('function');
    expect(typeof backend.generate).toBe('function');
  });

  it('isAvailable returns true when /sd-models responds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MODELS_RESPONSE), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await expect(backend.isAvailable({} as any)).resolves.toBe(true);
  });

  it('isAvailable returns false on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('a1111')!;
    await expect(backend.isAvailable({} as any)).resolves.toBe(false);
  });

  it('listModels returns model titles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MODELS_RESPONSE), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const models = await backend.listModels({} as any);
    expect(models).toEqual(['SDXL\\eXcursion_XL.safetensors', 'Flux\\imzAITrinityQwen_v10.safetensors']);
  });

  it('listModels returns empty array on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('a1111')!;
    const models = await backend.listModels({} as any);
    expect(models).toEqual([]);
  });

  it('generate returns a dataUrl with seed and backendId', async () => {
    const mockImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const mockInfo = JSON.stringify({ seed: 42 });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ images: [mockImageBase64], info: mockInfo }),
        { status: 200 },
      ),
    );

    const backend = getBackend('a1111')!;
    const result = await backend.generate(
      { prompt: 'test cat', steps: 10, cfgScale: 7, width: 512, height: 512 },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );

    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.seed).toBe(42);
    expect(result.backendId).toBe('a1111');
  });

  it('generate throws when /txt2img returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal error', { status: 500 }),
    );

    const backend = getBackend('a1111')!;
    await expect(
      backend.generate(
        { prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512 },
        { a1111Url: 'http://127.0.0.1:7860' } as any,
      ),
    ).rejects.toThrow(/A1111 generation failed/);
  });

  it('generate throws when no images returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: [] }), { status: 200 }),
    );

    const backend = getBackend('a1111')!;
    await expect(
      backend.generate(
        { prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512 },
        { a1111Url: 'http://127.0.0.1:7860' } as any,
      ),
    ).rejects.toThrow(/no images/);
  });
});
