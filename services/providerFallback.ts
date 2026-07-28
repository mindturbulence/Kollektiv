/**
 * Provider fallback — retries an operation on the next provider in a
 * user-configured chain when the active one fails at runtime.
 *
 * This is NOT services/providerRouter.ts, which was deleted under ISSUE-32.
 * That module selected providers on cost and latency heuristics, overriding
 * a working choice. This one fires only on actual failure and never
 * overrides a provider that succeeds. See the plan document for the full
 * distinction before changing anything here.
 */

import { ProviderUnsupportedError, type LLMProvider } from './llmService';
import type { LLMSettings } from '../types';

/** 4xx codes that mean "the user must fix configuration", not "try again". */
const NON_RETRIABLE_STATUS = /\b(400|401|402|403|404|422)\b/;

/** Signals of a transient failure worth retrying on another provider. */
const RETRIABLE_PATTERNS = [
  /failed to fetch/i,
  /network/i,
  /timed? ?out/i,
  /econnrefused/i,
  /\b(500|502|503|504|429)\b/,
];

/**
 * Whether an error justifies trying the next provider.
 *
 * ProviderUnsupportedError is always false: the provider cannot do this at
 * all, which is a configuration fact the user must see. Silently routing
 * around it would move a prompt off a local model the user chose for privacy.
 */
export function isRetriableProviderError(err: unknown): boolean {
  if (err instanceof ProviderUnsupportedError) return false;
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (NON_RETRIABLE_STATUS.test(msg)) return false;
  return RETRIABLE_PATTERNS.some(p => p.test(msg));
}

import { getActiveProvider } from './llmService';

/**
 * Run an operation on the active provider, falling back through the
 * user's chain only on genuine runtime failure.
 *
 * Throws the ORIGINAL error when the chain is exhausted — the first
 * failure is what the user needs to diagnose, not the last one.
 */
export async function withProviderFallback<T>(
  _feature: string,
  settings: LLMSettings,
  supported: LLMProvider[],
  run: (provider: LLMProvider) => Promise<T>,
  onFallback?: (from: LLMProvider, to: LLMProvider, err: Error) => void,
): Promise<T> {
  const active = getActiveProvider(settings);
  try {
    return await run(active);
  } catch (err) {
    const originalError = err;
    const enabled = (settings as any).providerFallbackEnabled === true;
    if (!enabled || !isRetriableProviderError(err)) throw err;

    const chain = ((settings as any).providerFallbackChain || []) as LLMProvider[];
    let from = active;
    for (const next of chain) {
      if (next === active || !supported.includes(next)) continue;
      try {
        onFallback?.(from, next, originalError as Error);
        return await run(next);
      } catch (nextErr) {
        from = next;
        if (!isRetriableProviderError(nextErr)) throw originalError;
      }
    }
    throw originalError;
  }
}
