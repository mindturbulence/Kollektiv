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

import type { GenerateParams, GenerateOutput, GenerationBackend, ModuleInfo, AdditionalModuleType } from './generationBackend';
import type { LLMSettings } from '../types';
import { registerBackend } from './generationBackend';

// ── Helpers ────────────────────────────────────────────────────────────

function proxyUrl(settings: LLMSettings, path: string): string {
  if (typeof window !== 'undefined') {
    return `/a1111-local${path}`;
  }
  return `${settings.a1111Url || 'http://127.0.0.1:7860'}${path}`;
}

// A1111's own extra-networks UI looks for a sibling preview image next to the
// model file, trying these suffixes in this exact order (modules/ui_extra_networks.py
// find_preview()): "<name>.<ext>" then "<name>.preview.<ext>" for each extension.
const PREVIEW_SUFFIXES = ['png', 'preview.png', 'jpg', 'preview.jpg', 'jpeg', 'preview.jpeg', 'webp', 'preview.webp', 'gif', 'preview.gif'];

/**
 * Forge builds its additional-module list from `models/VAE` and
 * `models/text_encoder` (plus custom `--vae-dir`/`--text-encoder-dir`), and
 * `/sdapi/v1/sd-modules` reports the full path per module. Map the file's
 * parent directory to a type so the UI can segment the picker.
 */
export function moduleTypeFromFilename(filename: string | undefined): AdditionalModuleType {
  if (!filename) return 'other';
  const parentDir = filename.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0]?.toLowerCase() ?? '';
  switch (parentDir) {
    case 'vae': return 'vae';
    case 'text_encoder': return 'text_encoder';
    case 'clip': return 'clip';
    case 'unet': return 'unet';
    default: return 'other';
  }
}

/**
 * A1111/Forge report each LoRA's `alias` from its embedded `ss_output_name`
 * metadata, and some training tools leave that at the generic default "lora"
 * — inserting it verbatim yields a broken `<lora:lora:1>` tag. The server
 * always registers the filename-derived `name` too, so fall back to it for
 * degenerate aliases (empty, or generic placeholders A1111 itself treats as
 * forbidden — see the Lora extension's forbidden_network_aliases / get_alias()).
 */
export function loraPromptName(name: string, alias?: string): string {
  const a = (alias || '').trim();
  if (!a || /^(lora|lyco|none|addams)$/i.test(a)) return name;
  return a;
}

/**
 * Candidate thumbnail URLs for a LoRA, tried in order via the stock
 * `/sd_extra_networks/thumb?filename=<path>` endpoint (serves the first
 * sibling preview image that exists on disk). Caller should render an
 * <img> and advance to the next candidate on load error.
 */
export function getLoraPreviewCandidates(loraPath: string, settings: LLMSettings): string[] {
  const base = loraPath.replace(/\.[^./\\]+$/, '');
  return PREVIEW_SUFFIXES.map((suffix) =>
    `${proxyUrl(settings, '/sd_extra_networks/thumb')}?filename=${encodeURIComponent(`${base}.${suffix}`)}`
  );
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

  async listSamplers(settings: LLMSettings): Promise<string[]> {
    try {
      const res = await fetch(proxyUrl(settings, '/sdapi/v1/samplers'), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const samplers: Array<{ name: string }> = await res.json();
      return samplers.map((s) => s.name);
    } catch {
      return [];
    }
  },

  async listLoras(settings: LLMSettings): Promise<{ name: string; alias: string; path?: string }[]> {
    try {
      const res = await fetch(proxyUrl(settings, '/sdapi/v1/loras'), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const loras: Array<{ name: string; alias?: string; path?: string }> = await res.json();
      // Normalize aliases so inserting `<lora:alias:1>` always resolves to this
      // LoRA: drop degenerate `ss_output_name` values, and give later entries
      // with a duplicate alias the filename-derived name (A1111 marks duplicate
      // aliases forbidden and its own UI does the same via network.get_alias()).
      const seenAliases = new Set<string>();
      return loras.map((l) => {
        const rawAlias = (l.alias || '').trim() || l.name;
        const collides = seenAliases.has(rawAlias.toLowerCase());
        seenAliases.add(rawAlias.toLowerCase());
        return { name: l.name, alias: collides ? l.name : loraPromptName(l.name, l.alias), path: l.path };
      });
    } catch {
      return [];
    }
  },

  async listEmbeddings(settings: LLMSettings): Promise<string[]> {
    try {
      const res = await fetch(proxyUrl(settings, '/sdapi/v1/embeddings'), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data: { loaded?: Record<string, unknown> } = await res.json();
      return Object.keys(data.loaded || {});
    } catch {
      return [];
    }
  },

  /**
   * Forge-only endpoint — enumerates every CLIP/T5/VAE module the server can
   * load for split checkpoints (Flux, SD3, GGUF). Vanilla A1111 returns 404,
   * which surfaces as an empty list so the UI falls back to manual entry.
   */
  async listModules(settings: LLMSettings): Promise<ModuleInfo[]> {
    try {
      const res = await fetch(proxyUrl(settings, '/sdapi/v1/sd-modules'), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const modules: Array<{ model_name: string; filename?: string }> = await res.json();
      return modules.map((m) => ({ name: m.model_name, type: moduleTypeFromFilename(m.filename) }));
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

    const body: Record<string, any> = {
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
    if (params.model || params.additionalModules?.length) {
      body.override_settings = {
        ...(params.model ? { sd_model_checkpoint: params.model } : {}),
        // Forge-specific: split checkpoints (Flux, SD3, GGUF) don't embed their
        // own text encoder, so the CLIP/T5/VAE files must be loaded alongside
        // the checkpoint or generation fails with "You do not have CLIP state dict!".
        ...(params.additionalModules?.length ? { forge_additional_modules: params.additionalModules } : {}),
      };
      body.override_settings_restore_afterwards = false;
    }

    // WP11: Use img2img endpoint when initImage is provided
    const isImg2Img = !!params.initImage;
    const endpoint = isImg2Img ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img';

    if (isImg2Img && params.initImage) {
      // Extract base64 data from data URL
      const base64Data = params.initImage.includes(',')
        ? params.initImage.split(',')[1]
        : params.initImage;
      body.init_images = [base64Data];
      body.denoising_strength = params.denoisingStrength ?? 0.75;
    }

    const res = await fetch(proxyUrl(settings, endpoint), {
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

    // The first image is the primary output — base64-encoded PNG. Some
    // A1111/Forge builds return it already wrapped in a data URI, so strip
    // any existing prefix before re-wrapping (same convention used for
    // externally-sourced base64 throughout this codebase, e.g. llmService.ts).
    const rawImage = data.images[0];
    const base64 = rawImage.includes('base64,') ? rawImage.split('base64,')[1] : rawImage;
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
