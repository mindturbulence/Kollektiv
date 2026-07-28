/**
 * a1111Service — A1111 / Forge Neo generation backend adapter.
 *
 * Communicates via the /a1111-local proxy route. Uses the standard
 * AUTOMATIC1111 API:
 *   GET  /sdapi/v1/sd-models   → list checkpoints
 *   POST /sdapi/v1/txt2img     → generate images
 *   GET  /sdapi/v1/options     → read current settings
 *
 * Response from txt2img:
 *   { images: ["base64..."], parameters: "...", info: "{...}" }
 */

import type { GenerateParams, GenerateOutput, GenerationBackend } from './generationBackend';
import type { LLMSettings } from '../types';
import { registerBackend } from './generationBackend';

// ── Helpers ────────────────────────────────────────────────────────────

function proxyUrl(settings: LLMSettings, path: string): string {
  if (typeof window !== 'undefined') {
    return `/a1111-local${path}`;
  }
  return `${settings.a1111Url || 'http://127.0.0.1:7860'}${path}`;
}

// ── The adapter ──────────────────────────────────────────────────────

export const a1111Backend: GenerationBackend = {
  id: 'a1111',
  label: 'A1111 / Forge Neo',

  async isAvailable(settings: LLMSettings): Promise<boolean> {
    try {
      const res = await fetch(proxyUrl(settings, '/sdapi/v1/sd-models'), {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(settings: LLMSettings): Promise<string[]> {
    try {
      const res = await fetch(proxyUrl(settings, '/sdapi/v1/sd-models'), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const models: Array<{ title: string; model_name: string }> = await res.json();
      return models.map((m) => m.title || m.model_name);
    } catch {
      return [];
    }
  },

  async generate(
    params: GenerateParams,
    settings: LLMSettings,
    signal?: AbortSignal,
  ): Promise<GenerateOutput> {
    const seed = params.seed ?? Math.floor(Math.random() * 2 ** 32);
    const sampler = params.sampler || 'Euler';

    const body = {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || '',
      seed,
      steps: params.steps || 20,
      cfg_scale: params.cfgScale || 7,
      width: params.width || 1024,
      height: params.height || 1024,
      sampler_name: sampler,
      save_images: false,
      send_images: true,
    };

    const res = await fetch(proxyUrl(settings, '/sdapi/v1/txt2img'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `A1111 generation failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const data = await res.json();

    if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
      throw new Error(
        `A1111 returned no images: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }

    // The first image is the primary output — base64-encoded PNG
    const base64 = data.images[0];
    const dataUrl = `data:image/png;base64,${base64}`;

    // Parse info for the actual seed used
    let actualSeed = seed;
    if (data.info) {
      try {
        const info = JSON.parse(data.info);
        if (typeof info.seed === 'number') actualSeed = info.seed;
      } catch { /* ignore */ }
    }

    return {
      dataUrl,
      seed: actualSeed,
      backendId: 'a1111',
    };
  },
};

// Self-register
registerBackend(a1111Backend);
