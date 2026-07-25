# Provider Router

## Implementation

**File:** `services/providerRouter.ts`

The provider router is a cost-aware, latency-aware selection engine that chooses the best backend for the current task.

## Routing Rules

- Use the configured active provider as the default path for assistant and prompt workflows
- Switch providers only when the current provider is unsupported for the requested feature
- Surface explicit errors when the provider is not configured or the feature is unsupported
- Keep the provider decision at the service layer, not in the UI page components

## Selection Strategy

`providerRouter.selectForStep()`:
- Selects the best provider based on cost, latency, and modality requirements
- Maintains a history of per-provider samples (`MAX_SAMPLES`)
- Tracks cost and latency metrics for informed decisions

## Fallback Chain

`providerRouter.buildFallbackChain()` / `providerRouter.callWithFallback()`:
- Constructs an ordered fallback chain from the best provider to least preferred
- Automatic fallback when a provider fails or times out
- Degrades gracefully instead of failing abruptly

## Cost & Latency Tracking

- Per-provider cost estimates based on model pricing
- Latency measured from historical request samples
- `MAX_SAMPLES` configurable cap on history

## Active Provider Resolution

`getActiveProvider(settings)` in `services/llmService.ts`:
- Collapses `ollama_cloud` → `ollama`
- Resolves `gemini`, `ollama`, `llamacpp`, `anthropic`, `openrouter`
- Used by `requireProvider()` to gate feature access per provider

## Capability Gating

`requireProvider(feature, settings, supported)`:
- Throws `ProviderUnsupportedError` with actionable message
- Supported feature sets:
  - **Gemini/Ollama/llama.cpp/Anthropic:** All core features (refine, enhance, dissect, translate, analyze, generate)
  - **OpenRouter:** Stream-only (via `ollamaToolDeclarations` format)

## Tests

`services/providerRouter.test.ts` — selection ordering, fallback chain, cost calculation
