# LLM Provider Dispatch Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix an active correctness + privacy bug: with Anthropic, OpenRouter, or LlamaCpp selected as the AI engine, at least five `llmService.ts` functions silently fall through to **Gemini** — the user's prompt is sent to Google without consent, or fails with a confusing missing-Gemini-key error. Replace the copy-pasted per-function provider booleans with one dispatch helper that makes unsupported combinations an explicit, user-readable error. Also deduplicate the twice-copied `<think>`-tag stripper and fix a stream-termination bug in the LlamaCpp service.

**Architecture:** `services/llmService.ts` (751 lines) is the dispatch layer over five provider services. There is no central dispatch: ~16 exported functions each recompute `const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud'` and branch inline. Functions implemented only for Ollama+Gemini end in `return isOllama ? xOllama(...) : xGemini(...)` — the Gemini arm is the silent fallthrough for the other three providers. Verified fallthrough sites: `generateFocusedVariations` (`llmService.ts:502-507`), `reconstructPrompt` (`:509-514`), `replaceComponentInPrompt` (`:516-521`), `abstractImage` (`:532-537`), `generatePromptFormulaWithAI` (`:539-545`); `dissectPrompt` (`:489-500`) and `reconstructFromIntent` (`:523-530`) handle LlamaCpp but fall through for Anthropic/OpenRouter; check every remaining function in Task 2.

**Tech Stack:** TypeScript. No new dependencies.

## Global Constraints

- **Behavior decision (do not second-guess it):** when the selected provider has no implementation for a feature, **throw a clear error** — do NOT keep the silent Gemini fallback and do NOT invent a new provider implementation. Silently routing a local-model user's prompt to Google is the bug being fixed.
- `settings.activeLLM` values are: `gemini`, `anthropic`, `ollama`, `ollama_cloud`, `openrouter`, `llamacpp`. `ollama_cloud` must always be treated as `ollama`.
- Streaming functions that work today must produce byte-identical output for supported providers.
- `pnpm lint` (= `tsc --noEmit`) green after every task.

---

### Task 1: Add the dispatch helpers

**Files:**
- Modify: `services/llmService.ts` (add near the top, after existing imports)

**Produces:** `getActiveProvider(settings)`, `requireProvider(feature, settings, supported)`, `ProviderUnsupportedError` — used by every later task.

- [ ] **Step 1: Add this block** to `services/llmService.ts`:

```typescript
export type LLMProvider = 'gemini' | 'ollama' | 'llamacpp' | 'anthropic' | 'openrouter';

export const getActiveProvider = (settings: LLMSettings): LLMProvider => {
    switch (settings.activeLLM) {
        case 'ollama':
        case 'ollama_cloud': return 'ollama';
        case 'llamacpp': return 'llamacpp';
        case 'anthropic': return 'anthropic';
        case 'openrouter': return 'openrouter';
        default: return 'gemini';
    }
};

export class ProviderUnsupportedError extends Error {
    constructor(feature: string, provider: LLMProvider, supported: LLMProvider[]) {
        super(`${feature} is not available with the ${provider} engine (supported: ${supported.join(', ')}). Switch the AI Engine in Settings > Integrations.`);
        this.name = 'ProviderUnsupportedError';
    }
}

const requireProvider = (feature: string, settings: LLMSettings, supported: LLMProvider[]): LLMProvider => {
    const provider = getActiveProvider(settings);
    if (!supported.includes(provider)) throw new ProviderUnsupportedError(feature, provider, supported);
    return provider;
};
```

- [ ] **Step 2:** `pnpm lint` green. Commit: `git commit -am "feat: central LLM provider resolution with explicit unsupported errors"`

---

### Task 2: Convert every dispatch site in llmService.ts

**Files:**
- Modify: `services/llmService.ts` (all ~16 exported functions)

- [ ] **Step 1: Enumerate every dispatch site:** `grep -n "activeLLM ===" services/llmService.ts`. Every hit outside the Task 1 block must be gone by the end of this task.
- [ ] **Step 2: Convert each function.** Pattern — a function implemented for Ollama and Gemini only:

```typescript
// BEFORE (silent fallthrough)
export const generateFocusedVariations = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? generateFocusedVariationsOllama(promptText, components, settings)
        : generateFocusedVariationsGemini(promptText, components, settings);
};

// AFTER (explicit)
export const generateFocusedVariations = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    const provider = requireProvider('Focused variations', settings, ['ollama', 'gemini']);
    return provider === 'ollama'
        ? generateFocusedVariationsOllama(promptText, components, settings)
        : generateFocusedVariationsGemini(promptText, components, settings);
};
```

  The `supported` list for each function = exactly the providers it **actually branches to today**. Do not add providers to the list without an implementation; do not remove ones that exist (e.g. `dissectPrompt` supports `['llamacpp', 'ollama', 'gemini']`; `streamChat` at `:665` supports all five — for all-five functions, `requireProvider` never throws, but convert anyway so the booleans disappear).
  Feature names go into user-visible error text — use human phrasing: `'Prompt dissection'`, `'Prompt reconstruction'`, `'Component replacement'`, `'Intent reconstruction'`, `'Image abstraction'`, `'Formula generation'`, `'Constructor preset'`, `'Translation'`, `'Chat'`, etc.
- [ ] **Step 3: Re-run the grep from Step 1** — zero hits outside `getActiveProvider`. Also `grep -n "isOllama\|isLlamaCpp\|isAnthropic\|isOpenRouter" services/llmService.ts` — zero hits.
- [ ] **Step 4: Check how errors surface.** Read `utils/errorHandler.ts` and find how the components that call these functions (grep `generateFocusedVariations\|dissectPrompt` in `components/`) render caught errors. If the handler rewrites unknown errors into a generic message, add a passthrough so `ProviderUnsupportedError.message` reaches the user verbatim (match on `error.name === 'ProviderUnsupportedError'`). If callers already display `error.message`, do nothing.
- [ ] **Step 5:** `pnpm lint` green. Commit: `git commit -am "fix: unsupported provider now errors instead of silently calling Gemini"`

---

### Task 3: Deduplicate the reasoning-tag stripper

**Files:**
- Modify: `services/llmService.ts` (`enhancePromptStream` stripper at `:347-371`, `refineSinglePromptStream` copy at `:428-452`)

The ~25-line `<think>`/`<thought>` stripping loop is copy-pasted verbatim in both streaming functions.

- [ ] **Step 1: Extract it** as a generator wrapper, moving the existing code **verbatim** (this is a pure dedupe — do not "improve" the logic in the same commit):

```typescript
async function* stripReasoningTags(stream: AsyncGenerator<string>): AsyncGenerator<string> {
    let inThought = false;
    for await (const chunk of stream) {
        let processChunk = chunk;
        if (processChunk.includes('<think') && processChunk.includes('</think>')) {
            processChunk = processChunk.replace(/<think[\s\S]*?<\/think>/g, '');
        } else if (processChunk.includes('<thought') && processChunk.includes('</thought>')) {
            processChunk = processChunk.replace(/<thought[\s\S]*?<\/thought>/g, '');
        } else {
            if (processChunk.includes('<think') || processChunk.includes('<thought')) {
                inThought = true;
                const parts = processChunk.split(/<think|<thought/);
                if (parts[0]) yield parts[0];
                continue;
            }
            if (processChunk.includes('</think>') || processChunk.includes('</thought>')) {
                inThought = false;
                const parts = processChunk.split(/<\/think>|<\/thought>/);
                if (parts[1]) yield parts[1];
                continue;
            }
        }
        if (!inThought && processChunk) {
            yield processChunk;
        }
    }
}
```

- [ ] **Step 2:** In both `enhancePromptStream` and `refineSinglePromptStream`, replace the inlined loop with `yield* stripReasoningTags(stream);` where `stream` is the provider generator each already builds. Diff the deleted blocks against the helper to confirm they were identical.
- [ ] **Step 3:** `pnpm lint` green. Commit: `git commit -am "refactor: single stripReasoningTags helper for both stream paths"`

---

### Task 4: Fix the LlamaCpp stream-termination bug

**Files:**
- Modify: `services/llamacppService.ts` (enhance-stream reader around `:125-151`)

**The bug:** the enhance-path SSE reader exits its `for` loop with `break` when it sees `data: [DONE]` (`llamacppService.ts:140`) — but that only exits the **inner** per-line loop; the outer `while (true)` keeps reading until the socket closes. The chat-path copy in the same file (`:203-229`) correctly uses `return` (`:218`).

- [ ] **Step 1:** Open the enhance-stream function, locate the `[DONE]` check, and confirm the loop nesting matches the description above (line numbers may have drifted — match on structure, not numbers).
- [ ] **Step 2:** Change `break` → `return` so it matches the chat path.
- [ ] **Step 3:** `pnpm lint` green. Commit: `git commit -am "fix: llamacpp enhance stream terminates on [DONE] instead of waiting for socket close"`

---

## Edge cases a weaker model would miss

1. **`ollama_cloud` maps to `ollama`** — treating it as its own provider breaks every Ollama Cloud user.
2. The `default:` arm of `getActiveProvider` returning `gemini` is deliberate — it preserves today's behavior for a missing/legacy `activeLLM` value. Don't throw there.
3. `streamChat` and the other streaming functions are **async generators** — an error thrown before the first `yield` only surfaces when the consumer starts iterating. That's fine; just don't convert them to eager throws by restructuring.
4. The `supported` list is per-function truth, not aspiration. Copying one list to all 16 functions reintroduces the bug in reverse (blocking combinations that work today).
5. Some UIs may catch errors and show `error.message`, others a generic toast — Task 2 Step 4 exists because a perfect error thrown into a swallowing catch block is still invisible.
6. In Task 3, resist fixing the stripper's known chunk-boundary weakness (a tag split across chunks leaks) in the same change — dedupe first, improve later, or a regression is unattributable.

## Acceptance criteria

1. `pnpm lint` and `pnpm build` green.
2. `grep -n "activeLLM ===" services/llmService.ts` → matches only inside `getActiveProvider`.
3. Manual, in `pnpm dev`: set AI Engine to **Anthropic** (any dummy key). Open Prompt Anatomy and trigger focused variations → a visible error containing "not available with the anthropic engine", and DevTools Network shows **no request** to `generativelanguage.googleapis.com`.
4. Set engine to **Ollama** (running locally): prompt enhance (streaming), refine, dissect, and chat all work as before; a model emitting `<think>…</think>` shows no reasoning text in either the enhance or refine output.
5. Set engine to **Gemini**: everything works as before.
6. With **LlamaCpp** running: prompt enhance completes promptly at end-of-generation (no multi-second hang after the text stops).

## Out of scope

- Implementing missing features for Anthropic/OpenRouter/LlamaCpp (follow-up; the dispatch table now makes each gap explicit).
- Abort/cancellation support for streams (none exists anywhere today).
- Deduplicating the 4 copy-pasted SSE readers across provider services.
- Making the tag stripper chunk-boundary safe.
