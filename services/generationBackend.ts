/**
 * generationBackend — Common interface for local generation backends
 * (A1111/Forge Neo, ComfyUI) and the registry that holds them.
 *
 * Each backend adapter implements `GenerationBackend` and registers
 * itself at module import time via `registerBackend()`.
 */

import type { LLMSettings } from '../types';

// ── Types ──────────────────────────────────────────────────────────────

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed?: number;
  sampler?: string;
  model?: string;
  /**
   * When set, the backend should use this pre-built workflow JSON instead of
   * constructing its own default workflow. Only supported by the ComfyUI backend.
   */
  customWorkflowJson?: Record<string, any>;
  /**
   * Extra module filenames (CLIP/T5/VAE) to load alongside `model` — Forge's
   * `forge_additional_modules`, needed for split checkpoints (Flux, SD3, GGUF)
   * that don't embed their own text encoder. Only supported by the A1111 backend.
   */
  additionalModules?: string[];
  /**
   * Source image for img2img mode (WP11). When set, the backend uses img2img
   * instead of txt2img. Format: data:image/png;base64,... or a URL.
   */
  initImage?: string;
  /** Denoising strength for img2img (0 = no change, 1 = full regeneration). Default: 0.75. */
  denoisingStrength?: number;
  /**
   * Opaque invocation arguments for backends with no fixed parameter shape
   * (e.g. an MCP tool call — WP6). Not read by the A1111/ComfyUI backends.
   */
  raw?: Record<string, unknown>;
}
export interface GenerateOutput {
  /** Full `data:image/png;base64,...` URL */
  dataUrl: string;
  /** Seed used for the generation (for reproducibility). */
  seed?: number;
  /** The backend id that produced this output. */
  backendId: string;
}

export interface LoraInfo {
  name: string;
  alias: string;
  /** Absolute path on the backend host, used to look up a preview thumbnail. */
  path?: string;
}

/**
 * Category of a Forge additional module, derived from the directory the file
 * lives in under the install (`models/VAE`, `models/text_encoder`, ...).
 */
export type AdditionalModuleType = 'vae' | 'text_encoder' | 'clip' | 'unet' | 'other';

export interface ModuleInfo {
  /** Basename Forge matches on, e.g. `clip_l.safetensors` — what goes into `forge_additional_modules`. */
  name: string;
  type: AdditionalModuleType;
}

export interface GenerationBackend {
  /** Unique machine-readable id (e.g. `'comfy'`, `'a1111'`). */
  id: string;
  /** Human-readable label (e.g. `'ComfyUI'`, `'A1111 / Forge Neo'`). */
  label: string;
  /** Whether the backend is reachable right now. */
  isAvailable(settings: LLMSettings): Promise<boolean>;
  /** List available models/checkpoints. */
  listModels(settings: LLMSettings): Promise<string[]>;
  /** List available sampler names. */
  listSamplers(settings: LLMSettings): Promise<string[]>;
  /** List available LoRAs. Not every backend supports this. */
  listLoras?(settings: LLMSettings): Promise<LoraInfo[]>;
  /** List available textual-inversion embedding names. Not every backend supports this. */
  listEmbeddings?(settings: LLMSettings): Promise<string[]>;
  /**
   * List available CLIP/T5/VAE module filenames — Forge's `/sdapi/v1/sd-modules`.
   * Needed for split checkpoints (Flux, SD3, GGUF) that don't embed their own
   * text encoder. Not every backend supports this (vanilla A1111 returns nothing).
   */
  listModules?(settings: LLMSettings): Promise<ModuleInfo[]>;
  /** Run a generation. */
  generate(params: GenerateParams, settings: LLMSettings, signal?: AbortSignal): Promise<GenerateOutput>;
}

// ── Registry ───────────────────────────────────────────────────────────

const _backends = new Map<string, GenerationBackend>();

/**
 * Register a backend. Overwrites any existing backend with the same id.
 */
export function registerBackend(b: GenerationBackend): void {
  _backends.set(b.id, b);
}

/**
 * Look up a backend by id. Returns undefined if not found.
 */
export function getBackend(id: string): GenerationBackend | undefined {
  return _backends.get(id);
}

/**
 * List all registered backends.
 */
export function listBackends(): GenerationBackend[] {
  return Array.from(_backends.values());
}

/** @internal test hook — clears all registered backends. */
export function _clearBackends(): void {
  _backends.clear();
}
