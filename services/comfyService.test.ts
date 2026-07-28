import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBackend, _clearBackends, registerBackend } from './generationBackend';
import { comfyBackend } from './comfyService';

const MOCK_SYSTEM_STATS = { system: { os: 'windows', python_version: '3.12' } };

describe('comfyBackend', () => {
  beforeEach(() => {
    _clearBackends();
    registerBackend(comfyBackend);
    // Register a second backend to verify uniqueness
    const other = {
      id: 'comfy',
      label: 'other',
      isAvailable: async () => false,
      listModels: async () => ['m1'],
      generate: async () => ({ dataUrl: 'x', backendId: 'comfy' }),
    };
    registerBackend(other);
    _clearBackends();
    registerBackend(comfyBackend);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is registered in the backend registry', () => {
    expect(getBackend('comfy')).toBeDefined();
    expect(getBackend('comfy')?.id).toBe('comfy');
    expect(getBackend('comfy')?.label).toBe('ComfyUI');
  });

  it('has the required interface methods', () => {
    const backend = getBackend('comfy')!;
    expect(typeof backend.isAvailable).toBe('function');
    expect(typeof backend.listModels).toBe('function');
    expect(typeof backend.generate).toBe('function');
  });

  it('isAvailable returns true when /system_stats responds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_SYSTEM_STATS), { status: 200 }),
    );
    const backend = getBackend('comfy')!;
    await expect(backend.isAvailable({} as any)).resolves.toBe(true);
  });

  it('isAvailable returns false on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('comfy')!;
    await expect(backend.isAvailable({} as any)).resolves.toBe(false);
  });

  it('isAvailable returns false on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 502 }));
    const backend = getBackend('comfy')!;
    await expect(backend.isAvailable({} as any)).resolves.toBe(false);
  });

  it('listModels returns an empty array', async () => {
    const backend = getBackend('comfy')!;
    const models = await backend.listModels({} as any);
    expect(models).toEqual([]);
  });

  it('generate returns a dataUrl when the pipeline succeeds', async () => {
    const mockPromptId = 'test-prompt-123';
    const mockImageFilename = 'generated_0001.png';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, _init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('/prompt')) {
        return new Response(JSON.stringify({ prompt_id: mockPromptId }), { status: 200 });
      }

      if (urlStr.includes('/history/')) {
        return new Response(
          JSON.stringify({
            [mockPromptId]: {
              outputs: {
                '12': {
                  images: [{ filename: mockImageFilename, subfolder: '', type: 'output' }],
                },
              },
            },
          }),
          { status: 200 },
        );
      }

      if (urlStr.includes('/view')) {
        const blob = new Blob(['fake-image-data'], { type: 'image/png' });
        return new Response(blob, { status: 200 });
      }

      // /system_stats (isAvailable is NOT called directly by generate,
      // but we mock it for safety)
      if (urlStr.includes('/system_stats')) {
        return new Response(JSON.stringify(MOCK_SYSTEM_STATS), { status: 200 });
      }

      return new Response(null, { status: 404 });
    });

    const backend = getBackend('comfy')!;
    const result = await backend.generate(
      { prompt: 'test cat', width: 512, height: 512, steps: 10, cfgScale: 7 },
      { comfyUrl: 'http://127.0.0.1:8188' } as any,
    );

    expect(result.dataUrl).toBeTruthy();
    expect(result.dataUrl).toMatch(/^data:.*;base64,/);
    expect(result.backendId).toBe('comfy');
    expect(typeof result.seed).toBe('number');
  });

  it('generate throws when /prompt returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal error', { status: 500 }),
    );

    const backend = getBackend('comfy')!;
    await expect(
      backend.generate(
        { prompt: 'test', width: 512, height: 512, steps: 10, cfgScale: 7 },
        { comfyUrl: 'http://127.0.0.1:8188' } as any,
      ),
    ).rejects.toThrow(/ComfyUI generation failed/);
  });
});
