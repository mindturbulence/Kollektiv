# Capability Expansion Roadmap

> **For agentic workers:** This is a **roadmap**, not a single executable plan. Each phase below is an independent subsystem and gets its own detailed task-level plan at kickoff (`docs/plans/YYYY-MM-DD-<phase-name>.md`), written with `superpowers:writing-plans`. Do not attempt to execute this document directly.

**Goal:** Extend Kollektiv's creative capabilities across six independent workstreams, ordered smallest-diff-first, closing the gap between what `VISION.md` promises and what the app does.

**Architecture:** Every phase is additive and flag-gated. No phase removes or rewrites an existing working path. Phases 1–3 harden and surface capability already in the tree; phases 4–5 add new user surfaces over existing engines; phase 6 closes the local-first generation gap using the proxy pattern already proven twice in `server.ts`.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Express bridge (`server.ts`), IndexedDB + File System Access API, Zod validation, Vitest + Playwright.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green. Add tests for all new logic.
- New settings must go through the shared settings object **and** the `handleSettingsChange` allow-list, then be verified to survive a reload (`AI_WORKER_RULES.md` §4).
- Conventional Commits: `type(scope): summary`. Branch off `main`, never commit to `main` directly.
- Styling stays within Tailwind + DaisyUI. No ad-hoc CSS.
- Local-first: no phase may introduce a required cloud dependency for a core workflow.
- No new confirmation gates on assistant tools. ISSUE-22 was a deliberate user decision (see Decision Record below).

---

## Verified Findings

Everything below was confirmed by reading the code on 2026-07-28, not inferred from docs.

| Claim | Evidence |
|---|---|
| Generation is cloud-only | `hooks/useGenerateLoop.ts:11` imports only `generateWithImagen`, `generateWithNanoBanana`, `generateWithVeo`; all re-exported from `geminiService` at `llmService.ts:545` |
| No local diffusion backend exists | No `comfyui`, `/sdapi/`, or `txt2img` match anywhere outside `node_modules` |
| Local-proxy pattern is proven | `server.ts:181-246` (`/ollama-local`) and `server.ts:249+` (`/llamacpp-local`) — transparent pass-through, streams response, IPv4 → localhost → IPv6 fallback, helpful ECONNREFUSED message |
| Execution engine is real, not a stub | `services/executionEngine.ts` — `StepStatus`, `StepResult`, `PlanResult`, retry with `maxRetries`/`retryDelayMs`, step + plan observers, cancellation flag |
| Capability platform is UI-unreachable | `planner`, `executionEngine`, `intentRouter` are imported by exactly one file: `services/assistantTools.ts:24-26` |
| Auto-tagging needs no schema change | `GalleryItem.tags?: string[]` already exists at `types.ts:384` |
| A vision path already ships | `abstractImageGemini(base64ImageData, ...)` at `geminiService.ts:414` |
| Search is keyword-only | `utils/vaultSearch.ts` — BM25 `VaultSearchIndex` class, singleton via `getSearchIndex()`, test seam `_setSearchIndex()` |
| `providerRouter.ts` is deleted | File does not exist. Deleted 2026-07-26 under ISSUE-32 |
| Provider switching is deliberately strict | `llmService.ts:29-33` — `requireProvider()` **throws** `ProviderUnsupportedError` rather than switching |
| No feature backlog is queued | Every unchecked box in `docs/ISSUES.md` is a manual test checklist, not feature work |

### Roadmap discrepancy found

`ARCHITECTURE_CONSTITUTION.md:205` marks Phase 2 complete including *"Gallery intelligence: auto-tagging, similarity clustering, visual search."* **No implementation was found for any of the three.** `utils/galleryAnalytics.ts` exports exactly one function, `computeGalleryStats`. Greps for `autoTag`/`suggestTags`/`generateTags` and for embedding/vector/cosine/cluster return nothing relevant.

This matches a documented pattern in this repo — `providerRouter` was marked done while being a stub (ISSUE-32), `relationshipGraph` was marked done while disconnected (ISSUE-31). **Phase 1 corrects the roadmap line as part of its deliverable.**

---

## Phase Order and Rationale

| Phase | Workstream | Why here |
|---|---|---|
| 1 | Auto-tagging | Smallest diff. No schema change, vision path exists, corrects a false roadmap claim |
| 2 | Provider fallback router | Self-contained in `llmService`. Makes every later phase more resilient |
| 3 | Relationship graph expansion | Pure additive use of built-and-tested code |
| 4 | Batch runner | Needs 1–3 stable; surfaces the execution engine to the UI |
| 5 | Semantic vault search | Largest data-migration surface of the non-generation work |
| 6a | Forge Neo / A1111 generation | Copies the proven proxy pattern; closes the vision gap |
| 6b | ComfyUI generation | Hardest; needs the adapter seam 6a establishes |

Each phase ships behind a settings flag and is independently revertible.

---

## Phase 1 — Gallery Auto-Tagging

**Goal:** Generate tag suggestions for gallery items from their image content and prompt text, writing to the existing `GalleryItem.tags` field, with the user accepting or rejecting suggestions rather than having them applied silently.

**Why first:** No schema migration (`types.ts:384` already has `tags?: string[]`). A working vision call already exists (`geminiService.ts:414`). The whole change is one service, one settings flag, and one UI affordance in the gallery.

**Files:**
- Create: `services/autoTagService.ts` — tag generation and normalization
- Create: `services/autoTagService.test.ts`
- Modify: `components/ImageGallery.tsx` — suggestion affordance on item detail
- Modify: `components/ItemDetailView.tsx` — accept/reject suggested tags
- Modify: `utils/settingsStorage.ts` + `types.ts` — `autoTagEnabled` flag through the allow-list
- Modify: `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md:205` — correct the false Phase 2 claim
- Modify: `docs/ISSUES.md` — log the correction

**Scope:**
- Tag suggestion from image content via a vision call, plus the item's `prompt` text when present
- Tag normalization: lowercase, trim, collapse whitespace, deduplicate against the item's existing tags
- Explicit user accept/reject. **Suggestions are never written automatically.**
- Single-item suggestion
- Graceful degradation when the active provider has no vision support — surface `ProviderUnsupportedError`'s message, do not silently fall back

**Deferred out of Phase 1** (were in this section's first draft, moved during task planning):
- Multi-select batch suggestion. Ship the single-item path first and learn whether batching is actually wanted.
- Canonicalizing against the vault's existing tag vocabulary (`scifi` → the already-used `sci-fi`). Needs fuzzy matching with plural and hyphen handling — a materially larger problem than exact-match dedupe, and easier to tune once real suggestions exist to inspect.

**Out of scope:**
- Similarity clustering and visual search (the other two false Phase 2 claims). Clustering depends on embeddings, which is Phase 5. Track them as open, do not mark them done.
- Any tag taxonomy or hierarchy. Flat strings only, matching the existing field.

**Acceptance criteria:**
1. Selecting an untagged gallery image produces at least one relevant suggestion within 10s using the default provider.
2. Rejecting a suggestion leaves `item.tags` byte-identical to before.
3. Accepting a suggestion persists it and survives a full page reload.
4. With `autoTagEnabled: false`, no vision call is made — verified by network inspection.
5. With a non-vision provider active, the UI shows the provider's own error message and makes no partial write.
6. `ARCHITECTURE_CONSTITUTION.md:205` no longer claims unshipped work.
7. `pnpm lint` clean, `pnpm test` green.

**Risks:** Vision calls cost money on cloud providers and are slow on local ones. Mitigation: flag defaults to **off**, suggestions are explicitly user-triggered, never on ingest.

---

## Phase 2 — Provider Fallback Router

**Goal:** When the user's chosen provider fails at runtime, fall back to a user-configured ordered list instead of surfacing a hard error — without ever overriding a provider that is working.

**Critical framing — read before implementing.** `services/providerRouter.ts` was **deleted** on 2026-07-26 (ISSUE-32) and must not be restored as designed. The deleted module did *silent, cost-and-latency-based* provider selection, which conflicts directly with `llmService.ts:29-33`, where `requireProvider()` deliberately throws rather than switching. `LLMSettings.activeLLM` is a deliberate user choice — local model for privacy, a specific paid API on the user's own key.

This phase builds different semantics:

| Deleted design (rejected) | This phase (accepted) |
|---|---|
| Switches on cost/latency heuristics | Switches only on **actual runtime failure** |
| Silent and automatic | User-configured ordered chain, off by default |
| Overrides a working provider | Never fires while the active provider succeeds |
| Opaque to the user | Every fallback is surfaced in the UI and logged to the activity panel |

`ProviderUnsupportedError` must **still throw**. A capability the provider cannot perform is not a transient failure and must not trigger fallback — otherwise a user's privacy choice silently leaks to a cloud provider.

**Files:**
- Create: `services/providerFallback.ts` (deliberately **not** `providerRouter.ts` — the old name carries the rejected design)
- Create: `services/providerFallback.test.ts`
- Modify: `services/llmService.ts` — wrap provider calls at the single dispatch point
- Modify: `types.ts` + `utils/settingsStorage.ts` — `providerFallbackChain: LLMProvider[]`, `providerFallbackEnabled: boolean`
- Modify: `components/settings/` — chain configuration UI

**Scope:**
- Ordered fallback chain, user-configured, empty and disabled by default
- Fires only on network error, timeout, 5xx, or rate limit
- Never fires on `ProviderUnsupportedError` or on auth/4xx errors (those are user-fixable configuration problems)
- Every fallback emits a visible notice naming both providers and the triggering error

**Out of scope:** Cost tracking, latency measurement, automatic chain ordering. All three are what got the original module deleted.

**Acceptance criteria:**
1. With the chain disabled, behavior is byte-identical to today — verified by the existing `llmService` test suite passing unmodified.
2. A simulated network failure on the active provider transparently completes via the next chain entry.
3. `ProviderUnsupportedError` still propagates to the user and triggers **no** fallback.
4. A 401 triggers no fallback.
5. Every fallback produces a user-visible notice naming both providers.
6. An exhausted chain surfaces the **original** error, not the last one.

**Risks:** A privacy-conscious user configuring a cloud provider in the chain behind a local model may not expect prompts to leave the machine. Mitigation: the settings UI must state this explicitly, and the chain ships empty.

---

## Phase 3 — Relationship Graph Expansion

**Goal:** Surface the graph traversal already built and tested in `services/relationshipGraph.ts` (52 tests) through additional assistant tools and a browsable vault map.

**Context:** ISSUE-31 wired `find_related_knowledge` (tag-overlap only) and *deliberately* left `traverse`, `findPaths`, and `getSubgraph` unused as a minimal-scope decision. This phase reopens that scope intentionally, at the user's direction. It is an expansion of a working feature, not a correction of a defect.

**Files:**
- Create: `services/tools/graphTraversalTools.ts` + test
- Modify: `services/tools/graphTools.ts` — share the rehydration path
- Create: `components/VaultMapPanel.tsx` — visual graph browser
- Modify: `components/CommandPalette.tsx` — add an open-map command

**Scope:**
- New assistant tools exposing `traverse` (n-hop neighborhood) and `findPaths` (how two artifacts connect)
- A read-only visual map of the rehydrated graph, reachable from the command palette
- Reuse the existing on-demand rehydration from `memoryStorage`/`galleryStorage`/`promptStorage`. **No write-path plumbing.**

**Out of scope:**
- Persisting the graph. On-demand rehydration is the established pattern and avoids a whole class of staleness bugs.
- Prompt lineage. Already solved separately by `SavedPrompt.lineage`; duplicating it would create two conflicting sources of truth.

**Acceptance criteria:**
1. `traverse` from a tagged gallery item returns its n-hop neighborhood with correct hop counts.
2. `findPaths` between two artifacts sharing an intermediate tag returns at least one path.
3. The map renders a vault of 500+ entities without blocking the main thread beyond 100ms.
4. Rehydration cost is measured and documented; if a full rehydrate per call exceeds 500ms at realistic vault size, add caching **in this phase** rather than deferring it. Any such cache must be **in-memory only, invalidated on any vault mutation, and never persisted** — a persisted graph cache is the write-path plumbing ISSUE-31 deliberately avoided, and it reintroduces the staleness class this phase's out-of-scope section rules out.

**Risks:** Rehydrating the whole graph per tool call may not scale. The acceptance criteria force this to be measured, not assumed.

---

## Phase 4 — Batch Runner

**Goal:** Give the user direct access to the capability platform — run a chain of capabilities across many prompts or gallery items without going through the assistant.

**Why this is cheap:** `services/executionEngine.ts` already provides step sequencing, retry (`maxRetries`, `retryDelayMs`), per-step and per-plan observers, cancellation, and typed `StepResult`/`PlanResult`. It is imported by exactly one file (`assistantTools.ts:24-26`). This phase is a **UI surface over a working engine**, not new orchestration.

**Files:**
- Create: `components/BatchRunnerPage.tsx`
- Create: `hooks/useBatchRun.ts` + test
- Create: `services/batchQueue.ts` + test — job queue over `createExecutionEngine`
- Modify: `components/App.tsx` — new `ActiveTab` entry
- Modify: `components/CommandPalette.tsx`

**Scope:**
- Select an input set (prompts from the library, or gallery items)
- Compose an ordered chain from registered capabilities
- Run sequentially with live per-item progress via the engine's existing observers
- Cancel mid-run using the engine's existing cancellation flag
- A run report showing per-item success, skip, and failure

**Out of scope:**
- Parallel execution. `executionEngine.ts:11-13` documents the step loop as intentionally sequential; changing it is a separate decision with its own risks.
- Scheduling and recurring runs.
- Saved/reusable recipes. Ship one-off runs first, learn which chains actually get used, then decide.

**Acceptance criteria:**
1. A 10-prompt refine-then-generate chain completes with a per-item report.
2. Cancelling mid-run stops before the next item and preserves completed results.
3. A single item's failure does not abort the batch; it is reported and the run continues.
4. Progress updates come from the engine's existing observers — no polling.
5. Closing and reopening the page during a run does not lose the run state.

**Risks:** Long batches against paid providers can spend real money fast. Mitigation: show an item count and a provider name in a pre-run summary, and make cancellation prominent during the run.

---

## Phase 5 — Semantic Vault Search

**Goal:** Make the vault searchable by meaning rather than keyword, computed locally via the existing Ollama bridge, with no required cloud dependency.

**Files:**
- Create: `services/embeddingService.ts` + test — local embeddings via `/ollama-local`
- Create: `utils/semanticIndex.ts` + test — vector store in IndexedDB
- Modify: `utils/vaultSearch.ts` — hybrid ranking alongside BM25
- Modify: `components/CommandPalette.tsx` — surface hybrid results

**Scope:**
- Embed prompt text and gallery item titles, prompts, notes, and tags
- Persist vectors in IndexedDB alongside the existing BM25 index
- Hybrid ranking: BM25 and semantic scores combined, never semantic-only — exact-term search must not regress
- Incremental backfill over an existing vault with visible progress and safe resumption
- Re-embed on mutation, reusing the existing auto-rebuild hooks

**Out of scope:**
- Image embeddings and visual similarity. Text first; CLIP-style image search is a follow-on once the vector store is proven.
- Cloud embedding providers. Local-first is the point of doing it this way.

**Acceptance criteria:**
1. A conceptual query returns relevant prompts that share no literal keyword with the query.
2. Every existing `vaultSearch.test.ts` test passes unmodified — exact-term search does not regress.
3. Backfill over 1,000 items is resumable after a mid-run page reload, with no duplicate vectors.
4. With no Ollama instance running, search silently degrades to BM25 with no error shown.
5. Index size is measured and reported in settings so the user can see storage cost.

**Risks:** Highest data-migration surface of the non-generation work, and IndexedDB vector storage grows fast. Acceptance criterion 5 forces the cost to be visible. Criterion 4 keeps the feature strictly additive.

---

## Phase 6a — Forge Neo / A1111 Generation

**Goal:** Generate images entirely offline against a local Forge Neo or A1111 instance, closing the contradiction between `VISION.md:12` ("stays useful even when network connectivity is limited") and a generation path that is 100% cloud.

**Why this before ComfyUI:** the A1111-family REST API is a near drop-in for the transparent proxy already proven twice. `POST /sdapi/v1/txt2img` returns `{images: [base64]}` in a single synchronous call, which maps directly onto `useGenerateLoop`'s existing `generating` phase with no change to the state machine.

> **Unverified:** the `/sdapi/v1/*` API shape above comes from general knowledge of the A1111/Forge family, **not** from this repo (which contains no such integration) and not from a running instance. The first task of this phase must be to capture a real request/response against the user's own instance and confirm the contract before any code is written.

**Files:**
- Modify: `server.ts` — add `/sdapi-local` proxy following the `/ollama-local` pattern at `server.ts:181-246` verbatim, including the IPv4 → localhost → IPv6 fallback chain and the ECONNREFUSED guidance message
- Create: `src/schemas/generation.ts` — Zod validation for the route
- Create: `services/localDiffusionService.ts` + test — the A1111 adapter
- Create: `services/generationBackend.ts` — the backend interface both 6a and 6b implement
- Modify: `hooks/useGenerateLoop.ts:11` — dispatch through the backend interface instead of importing Gemini functions directly
- Modify: `types.ts` + `utils/settingsStorage.ts` — backend selection and base URL through the allow-list
- Modify: `components/GeneratePanel.tsx` — backend selector

**Scope:**
- Transparent proxy route, host and port user-configurable (default `127.0.0.1:7860`)
- Adapter covering txt2img: prompt, negative prompt, steps, CFG, sampler, seed, dimensions
- Model and sampler list fetched from the instance rather than hardcoded
- Backend selector in the generate panel; **cloud remains the default**
- The `generating` phase of `useGenerateLoop` is the only phase that changes

**Out of scope:** img2img, inpainting, ControlNet, LoRA selection at generate time. Ship txt2img end-to-end first.

**Acceptance criteria:**
1. With the network disabled and a local instance running, a prompt produces an image that ingests into the gallery.
2. The generated item carries the same metadata shape as a cloud-generated one — verified by comparing gallery records.
3. With no local instance running, the error names the port and tells the user how to start the backend, matching the tone of the existing Ollama message at `server.ts:236-243`.
4. Switching backends mid-session requires no reload.
5. `useGenerateLoop`'s phase machine is unchanged apart from backend dispatch — verified by diff.
6. The route has Zod validation and a rate limiter, matching the pattern used by the reach routes.

**Risks:** Forge Neo may have diverged from A1111's API. Mitigation: the contract-capture task runs first and gates the rest of the phase.

---

## Phase 6b — ComfyUI Generation

**Goal:** Support ComfyUI as a generation backend behind the interface established in 6a.

> **Unverified:** the ComfyUI API description below is from general knowledge, not from this repo or a running instance. As with 6a, capture the real contract against the user's own instance before writing code.

**Why last:** ComfyUI has no simple txt2img endpoint. It accepts a full node-graph JSON at `POST /prompt`, returns a `prompt_id`, reports progress over a WebSocket, and requires separate `/history/{prompt_id}` and `/view` calls to retrieve output. Three concerns the existing proxy pattern does not cover.

**Key design decision — polling over WebSocket, initially.** The prod CSP at `ARCHITECTURE_CONSTITUTION.md:314` allows `http://localhost:*` but no `ws://localhost:*`, so a WebSocket needs either a CSP change or an Express upgrade handler. Polling `/history/{prompt_id}` works over the existing transparent HTTP proxy with no CSP change and no new server machinery. It costs live progress percentage. Ship polling first; add the socket only if progress granularity proves genuinely necessary.

**Files:**
- Modify: `server.ts` — `/comfy-local` proxy, same pattern (default `127.0.0.1:8188`)
- Create: `services/comfyService.ts` + test — graph submission, polling, image retrieval
- Create: `constants/comfyWorkflows.ts` — default workflow template with substitution points
- Modify: `services/generationBackend.ts` — register the adapter

**Scope:**
- One built-in default txt2img workflow with substitution points for prompt, negative prompt, seed, steps, CFG, model, and dimensions
- User import of their own workflow JSON, with a field-mapping UI binding Kollektiv's inputs to node IDs
- Result polling with a timeout and a clear cancel path
- Image retrieval via `/view` into the existing ingest path

**Out of scope:** A workflow editor. ComfyUI already is one; Kollektiv drives workflows, it does not author them.

**Acceptance criteria:**
1. The built-in workflow generates and ingests an image offline.
2. An imported user workflow generates after field mapping.
3. A malformed workflow produces a clear error naming the failing node, not a raw stack trace.
4. Cancelling a queued job stops polling and does not ingest a partial result.
5. A job exceeding the timeout fails cleanly with the elapsed time reported.
6. Retrieval works when ComfyUI writes to a custom output directory.

**Risks:** Workflow-JSON field mapping is the hardest UX in this roadmap and the most likely to need iteration. Mitigation: the built-in workflow must work end-to-end before import is started, so there is always a working path.

---

## Decision Record

- **Provider fallback is failure-triggered, never cost-triggered.** Reversing ISSUE-32's reasoning would break the guarantee that `activeLLM` is the user's own choice.
- **No new confirmation gates.** ISSUE-22 removed the Gmail confirmation gate as a deliberate user decision; the user has reverted a reintroduction of this pattern once already.
- **Polling before WebSocket for ComfyUI.** Avoids a CSP change and an Express upgrade handler until progress granularity is proven necessary.
- **Sequential batch execution.** `executionEngine.ts:11-13` documents this as intentional; parallelism is a separate decision.
- **Cloud generation stays the default** after Phase 6a. Local is opt-in, so no existing workflow changes under the user.
- **Roadmap claims get corrected, not quietly inherited.** Phase 1 fixes `ARCHITECTURE_CONSTITUTION.md:205`; clustering and visual search stay marked open until actually built.

## Open Questions

1. **Forge Neo API parity with A1111** — resolved by the contract-capture task gating Phase 6a.
2. **Graph rehydration cost at scale** — resolved by Phase 3's acceptance criterion 4.
3. **Embedding model choice** for Phase 5 — decide at that phase's kickoff, based on what the user actually runs in Ollama.
4. **Should clustering and visual search be built at all?** They were claimed but never shipped, and nobody has missed them. Revisit after Phase 5 makes embeddings available; they become nearly free at that point.
