/**
 * useGenerateLoop — State machine for the generate→ingest→compare loop.
 *
 * Phases:
 *   idle → refining → generating → ingesting → ready → (reset → idle)
 *     ↓         ↓            ↓            ↓
 *    error ←───┴────────────┴────────────┘
 */

import { useState, useRef, useCallback } from 'react';
import { enhancePromptStream, cleanLLMResponse, generateWithImagen, generateWithNanoBanana, generateWithVeo } from '../services/llmService';
import { getBackend } from '../services/generationBackend';
// Side-effect imports: register local generation backends in the registry
import '../services/comfyService';
import '../services/a1111Service';
import { addItemToGallery } from '../utils/galleryStorage';
import type { LLMSettings } from '../types';

export type GeneratePhase = 'idle' | 'refining' | 'generating' | 'ingesting' | 'ready' | 'error';

export interface GenerateLoopState {
  phase: GeneratePhase;
  /** The prompt text as it goes through refinement. */
  refinedPrompt: string;
  /** Data URL or blob URL of the generated media. */
  generatedUrl: string | null;
  /** 'image' or 'video'. */
  mediaType: 'image' | 'video';
  /** Gallery item id after ingestion, or null if auto-ingest is off. */
  galleryItemId: string | null;
  /** Error message if phase === 'error'. */
  error: string | null;
  /** 0–100 progress estimate. */
  progress: number;
  /** Status text shown alongside the progress bar. */
  statusMessage: string;
}

const INITIAL_STATE: GenerateLoopState = {
  phase: 'idle',
  refinedPrompt: '',
  generatedUrl: null,
  mediaType: 'image',
  galleryItemId: null,
  error: null,
  progress: 0,
  statusMessage: '',
};

export interface UseGenerateLoopReturn {
  state: GenerateLoopState;
  /** Start the generate loop from a raw prompt. */
  startGenerate: (params: {
    rawPrompt: string;
    constantModifier: string;
    targetAIModel: string;
    settings: LLMSettings;
    referenceImages: string[];
    /** Optional formatted catalog of available modifier options for richer refinements. */
    modifierCatalog?: string;
  }) => Promise<void>;
  /** Reset to idle. */
  reset: () => void;
  /** Whether generated media should be auto-ingested into the gallery. */
  autoIngest: boolean;
  setAutoIngest: (v: boolean) => void;
  /** A ref to the PREVIOUS generated result for comparison. */
  previousResult: GenerateLoopState | null;
}

export function useGenerateLoop(): UseGenerateLoopReturn {
  const [state, setState] = useState<GenerateLoopState>(INITIAL_STATE);
  const [autoIngest, setAutoIngest] = useState(true);
  const previousRef = useRef<GenerateLoopState | null>(null);

  const reset = useCallback(() => {
    previousRef.current = state.phase === 'ready' ? state : previousRef.current;
    setState(INITIAL_STATE);
  }, [state]);

  const startGenerate = useCallback(
    async (params: {
      rawPrompt: string;
      constantModifier: string;
      targetAIModel: string;
      settings: LLMSettings;
      referenceImages: string[];
      modifierCatalog?: string;
    }) => {
      const { rawPrompt, constantModifier, targetAIModel, settings, referenceImages, modifierCatalog } = params;

      // Preserve previous result for comparison
      setState((prev) => {
        if (prev.phase === 'ready' || prev.phase === 'error') {
          previousRef.current = prev;
        }
        return prev;
      });

      const update = (patch: Partial<GenerateLoopState>) =>
        setState((prev) => ({ ...prev, ...patch }));

      const isVeo = targetAIModel.toLowerCase().includes('veo');
      const mediaType: 'image' | 'video' = isVeo ? 'video' : 'image';

      try {
        // ── 1. REFINING ────────────────────────────────────────────
        update({
          phase: 'refining',
          progress: 5,
          statusMessage: 'Refining prompt...',
          error: null,
          generatedUrl: null,
          galleryItemId: null,
          mediaType,
        });

        const combinedPrompt = [rawPrompt, constantModifier].filter(Boolean).join('. ');
        let refinedPrompt = combinedPrompt;

        // Only run through the refiner if there's actual text to refine
        if (combinedPrompt.trim()) {
          let fullText = '';
          const stream = enhancePromptStream(
            rawPrompt,
            constantModifier,
            'MEDIUM',
            targetAIModel,
            {},
            settings,
            referenceImages,
            modifierCatalog || ''
          );
          for await (const chunk of stream) {
            fullText += chunk;
          }
          if (fullText.trim()) {
            if (fullText.includes('---PROMPT_BREAKDOWN---')) {
              refinedPrompt = fullText.split('---PROMPT_BREAKDOWN---')[0].trim();
            } else {
              refinedPrompt = cleanLLMResponse(fullText);
            }
          }
        }

        update({ refinedPrompt, progress: 30, statusMessage: 'Prompt refined.' });

        // ── 2. GENERATING ─────────────────────────────────────────
        update({ phase: 'generating', progress: 35, statusMessage: 'Generating media...' });

        let generatedUrl = '';
        const target = targetAIModel.toLowerCase();

        // Check for local generation backend (ComfyUI, A1111, etc.)
        const backendId = settings.generationBackendId;
        if (backendId && backendId !== 'cloud') {
          const backend = getBackend(backendId);
          if (!backend) {
            update({
              phase: 'error',
              error: `Generation backend "${backendId}" not found.`,
              progress: 0,
              statusMessage: 'Error',
            });
            return;
          }

          const available = await backend.isAvailable(settings);
          if (!available) {
            update({
              phase: 'error',
              error: `Generation backend "${backend.label}" is not available.`,
              progress: 0,
              statusMessage: 'Error',
            });
            return;
          }

          update({ statusMessage: `Generating via ${backend.label}...` });
          const output = await backend.generate(
            {
              prompt: refinedPrompt,
              negativePrompt: '',
              width: 1024,
              height: 1024,
              steps: 20,
              cfgScale: 7,
            },
            settings,
          );
          generatedUrl = output.dataUrl;
        } else if (target.includes('imagen')) {
          generatedUrl = await generateWithImagen(refinedPrompt, '1:1', settings);
        } else if (target.includes('nano banana')) {
          generatedUrl = await generateWithNanoBanana(refinedPrompt, referenceImages, '1:1', settings);
        } else if (target.includes('veo')) {
          generatedUrl = await generateWithVeo(refinedPrompt, (msg) => update({ statusMessage: msg }), '16:9', settings);
        } else {
          // Unsupported model — skip generation and just mark the refined prompt as ready
          update({ phase: 'ready', progress: 100, statusMessage: 'Prompt ready (model does not support direct generation).' });
          return;
        }

        update({ generatedUrl, progress: 75, statusMessage: 'Media generated.' });

        // ── 3. INGESTING ──────────────────────────────────────────
        if (autoIngest && generatedUrl) {
          update({ phase: 'ingesting', progress: 80, statusMessage: 'Saving to gallery...' });
          const item = await addItemToGallery(
            mediaType,
            [generatedUrl],
            ['Generate Loop'],
            undefined,
            undefined,
            [],
            undefined,
            refinedPrompt
          );
          update({ galleryItemId: item.id, progress: 95, statusMessage: 'Saved to gallery.' });
        }

        // ── 4. READY ──────────────────────────────────────────────
        update({ phase: 'ready', progress: 100, statusMessage: 'Complete.' });
      } catch (err: any) {
        update({
          phase: 'error',
          error: err?.message || 'Generation failed.',
          progress: 0,
          statusMessage: 'Error',
        });
      }
    },
    [autoIngest]
  );

  return {
    state,
    startGenerate,
    reset,
    autoIngest,
    setAutoIngest,
    previousResult: previousRef.current,
  };
}
