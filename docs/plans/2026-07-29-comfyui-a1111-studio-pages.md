# ComfyUI / A1111-Forge Dedicated Studio Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ComfyUI and A1111/Forge Neo their own dedicated UI pages (one shared component, two routes) so a user can pick a checkpoint, set generation params, and run a real txt2img job against their local instance — without going through the Crafter/Refiner LLM-refinement loop.

**Architecture:** The backend is already built and live-verified (`services/generationBackend.ts`'s `GenerationBackend` interface, `comfyService.ts`/`a1111Service.ts` adapters, `/comfy-local`/`/a1111-local` proxy routes). This plan is UI + two small backend-adapter bugfixes on top of that foundation — no new server routes, no new abstractions. One shared page component (`LocalGenerationStudioPage`) is parameterized by `backendId` and mounted twice, since both backends implement the identical `GenerationBackend` interface.

**Tech Stack:** React 19 + TypeScript, Vitest + `@testing-library/react` for tests, existing `useSettings()` context for persistence, existing `GenerationBackend` registry for backend calls.

## Global Constraints

- Reuse the existing `GenerationBackend` interface (`services/generationBackend.ts`) as-is — do not add new methods to it (no `listSamplers`, no `cancel`); sampler lists are a small hardcoded constant per backend, cancellation is via `AbortController` already threaded through `generate(params, settings, signal)`.
- No new server routes — `/comfy-local` and `/a1111-local` proxies already exist and are not touched.
- Follow existing visual conventions exactly: `font-mono`, `text-[10px] font-bold uppercase tracking-widest text-base-content/40` labels, `form-input`/`form-btn` utility classes, the two-column config-left/results-right layout used by `BatchRunnerPage`.
- Vitest is the test runner; mock `fetch` with `vi.spyOn(globalThis, 'fetch')` for service tests, mock hooks/context with `vi.mock(...)` for component tests — matching `comfyService.test.ts`, `a1111Service.test.ts`, and `BatchRunnerPage.test.tsx` exactly.
- Do not build: custom ComfyUI workflow import/parameter-mapping UI (`comfyWorkflowParser.ts` stays unused — separate, larger feature), LoRA/CFG/sampler matrix batch UI (`matrixGenerator.ts` stays unused — that's Batch Runner's domain), or dynamic sampler-list fetching from either backend. These are explicitly deferred — see the closing note.

---

## File Structure

| File | Responsibility |
|---|---|
| `services/a1111Service.ts` (modify) | Fix: honor `params.model` via `override_settings` |
| `constants/comfyWorkflows.ts` (modify) | Fix: honor a `samplerName` param in the default workflow |
| `services/comfyService.ts` (modify) | Fix: pass `params.sampler` through to the workflow builder |
| `types.ts` (modify) | Add `comfyModel`/`a1111Model` to `LLMSettings`; add `'comfy_studio'`/`'a1111_studio'` to `ActiveTab` |
| `utils/settingsStorage.ts` (modify) | Defaults + parse-fallback for the two new settings fields |
| `components/SetupPage.tsx` (modify) | Add the two new fields to the settings-persist allowlist |
| `hooks/useLocalGenerationStudio.ts` (create) | Async state machine: check availability, list models, generate (with cancel), ingest into gallery |
| `hooks/useLocalGenerationStudio.test.ts` (create) | Hook tests |
| `components/LocalGenerationStudioPage.tsx` (create) | The dedicated page UI, parameterized by `backendId` |
| `components/LocalGenerationStudioPage.test.tsx` (create) | Component tests |
| `services/assistantTools.ts` (modify) | Add the two new tab ids to the `navigate` tool's `PAGES` list |
| `components/Header.tsx` (modify) | Add both pages to the visible nav (`utilityItems`) |
| `constants/commandRegistry.ts` (modify) | Add both pages to the Command Palette |
| `components/App.tsx` (modify) | Import the page, add title-bar + render-switch cases for both tab ids |

---

### Task 1: Fix backend adapters to honor `sampler` (ComfyUI) and `model` (A1111)

Both adapters already declare `sampler`/`model` in `GenerateParams` (`services/generationBackend.ts:13-23`), but each silently drops one of them today:
- `services/a1111Service.ts:65-76` builds the txt2img body and never reads `params.model` — so A1111/Forge Neo has no way to actually switch checkpoints per-request.
- `constants/comfyWorkflows.ts:38-121`'s `createDefaultWorkflow()` hardcodes `sampler_name: 'euler'` in the KSampler node (`comfyWorkflows.ts:91`) and has no `samplerName` param at all — `services/comfyService.ts:135-164` never has anything to pass through even though `GenerateParams.sampler` exists.

The studio page (Task 4) needs both of these to work, or its model/sampler dropdowns will silently do nothing. Fix the root cause in the adapters, not in the UI.

**Files:**
- Modify: `services/a1111Service.ts:65-76`
- Modify: `constants/comfyWorkflows.ts:38-48, 86-101`
- Modify: `services/comfyService.ts:153-164`
- Test: `services/a1111Service.test.ts`
- Test: `services/comfyService.test.ts`

**Interfaces:**
- Consumes: `GenerateParams` (`services/generationBackend.ts:13-23`) — no changes to this interface.
- Produces: no new exports. Existing `comfyBackend.generate()`/`a1111Backend.generate()` now actually respect `params.model`/`params.sampler`, which Task 4's hook relies on.

- [ ] **Step 1: Write the failing tests**

Append to `services/a1111Service.test.ts` (inside the existing `describe('a1111Backend', ...)` block, after the last `it(...)`):

```ts
  it('generate sends override_settings when params.model is provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['aGVsbG8='], info: '{}' }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.generate(
      { prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512, model: 'SDXL\\eXcursion_XL.safetensors' },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.override_settings).toEqual({ sd_model_checkpoint: 'SDXL\\eXcursion_XL.safetensors' });
    expect(body.override_settings_restore_afterwards).toBe(false);
  });

  it('generate omits override_settings when no model is given', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['aGVsbG8='], info: '{}' }), { status: 200 }),
    );
    const backend = getBackend('a1111')!;
    await backend.generate(
      { prompt: 'test', steps: 10, cfgScale: 7, width: 512, height: 512 },
      { a1111Url: 'http://127.0.0.1:7860' } as any,
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.override_settings).toBeUndefined();
  });
```

Append to `services/comfyService.test.ts` (inside `describe('comfyBackend', ...)`, after the last `it(...)`):

```ts
  it('generate passes params.sampler into the workflow KSampler node', async () => {
    const mockPromptId = 'test-prompt-sampler';
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/prompt')) {
        capturedBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ prompt_id: mockPromptId }), { status: 200 });
      }
      if (urlStr.includes('/history/')) {
        return new Response(JSON.stringify({
          [mockPromptId]: { outputs: { '12': { images: [{ filename: 'x.png', subfolder: '' }] } } },
        }), { status: 200 });
      }
      if (urlStr.includes('/view')) return new Response(new Blob(['x'], { type: 'image/png' }), { status: 200 });
      return new Response(null, { status: 404 });
    });

    const backend = getBackend('comfy')!;
    await backend.generate(
      { prompt: 'test', width: 512, height: 512, steps: 10, cfgScale: 7, sampler: 'dpmpp_2m', model: 'sd15.safetensors' },
      { comfyUrl: 'http://127.0.0.1:8188' } as any,
    );

    expect(capturedBody.prompt['8'].inputs.sampler_name).toBe('dpmpp_2m');
  });

  it('generate defaults to euler when no sampler is given', async () => {
    const mockPromptId = 'test-prompt-default-sampler';
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/prompt')) {
        capturedBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ prompt_id: mockPromptId }), { status: 200 });
      }
      if (urlStr.includes('/history/')) {
        return new Response(JSON.stringify({
          [mockPromptId]: { outputs: { '12': { images: [{ filename: 'x.png', subfolder: '' }] } } },
        }), { status: 200 });
      }
      if (urlStr.includes('/view')) return new Response(new Blob(['x'], { type: 'image/png' }), { status: 200 });
      return new Response(null, { status: 404 });
    });

    const backend = getBackend('comfy')!;
    await backend.generate(
      { prompt: 'test', width: 512, height: 512, steps: 10, cfgScale: 7, model: 'sd15.safetensors' },
      { comfyUrl: 'http://127.0.0.1:8188' } as any,
    );

    expect(capturedBody.prompt['8'].inputs.sampler_name).toBe('euler');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run services/a1111Service.test.ts services/comfyService.test.ts`
Expected: the 4 new tests FAIL — A1111's body has no `override_settings` key, ComfyUI's `sampler_name` is always `'euler'` regardless of the `sampler` param (the "defaults to euler" test actually already passes; the "passes params.sampler" one fails).

- [ ] **Step 3: Implement the fixes**

In `services/a1111Service.ts`, replace the body construction (lines 65-76):

```ts
    const body: Record<string, any> = {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || '',
      seed,
      steps: params.steps || 20,
      cfg_scale: params.cfgScale || 7,
      width: params.width || 1024,
      height: params.height || 1024,
      sampler_name: sampler,
      save_images: false,
      send_images: true,
    };
    if (params.model) {
      body.override_settings = { sd_model_checkpoint: params.model };
      body.override_settings_restore_afterwards = false;
    }
```

In `constants/comfyWorkflows.ts`, add `samplerName` to `createDefaultWorkflow`'s params type (lines 38-48):

```ts
export function createDefaultWorkflow(params: {
  positivePrompt: string;
  negativePrompt?: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  /** Checkpoint filename exactly as returned by /object_info's ckpt_name list. Required — ComfyUI rejects an empty value. */
  ckptName: string;
  /** ComfyUI sampler name (e.g. 'euler', 'dpmpp_2m'). Defaults to 'euler'. */
  samplerName?: string;
}): ComfyWorkflow {
```

And in the same function, update the KSampler node (lines 86-101) to use it:

```ts
    '8': {
      inputs: {
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: p.samplerName || 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
      class_type: 'KSampler',
      _meta: { title: 'KSampler' },
    },
```

In `services/comfyService.ts`, update the `createDefaultWorkflow` call (lines 155-164) to pass it through:

```ts
    const workflow = createDefaultWorkflow({
      positivePrompt: params.prompt,
      negativePrompt: params.negativePrompt,
      seed,
      steps: params.steps,
      cfg: params.cfgScale,
      width: params.width,
      height: params.height,
      ckptName,
      samplerName: params.sampler,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/a1111Service.test.ts services/comfyService.test.ts`
Expected: PASS, all tests including the 4 new ones and every pre-existing test in both files.

- [ ] **Step 5: Commit**

```bash
git add services/a1111Service.ts constants/comfyWorkflows.ts services/comfyService.ts services/a1111Service.test.ts services/comfyService.test.ts
git commit -m "fix: honor sampler (ComfyUI) and model override (A1111) generate params"
```

---

### Task 2: Persist the last-selected checkpoint per backend

`LLMSettings` has `comfyUrl`/`a1111Url` but no field to remember which checkpoint the user picked last session (`types.ts:271-274`). The studio page (Task 4) needs somewhere durable to store the dropdown selection, the same way `ollamaModel`/`llamacppModel` already work for those providers.

**Files:**
- Modify: `types.ts:271-274`
- Modify: `utils/settingsStorage.ts:111-114` (defaults), `:210-214` (parse fallback)
- Modify: `components/SetupPage.tsx:436` (persist-on-change allowlist)
- Test: `utils/settingsStorage.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LLMSettings.comfyModel: string` and `LLMSettings.a1111Model: string` (default `''`), read/written by Task 4's page via `useSettings()`.

- [ ] **Step 1: Write the failing test**

Append to `utils/settingsStorage.test.ts` (after the closing `});` of `describe('provider fallback settings', ...)` at line 329):

```ts

describe('local generation model persistence', () => {
  it('defaults to an empty string for both backends', () => {
    expect(defaultLLMSettings.comfyModel).toBe('');
    expect(defaultLLMSettings.a1111Model).toBe('');
  });

  it('survives a save/load round trip', () => {
    saveLLMSettings({ ...defaultLLMSettings, comfyModel: 'sd15.safetensors', a1111Model: 'SDXL\\eXcursion_XL.safetensors' });
    const loaded = loadLLMSettings();
    expect(loaded.comfyModel).toBe('sd15.safetensors');
    expect(loaded.a1111Model).toBe('SDXL\\eXcursion_XL.safetensors');
  });

  it('falls back to empty strings when absent from stored settings', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activeLLM: 'gemini' }));
    const loaded = loadLLMSettings();
    expect(loaded.comfyModel).toBe('');
    expect(loaded.a1111Model).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/settingsStorage.test.ts`
Expected: FAIL with `defaultLLMSettings.comfyModel` (and the round-trip/fallback assertions) being `undefined`, not `''`.

- [ ] **Step 3: Implement**

In `types.ts`, extend the block at lines 271-274:

```ts
  // Local generation — ComfyUI backend
  generationBackendId: string;
  comfyUrl: string;
  a1111Url: string;
  /** Last-selected checkpoint for each local backend, remembered across sessions. */
  comfyModel: string;
  a1111Model: string;
```

In `utils/settingsStorage.ts`, extend the defaults block at lines 111-114:

```ts
  generationBackendId: 'cloud',
  comfyUrl: 'http://127.0.0.1:8188',
  a1111Url: 'http://127.0.0.1:7860',
  comfyModel: '',
  a1111Model: '',
```

And the parse-fallback block at lines 211-213:

```ts
      generationBackendId: parsed.generationBackendId ?? 'cloud',
      comfyUrl: parsed.comfyUrl ?? 'http://127.0.0.1:8188',
      a1111Url: parsed.a1111Url ?? 'http://127.0.0.1:7860',
      comfyModel: parsed.comfyModel ?? '',
      a1111Model: parsed.a1111Model ?? '',
```

In `components/SetupPage.tsx:436`, add both fields to the persist-on-change allowlist:

```ts
        if (['youtube', 'googleIdentity', 'spotify', 'dashboardImageUrl', 'dashboardVideoUrl', 'darkTheme', 'mcpServers', 'googleApiKey', 'storageProvider', 'driveFolderId', 'driveFolderName', 'autoTagEnabled', 'providerFallbackEnabled', 'providerFallbackChain', 'embeddingModel', 'generationBackendId', 'comfyUrl', 'a1111Url', 'comfyModel', 'a1111Model', 'modifierWeights', 'voiceSilenceTimeoutMs'].includes(field)) updateSettings(updated);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/settingsStorage.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add types.ts utils/settingsStorage.ts components/SetupPage.tsx utils/settingsStorage.test.ts
git commit -m "feat: persist last-selected checkpoint per local generation backend"
```

---

### Task 3: `useLocalGenerationStudio` hook

The async state machine behind the studio page: check backend reachability, fetch the checkpoint list, run a generation with cancel support, and ingest the result into the gallery. Modeled on `useGenerateLoop`'s phase machine (`hooks/useGenerateLoop.ts:19-37`) but without the LLM prompt-refinement phase — this hook talks directly to a `GenerationBackend`.

**Files:**
- Create: `hooks/useLocalGenerationStudio.ts`
- Test: `hooks/useLocalGenerationStudio.test.ts`

**Interfaces:**
- Consumes: `getBackend(id)` from `services/generationBackend.ts:61-63`; `addItemToGallery(type, urls, sources, categoryId?, defaultTitle?, tags?, notes?, prompt?, isNsfw?)` from `utils/galleryStorage.ts:163`; `LLMSettings` from `types.ts`.
- Produces: `useLocalGenerationStudio(backendId: 'comfy' | 'a1111'): UseLocalGenerationStudioReturn` — consumed by Task 4's `LocalGenerationStudioPage`. Exports `StudioBackendId`, `StudioPhase`, `StudioParams`, `StudioState`, `UseLocalGenerationStudioReturn`.

- [ ] **Step 1: Write the failing tests**

Create `hooks/useLocalGenerationStudio.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockBackend = {
  id: 'comfy',
  label: 'ComfyUI',
  isAvailable: vi.fn(async () => true),
  listModels: vi.fn(async () => ['sd15.safetensors']),
  generate: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,x', seed: 42, backendId: 'comfy' })),
};

vi.mock('../services/generationBackend', () => ({
  getBackend: (id: string) => (id === 'comfy' ? mockBackend : undefined),
}));
vi.mock('../services/comfyService', () => ({}));
vi.mock('../services/a1111Service', () => ({}));
vi.mock('../utils/galleryStorage', () => ({
  addItemToGallery: vi.fn(async () => ({ id: 'item-1' })),
}));

import { useLocalGenerationStudio } from './useLocalGenerationStudio';

const PARAMS = {
  prompt: 'a cat',
  negativePrompt: '',
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  seed: null,
  sampler: 'euler',
  model: '',
};

describe('useLocalGenerationStudio', () => {
  it('starts idle with no availability checked', () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.available).toBeNull();
  });

  it('checkAvailability reflects the backend result', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.checkAvailability({} as any); });
    expect(result.current.state.available).toBe(true);
  });

  it('refreshModels populates the model list', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.refreshModels({} as any); });
    expect(result.current.state.models).toEqual(['sd15.safetensors']);
  });

  it('generate goes idle -> generating -> done and ingests into the gallery', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.generate(PARAMS as any, {} as any); });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(result.current.state.resultUrl).toBe('data:image/png;base64,x');
    expect(result.current.state.resultSeed).toBe(42);
    expect(result.current.state.galleryItemId).toBe('item-1');
  });

  it('generate reports an error when the backend throws', async () => {
    mockBackend.generate.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.generate(PARAMS as any, {} as any); });
    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.error).toBe('boom');
  });

  it('cancel aborts an in-flight generate without setting an error', async () => {
    mockBackend.generate.mockImplementationOnce((_p: any, _s: any, signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    );
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    let genPromise!: Promise<void>;
    act(() => { genPromise = result.current.generate(PARAMS as any, {} as any); });
    await waitFor(() => expect(result.current.state.phase).toBe('generating'));
    act(() => result.current.cancel());
    await act(async () => { await genPromise; });
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.error).toBeNull();
  });

  it('reset returns to the initial state', async () => {
    const { result } = renderHook(() => useLocalGenerationStudio('comfy'));
    await act(async () => { await result.current.generate(PARAMS as any, {} as any); });
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.resultUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hooks/useLocalGenerationStudio.test.ts`
Expected: FAIL with "Cannot find module './useLocalGenerationStudio'".

- [ ] **Step 3: Write the implementation**

Create `hooks/useLocalGenerationStudio.ts`:

```ts
/**
 * useLocalGenerationStudio — Async state machine for a dedicated
 * ComfyUI / A1111-Forge generation page: availability check, model list,
 * generate (with cancel), and gallery ingestion.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { getBackend } from '../services/generationBackend';
// Side-effect imports: register the local generation backends in the registry
import '../services/comfyService';
import '../services/a1111Service';
import { addItemToGallery } from '../utils/galleryStorage';
import type { LLMSettings } from '../types';

export type StudioBackendId = 'comfy' | 'a1111';
export type StudioPhase = 'idle' | 'checking' | 'generating' | 'done' | 'error';

export interface StudioParams {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** null = let the backend randomize the seed. */
  seed: number | null;
  sampler: string;
  /** '' = let the backend pick a default checkpoint. */
  model: string;
}

export interface StudioState {
  phase: StudioPhase;
  /** null = not checked yet. */
  available: boolean | null;
  models: string[];
  loadingModels: boolean;
  resultUrl: string | null;
  resultSeed: number | null;
  galleryItemId: string | null;
  error: string | null;
}

const INITIAL_STATE: StudioState = {
  phase: 'idle',
  available: null,
  models: [],
  loadingModels: false,
  resultUrl: null,
  resultSeed: null,
  galleryItemId: null,
  error: null,
};

export interface UseLocalGenerationStudioReturn {
  state: StudioState;
  checkAvailability: (settings: LLMSettings) => Promise<void>;
  refreshModels: (settings: LLMSettings) => Promise<void>;
  generate: (params: StudioParams, settings: LLMSettings) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useLocalGenerationStudio(backendId: StudioBackendId): UseLocalGenerationStudioReturn {
  const [state, setState] = useState<StudioState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const update = useCallback((patch: Partial<StudioState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const checkAvailability = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) {
      update({ available: false });
      return;
    }
    update({ phase: 'checking' });
    const ok = await backend.isAvailable(settings);
    update({ available: ok, phase: 'idle' });
  }, [backendId, update]);

  const refreshModels = useCallback(async (settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) return;
    update({ loadingModels: true });
    const models = await backend.listModels(settings);
    update({ models, loadingModels: false });
  }, [backendId, update]);

  const generate = useCallback(async (params: StudioParams, settings: LLMSettings) => {
    const backend = getBackend(backendId);
    if (!backend) {
      update({ phase: 'error', error: `Backend "${backendId}" is not registered.` });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    update({
      phase: 'generating',
      error: null,
      resultUrl: null,
      resultSeed: null,
      galleryItemId: null,
    });

    try {
      const output = await backend.generate(
        {
          prompt: params.prompt,
          negativePrompt: params.negativePrompt || undefined,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgScale: params.cfgScale,
          seed: params.seed ?? undefined,
          sampler: params.sampler || undefined,
          model: params.model || undefined,
        },
        settings,
        controller.signal,
      );

      const item = await addItemToGallery(
        'image',
        [output.dataUrl],
        [backend.label],
        undefined,
        undefined,
        [],
        undefined,
        params.prompt,
      );

      update({
        phase: 'done',
        resultUrl: output.dataUrl,
        resultSeed: output.seed ?? null,
        galleryItemId: item.id,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        update({ phase: 'idle', error: null });
        return;
      }
      update({ phase: 'error', error: err?.message || 'Generation failed.' });
    } finally {
      abortRef.current = null;
    }
  }, [backendId, update]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { state, checkAvailability, refreshModels, generate, cancel, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run hooks/useLocalGenerationStudio.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/useLocalGenerationStudio.ts hooks/useLocalGenerationStudio.test.ts
git commit -m "feat: add useLocalGenerationStudio hook for ComfyUI/A1111 studio pages"
```

---

### Task 4: `LocalGenerationStudioPage` component

The dedicated page itself: connection status, checkpoint dropdown (persisted via Task 2's settings fields), prompt/negative-prompt/width/height/steps/cfg/sampler/seed controls, Generate/Cancel, and a result preview. One component, mounted twice with a different `backendId` prop (Task 5).

**Files:**
- Create: `components/LocalGenerationStudioPage.tsx`
- Test: `components/LocalGenerationStudioPage.test.tsx`

**Interfaces:**
- Consumes: `useLocalGenerationStudio(backendId)` from Task 3; `useSettings()` from `contexts/SettingsContext.tsx:88-94` (`{ settings, updateSettings }`); `showGlobalFeedback: (message: string, isError?: boolean) => void` (same prop signature as `ComposerPage.tsx:57`).
- Produces: `LocalGenerationStudioPage` (default export + named export `{ LocalGenerationStudioPage }`, matching `BatchRunnerPage.tsx:247-248`'s export pattern), consumed by Task 5's `components/App.tsx` wiring.

- [ ] **Step 1: Write the failing tests**

Create `components/LocalGenerationStudioPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

beforeEach(cleanup);

const mockState = {
  phase: 'idle' as const,
  available: true as boolean | null,
  models: ['sd15.safetensors'],
  loadingModels: false,
  resultUrl: null as string | null,
  resultSeed: null as number | null,
  galleryItemId: null as string | null,
  error: null as string | null,
};

const hookMocks = {
  checkAvailability: vi.fn(),
  refreshModels: vi.fn(),
  generate: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
};

vi.mock('../hooks/useLocalGenerationStudio', () => ({
  useLocalGenerationStudio: () => ({ state: mockState, ...hookMocks }),
}));

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: { comfyUrl: 'http://127.0.0.1:8188', comfyModel: '' },
    updateSettings: vi.fn(),
  }),
}));

import { LocalGenerationStudioPage } from './LocalGenerationStudioPage';

describe('LocalGenerationStudioPage', () => {
  it('renders the backend label in the heading', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText(/ComfyUI Studio/i)).toBeTruthy();
  });

  it('shows the connected badge when available', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText(/Connected/i)).toBeTruthy();
  });

  it('lists fetched models in the checkpoint dropdown', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText('sd15.safetensors')).toBeTruthy();
  });

  it('disables Generate until a prompt is typed', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByRole('button', { name: /generate/i }).hasAttribute('disabled')).toBe(true);
  });

  it('calls generate with the typed prompt when clicked', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/a photo of/i), { target: { value: 'a red fox' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(hookMocks.generate).toHaveBeenCalledTimes(1);
    expect(hookMocks.generate.mock.calls[0][0].prompt).toBe('a red fox');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/LocalGenerationStudioPage.test.tsx`
Expected: FAIL with "Cannot find module './LocalGenerationStudioPage'".

- [ ] **Step 3: Write the implementation**

Create `components/LocalGenerationStudioPage.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useLocalGenerationStudio, type StudioBackendId, type StudioParams } from '../hooks/useLocalGenerationStudio';

interface LocalGenerationStudioPageProps {
  backendId: StudioBackendId;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

interface BackendMeta {
  label: string;
  urlField: 'comfyUrl' | 'a1111Url';
  modelField: 'comfyModel' | 'a1111Model';
  defaultSamplers: string[];
}

const BACKEND_META: Record<StudioBackendId, BackendMeta> = {
  comfy: {
    label: 'ComfyUI',
    urlField: 'comfyUrl',
    modelField: 'comfyModel',
    defaultSamplers: ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde', 'ddim'],
  },
  a1111: {
    label: 'A1111 / Forge Neo',
    urlField: 'a1111Url',
    modelField: 'a1111Model',
    defaultSamplers: ['Euler', 'Euler a', 'DPM++ 2M', 'DPM++ SDE Karras', 'DDIM'],
  },
};

const LocalGenerationStudioPage: React.FC<LocalGenerationStudioPageProps> = ({ backendId, showGlobalFeedback }) => {
  const { settings, updateSettings } = useSettings();
  const meta = BACKEND_META[backendId];
  const { state, checkAvailability, refreshModels, generate, cancel, reset } = useLocalGenerationStudio(backendId);

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7);
  const [seedText, setSeedText] = useState('');
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [sampler, setSampler] = useState(meta.defaultSamplers[0]);

  const model = (settings as any)[meta.modelField] || '';
  const serverUrl = (settings as any)[meta.urlField] || '';

  useEffect(() => {
    checkAvailability(settings);
    refreshModels(settings);
    // Re-check whenever the backend or its configured server URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendId, serverUrl]);

  const setModel = useCallback((value: string) => {
    updateSettings({ ...settings, [meta.modelField]: value });
  }, [settings, updateSettings, meta.modelField]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || state.phase === 'generating') return;
    const params: StudioParams = {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed: randomizeSeed ? null : (parseInt(seedText, 10) || 0),
      sampler,
      model,
    };
    generate(params, settings);
  }, [prompt, negativePrompt, width, height, steps, cfgScale, seedText, randomizeSeed, sampler, model, state.phase, generate, settings]);

  useEffect(() => {
    if (state.phase === 'done') showGlobalFeedback('Saved to gallery.');
    if (state.phase === 'error' && state.error) showGlobalFeedback(state.error, true);
  }, [state.phase, state.error, showGlobalFeedback]);

  return (
    <div className="h-full flex flex-col font-mono">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black uppercase tracking-tighter">{meta.label} Studio</h1>
          <p className="text-xs text-base-content/40 mt-1">
            Generate directly against your local {meta.label} instance.
          </p>
        </div>
        {state.available === false && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-error">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
            Not reachable at {serverUrl}
          </div>
        )}
        {state.available === true && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Connected
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Params */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">
              Checkpoint
            </label>
            <div className="flex items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="form-input flex-1 text-xs"
              >
                <option value="">{state.loadingModels ? 'Loading…' : 'Auto (first available)'}</option>
                {state.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button
                onClick={() => refreshModels(settings)}
                disabled={state.loadingModels}
                className="form-btn px-3 text-[10px] whitespace-nowrap"
              >
                {state.loadingModels ? '...' : 'REFRESH'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="form-input w-full text-xs"
              placeholder="a photo of..."
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Negative Prompt</label>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              rows={2}
              className="form-input w-full text-xs"
              placeholder="blurry, low quality..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Width</label>
              <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value, 10) || 512)} className="form-input w-full text-xs" step={64} min={64} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Height</label>
              <input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value, 10) || 512)} className="form-input w-full text-xs" step={64} min={64} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Steps</label>
              <input type="number" value={steps} onChange={(e) => setSteps(parseInt(e.target.value, 10) || 1)} className="form-input w-full text-xs" min={1} max={150} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">CFG Scale</label>
              <input type="number" value={cfgScale} onChange={(e) => setCfgScale(parseFloat(e.target.value) || 1)} className="form-input w-full text-xs" step={0.5} min={1} max={30} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Sampler</label>
            <select value={sampler} onChange={(e) => setSampler(e.target.value)} className="form-input w-full text-xs">
              {meta.defaultSamplers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Seed</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                disabled={randomizeSeed}
                className="form-input flex-1 text-xs disabled:opacity-30"
                placeholder="random"
              />
              <label className="flex items-center gap-1.5 text-[10px] text-base-content/50 whitespace-nowrap">
                <input type="checkbox" checked={randomizeSeed} onChange={(e) => setRandomizeSeed(e.target.checked)} />
                Random
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            {state.phase === 'generating' ? (
              <button onClick={cancel} className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded bg-error/20 text-error hover:bg-error/30 transition-colors">
                Cancel
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || state.available === false}
                className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                Generate
              </button>
            )}
            {(state.phase === 'done' || state.phase === 'error') && (
              <button onClick={reset} className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest rounded bg-base-content/5 text-base-content/30 hover:bg-base-content/10 transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right: Result */}
        <div className="flex-1 flex flex-col min-w-0 items-center justify-center bg-base-300/10 rounded">
          {state.phase === 'generating' && (
            <div className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 animate-pulse">
              Generating via {meta.label}...
            </div>
          )}
          {state.phase === 'error' && (
            <div className="text-[10px] font-bold uppercase tracking-widest text-error px-6 text-center">
              {state.error}
            </div>
          )}
          {state.phase === 'done' && state.resultUrl && (
            <div className="flex flex-col items-center gap-2 p-4">
              <img src={state.resultUrl} alt="Generated result" className="max-h-[60vh] max-w-full rounded shadow-lg" />
              <div className="text-[10px] text-base-content/30">
                Seed: {state.resultSeed} · Saved to gallery
              </div>
            </div>
          )}
          {state.phase === 'idle' && !state.resultUrl && (
            <p className="text-[10px] text-base-content/20 uppercase tracking-widest">
              Enter a prompt and click Generate
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export { LocalGenerationStudioPage };
export default LocalGenerationStudioPage;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/LocalGenerationStudioPage.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/LocalGenerationStudioPage.tsx components/LocalGenerationStudioPage.test.tsx
git commit -m "feat: add LocalGenerationStudioPage for ComfyUI/A1111"
```

---

### Task 5: Wire both pages into navigation

Make the two pages actually reachable: add the tab ids to the type system and the assistant's `navigate` tool, mount the page twice in `App.tsx`, and add both to the visible nav (`Header.tsx`) and the Command Palette (`commandRegistry.ts`) — the same two places `lora_editor` is wired into (`components/Header.tsx:143-150`, `constants/commandRegistry.ts:31`).

**Files:**
- Modify: `types.ts:61-80` (`ActiveTab`)
- Modify: `services/assistantTools.ts:43` (`PAGES`)
- Modify: `components/Header.tsx:143-150` (`utilityItems`)
- Modify: `constants/commandRegistry.ts:31-32` (command entries)
- Modify: `components/App.tsx` (import, title switch, render switch)
- Test: `services/assistantTools.test.ts`

**Interfaces:**
- Consumes: `LocalGenerationStudioPage` from Task 4.
- Produces: the `'comfy_studio'`/`'a1111_studio'` tab ids are now valid everywhere `ActiveTab` is used — no further consumers in this plan.

- [ ] **Step 1: Write the failing test**

Append to `services/assistantTools.test.ts` (inside `describe('ASSISTANT_TOOLS', ...)`, after the `rss_fetch` test):

```ts
    it('navigate tool accepts the new local-generation studio pages', () => {
        const tool = ASSISTANT_TOOLS.find(t => t.name === 'navigate');
        expect(tool!.parameters.properties.page.enum).toContain('comfy_studio');
        expect(tool!.parameters.properties.page.enum).toContain('a1111_studio');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/assistantTools.test.ts -t "local-generation studio pages"`
Expected: FAIL — `page.enum` does not contain `'comfy_studio'`/`'a1111_studio'` yet.

- [ ] **Step 3: Write the implementation**

In `types.ts`, extend `ActiveTab` (lines 61-80):

```ts
export type ActiveTab =
  | 'dashboard'
  | 'assistant'
  | 'discovery'
  | 'prompts'
  | 'crafter'
  | 'refiner'
  | 'prompt_analyzer'
  | 'media_analyzer'
  | 'prompt'
  | 'gallery'

  | 'resizer'
  | 'video_to_frames'
  | 'image_compare'
  | 'color_palette_extractor'
  | 'composer'
  | 'lora_editor'
  | 'batch_runner'
  | 'comfy_studio'
  | 'a1111_studio'
  | 'settings';
```

In `services/assistantTools.ts`, extend `PAGES` (line 43):

```ts
const PAGES = ['dashboard', 'discovery', 'prompts', 'crafter', 'refiner', 'prompt_analyzer', 'media_analyzer', 'prompt', 'gallery', 'resizer', 'video_to_frames', 'image_compare', 'color_palette_extractor', 'composer', 'batch_runner', 'comfy_studio', 'a1111_studio', 'settings'];
```

In `components/Header.tsx`, extend `utilityItems` (lines 143-150):

```ts
  const utilityItems = React.useMemo<NavItemData[]>(() => [
    { id: 'composer' as ActiveTab, label: 'Composer' },
    { id: 'image_compare' as ActiveTab, label: 'Compare' },
    { id: 'color_palette_extractor' as ActiveTab, label: 'Palette' },
    { id: 'resizer' as ActiveTab, label: 'Resizer' },
    { id: 'video_to_frames' as ActiveTab, label: 'Video' },
    { id: 'lora_editor' as ActiveTab, label: 'LoRA Editor' },
    { id: 'comfy_studio' as ActiveTab, label: 'ComfyUI Studio' },
    { id: 'a1111_studio' as ActiveTab, label: 'A1111 Studio' },
  ], []);
```

In `constants/commandRegistry.ts`, add two entries next to `nav-lora`/`nav-batch-runner` (lines 31-32):

```ts
  { id: 'nav-lora', label: 'LoRA Editor', category: 'Navigation', keywords: ['metadata', 'tags', 'model'], execute: () => appEventBus.emit('navigate', 'lora_editor' as ActiveTab) },
  { id: 'nav-batch-runner', label: 'Batch Runner', category: 'Navigation', keywords: ['batch', 'queue', 'run', 'bulk'], execute: () => appEventBus.emit('navigate', 'batch_runner' as ActiveTab) },
  { id: 'nav-comfy-studio', label: 'ComfyUI Studio', category: 'Navigation', keywords: ['comfy', 'comfyui', 'generate', 'local', 'stable diffusion'], execute: () => appEventBus.emit('navigate', 'comfy_studio' as ActiveTab) },
  { id: 'nav-a1111-studio', label: 'A1111 Studio', category: 'Navigation', keywords: ['a1111', 'forge', 'automatic1111', 'generate', 'local', 'stable diffusion'], execute: () => appEventBus.emit('navigate', 'a1111_studio' as ActiveTab) },
```

In `components/App.tsx`, add the import next to `BatchRunnerPage` (line 41):

```ts
import BatchRunnerPage from './BatchRunnerPage';
import LocalGenerationStudioPage from './LocalGenerationStudioPage';
```

Add title-bar cases next to `batch_runner` (line 159):

```ts
            case 'batch_runner': return `BATCH | ${base}`;
            case 'comfy_studio': return `COMFYUI | ${base}`;
            case 'a1111_studio': return `FORGE | ${base}`;
```

Add render-switch cases next to `batch_runner` (line 375):

```ts
            case 'batch_runner': return <BatchRunnerPage key="batch_runner" />;
            case 'comfy_studio': return <LocalGenerationStudioPage key="comfy_studio" backendId="comfy" showGlobalFeedback={showGlobalFeedback} />;
            case 'a1111_studio': return <LocalGenerationStudioPage key="a1111_studio" backendId="a1111" showGlobalFeedback={showGlobalFeedback} />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/assistantTools.test.ts`
Expected: PASS, all tests in the file (including the new one).

Then run the full suite once to confirm the `ActiveTab`/`PAGES`/`Header`/`commandRegistry`/`App.tsx` edits didn't break typechecking or any other test:

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, zero TypeScript errors, zero failing tests.

- [ ] **Step 5: Commit**

```bash
git add types.ts services/assistantTools.ts components/Header.tsx constants/commandRegistry.ts components/App.tsx services/assistantTools.test.ts
git commit -m "feat: wire ComfyUI/A1111 studio pages into navigation"
```

---

## Self-Review

**Spec coverage:** "ComfyUI and Forge/A1111 have a dedicated UI page" — Task 4 delivers one page per backend (same component, two `backendId` values); Task 5 makes both reachable from the visible nav, the Command Palette, and the assistant's `navigate` tool. Task 1 fixes two pre-existing adapter bugs (dropped `sampler`/`model` params) that would otherwise make the page's own controls silently do nothing. Task 2 gives the page's checkpoint dropdown somewhere to persist its selection across sessions. No requirement is left unaddressed.

**Placeholder scan:** every step has literal code — no "add error handling" / "similar to Task N" / "TBD" markers anywhere in the five tasks.

**Type consistency:** `StudioParams`, `StudioState`, `StudioPhase`, `StudioBackendId`, and `UseLocalGenerationStudioReturn` are defined once in Task 3 and used with identical names/shapes in Task 4. `BackendMeta`'s `modelField`/`urlField` keys (`'comfyModel' | 'a1111Model'`, `'comfyUrl' | 'a1111Url'`) match exactly the field names added to `LLMSettings` in Task 2. The `GenerateParams` fields passed from the hook (`prompt`, `negativePrompt`, `width`, `height`, `steps`, `cfgScale`, `seed`, `sampler`, `model`) match `services/generationBackend.ts:13-23` exactly — no renamed or invented fields.

## Explicitly deferred (not in this plan)

- **ComfyUI custom workflow import UI.** `services/comfyWorkflowParser.ts` (`injectWorkflowParameters`, `validateWorkflowOnComfy`) stays unused by the UI after this plan — it needs a node/field-mapping form (which node holds the prompt, which holds the seed, etc.), which is a meaningfully bigger feature than "give ComfyUI a page." Worth a follow-up plan if wanted.
- **LoRA/CFG/sampler matrix batch generation.** `services/matrixGenerator.ts` stays unused — it's designed to feed `batchQueue.ts`/Batch Runner, not a single-generation studio page.
- **Dynamic sampler list.** Both backends expose their real sampler list via API (A1111: `GET /sdapi/v1/samplers`; ComfyUI: per-checkpoint via `/object_info`), but that's a `GenerationBackend` interface change (a new method) affecting both adapters and their tests. The hardcoded lists in `BACKEND_META` cover the common cases; swap to a live fetch later if a checkpoint's actual sampler set diverges from them.
