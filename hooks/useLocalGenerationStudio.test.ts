import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockBackend = {
  id: 'comfy',
  label: 'ComfyUI',
  isAvailable: vi.fn(async () => true),
  listModels: vi.fn(async () => ['sd15.safetensors']),
  listSamplers: vi.fn(async () => ['euler', 'dpmpp_2m']),
  generate: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,x', seed: 42, backendId: 'comfy' })),
};

// A1111 supports listLoras/listEmbeddings; ComfyUI (mockBackend above) does not —
// mirrors the optional interface methods in generationBackend.ts.
const mockA1111Backend = {
  id: 'a1111',
  label: 'A1111 / Forge Neo',
  isAvailable: vi.fn(async () => true),
  listModels: vi.fn(async () => ['sdxl.safetensors']),
  listSamplers: vi.fn(async () => ['Euler']),
  listLoras: vi.fn(async () => [{ name: 'add_detail', alias: 'add_detail' }]),
  listEmbeddings: vi.fn(async () => ['easynegative']),
  generate: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,x', seed: 42, backendId: 'a1111' })),
};

vi.mock('../services/generationBackend', () => ({
  getBackend: (id: string) => (id === 'comfy' ? mockBackend : id === 'a1111' ? mockA1111Backend : undefined),
}));
vi.mock('../services/comfyService', () => ({}));
vi.mock('../services/a1111Service', () => ({}));
vi.mock('../utils/galleryStorage', () => ({
  addItemToGallery: vi.fn(async () => ({ id: 'item-1' })),
}));

import { useLocalGenerationStudio } from './useLocalGenerationStudio';

const PARAMS = {
  prompt: 'a cat',
  negativePrompt: '',
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  seed: null,
  sampler: 'euler',
  model: '',
};

describe('useLocalGenerationStudio', () => {
  it('starts idle with no availability checked', () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.available).toBeNull();
  });

  it('checkAvailability reflects the backend result', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.checkAvailability({} as any); });
    expect(result.current.state.available).toBe(true);
  });

  it('refreshModels populates the model list', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.refreshModels({} as any); });
    expect(result.current.state.models).toEqual(['sd15.safetensors']);
  });

  it('refreshSamplers populates the sampler list', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.refreshSamplers({} as any); });
    expect(result.current.state.samplers).toEqual(['euler', 'dpmpp_2m']);
  });

  it('refreshSamplers shows loading state', async () => {
    let resolve!: (v: any) => void;
    mockBackend.listSamplers.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    act(() => { result.current.refreshSamplers({} as any); });
    expect(result.current.state.loadingSamplers).toBe(true);
    await act(async () => { resolve(['euler']); });
    expect(result.current.state.loadingSamplers).toBe(false);
  });

  it('refreshLoras is a no-op and never sets loadingLoras when the backend does not support it', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.refreshLoras({} as any); });
    expect(result.current.state.loras).toEqual([]);
    expect(result.current.state.loadingLoras).toBe(false);
  });

  it('refreshEmbeddings is a no-op when the backend does not support it', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.refreshEmbeddings({} as any); });
    expect(result.current.state.embeddings).toEqual([]);
    expect(result.current.state.loadingEmbeddings).toBe(false);
  });

  it('refreshLoras populates loras for a backend that supports it', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('a1111'));
    await act(async () => { await result.current.refreshLoras({} as any); });
    expect(result.current.state.loras).toEqual([{ name: 'add_detail', alias: 'add_detail' }]);
  });

  it('refreshEmbeddings populates embeddings for a backend that supports it', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('a1111'));
    await act(async () => { await result.current.refreshEmbeddings({} as any); });
    expect(result.current.state.embeddings).toEqual(['easynegative']);
  });

  it('generate goes idle -> generating -> done and ingests into the gallery', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.generate(PARAMS as any, {} as any); });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(result.current.state.resultUrl).toBe('data:image/png;base64,x');
    expect(result.current.state.resultSeed).toBe(42);
    expect(result.current.state.galleryItemId).toBe('item-1');
  });

  it('generate reports an error when the backend throws', async () => {
    mockBackend.generate.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.generate(PARAMS as any, {} as any); });
    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error).toBe('boom');
  });

  it('cancel aborts an in-flight generate without setting an error', async () => {
    (mockBackend.generate.mockImplementationOnce as any)(
      (_p: any, _s: any, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    let genPromise!: Promise<void>;
    act(() => { genPromise = result.current.generate(PARAMS as any, {} as any); });
    await waitFor(() => expect(result.current.state.phase).toBe('generating'));
    act(() => result.current.cancel());
    await act(async () => { await genPromise; });
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.error).toBeNull();
  });

  it('reset returns to the initial state', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.generate(PARAMS as any, {} as any); });
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.resultUrl).toBeNull();
  });
});
