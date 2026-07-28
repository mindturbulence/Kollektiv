/**
 * comfyService — ComfyUI generation backend adapter.
 *
 * Communicates via the /comfy-local proxy route. Uses polling over
 * /history/{prompt_id} rather than WebSocket (the prod CSP allows
 * http://localhost:* but not ws://localhost:*).
 *
 * POST /prompt → poll /history/{id} → GET /view → data URL
 */

import type { GenerateParams, GenerateOutput, GenerationBackend } from './generationBackend';
import type { LLMSettings } from '../types';
import { createDefaultWorkflow } from '../constants/comfyWorkflows';
import { registerBackend } from './generationBackend';

// ── Helpers ────────────────────────────────────────────────────────────

function comfyApiUrl(settings: LLMSettings): string {
  return settings.comfyUrl || 'http://127.0.0.1:8188';
}

function proxyUrl(settings: LLMSettings, path: string): string {
  // In the browser, use the proxy. In tests, use the direct URL.
  if (typeof window !== 'undefined') {
    return `/comfy-local${path}`;
  }
  return `${comfyApiUrl(settings)}${path}`;
}

/**
 * Poll /history/{prompt_id} until the output is ready or the timeout expires.
 */
async function pollForOutput(
  promptId: string,
  settings: LLMSettings,
  signal?: AbortSignal,
  timeoutMs = 120_000,
  intervalMs = 500,
): Promise<{ filename: string; subfolder: string }> {
  const deadline = Date.now() + timeoutMs;
  const url = proxyUrl(settings, `/history/${promptId}`);

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    await new Promise((r) => setTimeout(r, intervalMs));

    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      const history = data[promptId];
      if (!history?.outputs) continue;

      // ComfyUI /history returns outputs keyed by node id
      for (const nodeId of Object.keys(history.outputs)) {
        const output = history.outputs[nodeId];
        if (output.images && output.images.length > 0) {
          const img = output.images[0];
          return {
            filename: img.filename,
            subfolder: img.subfolder || '',
          };
        }
      }
    } catch {
      // Network error — retry
    }
  }

  throw new Error(`ComfyUI generation timed out after ${timeoutMs / 1000}s`);
}

/**
 * Fetch an image from /view and convert it to a data URL.
 */
async function fetchImageAsDataUrl(
  filename: string,
  subfolder: string,
  settings: LLMSettings,
  signal?: AbortSignal,
): Promise<string> {
  const params = new URLSearchParams({
    filename,
    subfolder,
    type: 'output',
  });
  const url = `${proxyUrl(settings, '/view')}?${params}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);

  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

// ── The adapter ──────────────────────────────────────────────────────

export const comfyBackend: GenerationBackend = {
  id: 'comfy',
  label: 'ComfyUI',

  async isAvailable(settings: LLMSettings): Promise<boolean> {
    try {
      const res = await fetch(proxyUrl(settings, '/system_stats'), {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(settings: LLMSettings): Promise<string[]> {
    try {
      const res = await fetch(proxyUrl(settings, '/queue'));
      if (!res.ok) return [];
      // ComfyUI doesn't have a simple models endpoint via the proxy
      // Return empty — model selection is configured in ComfyUI itself
      return [];
    } catch {
      return [];
    }
  },

  async generate(
    params: GenerateParams,
    settings: LLMSettings,
    signal?: AbortSignal,
  ): Promise<GenerateOutput> {
    // Build the default txt2img workflow
    const seed = params.seed ?? Math.floor(Math.random() * 2 ** 32);
    const workflow = createDefaultWorkflow({
      positivePrompt: params.prompt,
      negativePrompt: params.negativePrompt,
      seed,
      steps: params.steps,
      cfg: params.cfgScale,
      width: params.width,
      height: params.height,
    });

    // POST to /prompt
    const promptUrl = proxyUrl(settings, '/prompt');
    const res = await fetch(promptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `ComfyUI generation failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const data = await res.json();
    const promptId: string = data.prompt_id;
    if (!promptId) {
      throw new Error(`ComfyUI did not return a prompt_id: ${JSON.stringify(data)}`);
    }

    // Poll for the output
    const { filename, subfolder } = await pollForOutput(promptId, settings, signal);

    // Fetch the image as a data URL
    const dataUrl = await fetchImageAsDataUrl(filename, subfolder, settings, signal);

    return {
      dataUrl,
      seed,
      backendId: 'comfy',
    };
  },
};

// Self-register
registerBackend(comfyBackend);
