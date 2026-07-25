/**
 * Provider Router — Layer 6 of the MCP Architecture.
 *
 * Unified interface across all LLM providers (Gemini, Ollama, LlamaCpp,
 * Anthropic, OpenRouter).
 *
 * Responsibilities:
 *   - Selects the best provider for a given capability (cost, latency, modality)
 *   - Manages fallback chains when the primary provider is unavailable
 *   - Tracks per-provider cost and latency for observability
 *   - Wraps existing provider services (geminiService, ollamaService, etc.)
 *     behind a single interface
 */

import type { PlanStep } from './planner';

// ─── Types ────────────────────────────────────────────────────────────────

export type ProviderId = 'gemini' | 'ollama' | 'llamacpp' | 'anthropic' | 'openrouter';

export interface ProviderCapability {
  /** Whether this provider supports multimodal (image + text) input. */
  multimodal: boolean;
  /** Whether this provider supports tool/function calling. */
  tools: boolean;
  /** Maximum input tokens. */
  maxInputTokens: number;
  /** Maximum output tokens. */
  maxOutputTokens: number;
  /** Supported generation types. */
  generationTypes: Array<'text' | 'image' | 'video' | 'audio'>;
}

export interface ProviderCost {
  perInputToken: number;  // USD
  perOutputToken: number; // USD
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  isAvailable: boolean;
  capability: ProviderCapability;
  cost: ProviderCost;
  /** Average latency for last N calls (ms), NaN if no data yet. */
  avgLatency: number;
}

export interface ProviderCallOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Attached images (base64). */
  images?: string[];
  /** Tool definitions for function/tool calling. */
  tools?: any[];
}

export interface ProviderCallResult {
  text: string;
  provider: ProviderId;
  latency: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface FallbackChain {
  primary: ProviderId;
  fallbacks: ProviderId[];
}

// ─── Static provider registry ─────────────────────────────────────────────
// Declared here; in production, runtime health checks update availability.

const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    isAvailable: true,
    capability: {
      multimodal: true,
      tools: true,
      maxInputTokens: 128000,
      maxOutputTokens: 8192,
      generationTypes: ['text', 'image', 'video'],
    },
    cost: { perInputToken: 0.000000125, perOutputToken: 0.000000375 },
    avgLatency: NaN,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    isAvailable: false, // requires API key
    capability: {
      multimodal: true,
      tools: true,
      maxInputTokens: 100000,
      maxOutputTokens: 4096,
      generationTypes: ['text'],
    },
    cost: { perInputToken: 0.000003, perOutputToken: 0.000015 },
    avgLatency: NaN,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    isAvailable: false,
    capability: {
      multimodal: true,
      tools: true,
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      generationTypes: ['text', 'image'],
    },
    cost: { perInputToken: 0.000001, perOutputToken: 0.000002 },
    avgLatency: NaN,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (local)',
    isAvailable: false, // requires local running instance
    capability: {
      multimodal: false,
      tools: false,
      maxInputTokens: 8192,
      maxOutputTokens: 2048,
      generationTypes: ['text'],
    },
    cost: { perInputToken: 0, perOutputToken: 0 },
    avgLatency: NaN,
  },
  llamacpp: {
    id: 'llamacpp',
    name: 'llama.cpp (local)',
    isAvailable: false,
    capability: {
      multimodal: false,
      tools: false,
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      generationTypes: ['text'],
    },
    cost: { perInputToken: 0, perOutputToken: 0 },
    avgLatency: NaN,
  },
};

// ─── Latency tracker ──────────────────────────────────────────────────────

const _latencyHistory = new Map<ProviderId, number[]>();
const MAX_SAMPLES = 20;

function recordLatency(provider: ProviderId, ms: number): void {
  const history = _latencyHistory.get(provider) || [];
  history.push(ms);
  if (history.length > MAX_SAMPLES) history.shift();
  _latencyHistory.set(provider, history);
  PROVIDERS[provider].avgLatency = history.reduce((a, b) => a + b, 0) / history.length;
}

// ─── Provider Router ──────────────────────────────────────────────────────

export const providerRouter = {
  /**
   * Get the best available provider for a given step / context.
   *
   * Selection criteria (in order):
   *   1. Must be available
   *   2. Must support the required modality (multimodal if images present)
   *   3. Lowest cost per token wins
   *   4. Tiebreaker: lowest latency
   */
  selectForStep(step: PlanStep, availableProviders?: ProviderId[]): ProviderId | null {
    const requiresMultimodal = step.params?.images?.length > 0;
    const requiresTools = step.kind === 'assistant_tool' || step.kind === 'capability_dispatch';

    const candidates = (availableProviders || Object.keys(PROVIDERS) as ProviderId[])
      .map(id => PROVIDERS[id])
      .filter(p => p.isAvailable)
      .filter(p => !requiresMultimodal || p.capability.multimodal)
      .filter(p => !requiresTools || p.capability.tools);

    if (candidates.length === 0) return null;

    // Sort by cost (total per token), then latency
    candidates.sort((a, b) => {
      const costA = a.cost.perInputToken + a.cost.perOutputToken;
      const costB = b.cost.perInputToken + b.cost.perOutputToken;
      if (costA !== costB) return costA - costB;
      return (isNaN(a.avgLatency) ? Infinity : a.avgLatency) -
             (isNaN(b.avgLatency) ? Infinity : b.avgLatency);
    });

    return candidates[0].id;
  },

  /**
   * Build a fallback chain for a given step.
   * Primary is the best available; fallbacks are remaining available providers
   * sorted by cost.
   */
  buildFallbackChain(step: PlanStep): FallbackChain {
    const primary = this.selectForStep(step);
    if (!primary) {
      return { primary: 'gemini', fallbacks: [] };
    }

    const fallbacks = (Object.keys(PROVIDERS) as ProviderId[])
      .filter(id => id !== primary && PROVIDERS[id].isAvailable);

    fallbacks.sort((a, b) => {
      const costA = PROVIDERS[a].cost.perInputToken + PROVIDERS[a].cost.perOutputToken;
      const costB = PROVIDERS[b].cost.perInputToken + PROVIDERS[b].cost.perOutputToken;
      return costA - costB;
    });

    return { primary, fallbacks };
  },

  /**
   * Call the specified provider.
   *
   * In production, this dispatches to the actual provider service
   * (geminiService, ollamaService, etc.).  Right now it returns a stub
   * result — real wiring is in Layer 8.
   */
  async call(provider: ProviderId, options: ProviderCallOptions): Promise<ProviderCallResult> {
    const startTime = Date.now();

    if (!PROVIDERS[provider].isAvailable) {
      throw new Error(`Provider "${provider}" is not available`);
    }

    // Stub — in production this calls the actual provider service.
    const text = `[${provider} response to: "${options.prompt.slice(0, 60)}…"]`;
    const latency = Date.now() - startTime;
    const inputTokens = estimateTokens(options.prompt);
    const outputTokens = estimateTokens(text);
    const cost = (inputTokens * PROVIDERS[provider].cost.perInputToken) +
                 (outputTokens * PROVIDERS[provider].cost.perOutputToken);

    recordLatency(provider, latency);

    return { text, provider, latency, inputTokens, outputTokens, cost };
  },

  /**
   * Call with automatic fallback.
   * Tries primary, then each fallback in order until one succeeds.
   */
  async callWithFallback(
    primary: ProviderId,
    fallbacks: ProviderId[],
    options: ProviderCallOptions,
  ): Promise<ProviderCallResult> {
    const chain = [primary, ...fallbacks];
    let lastError: Error | undefined;

    for (const provider of chain) {
      try {
        return await this.call(provider, options);
      } catch (err: any) {
        lastError = err;
        console.warn(`[ProviderRouter] ${provider} failed: ${err.message}. Trying next…`);
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  },

  /**
   * Update a provider's availability at runtime.
   */
  setAvailability(provider: ProviderId, available: boolean): void {
    if (PROVIDERS[provider]) {
      PROVIDERS[provider].isAvailable = available;
    }
  },

  /**
   * Get current info for all providers (snapshot).
   */
  getSnapshot(): ProviderInfo[] {
    return Object.values(PROVIDERS).map(p => ({ ...p }));
  },

  /**
   * Get total estimated cost for a set of results.
   */
  summarizeCost(results: ProviderCallResult[]): { totalCost: number; totalTokens: number; calls: number } {
    return {
      totalCost: results.reduce((sum, r) => sum + r.cost, 0),
      totalTokens: results.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
      calls: results.length,
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Crude token estimator (~4 chars per token for English text). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
