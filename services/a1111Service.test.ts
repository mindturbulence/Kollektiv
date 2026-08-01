import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBackend, _clearBackends, registerBackend } from './generationBackend';
import { a1111Backend, loraPromptName } from './a1111Service';

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
    expect(typeof backend.listModules).toBe('function');
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

  it('listLoras replaces degenerate ss_output_name aliases ("lora") with the filename-derived name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { name: 'good_lora', alias: 'good_lora', path: '/a', metadata: {} },
        { name: 'bad_lora', alias: 'lora', path: '/b', metadata: {} },
      ]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const loras = await backend.listLoras!({} as any);
    expect(loras).toEqual([
      { name: 'good_lora', alias: 'good_lora', path: '/a' },
      { name: 'bad_lora', alias: 'bad_lora', path: '/b' },
    ]);
  });

  it('listLoras resolves duplicate aliases to the filename-derived name, mirroring A1111 forbidden-alias behavior', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { name: 'lora_a', alias: 'shared_alias', path: '/a', metadata: {} },
        { name: 'lora_b', alias: 'shared_alias', path: '/b', metadata: {} },
      ]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const loras = await backend.listLoras!({} as any);
    expect(loras).toEqual([
      { name: 'lora_a', alias: 'shared_alias', path: '/a' },
      { name: 'lora_b', alias: 'lora_b', path: '/b' },
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

  it('listModules returns typed module entries derived from the filename directory', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { model_name: 'clip_l.safetensors', filename: 'C:/webui/models/CLIP/clip_l.safetensors' },
        { model_name: 't5xxl_fp16.safetensors', filename: 'C:/webui/models/text_encoder/t5xxl_fp16.safetensors' },
        { model_name: 'ae.safetensors', filename: 'C:/webui/models/text_encoder/ae.safetensors' },
        { model_name: 'sdxl_vae.safetensors', filename: 'C:/webui/models/VAE/sdxl_vae.safetensors' },
        { model_name: 'custom_te.safetensors', filename: 'D:/custom-mods/custom_te.safetensors' },
      ]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const modules = await backend.listModules!({} as any);
    expect(modules).toEqual([
      { name: 'clip_l.safetensors', type: 'clip' },
      { name: 't5xxl_fp16.safetensors', type: 'text_encoder' },
      { name: 'ae.safetensors', type: 'text_encoder' },
      { name: 'sdxl_vae.safetensors', type: 'vae' },
      { name: 'custom_te.safetensors', type: 'other' },
    ]);
  });

  it('listModules derives VAE type from a parent directory named vae (case-insensitive)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { model_name: 'kl-f8-anime2.safetensors', filename: 'C:/webui/models/VAE/kl-f8-anime2.safetensors' },
        { model_name: 'vae-ft-mse.safetensors', filename: 'C:/webui/models/vae/vae-ft-mse.safetensors' },
      ]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const modules = await backend.listModules!({} as any);
    expect(modules).toEqual([
      { name: 'kl-f8-anime2.safetensors', type: 'vae' },
      { name: 'vae-ft-mse.safetensors', type: 'vae' },
    ]);
  });

  it('listModules returns empty array when the endpoint is missing (vanilla A1111 404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));
    const backend = getBackend('a1111')!;
    const modules = await backend.listModules!({} as any);
    expect(modules).toEqual([]);
  });

  it('listModules returns empty array on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const backend = getBackend('a1111')!;
    const modules = await backend.listModules!({} as any);
    expect(modules).toEqual([]);
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

  it('listModules fetches the Forge-only /sdapi/v1/sd-modules endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ model_name: 'clip_l.safetensors', filename: '/x' }]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.listModules!({} as any);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('/a1111-local/sdapi/v1/sd-modules');
  });

  it('listModules treats a missing filename as type other', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ model_name: 'odd.safetensors' }]), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    const modules = await backend.listModules!({} as any);
    expect(modules).toEqual([{ name: 'odd.safetensors', type: 'other' }]);
  });
});

describe('loraPromptName', () => {
  it('returns a meaningful ss_output_name alias unchanged', () => {
    expect(loraPromptName('character_v3', 'char_v3')).toBe('char_v3');
  });

  it('falls back to the filename-derived name for the degenerate "lora" alias', () => {
    expect(loraPromptName('character_v3', 'lora')).toBe('character_v3');
    expect(loraPromptName('character_v3', 'LORA')).toBe('character_v3');
  });

  it('falls back to the filename-derived name for other generic aliases', () => {
    expect(loraPromptName('character_v3', 'lyco')).toBe('character_v3');
    expect(loraPromptName('character_v3', 'none')).toBe('character_v3');
    expect(loraPromptName('character_v3', 'Addams')).toBe('character_v3');
  });

  it('falls back to the filename-derived name for an empty or missing alias', () => {
    expect(loraPromptName('character_v3', '')).toBe('character_v3');
    expect(loraPromptName('character_v3', '   ')).toBe('character_v3');
    expect(loraPromptName('character_v3', undefined)).toBe('character_v3');
  });

  it('keeps a name of "lora" when the file itself is named lora (correctly resolves server-side)', () => {
    expect(loraPromptName('lora', 'lora')).toBe('lora');
  });
});
