# Phase 2 — Provider Fallback Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When the user's chosen provider fails at runtime, retry the same operation on a user-configured ordered chain instead of surfacing a hard error — without ever overriding a provider that is working.

**Architecture:** A single higher-order wrapper, `withProviderFallback`, that takes the supported-provider list and a per-provider executor. Call sites opt in one at a time. There is **no single dispatch point to wrap** (see below), so this ships as an opt-in helper applied to the highest-value operations first, not a big-bang refactor of all sixteen.

**Tech Stack:** TypeScript (strict), Vitest.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green.
- New settings follow the 4-step recipe in `AI_WORKER_RULES.md:43-44`: (a) field on `LLMSettings` in `types.ts`, (b) default in `defaultLLMSettings`, (c) hydration line in `loadLLMSettings`, (d) **add to the `SetupPage.handleSettingsChange` allow-list at `components/SetupPage.tsx:436`** or it will not survive a reload.
- Test assertions use `toBeTruthy()`, **not** `toBeInTheDocument()`. `vite.config.ts:178` sets `setupFiles: []`.
- Conventional Commits. Work on `development`.

## The Constraint That Shapes This Plan

**There is no single provider dispatch point.** `requireProvider` is called at **15 separate sites** in `services/llmService.ts` — lines 367, 398, 415, 425, 435, 445, 458, 465, 472, 479, 487, 495, 502, 550, 617 — plus `suggestTagsRaw` added by Phase 1, for 16 total. Each site follows the same shape:

```ts
const provider = requireProvider('Feature name', settings, ['gemini', 'ollama']);
return provider === 'ollama' ? doOllama(...) : doGemini(...);
```

Wrapping all sixteen at once is a large, repetitive, easy-to-get-wrong diff with no incremental value. This plan builds the helper, proves it on the three highest-value operations, and leaves the rest as a documented follow-on.

## Why This Is Not `providerRouter.ts` Restored

`services/providerRouter.ts` was **deleted** on 2026-07-26 under ISSUE-32. Do not restore it. The deleted module did silent cost-and-latency-based selection, which conflicts with `llmService.ts:29-33` where `requireProvider` deliberately **throws** rather than switching, because `LLMSettings.activeLLM` is the user's explicit choice.

| Deleted design (rejected) | This phase (accepted) |
|---|---|
| Switches on cost/latency heuristics | Switches only on **actual runtime failure** |
| Silent and automatic | User-configured ordered chain, empty and off by default |
| Overrides a working provider | Never fires while the active provider succeeds |
| Opaque | Every fallback emits a user-visible notice |

**`ProviderUnsupportedError` must still throw and must never trigger fallback.** A capability the provider cannot perform is a configuration fact, not a transient failure. Falling back on it would silently move a prompt from a local model to a cloud API — leaking data the user chose to keep on their machine.

## File Structure

| File | Responsibility |
|---|---|
| `services/providerFallback.ts` (create) | Error classification + the `withProviderFallback` wrapper. |
| `services/providerFallback.test.ts` (create) | Unit tests. |
| `services/llmService.ts` (modify) | Opt three call sites into the wrapper. |
| `types.ts`, `utils/settingsStorage.ts`, `components/SetupPage.tsx` (modify) | Settings. |
| `components/settings/AssistantSection.tsx` (modify) | Chain configuration UI. |

**Naming:** the file is `providerFallback.ts`, deliberately **not** `providerRouter.ts`. The old name carries the rejected design.

---

## Task 1: Classify which errors are worth retrying

**Files:**
- Create: `services/providerFallback.ts`
- Test: `services/providerFallback.test.ts`

**Interfaces:**
- Produces: `isRetriableProviderError(err: unknown): boolean`

- [ ] **Step 1: Write the failing test**

Create `services/providerFallback.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isRetriableProviderError } from './providerFallback';
import { ProviderUnsupportedError } from './llmService';

describe('isRetriableProviderError', () => {
  it('retries a network failure', () => {
    expect(isRetriableProviderError(new Error('Failed to fetch'))).toBe(true);
  });

  it('retries a timeout', () => {
    expect(isRetriableProviderError(new Error('request timed out'))).toBe(true);
  });

  it('retries a 500', () => {
    expect(isRetriableProviderError(new Error('HTTP 500 Internal Server Error'))).toBe(true);
  });

  it('retries a 429 rate limit', () => {
    expect(isRetriableProviderError(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('does NOT retry ProviderUnsupportedError', () => {
    const err = new ProviderUnsupportedError('Image abstraction', 'anthropic', ['gemini', 'ollama']);
    expect(isRetriableProviderError(err)).toBe(false);
  });

  it('does NOT retry a 401', () => {
    expect(isRetriableProviderError(new Error('HTTP 401 Unauthorized'))).toBe(false);
  });

  it('does NOT retry a 403', () => {
    expect(isRetriableProviderError(new Error('403 Forbidden — invalid API key'))).toBe(false);
  });

  it('does NOT retry a 400', () => {
    expect(isRetriableProviderError(new Error('400 Bad Request'))).toBe(false);
  });

  it('does not retry a non-Error value', () => {
    expect(isRetriableProviderError('some string')).toBe(false);
    expect(isRetriableProviderError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/providerFallback.test.ts`
Expected: FAIL — cannot resolve `./providerFallback`.

- [ ] **Step 3: Write the minimal implementation**

Create `services/providerFallback.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/providerFallback.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add services/providerFallback.ts services/providerFallback.test.ts
git commit -m "feat(fallback): classify retriable provider errors"
```

---

## Task 2: The `withProviderFallback` wrapper

**Files:**
- Modify: `services/providerFallback.ts`
- Test: `services/providerFallback.test.ts`

**Interfaces:**
- Consumes: `isRetriableProviderError` (Task 1), `getActiveProvider` (`llmService.ts:11`).
- Produces:
  ```ts
  withProviderFallback<T>(
    feature: string,
    settings: LLMSettings,
    supported: LLMProvider[],
    run: (provider: LLMProvider) => Promise<T>,
    onFallback?: (from: LLMProvider, to: LLMProvider, err: Error) => void,
  ): Promise<T>
  ```

**Behaviour:**
1. Try the active provider first, always.
2. On a **non**-retriable error, rethrow immediately.
3. On a retriable error, walk `settings.providerFallbackChain` in order, skipping providers not in `supported` and skipping the one that already failed.
4. If the chain is exhausted, throw the **original** error, not the last one. The first failure is the one the user needs to diagnose.
5. When `providerFallbackEnabled` is false, behave exactly like a direct call.

- [ ] **Step 1: Write the failing test**

Append to `services/providerFallback.test.ts`:

```ts
import { vi } from 'vitest';
import { withProviderFallback } from './providerFallback';
import type { LLMSettings } from '../types';

const settingsWith = (chain: string[], enabled = true): LLMSettings => ({
  activeLLM: 'gemini',
  providerFallbackEnabled: enabled,
  providerFallbackChain: chain,
} as unknown as LLMSettings);

describe('withProviderFallback', () => {
  it('returns the active provider result without touching the chain', async () => {
    const run = vi.fn(async () => 'ok');
    const result = await withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run);
    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('gemini');
  });

  it('falls back to the next chain entry on a network error', async () => {
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return 'from-ollama';
    });
    const result = await withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run);
    expect(result).toBe('from-ollama');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on a 401', async () => {
    const run = vi.fn(async () => { throw new Error('HTTP 401 Unauthorized'); });
    await expect(withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run))
      .rejects.toThrow(/401/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not fall back when disabled', async () => {
    const run = vi.fn(async () => { throw new Error('Failed to fetch'); });
    await expect(withProviderFallback('Chat', settingsWith(['ollama'], false), ['gemini', 'ollama'], run))
      .rejects.toThrow(/Failed to fetch/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips chain entries the feature does not support', async () => {
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return `from-${p}`;
    });
    // 'anthropic' is in the chain but not in supported — must be skipped.
    const result = await withProviderFallback('Vision', settingsWith(['anthropic', 'ollama']), ['gemini', 'ollama'], run);
    expect(result).toBe('from-ollama');
    expect(run).not.toHaveBeenCalledWith('anthropic');
  });

  it('throws the ORIGINAL error when the chain is exhausted', async () => {
    const run = vi.fn(async (p: string) => {
      throw new Error(p === 'gemini' ? 'original failure' : 'secondary failure');
    });
    await expect(withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run))
      .rejects.toThrow(/original failure/);
  });

  it('notifies the caller on each fallback', async () => {
    const onFallback = vi.fn();
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return 'ok';
    });
    await withProviderFallback('Chat', settingsWith(['ollama']), ['gemini', 'ollama'], run, onFallback);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0][0]).toBe('gemini');
    expect(onFallback.mock.calls[0][1]).toBe('ollama');
  });

  it('does not retry the provider that already failed even if it is in the chain', async () => {
    const run = vi.fn(async (p: string) => {
      if (p === 'gemini') throw new Error('Failed to fetch');
      return 'ok';
    });
    await withProviderFallback('Chat', settingsWith(['gemini', 'ollama']), ['gemini', 'ollama'], run);
    expect(run.mock.calls.filter(c => c[0] === 'gemini')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/providerFallback.test.ts`
Expected: FAIL — `withProviderFallback is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `services/providerFallback.ts`:

```ts
import { getActiveProvider } from './llmService';

/**
 * Run an operation on the active provider, falling back through the
 * user's chain only on genuine runtime failure.
 *
 * Throws the ORIGINAL error when the chain is exhausted — the first
 * failure is what the user needs to diagnose, not the last one.
 */
export async function withProviderFallback<T>(
  feature: string,
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
```

> `feature` is unused in the body today. Keep the parameter — it is the label every call site already has for `requireProvider`, and Task 4's notice text needs it. If `tsc` flags it under `noUnusedParameters`, prefix with `_feature` **and** update Task 4's usage accordingly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/providerFallback.test.ts`
Expected: PASS — 17 tests total.

- [ ] **Step 5: Commit**

```bash
git add services/providerFallback.ts services/providerFallback.test.ts
git commit -m "feat(fallback): add withProviderFallback wrapper"
```

---

## Task 3: Settings — chain and toggle

**Files:**
- Modify: `types.ts`, `utils/settingsStorage.ts`, `components/SetupPage.tsx:436`
- Test: `utils/settingsStorage.test.ts`

**Interfaces:**
- Produces: `LLMSettings.providerFallbackEnabled: boolean` (default `false`), `LLMSettings.providerFallbackChain: LLMProvider[]` (default `[]`).

**Both defaults are deliberately inert.** A user who never opens this UI sees byte-identical behaviour to today.

- [ ] **Step 1: Write the failing test**

Append to `utils/settingsStorage.test.ts`:

```ts
describe('provider fallback settings', () => {
  it('defaults to disabled with an empty chain', () => {
    expect(defaultLLMSettings.providerFallbackEnabled).toBe(false);
    expect(defaultLLMSettings.providerFallbackChain).toEqual([]);
  });

  it('survives a save/load round trip', () => {
    saveLLMSettings({ ...defaultLLMSettings, providerFallbackEnabled: true, providerFallbackChain: ['ollama'] });
    const loaded = loadLLMSettings();
    expect(loaded.providerFallbackEnabled).toBe(true);
    expect(loaded.providerFallbackChain).toEqual(['ollama']);
  });

  it('falls back to safe defaults when absent', () => {
    localStorage.setItem('kollektivSettingsV4', JSON.stringify({ activeLLM: 'gemini' }));
    const loaded = loadLLMSettings();
    expect(loaded.providerFallbackEnabled).toBe(false);
    expect(loaded.providerFallbackChain).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run utils/settingsStorage.test.ts`
Expected: FAIL — `undefined`.

- [ ] **Step 3: Apply all four recipe parts**

**(a)** `types.ts`, inside `interface LLMSettings`:
```ts
  // Provider Fallback (failure-triggered only — see ISSUE-32)
  providerFallbackEnabled: boolean;
  providerFallbackChain: ('gemini' | 'ollama' | 'llamacpp' | 'anthropic' | 'openrouter')[];
```

**(b)** `utils/settingsStorage.ts`, in `defaultLLMSettings`:
```ts
  providerFallbackEnabled: false,
  providerFallbackChain: [],
```

**(c)** `utils/settingsStorage.ts`, in `loadLLMSettings`:
```ts
  providerFallbackEnabled: parsed.providerFallbackEnabled ?? false,
  providerFallbackChain: parsed.providerFallbackChain ?? [],
```

**(d)** `components/SetupPage.tsx:436` — add `'providerFallbackEnabled'` and `'providerFallbackChain'` to the allow-list array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run utils/settingsStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the chain UI**

In `components/settings/AssistantSection.tsx`, add a section titled **"Provider fallback"** with a toggle for `providerFallbackEnabled` and an ordered multi-select for `providerFallbackChain`. Copy markup and class names from an existing toggle and select in that file.

Include this helper text verbatim — it is a privacy disclosure, not decoration:

> *"If your active provider fails, retry on these in order. Fallback never fires while your provider is working, and never fires for features a provider doesn't support. **Adding a cloud provider means a prompt from a local model can be sent to that cloud service when the local one fails.**"*

- [ ] **Step 6: Verify persistence by hand**

Run `pnpm dev`, enable the toggle, set a chain, hard-reload, confirm both survive. Required by `AI_WORKER_RULES.md:44`.

- [ ] **Step 7: Commit**

```bash
git add types.ts utils/settingsStorage.ts utils/settingsStorage.test.ts components/SetupPage.tsx components/settings/AssistantSection.tsx
git commit -m "feat(fallback): add provider chain settings with privacy disclosure"
```

---

## Task 4: Opt three call sites in

**Files:**
- Modify: `services/llmService.ts` — lines 617 (Chat), 367 (Prompt refinement), 398 (Prompt refinement stream)

**Interfaces:**
- Consumes: `withProviderFallback` (Task 2).
- Produces: no new exports.

**Why these three:** Chat (617) is the most-used path and the most painful to have fail. Prompt refinement (367, 398) is the core creative loop. The other thirteen sites stay unchanged and are listed as follow-on work below.

**Streaming caveat:** line 398 is an async generator (`refineSinglePromptStream`-style). `withProviderFallback` returns a `Promise<T>`, so it can wrap the *creation* of the stream but **cannot** retry after the first chunk has been yielded — a partially-consumed stream cannot be replayed. Wrap only the initial call, and if that constraint makes 398 awkward, **skip it and do only 617 and 367.** Two working call sites beat three where one silently drops chunks.

- [ ] **Step 1: Write the failing test**

Create `services/providerFallbackIntegration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { LLMSettings } from '../types';

vi.mock('./geminiService', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  enhancePromptGeminiStream: vi.fn(),
}));

describe('chat honours the fallback chain', () => {
  it('retries chat on the next provider after a network error', async () => {
    // Arrange a settings object with chat fallback enabled.
    const settings = {
      activeLLM: 'gemini',
      providerFallbackEnabled: true,
      providerFallbackChain: ['ollama'],
    } as unknown as LLMSettings;

    // The concrete assertion depends on how the chat function at
    // llmService.ts:617 is named and exported. Read that function first,
    // then assert: the gemini path throws 'Failed to fetch', and the
    // returned value comes from the ollama path.
    expect(settings.providerFallbackEnabled).toBe(true);
  });
});
```

> **This test is a scaffold, not a finished test.** Read the function at `llmService.ts:617`, learn its exported name and signature, then write the real assertion. Do not leave the placeholder `expect` above in the committed file — replace it. If the function proves impractical to test in isolation because of its dependency graph, cover the behaviour through `providerFallback.test.ts` instead and note that here.

- [ ] **Step 2: Refactor the chat call site**

At `llmService.ts:617`, change from:

```ts
const provider = requireProvider('Chat', settings, ['gemini', 'ollama', 'openrouter', 'llamacpp', 'anthropic']);
// ...dispatch on `provider`
```

to:

```ts
const supported: LLMProvider[] = ['gemini', 'ollama', 'openrouter', 'llamacpp', 'anthropic'];
requireProvider('Chat', settings, supported); // still throws for unsupported — do not remove
return withProviderFallback('Chat', settings, supported, async (provider) => {
    // ...the existing dispatch body, using `provider` instead of the old const
});
```

**Keep the `requireProvider` call.** It is what makes `ProviderUnsupportedError` fire before any fallback logic runs. Removing it is the single way this task can leak a local prompt to a cloud provider.

- [ ] **Step 3: Repeat for prompt refinement at line 367**

Same shape, `feature` string `'Prompt refinement'`, supported list `['gemini', 'ollama', 'llamacpp', 'anthropic']` copied verbatim from the existing line.

- [ ] **Step 4: Wire the user-visible notice**

Pass an `onFallback` callback that emits a feedback toast through the existing global feedback mechanism used elsewhere in this file, with text:

> `Gemini failed (Failed to fetch). Retrying on Ollama.`

Acceptance criterion 5 requires this to name **both** providers and the triggering error.

- [ ] **Step 5: Verify nothing regressed**

Run: `pnpm lint && pnpm test`
Expected: clean, green. **Every pre-existing `llmService` test must pass unmodified** — that is acceptance criterion 1.

- [ ] **Step 6: Commit**

```bash
git add services/llmService.ts services/providerFallbackIntegration.test.ts
git commit -m "feat(fallback): opt chat and prompt refinement into provider fallback"
```

---

## Final Verification

- [ ] `pnpm lint && pnpm test` — clean, green.
- [ ] `pnpm build` succeeds.
- [ ] **Acceptance criteria from the roadmap:**
  1. Chain disabled → behaviour byte-identical; existing `llmService` tests pass unmodified.
  2. Simulated network failure completes via the next chain entry.
  3. `ProviderUnsupportedError` propagates with **no** fallback.
  4. A 401 triggers no fallback.
  5. Every fallback produces a notice naming both providers.
  6. Exhausted chain surfaces the **original** error.
- [ ] Manual: set chain to `['ollama']`, stop Ollama, force a Gemini failure by clearing the API key, confirm the error is Gemini's original one and not Ollama's.

## Follow-On Work (not this phase)

Thirteen `requireProvider` call sites remain unwrapped: `llmService.ts` lines 415, 425, 435, 445, 458, 465, 472, 479, 487, 495, 502, 550, plus `suggestTagsRaw` from Phase 1. Each is a mechanical application of Task 4's pattern. Wrap them as they cause real pain, not speculatively — and log an `ISSUE-N` entry if you decide to do them as a batch.

## Out of Scope

- Cost tracking, latency measurement, automatic chain ordering. All three are what got `providerRouter.ts` deleted.
- Retrying the *same* provider. That is a different feature (transient-retry), and `executionEngine.ts` already has `maxRetries` for the capability path.
- Mid-stream fallback. A partially-consumed stream cannot be replayed.
