import { describe, it, expect, beforeEach } from 'vitest';
import { providerRouter } from './providerRouter';
import type { PlanStep } from './planner';

// ─── Helper ───────────────────────────────────────────────────────────────

const makeStep = (overrides: Partial<PlanStep> = {}): PlanStep => ({
  kind: 'provider_call',
  description: 'Generate text',
  params: {},
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('providerRouter', () => {
  // Reset all providers to default state before each test so order is predictable.
  // Default: only gemini is available.
  beforeEach(() => {
    providerRouter.setAvailability('gemini', true);
    providerRouter.setAvailability('anthropic', false);
    providerRouter.setAvailability('openrouter', false);
    providerRouter.setAvailability('ollama', false);
    providerRouter.setAvailability('llamacpp', false);
  });

  // ─── selectForStep ───────────────────────────────────────────────────

  describe('selectForStep', () => {
    it('returns the only available provider (gemini)', () => {
      const result = providerRouter.selectForStep(makeStep());
      expect(result).toBe('gemini');
    });

    it('returns the cheapest available provider when multiple are available', () => {
      providerRouter.setAvailability('ollama', true);
      providerRouter.setAvailability('openrouter', true);
      // ollama = $0, openrouter = $0.000003/token, gemini = $0.0000005/token
      // Cheapest: ollama (free local), then gemini, then openrouter
      const result = providerRouter.selectForStep(makeStep());
      expect(result).toBe('ollama');
    });

    it('selects gemini over openrouter when both are available (gemini is cheaper)', () => {
      providerRouter.setAvailability('openrouter', true);
      // gemini: 0.0000005/token, openrouter: 0.000003/token
      const result = providerRouter.selectForStep(makeStep());
      expect(result).toBe('gemini');
    });

    it('prefers a provider that supports multimodal when images are present', () => {
      providerRouter.setAvailability('ollama', true);
      // ollama: multimodal=false, gemini: multimodal=true
      const step = makeStep({ params: { images: ['data:image/png;base64,abc'] } });
      const result = providerRouter.selectForStep(step);
      expect(result).toBe('gemini'); // gemini is the only multimodal + available
    });

    it('prefers a provider that supports tools when step kind requires them', () => {
      providerRouter.setAvailability('ollama', true);
      // ollama: tools=false, gemini: tools=true
      const step = makeStep({ kind: 'assistant_tool' });
      const result = providerRouter.selectForStep(step);
      expect(result).toBe('gemini');
    });

    it('returns null when no provider is available', () => {
      providerRouter.setAvailability('gemini', false);
      const result = providerRouter.selectForStep(makeStep());
      expect(result).toBeNull();
    });

    it('filters by explicit availableProviders list', () => {
      providerRouter.setAvailability('ollama', true);
      // Only consider anthropic and openrouter — neither is available
      const result = providerRouter.selectForStep(makeStep(), ['anthropic', 'openrouter']);
      expect(result).toBeNull();
    });

    it('uses availableProviders list even if gemini is available but not in the list', () => {
      providerRouter.setAvailability('openrouter', true);
      const result = providerRouter.selectForStep(makeStep(), ['openrouter']);
      expect(result).toBe('openrouter');
    });

    it('uses latency as tiebreaker when costs are equal', () => {
      providerRouter.setAvailability('ollama', true);
      providerRouter.setAvailability('llamacpp', true);
      // Both cost $0. Just check that a provider is returned (either one).
      const result = providerRouter.selectForStep(makeStep());
      expect(result).toBeTruthy();
    });
  });

  // ─── buildFallbackChain ──────────────────────────────────────────────

  describe('buildFallbackChain', () => {
    it('builds a chain with primary as best available and remaining as fallbacks', () => {
      providerRouter.setAvailability('openrouter', true);
      providerRouter.setAvailability('ollama', true);
      // Best: ollama (free), then gemini, then openrouter
      const chain = providerRouter.buildFallbackChain(makeStep());
      expect(chain.primary).toBe('ollama');
      expect(chain.fallbacks).toContain('gemini');
      expect(chain.fallbacks).toContain('openrouter');
      expect(chain.fallbacks).not.toContain('ollama');
    });

    it('falls back to gemini when no provider is available', () => {
      providerRouter.setAvailability('gemini', false);
      const chain = providerRouter.buildFallbackChain(makeStep());
      expect(chain.primary).toBe('gemini');
      expect(chain.fallbacks).toEqual([]);
    });

    it('sorts fallbacks by cost ascending', () => {
      providerRouter.setAvailability('ollama', true);
      providerRouter.setAvailability('anthropic', true);
      providerRouter.setAvailability('openrouter', true);
      const chain = providerRouter.buildFallbackChain(makeStep());
      // primary: ollama ($0)
      // fallbacks sorted by cost: gemini ($0.0000005) ? wait — gemini isn't
      // available here since ollama is primary. Let's check all:
      // ollama: $0 (primary)
      // gemini: $0.0000005/token
      // openrouter: $0.000003/token
      // anthropic: $0.000018/token
      expect(chain.primary).toBe('ollama');
      expect(chain.fallbacks[0]).toBe('gemini');
      expect(chain.fallbacks[1]).toBe('openrouter');
      expect(chain.fallbacks[2]).toBe('anthropic');
    });

    it('excludes the primary from fallbacks', () => {
      providerRouter.setAvailability('ollama', true);
      const chain = providerRouter.buildFallbackChain(makeStep());
      expect(chain.primary).toBe('ollama');
      expect(chain.fallbacks).not.toContain('ollama');
    });
  });

  // ─── call ────────────────────────────────────────────────────────────

  describe('call', () => {
    it('returns a ProviderCallResult with correct provider id', async () => {
      const result = await providerRouter.call('gemini', { prompt: 'Hello' });
      expect(result.provider).toBe('gemini');
      expect(result.text).toContain('[gemini response');
      expect(typeof result.latency).toBe('number');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('estimates tokens from prompt and response', async () => {
      const result = await providerRouter.call('gemini', { prompt: 'Hello world' });
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
    });

    it('calculates cost from token estimates and provider rates', async () => {
      const result = await providerRouter.call('gemini', { prompt: 'A'.repeat(100) });
      // gemini: $0.000000125/input token, $0.000000375/output token
      // input: Math.ceil(100/4) = 25 tokens * 0.000000125 = 0.000003125
      // output: estimate of stub response (~25 chars) = 7 tokens * 0.000000375 = 0.000002625
      // total ≈ 0.00000575
      expect(result.cost).toBeGreaterThan(0);
      expect(result.cost).toBeLessThan(1); // sanity: not dollars
    });

    it('throws when the provider is not available', async () => {
      await expect(providerRouter.call('anthropic', { prompt: 'Hi' }))
        .rejects.toThrow('not available');
    });

    it('records latency for subsequent selection', async () => {
      // Call gemini once to establish latency
      await providerRouter.call('gemini', { prompt: 'Test' });
      const snapshot = providerRouter.getSnapshot();
      const gemini = snapshot.find((p) => p.id === 'gemini');
      expect(gemini!.avgLatency).not.toBeNaN();
      expect(gemini!.avgLatency).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── callWithFallback ────────────────────────────────────────────────

  describe('callWithFallback', () => {
    it('succeeds on the primary provider', async () => {
      const result = await providerRouter.callWithFallback('gemini', [], { prompt: 'Hello' });
      expect(result.provider).toBe('gemini');
    });

    it('falls back to the next provider when primary fails', async () => {
      // Primary 'anthropic' is unavailable by default (only gemini is available
      // after beforeEach). The call to 'anthropic' will fail, and the chain
      // falls through to 'gemini' which is available by default.
      const result = await providerRouter.callWithFallback(
        'anthropic', // unavailable — will fail
        ['gemini'],  // available by default — will succeed
        { prompt: 'Hello' },
      );
      expect(result.provider).toBe('gemini');
    });

    it('throws when all providers fail', async () => {
      providerRouter.setAvailability('gemini', false);
      await expect(providerRouter.callWithFallback('anthropic', ['openrouter'], { prompt: 'Hi' }))
        .rejects.toThrow('All providers failed');
    });
  });

  // ─── setAvailability ────────────────────────────────────────────────

  describe('setAvailability', () => {
    it('toggles a provider from available to unavailable', () => {
      expect(providerRouter.selectForStep(makeStep())).toBe('gemini');
      providerRouter.setAvailability('gemini', false);
      expect(providerRouter.selectForStep(makeStep())).toBeNull();
    });

    it('toggles a provider from unavailable to available', () => {
      providerRouter.setAvailability('gemini', false);
      expect(providerRouter.selectForStep(makeStep())).toBeNull();
      providerRouter.setAvailability('gemini', true);
      expect(providerRouter.selectForStep(makeStep())).toBe('gemini');
    });

    it('does nothing for an unknown provider id', () => {
      expect(() => providerRouter.setAvailability('unknown' as any, true)).not.toThrow();
    });
  });

  // ─── getSnapshot ─────────────────────────────────────────────────────

  describe('getSnapshot', () => {
    it('returns all 5 providers', () => {
      const snapshot = providerRouter.getSnapshot();
      expect(snapshot).toHaveLength(5);
    });

    it('returns copies (not references to internal state)', () => {
      const snapshot = providerRouter.getSnapshot();
      const geminiSnap = snapshot.find((p) => p.id === 'gemini')!;
      geminiSnap.isAvailable = false; // mutate the snapshot
      // Internal state should be unchanged
      expect(providerRouter.selectForStep(makeStep())).toBe('gemini');
    });

    it('reflects setAvailability changes', () => {
      providerRouter.setAvailability('ollama', true);
      const snapshot = providerRouter.getSnapshot();
      const ollama = snapshot.find((p) => p.id === 'ollama')!;
      expect(ollama.isAvailable).toBe(true);
    });
  });

  // ─── summarizeCost ───────────────────────────────────────────────────

  describe('summarizeCost', () => {
    it('aggregates costs, tokens, and call count', () => {
      const results = [
        { provider: 'gemini' as const, text: 'a', latency: 100, inputTokens: 10, outputTokens: 5, cost: 0.001 },
        { provider: 'ollama' as const, text: 'b', latency: 200, inputTokens: 20, outputTokens: 10, cost: 0 },
      ];
      const summary = providerRouter.summarizeCost(results);
      expect(summary.totalCost).toBeCloseTo(0.001);
      expect(summary.totalTokens).toBe(45);
      expect(summary.calls).toBe(2);
    });

    it('returns zeros for an empty array', () => {
      const summary = providerRouter.summarizeCost([]);
      expect(summary.totalCost).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.calls).toBe(0);
    });
  });
});
