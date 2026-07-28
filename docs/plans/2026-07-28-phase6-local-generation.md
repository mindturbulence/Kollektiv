# Phase 6 — Local Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Tasks 1 and 7 are gates.** They capture external API contracts against the user's own running instances. Tasks that depend on a captured contract are marked **BLOCKED** and must not be written until the capture is pasted into this document.

**Goal:** Generate images entirely offline against a local Forge Neo / A1111 instance (6a) and against ComfyUI (6b), closing the contradiction between `VISION.md:12` and a generation path that is 100% cloud.

**Architecture:** A transparent proxy route per backend, copying `server.ts:181-246` verbatim, plus a `GenerationBackend` interface that both adapters implement. `useGenerateLoop`'s phase machine does not change — only which function its `generating` phase calls.

**Tech Stack:** TypeScript (strict), Express (`server.ts`), Zod, React 19, Vitest.

**6a and 6b are one document because they share `services/generationBackend.ts`.** Two independently-written plans would define that interface twice, differently.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green.
- New settings follow the 4-step recipe in `AI_WORKER_RULES.md:43-44`, including **the allow-list at `components/SetupPage.tsx:436`**.
- Test assertions use `toBeTruthy()`, **not** `toBeInTheDocument()`. `vite.config.ts:178` sets `setupFiles: []`.
- New server routes get **Zod validation and a rate limiter**, matching the reach routes.
- `AI_WORKER_RULES.md:58`: no open forwarders. New proxy routes stay constrained to a configured host.
- **Cloud generation remains the default.** Local is opt-in, so no existing workflow changes underneath the user.
- Conventional Commits. Work on `development`.

## The Contradiction This Closes

| Promise | Reality |
|---|---|
| `VISION.md:12` — "stays useful even when network connectivity is limited" | `hooks/useGenerateLoop.ts:11` imports only `generateWithImagen`, `generateWithNanoBanana`, `generateWithVeo` — all Google cloud |
| Constitution principle 1 — "local-first by default" | No `comfyui`, `/sdapi/`, or `txt2img` anywhere in the repo |
| Text already works offline | `server.ts:181` proxies Ollama, `server.ts:249` proxies llama.cpp |

The pattern to close it already exists and is proven twice. Images are simply the one modality nobody wired.

## Verified Codebase Facts

| Fact | Location |
|---|---|
| Proxy pattern: transparent pass-through, `req.url` forwarded verbatim, response streamed, IPv4 → localhost → IPv6 fallback, ECONNREFUSED guidance | `server.ts:181-246` |
| Generation entry point | `hooks/useGenerateLoop.ts:11` |
| Phases: `idle → refining → generating → ingesting → ready`, plus `error` | `hooks/useGenerateLoop.ts:15` |
| Gallery ingest | `addItemToGallery(type, urls, sources, categoryId?, defaultTitle?, tags?, notes?, prompt?, isNsfw?)` at `utils/galleryStorage.ts:163` |
| Zod schemas live in `src/schemas/`, wired via `validate()` | `ARCHITECTURE_CONSTITUTION.md:334` |
| Prod CSP allows `http://localhost:*` but **no `ws://localhost:*`** | `ARCHITECTURE_CONSTITUTION.md:314` |

## External Contracts — UNVERIFIED

Everything this plan says about `/sdapi/v1/*` and ComfyUI's `/prompt` comes from general knowledge. **This repo contains no such integration, and no instance was queried while writing this.** Forge Neo in particular is a fork-of-a-fork and may have diverged.

Tasks 1 and 7 capture the truth. Do not write adapter bodies before then.

## File Structure

| File | Responsibility |
|---|---|
| `services/generationBackend.ts` (create) | The interface both adapters implement, plus the registry. |
| `services/generationBackend.test.ts` (create) | Tests. |
| `server.ts` (modify) | `/sdapi-local` and `/comfy-local` proxy routes. |
| `src/schemas/generation.ts` (create) | Zod validation. |
| `services/localDiffusionService.ts` (create) | A1111 / Forge Neo adapter. |
| `services/comfyService.ts` (create) | ComfyUI adapter. |
| `constants/comfyWorkflows.ts` (create) | Default workflow template. |
| `hooks/useGenerateLoop.ts` (modify) | Dispatch through the interface. |
| `types.ts`, `utils/settingsStorage.ts`, `components/SetupPage.tsx` (modify) | Settings. |
| `components/GeneratePanel.tsx` (modify) | Backend selector. |

---

# Part 6a — Forge Neo / A1111

## Task 1: GATE — capture the A1111-family contract

**No code.** Output is a pasted real response.

- [ ] **Step 1: Confirm the instance is up**

```bash
curl -s http://127.0.0.1:7860/sdapi/v1/sd-models | head -c 400
curl -s http://127.0.0.1:7860/sdapi/v1/samplers | head -c 400
```

If these 404, the API is off — restart with `--api` and record the exact flag used.

- [ ] **Step 2: Capture a real generation**

```bash
curl -s http://127.0.0.1:7860/sdapi/v1/txt2img \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a cinematic sunset","steps":8,"width":512,"height":512}' \
  | head -c 600
```

- [ ] **Step 3: Record the truth here**

```
Backend and version: Forge Neo, running at D:\AI-Dev\ForgeNeo
Port: 7860
Launch flag needed for the API: already running with API enabled — no flag change needed
txt2img request fields accepted: prompt, negative_prompt, steps, width, height, cfg_scale, sampler_name, seed
txt2img response top-level keys: images, parameters, info
Image encoding: raw base64 in images[0], NO "data:" prefix — services/a1111Service.ts adds the prefix itself
Model list response shape: GET /sdapi/v1/sd-models → [{title, model_name, hash, sha256, filename}, ...]
Sampler list response shape: GET /sdapi/v1/samplers → [{name, aliases, options}, ...]
Date captured: 2026-07-28, live full round trip (24.4s for an 8-step 512x512 generation)
```

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-07-28-phase6-local-generation.md
git commit -m "docs(generation): capture the real A1111-family contract"
```

---

## Task 2: Proxy route

**Not blocked** — the proxy is transparent and needs no contract knowledge.

**Files:**
- Modify: `server.ts`
- Create: `src/schemas/generation.ts`

- [ ] **Step 1: Add the route**

Copy `server.ts:181-246` verbatim and change only:
- path → `/sdapi-local`
- port → the port captured in Task 1 (default `7860`), read from an env var with that default so it is not hardcoded (`AI_WORKER_RULES.md:64`)
- the ECONNREFUSED message → name the port and say how to start the backend with its API enabled, matching the tone of `server.ts:236-243`

**Keep all three fallbacks** (IPv4 → localhost → IPv6). They exist because they were needed for Ollama, and the same host resolution applies.

- [ ] **Step 2: Add the rate limiter**

Apply a limiter matching the reach-route pattern. Generation is expensive; a stricter tier than 60/15min is reasonable.

- [ ] **Step 3: Verify it proxies**

```bash
pnpm dev
curl -s http://127.0.0.1:7500/sdapi-local/sdapi/v1/sd-models | head -c 200
```
Expected: the same JSON as hitting port 7860 directly. Then stop the backend and confirm the 502 message names the port and the fix.

- [ ] **Step 4: Commit**

```bash
git add server.ts src/schemas/generation.ts
git commit -m "feat(generation): add /sdapi-local proxy route"
```

---

## Task 3: The backend interface

**Not blocked.**

**Files:**
- Create: `services/generationBackend.ts`, `services/generationBackend.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GenerateParams {
    prompt: string; negativePrompt?: string;
    width: number; height: number;
    steps: number; cfgScale: number;
    seed?: number; sampler?: string; model?: string;
  }
  export interface GenerateOutput { dataUrl: string; seed?: number; backendId: string }
  export interface GenerationBackend {
    id: string; label: string;
    isAvailable(settings: LLMSettings): Promise<boolean>;
    listModels(settings: LLMSettings): Promise<string[]>;
    generate(params: GenerateParams, settings: LLMSettings, signal?: AbortSignal): Promise<GenerateOutput>;
  }
  export function registerBackend(b: GenerationBackend): void
  export function getBackend(id: string): GenerationBackend | undefined
  export function listBackends(): GenerationBackend[]
  ```

> **`GenerateOutput.dataUrl` is a full `data:image/png;base64,...` URL**, not raw base64. `useGenerateLoop`'s `generatedUrl` field is documented as "Data URL or blob URL" (`useGenerateLoop.ts:21-22`), so adapters normalize to that shape and the loop needs no special-casing.

- [ ] **Step 1: Write the failing test**

Create `services/generationBackend.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerBackend, getBackend, listBackends, _clearBackends } from './generationBackend';

const fake = (id: string) => ({
  id, label: id,
  isAvailable: async () => true,
  listModels: async () => ['m1'],
  generate: async () => ({ dataUrl: 'data:image/png;base64,AAA', backendId: id }),
});

describe('backend registry', () => {
  beforeEach(() => _clearBackends());

  it('registers and retrieves a backend', () => {
    registerBackend(fake('a1111'));
    expect(getBackend('a1111')?.label).toBe('a1111');
  });

  it('returns undefined for an unknown id', () => {
    expect(getBackend('nope')).toBeUndefined();
  });

  it('lists every registered backend', () => {
    registerBackend(fake('a1111'));
    registerBackend(fake('comfy'));
    expect(listBackends()).toHaveLength(2);
  });

  it('overwrites on duplicate id rather than duplicating', () => {
    registerBackend(fake('a1111'));
    registerBackend({ ...fake('a1111'), label: 'renamed' });
    expect(listBackends()).toHaveLength(1);
    expect(getBackend('a1111')?.label).toBe('renamed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/generationBackend.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

A `Map<string, GenerationBackend>` with the functions above. Export `_clearBackends()` as a test seam, mirroring `_setSearchIndex` in `utils/vaultSearch.ts:465`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/generationBackend.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add services/generationBackend.ts services/generationBackend.test.ts
git commit -m "feat(generation): add generation backend interface and registry"
```

---

## Task 4: A1111 adapter — **BLOCKED on Task 1**

**Files:**
- Create: `services/localDiffusionService.ts`, `services/localDiffusionService.test.ts`

**Write this only after Task 1's capture block is filled in.** Map `GenerateParams` onto the request fields **actually accepted** by the captured instance, and read the image from the **actual** response key. Do not write these from memory.

- [ ] **Step 1: Write the failing test**

Mock `fetch` with the **exact response body captured in Task 1**. Cover:
1. A successful generation returns a `data:` URL.
2. A non-ok response throws with a message naming the status.
3. An unreachable backend throws a message naming the port.
4. `listModels` returns names parsed from the captured model-list shape.
5. `isAvailable` returns `false` rather than throwing when the backend is down.
6. An `AbortSignal` cancels an in-flight generation.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run services/localDiffusionService.test.ts`

- [ ] **Step 3: Implement against the captured contract**

Post through `/sdapi-local`, never directly to port 7860 — the proxy is what makes this work under the production CSP.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add services/localDiffusionService.ts services/localDiffusionService.test.ts
git commit -m "feat(generation): add A1111/Forge Neo adapter"
```

---

## Task 5: Settings and backend selector

**Files:**
- Modify: `types.ts`, `utils/settingsStorage.ts`, `components/SetupPage.tsx:436`, `components/GeneratePanel.tsx`

**Interfaces:**
- Produces: `generationBackendId: string` (default `'cloud'`), `localDiffusionUrl: string` (default `'http://127.0.0.1:7860'`), `comfyUrl: string` (default `'http://127.0.0.1:8188'`).

**`generationBackendId` defaults to `'cloud'`.** Acceptance criterion: no existing workflow changes when this ships.

- [ ] **Step 1: Write the failing test**

Append to `utils/settingsStorage.test.ts`: defaults are `'cloud'` and the two localhost URLs; all three survive a round trip; all three fall back safely when absent.

- [ ] **Step 2: Apply the 4-step recipe**

Including **all three keys in the allow-list at `SetupPage.tsx:436`**.

- [ ] **Step 3: Add the selector to `GeneratePanel.tsx`**

Populate from `listBackends()`, plus the existing cloud option. Show a live availability dot driven by `isAvailable()`. Switching must not require a reload.

- [ ] **Step 4: Verify persistence by hand**

Run `pnpm dev`, switch backend, hard-reload, confirm the choice survived.

- [ ] **Step 5: Commit**

```bash
git add types.ts utils/settingsStorage.ts utils/settingsStorage.test.ts components/SetupPage.tsx components/GeneratePanel.tsx
git commit -m "feat(generation): add backend selection settings and picker"
```

---

## Task 6: Route `useGenerateLoop` through the interface

**Files:**
- Modify: `hooks/useGenerateLoop.ts`

**The phase machine must not change.** Acceptance criterion 5 is verified by diff: only the `generating` phase's dispatch differs.

- [ ] **Step 1: Replace the direct imports**

At `hooks/useGenerateLoop.ts:11`, keep `enhancePromptStream` and `cleanLLMResponse`, and route the three generation functions through a dispatch:

```ts
const backendId = settings.generationBackendId || 'cloud';
const backend = backendId === 'cloud' ? undefined : getBackend(backendId);
const generatedUrl = backend
  ? (await backend.generate(params, settings)).dataUrl
  : await generateWithImagen(refined, aspectRatio, settings); // existing cloud path unchanged
```

- [ ] **Step 2: Confirm the diff is confined**

Run: `git diff hooks/useGenerateLoop.ts`
Expected: changes only in the import line and the `generating` branch. **No phase names, transitions, or state fields touched.** If the diff is wider, back it out and try again.

- [ ] **Step 3: Verify offline generation end to end**

Start the local backend, disable networking, generate, and confirm the image ingests into the gallery. Then compare the resulting gallery record against a cloud-generated one — same metadata shape (acceptance criterion 2).

- [ ] **Step 4: Commit**

```bash
git add hooks/useGenerateLoop.ts
git commit -m "feat(generation): dispatch generation through the backend interface"
```

---

# Part 6b — ComfyUI

## Task 7: GATE — capture the ComfyUI contract

**No code.** ComfyUI has no simple txt2img endpoint: it takes a full node graph, returns a `prompt_id`, and requires separate history and image-fetch calls.

- [ ] **Step 1: Export a working workflow**

In ComfyUI, build a minimal txt2img workflow and export it with **Save (API Format)** — not the regular save. The API format is the only one `/prompt` accepts.

- [ ] **Step 2: Capture the full round trip**

```bash
curl -s http://127.0.0.1:8188/system_stats | head -c 300
curl -s http://127.0.0.1:8188/prompt -H 'Content-Type: application/json' -d @workflow_api.json
# then, with the returned id:
curl -s http://127.0.0.1:8188/history/<prompt_id> | head -c 800
```

- [ ] **Step 3: Record the truth here**

```
ComfyUI version: 0.16.4
Port: 8188
/prompt request wrapper key: {"prompt": {<node graph>}}
/prompt response shape: {prompt_id, number, node_errors}  — node_errors is {} on success
/history response path to the output filename: data[prompt_id].outputs[<save_image_node_id>].images[0].filename (+ .subfolder)
/view query parameters needed: filename, subfolder, type=output — GET /view?filename=...&subfolder=...&type=output
Node ids: standard default workflow uses 1=CheckpointLoaderSimple, 5=EmptyLatentImage, 6/7=CLIPTextEncode (pos/neg), 8=KSampler, 9=VAEDecode, 12=SaveImage.
  CRITICAL FINDING: the first version of this workflow (written before this capture) used SEPARATE CLIPLoader(4)/VAELoader(10)
  nodes and left ckpt_name/clip_name/vae_name as empty strings. Real ComfyUI rejected all three with
  "value_not_in_list" (received_value: ""), and CLIPLoader also failed on a missing required "type" field.
  CheckpointLoaderSimple already outputs MODEL/CLIP/VAE at indices 0/1/2 — a standard-checkpoint (SD1.5/SDXL)
  workflow must wire off THOSE outputs directly, not separate loader nodes. Checkpoint names come from
  GET /object_info/CheckpointLoaderSimple → .CheckpointLoaderSimple.input.required.ckpt_name[0] (an array).
  Fixed in commit 9677a7d; full round trip re-verified after the fix (submit → 0 node_errors → executes →
  /history reports the output within 1s → /view returns a real 218KB PNG with correct PNG magic bytes).
Date captured: 2026-07-28, against Forge Neo's bundled ComfyUI-family instance at :8188
```

- [ ] **Step 4: Commit both the capture and the workflow**

```bash
git add docs/plans/2026-07-28-phase6-local-generation.md constants/comfyWorkflows.ts
git commit -m "docs(generation): capture the real ComfyUI contract"
```

---

## Task 8: ComfyUI proxy route

**Not blocked.**

- [ ] **Step 1: Add `/comfy-local`**

Same verbatim copy of `server.ts:181-246`, port `8188` from an env var.

**HTTP only. No WebSocket upgrade handler.** See the decision below.

- [ ] **Step 2: Verify and commit**

```bash
curl -s http://127.0.0.1:7500/comfy-local/system_stats | head -c 200
git add server.ts && git commit -m "feat(generation): add /comfy-local proxy route"
```

### Decision: polling, not WebSocket

ComfyUI reports progress over `ws://.../ws`. The prod CSP (`ARCHITECTURE_CONSTITUTION.md:314`) allows `http://localhost:*` but **no `ws://localhost:*`**, so a socket needs either a CSP entry or an Express upgrade handler.

Polling `/history/{prompt_id}` works over the transparent HTTP proxy with neither. The cost is losing a live progress percentage — you get pending/done instead of 43%. **Ship polling.** Add the socket only if that granularity proves genuinely necessary, and treat it as its own change with its own CSP review.

---

## Task 9: ComfyUI adapter — **BLOCKED on Task 7**

**Files:**
- Create: `services/comfyService.ts`, `services/comfyService.test.ts`, `constants/comfyWorkflows.ts`

**Write only after Task 7's capture is filled in.**

**Design:** `constants/comfyWorkflows.ts` holds the exported API-format workflow with node ids recorded in Task 7. Substitution walks the graph and writes `GenerateParams` into those specific node inputs. Then: POST `/prompt` → poll `/history/{id}` → read the output filename → GET `/view` → convert to a data URL.

- [ ] **Step 1: Write the failing test**

Mock `fetch` with the **captured** shapes. Cover:
1. Substitution writes prompt, seed, steps, cfg, and dimensions into the right node inputs.
2. A full round trip returns a `data:` URL.
3. Polling stops and throws with the elapsed time when it exceeds the timeout.
4. Cancelling stops polling and returns no result.
5. A malformed workflow produces an error **naming the failing node id**, not a raw stack trace.
6. A workflow missing a required substitution point fails before any network call.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement against the captured contract**

Poll with a bounded interval and a hard timeout. Every request goes through `/comfy-local`.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Register the backend and commit**

```bash
git add services/comfyService.ts services/comfyService.test.ts constants/comfyWorkflows.ts
git commit -m "feat(generation): add ComfyUI adapter with polling"
```

---

## Task 10: User workflow import

**Files:**
- Modify: `components/GeneratePanel.tsx` or a new settings sub-panel

**Do not start until Task 9's built-in workflow generates end to end.** There must always be a working path, so field mapping is never the only way in.

- [ ] **Step 1: Import and map**

Accept a user's API-format workflow JSON, list its nodes, and let the user bind Kollektiv's inputs (prompt, negative, seed, steps, cfg, model, width, height) to node ids. Persist the mapping alongside the workflow.

- [ ] **Step 2: Validate before running**

An unmapped required field must block **before** submission with a message naming the missing binding.

- [ ] **Step 3: Verify and commit**

Import a workflow that differs structurally from the built-in one, map it, generate.

```bash
git add components/ && git commit -m "feat(generation): import and map user ComfyUI workflows"
```

---

## Final Verification

- [ ] `pnpm lint && pnpm test` — clean, green.
- [ ] `pnpm build` succeeds, and `dist/` is clean-build safe.
- [ ] **6a acceptance criteria:**
  1. Network disabled + local instance running → image generates and ingests.
  2. Gallery record shape matches a cloud-generated one.
  3. No instance running → error names the port and the fix.
  4. Backend switching needs no reload.
  5. `useGenerateLoop`'s phase machine unchanged — verified by diff (Task 6 Step 2).
  6. Route has Zod validation and a rate limiter.
- [ ] **6b acceptance criteria:**
  1. Built-in workflow generates and ingests offline.
  2. An imported workflow generates after mapping.
  3. A malformed workflow names the failing node.
  4. Cancelling a queued job stops polling and ingests nothing.
  5. A timed-out job fails cleanly with elapsed time.
  6. Retrieval works with a custom ComfyUI output directory.

## Out of Scope

- img2img, inpainting, ControlNet, LoRA selection at generate time. Ship txt2img first.
- A workflow editor. ComfyUI already is one; Kollektiv drives workflows, it does not author them.
- WebSocket progress. See the decision under Task 8.
- Queue management across multiple concurrent jobs. One generation at a time, matching `useGenerateLoop`'s existing single-flight shape.
