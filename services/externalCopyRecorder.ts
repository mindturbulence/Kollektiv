/**
 * External Copy Recorder — WP7 of the Adaptation Roadmap.
 *
 * When a prompt is copied/exported for an external service, records a
 * Generation with backendId 'external:<name>' so the copy-out workflow
 * becomes a first-class, tracked path.
 */

import { saveGeneration, createGeneration } from '../utils/generationStorage';
import type { GenerateParams } from './generationBackend';

/**
 * Record that a prompt was copied for an external service.
 * Creates a Generation record with empty resultItemIds and status 'ok'.
 */
export async function recordExternalCopy(params: {
  /** Name of the external service, e.g. 'midjourney', 'dall-e', 'flux'. */
  serviceName: string;
  /** The prompt text that was copied. */
  promptText: string;
  /** Negative prompt if applicable. */
  negativePromptText?: string;
  /** Target model name for context. */
  targetModel?: string;
  /** Any modifiers that were applied. */
  modifiers?: Record<string, any>;
}): Promise<string> {
  const genParams: GenerateParams = {
    prompt: params.promptText,
    negativePrompt: params.negativePromptText,
    width: 0,
    height: 0,
    steps: 0,
    cfgScale: 0,
    model: params.targetModel,
  };

  const gen = createGeneration({
    promptText: params.promptText,
    negativePromptText: params.negativePromptText,
    modifiers: params.modifiers,
    backendId: `external:${params.serviceName}`,
    params: genParams,
    status: 'ok',
  });

  await saveGeneration(gen);
  console.log(`[ExternalCopy] Recorded copy to ${params.serviceName} → ${gen.id}`);
  return gen.id;
}
