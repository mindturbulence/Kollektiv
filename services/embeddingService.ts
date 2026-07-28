/**
 * embeddingService — Local embedding via the Ollama bridge.
 *
 * Turns text into a vector through the existing /ollama-local proxy,
 * so CSP and proxy paths are inherited for free.
 *
 * Returns `null` rather than throwing when Ollama is unreachable —
 * semantic search is an enhancement; its absence must degrade silently to BM25.
 */

import type { LLMSettings } from '../types';
import { getOllamaConfig } from './ollamaService';

/**
 * Embed a single text string into a vector using the locally configured
 * Ollama embedding model.
 *
 * @returns A `number[]` vector on success, or `null` if Ollama is unreachable
 *          or the embedding fails for any reason.
 */
export async function embedText(
  text: string,
  settings: LLMSettings,
): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const model = settings.embeddingModel || 'all-minilm:33m';

  try {
    const config = getOllamaConfig(settings);
    if (!config.baseUrl) return null;

    const response = await fetch(`${config.baseUrl}/api/embed`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        model,
        input: trimmed,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length === 0) return null;

    return embeddings[0] as number[];
  } catch {
    return null;
  }
}

/**
 * Quick check whether the embedding endpoint is reachable.
 * Returns `true` if Ollama responds, `false` otherwise.
 */
export async function isEmbeddingAvailable(
  settings: LLMSettings,
): Promise<boolean> {
  const model = settings.embeddingModel || 'all-minilm:33m';

  try {
    const config = getOllamaConfig(settings);
    if (!config.baseUrl) return false;

    const response = await fetch(`${config.baseUrl}/api/embed`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        model,
        input: 'ping',
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
