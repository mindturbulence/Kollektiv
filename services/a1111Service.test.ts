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

  it('generate strips an already-present data URI prefix from the image payload', async () => {
    const mockImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ images: [`data:image/png;base64,${mockImageBase64}`] }),
        { status: 200 },
      ),
    );

    const backend = getBackend('a1111')!;
    const result = await backend.generate(
      { prompt: 'test cat', steps: 10, cfgScale: 7, width: 512, height: 512 },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );

    expect(result.dataUrl).toBe(`data:image/png;base64,${mockImageBase64}`);
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

  it('generate sends override_settings when params.model is provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['aGVsbG8='], info: '{}' }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.generate(
      { prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512, model: 'SDXL\\eXcursion_XL.safetensors' },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.override_settings).toEqual({ sd_model_checkpoint: 'SDXL\\eXcursion_XL.safetensors' });
    expect(body.override_settings_restore_afterwards).toBe(false);
  });

  it('generate sends forge_additional_modules alongside the checkpoint for split models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['aGVsbG8='], info: '{}' }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.generate(
      {
        prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512,
        model: 'flux1-dev.safetensors',
        additionalModules: ['clip_l.safetensors', 't5xxl_fp16.safetensors', 'ae.safetensors'],
      },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.override_settings).toEqual({
      sd_model_checkpoint: 'flux1-dev.safetensors',
      forge_additional_modules: ['clip_l.safetensors', 't5xxl_fp16.safetensors', 'ae.safetensors'],
    });
    expect(body.override_settings_restore_afterwards).toBe(false);
  });

  it('generate sends forge_additional_modules even without a model override', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['aGVsbG8='], info: '{}' }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.generate(
      {
        prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512,
        additionalModules: ['clip_l.safetensors'],
      },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.override_settings).toEqual({ forge_additional_modules: ['clip_l.safetensors'] });
  });

  it('listSamplers returns sampler names from /sdapi/v1/samplers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { name: 'Euler' },
        { name: 'Euler a' },
        { name: 'DPM++ 2M Karras' },
      ]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const samplers = await backend.listSamplers({} as any);
    expect(samplers).toEqual(['Euler', 'Euler a', 'DPM++ 2M Karras']);
  });

  it('listSamplers returns empty array on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('a1111')!;
    const samplers = await backend.listSamplers({} as any);
    expect(samplers).toEqual([]);
  });

  it('listLoras returns name/alias pairs from /sdapi/v1/loras', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { name: 'pokemon_v3_offset', alias: 'pokemon_v3_offset', path: '/x', metadata: {} },
        { name: 'add_detail', path: '/y', metadata: {} },
      ]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const loras = await backend.listLoras!({} as any);
    expect(loras).toEqual([
      { name: 'pokemon_v3_offset', alias: 'pokemon_v3_offset', path: '/x' },
      { name: 'add_detail', alias: 'add_detail', path: '/y' },
    ]);
  });

  it('getLoraPreviewCandidates builds ordered thumbnail URLs matching find_preview()\'s suffix order', async () => {
    const { getLoraPreviewCandidates } = await import('./a1111Service');
    const candidates = getLoraPreviewCandidates('D:/models/Lora/add_detail.safetensors', { a1111Url: 'http://127.0.0.1:7860' } as any);
    const decoded = candidates.map((c) => decodeURIComponent(c));
    expect(decoded[0]).toBe('/a1111-local/sd_extra_networks/thumb?filename=D:/models/Lora/add_detail.png');
    expect(decoded[1]).toBe('/a1111-local/sd_extra_networks/thumb?filename=D:/models/Lora/add_detail.preview.png');
    expect(decoded).toHaveLength(10);
  });

  it('listLoras returns empty array on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('a1111')!;
    const loras = await backend.listLoras!({} as any);
    expect(loras).toEqual([]);
  });

  it('listEmbeddings returns loaded embedding names from /sdapi/v1/embeddings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        loaded: { 'easynegative': { shape: 768, vectors: 1 }, 'bad-hands-5': { shape: 768, vectors: 5 } },
        skipped: {},
      }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const embeddings = await backend.listEmbeddings!({} as any);
    expect(embeddings).toEqual(['easynegative', 'bad-hands-5']);
  });

  it('listEmbeddings returns empty array on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('a1111')!;
    const embeddings = await backend.listEmbeddings!({} as any);
    expect(embeddings).toEqual([]);
  });

  it('generate omits override_settings when no model is given', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['aGVsbG8='], info: '{}' }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.generate(
      { prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512 },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.override_settings).toBeUndefined();
  });
});
