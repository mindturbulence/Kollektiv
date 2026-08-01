/**
 * useLocalGenerationStudio — Async state machine for a dedicated
 * ComfyUI / A1111-Forge generation page: availability check, model list,
 * generate (with cancel), and gallery ingestion.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { getBackend, type LoraInfo, type ModuleInfo } from '../services/generationBackend';
// Side-effect imports: register the local generation backends in the registry
import '../services/comfyService';
import '../services/a1111Service';
import { addItemToGallery } from '../utils/galleryStorage';
import type { LLMSettings } from '../types';

export type StudioBackendId = 'comfy' | 'a1111';
export type StudioPhase = 'idle' | 'checking' | 'generating' | 'done' | 'error';

export interface StudioParams {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** null = let the backend randomize the seed. */
  seed: number | null;
  sampler: string;
  /** '' = let the backend pick a default checkpoint. */
  model: string;
  /** Pre-injected workflow JSON for custom workflows (ComfyUI only). */
  customWorkflowJson?: Record<string, any>;
  /** Extra CLIP/T5/VAE module filenames for split checkpoints (A1111/Forge only). */
  additionalModules?: string[];
}

export interface StudioState {
  phase: StudioPhase;
  /** null = not checked yet. */
  available: boolean | null;
  models: string[];
  loadingModels: boolean;
  samplers: string[];
  loadingSamplers: boolean;
  /** Empty when the backend doesn't support listLoras (e.g. ComfyUI). */
  loras: LoraInfo[];
  loadingLoras: boolean;
  /** Empty when the backend doesn't support listEmbeddings (e.g. ComfyUI). */
  embeddings: string[];
  loadingEmbeddings: boolean;
  /**
   * Available CLIP/T5/VAE module entries (Forge `/sdapi/v1/sd-modules`), each
   * typed by the directory it lives in. Empty when the backend doesn't support
   * listModules (ComfyUI) or the server doesn't expose the endpoint (vanilla A1111).
   */
  modules: ModuleInfo[];
  loadingModules: boolean;
  resultUrl: string | null;
  resultSeed: number | null;
  galleryItemId: string | null;
  error: string | null;
}

const INITIAL_STATE: StudioState = {
  phase: 'idle',
  available: null,
  models: [],
  loadingModels: false,
  samplers: [],
  loadingSamplers: false,
  loras: [],
  loadingLoras: false,
  embeddings: [],
  loadingEmbeddings: false,
  modules: [],
  loadingModules: false,
  resultUrl: null,
  resultSeed: null,
  galleryItemId: null,
  error: null,
};

export interface UseLocalGenerationStudioReturn {
  state: StudioState;
  checkAvailability: (settings: LLMSettings) => Promise<void>;
  refreshModels: (settings: LLMSettings) => Promise<void>;
  refreshSamplers: (settings: LLMSettings) => Promise<void>;
  refreshLoras: (settings: LLMSettings) => Promise<void>;
  refreshEmbeddings: (settings: LLMSettings) => Promise<void>;
  refreshModules: (settings: LLMSettings) => Promise<void>;
  generate: (params: StudioParams, settings: LLMSettings) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useLocalGenerationStudio(backendId: StudioBackendId): UseLocalGenerationStudioReturn {
  const [state, setState] = useState<StudioState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const update = useCallback((patch: Partial<StudioState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const checkAvailability = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) {
      update({ available: false });
      return;
    }
    update({ phase: 'checking' });
    const ok = await backend.isAvailable(settings);
    update({ available: ok, phase: 'idle' });
  }, [backendId, update]);

  const refreshModels = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) return;
    update({ loadingModels: true });
    const models = await backend.listModels(settings);
    update({ models, loadingModels: false });
  }, [backendId, update]);

  const refreshSamplers = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) return;
    update({ loadingSamplers: true });
    const samplers = await backend.listSamplers(settings);
    update({ samplers, loadingSamplers: false });
  }, [backendId, update]);

  const refreshLoras = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend?.listLoras) return;
    update({ loadingLoras: true });
    const loras = await backend.listLoras(settings);
    update({ loras, loadingLoras: false });
  }, [backendId, update]);

  const refreshEmbeddings = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend?.listEmbeddings) return;
    update({ loadingEmbeddings: true });
    const embeddings = await backend.listEmbeddings(settings);
    update({ embeddings, loadingEmbeddings: false });
  }, [backendId, update]);

  const refreshModules = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend?.listModules) return;
    update({ loadingModules: true });
    const modules = await backend.listModules(settings);
    update({ modules, loadingModules: false });
  }, [backendId, update]);

  const generate = useCallback(async (params: StudioParams, settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) {
      update({ phase: 'error', error: `Backend "${backendId}" is not registered.` });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    update({
      phase: 'generating',
      error: null,
      resultUrl: null,
      resultSeed: null,
      galleryItemId: null,
    });

    try {
      const output = await backend.generate(
        {
          prompt: params.prompt,
          negativePrompt: params.negativePrompt || undefined,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgScale: params.cfgScale,
          seed: params.seed ?? undefined,
          sampler: params.sampler || undefined,
          model: params.model || undefined,
          customWorkflowJson: params.customWorkflowJson,
          additionalModules: params.additionalModules,
        },
        settings,
        controller.signal,
      );

      const item = await addItemToGallery(
        'image',
        [output.dataUrl],
        [backend.label],
        undefined,
        undefined,
        [],
        undefined,
        params.prompt,
      );

      update({
        phase: 'done',
        resultUrl: output.dataUrl,
        resultSeed: output.seed ?? null,
        galleryItemId: item.id,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        update({ phase: 'idle', error: null });
        return;
      }
      update({ phase: 'error', error: err?.message || 'Generation failed.' });
    } finally {
      abortRef.current = null;
    }
  }, [backendId, update]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { state, checkAvailability, refreshModels, refreshSamplers, refreshLoras, refreshEmbeddings, refreshModules, generate, cancel, reset };
}
