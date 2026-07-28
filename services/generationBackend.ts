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
}

export interface GenerateOutput {
  /** Full `data:image/png;base64,...` URL */
  dataUrl: string;
  /** Seed used for the generation (for reproducibility). */
  seed?: number;
  /** The backend id that produced this output. */
  backendId: string;
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
