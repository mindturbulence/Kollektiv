# Phase 4 — Batch Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **READ THE "Correction" SECTION BEFORE ANYTHING ELSE.** The roadmap's description of this phase was based on a wrong premise, and the task list below is not what the roadmap led you to expect.

**Goal:** Run a chain of operations across many prompts or gallery items, with live progress, cancellation, and a per-item report.

**Architecture:** A self-contained queue over the **existing working services**, deliberately *not* over the capability platform. See the correction below for why.

**Tech Stack:** TypeScript (strict), React 19, Vitest.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green.
- New settings follow the 4-step recipe in `AI_WORKER_RULES.md:43-44`, including **the allow-list at `components/SetupPage.tsx:436`**.
- Test assertions use `toBeTruthy()`, **not** `toBeInTheDocument()`. `vite.config.ts:178` sets `setupFiles: []`.
- Conventional Commits. Work on `development`.

---

## Correction: the capability platform is inert

The roadmap said this phase would be *"a UI surface over a working engine"* and *"cheap."* **That was wrong**, based on reading `executionEngine.ts`'s type definitions and observer API without reading its dispatcher. Verified 2026-07-28:

| Claim in the roadmap | What the code actually does |
|---|---|
| "Execution engine is real, not a stub" | Half true. Sequencing, retry, observers, and cancellation are real. **Execution is not.** |
| "Batch runner is UI over working internals" | False. There are no working internals to surface. |

**Evidence 1 — the dispatcher is entirely stubs.** `services/executionEngine.ts:213-249`. Every branch of `dispatchStep` returns a fake result:

```ts
case 'capability_dispatch': { ... return { capability: cap.id, status: 'dispatched (stub)' }; }
case 'provider_call':        return { provider: ..., status: 'called (stub)' };
case 'assistant_tool':       return { tool: step.capabilityId, status: 'dispatched (stub)' };
```

The comment at line 211 states it plainly: *"Full capability/tool dispatch is wired in Layer 8 (infrastructure)."* Layer 8 is `services/providerRouter.ts`, which was **deleted** under ISSUE-32. It was never built.

**Evidence 2 — the capability registry is empty at runtime.** `capabilityRegistry.register()` is called **nowhere in the application**. Every one of the 13 `capabilityRegistry` references across the codebase is a read (`get`, `list`, `search`). Grep confirms zero registration calls outside tests.

The comment at `services/kollektivMcp.ts:345-347` asserts the registry *"is populated in the browser context."* It is not. That comment is wrong.

**Consequence:** the five `capability_*` assistant tools return empty results today, and `executionEngine.execute()` returns a `PlanResult` full of stub outputs. This is a **fourth** built-but-not-wired case, after ISSUE-31 (`relationshipGraph` disconnected), ISSUE-32 (`providerRouter` a stub), and ISSUE-46 (gallery intelligence unimplemented) — and it is the largest of the four.

### The fork this creates

**Option A — resurrect the capability platform, then build the runner on it.** Register every assistant tool as a capability, replace `dispatchStep`'s eight stub branches with real execution, then build the UI. Makes `capability_*` tools work as a side effect.

**Option B — build the runner directly over working services. ◀ This plan takes Option B.**

**Why B.** The batch runner needs one thing: *run operation F across list L, with progress, cancellation, and a per-item report.* That is roughly 120 lines over services that already work (`llmService`, `galleryStorage`, `useGenerateLoop`'s underlying calls). Option A requires wiring four layers of indirection — registry, intent router, planner, dispatcher — to arrive at the same place, and the `Plan`/`RouterIntent` types were shaped for assistant intent classification, not for user-composed batches. `plan()` at `services/planner.ts:70` switches on `intent.category`, so driving it from a UI means synthesizing fake intents.

**What B does not do:** it leaves the capability platform inert. That is a real cost and it should be logged as its own issue, not silently accepted — Task 5 does that. If you later want `capability_*` tools to work, that is Option A as a separate project, and this phase does not block it.

---

## Verified Codebase Facts

| Fact | Location |
|---|---|
| `dispatchStep` returns stubs for all 8 step kinds | `services/executionEngine.ts:213-249` |
| `capabilityRegistry.register()` is never called by app code | grep across repo, tests excluded |
| Engine API: `onStep`, `onPlanComplete`, `cancel`, `execute`, `executeStep` | `services/executionEngine.ts:74-207` |
| `AssistantTool { name, description, parameters, execute(args, ctx) }` | `services/tools/types.ts:12-20` |
| `loadSavedPrompts()` / `loadGalleryItems()` | `utils/promptStorage.ts`, `utils/galleryStorage.ts:127` |
| `updateItemInGallery(id, updates)` | `utils/galleryStorage.ts:230` |
| `requireProvider` throws `ProviderUnsupportedError` | `services/llmService.ts:29-33` |

## File Structure

| File | Responsibility |
|---|---|
| `services/batchQueue.ts` (create) | Generic sequential queue: progress, cancel, per-item results. No domain knowledge. |
| `services/batchQueue.test.ts` (create) | Tests. |
| `services/batchOperations.ts` (create) | The named operations a batch can run, each a thin wrapper over an existing service. |
| `services/batchOperations.test.ts` (create) | Tests. |
| `hooks/useBatchRun.ts` (create) | React binding: state, progress, cancel. |
| `components/BatchRunnerPage.tsx` (create) | UI. |
| `components/App.tsx`, `components/CommandPalette.tsx` (modify) | Navigation. |

---

## Task 1: Generic sequential batch queue

**Files:**
- Create: `services/batchQueue.ts`
- Test: `services/batchQueue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  export interface ItemResult<T> { index: number; input: T; status: ItemStatus; output?: any; error?: string; ms: number }
  export interface BatchResult<T> { results: ItemResult<T>[]; completed: number; failed: number; cancelled: boolean; totalMs: number }
  export interface BatchHandle<T> { promise: Promise<BatchResult<T>>; cancel: () => void }
  export function runBatch<T>(items: T[], op: (item: T, index: number) => Promise<any>, onProgress?: (r: ItemResult<T>, doneCount: number, total: number) => void): BatchHandle<T>
  ```

**Design:** sequential by choice. Parallel calls to the same provider trip rate limits, and `executionEngine.ts:11-13` documents the same decision for its own loop. One item's failure never aborts the batch.

- [ ] **Step 1: Write the failing test**

Create `services/batchQueue.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runBatch } from './batchQueue';

describe('runBatch', () => {
  it('runs every item and reports completion', async () => {
    const op = vi.fn(async (n: number) => n * 2);
    const { promise } = runBatch([1, 2, 3], op);
    const result = await promise;
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results.map(r => r.output)).toEqual([2, 4, 6]);
  });

  it('continues past a failing item', async () => {
    const op = async (n: number) => {
      if (n === 2) throw new Error('boom');
      return n;
    };
    const result = await runBatch([1, 2, 3], op).promise;
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[1].status).toBe('failed');
    expect(result.results[1].error).toBe('boom');
    expect(result.results[2].status).toBe('done');
  });

  it('reports progress per item', async () => {
    const onProgress = vi.fn();
    await runBatch([1, 2], async n => n, onProgress).promise;
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0][1]).toBe(1);
    expect(onProgress.mock.calls[1][1]).toBe(2);
    expect(onProgress.mock.calls[0][2]).toBe(2);
  });

  it('stops before the next item when cancelled and preserves completed results', async () => {
    const handle = runBatch([1, 2, 3], async (n) => {
      if (n === 1) handle.cancel();
      return n;
    });
    const result = await handle.promise;
    expect(result.cancelled).toBe(true);
    expect(result.completed).toBe(1);
    expect(result.results[1].status).toBe('cancelled');
    expect(result.results[2].status).toBe('cancelled');
  });

  it('runs items strictly in order', async () => {
    const order: number[] = [];
    await runBatch([1, 2, 3], async n => { order.push(n); }).promise;
    expect(order).toEqual([1, 2, 3]);
  });

  it('handles an empty item list', async () => {
    const result = await runBatch([], async () => {}).promise;
    expect(result.completed).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('stringifies a non-Error throw', async () => {
    const result = await runBatch([1], async () => { throw 'plain string'; }).promise;
    expect(result.results[0].error).toContain('plain string');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/batchQueue.test.ts`
Expected: FAIL — cannot resolve `./batchQueue`.

- [ ] **Step 3: Write the implementation**

Create `services/batchQueue.ts`:

```ts
/**
 * Sequential batch queue.
 *
 * ponytail: sequential on purpose. Parallel calls to one provider trip rate
 * limits, and executionEngine.ts:11-13 made the same call for the same
 * reason. Add concurrency only when a measured run proves it is the
 * bottleneck and the provider tolerates it.
 *
 * Deliberately knows nothing about prompts, gallery items, or providers —
 * batchOperations.ts supplies the operation.
 */

export type ItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ItemResult<T> {
  index: number;
  input: T;
  status: ItemStatus;
  output?: any;
  error?: string;
  ms: number;
}

export interface BatchResult<T> {
  results: ItemResult<T>[];
  completed: number;
  failed: number;
  cancelled: boolean;
  totalMs: number;
}

export interface BatchHandle<T> {
  promise: Promise<BatchResult<T>>;
  cancel: () => void;
}

export function runBatch<T>(
  items: T[],
  op: (item: T, index: number) => Promise<any>,
  onProgress?: (result: ItemResult<T>, doneCount: number, total: number) => void,
): BatchHandle<T> {
  let cancelled = false;
  const cancel = () => { cancelled = true; };

  const promise = (async (): Promise<BatchResult<T>> => {
    const started = performance.now();
    const results: ItemResult<T>[] = [];
    let completed = 0, failed = 0;

    for (let i = 0; i < items.length; i++) {
      if (cancelled) {
        results.push({ index: i, input: items[i], status: 'cancelled', ms: 0 });
        continue;
      }
      const itemStart = performance.now();
      let result: ItemResult<T>;
      try {
        const output = await op(items[i], i);
        result = { index: i, input: items[i], status: 'done', output, ms: performance.now() - itemStart };
        completed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { index: i, input: items[i], status: 'failed', error: message, ms: performance.now() - itemStart };
        failed++;
      }
      results.push(result);
      onProgress?.(result, completed + failed, items.length);
    }

    return { results, completed, failed, cancelled, totalMs: performance.now() - started };
  })();

  return { promise, cancel };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/batchQueue.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add services/batchQueue.ts services/batchQueue.test.ts
git commit -m "feat(batch): add sequential batch queue with cancel and per-item results"
```

---

## Task 2: The operations a batch can run

**Files:**
- Create: `services/batchOperations.ts`
- Test: `services/batchOperations.test.ts`

**Interfaces:**
- Consumes: `llmService` functions, `galleryStorage`.
- Produces:
  ```ts
  export interface BatchOperation { id: string; label: string; inputKind: 'prompt' | 'gallery_item'; run: (item: any, settings: LLMSettings) => Promise<any> }
  export const BATCH_OPERATIONS: BatchOperation[]
  export function getOperation(id: string): BatchOperation | undefined
  ```

**Scope:** ship exactly **three** operations. Each is a thin wrapper over a service that already works today. Do not add a fourth until someone asks for it.

| id | Label | Input | Wraps |
|---|---|---|---|
| `refine_prompt` | Refine prompt | prompt | `refineSinglePrompt` (`llmService.ts:367` region) |
| `suggest_tags` | Suggest gallery tags | gallery_item | `suggestTagsForItem` (Phase 1) |
| `abstract_image` | Describe image as prompt | gallery_item | `abstractImage` (`llmService.ts:486`) |

> **`suggest_tags` depends on Phase 1 being merged.** If it is not, drop that row and ship two operations — do not stub it.

- [ ] **Step 1: Write the failing test**

Create `services/batchOperations.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./llmService', () => ({
  refineSinglePrompt: vi.fn(async () => ({ suggestions: ['refined'] })),
  abstractImage: vi.fn(async () => ({ suggestions: ['described'] })),
}));
vi.mock('./autoTagService', () => ({
  suggestTagsForItem: vi.fn(async () => ['sunset']),
}));

import { BATCH_OPERATIONS, getOperation } from './batchOperations';

describe('BATCH_OPERATIONS', () => {
  it('exposes operations with unique ids', () => {
    const ids = BATCH_OPERATIONS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares an input kind for every operation', () => {
    for (const op of BATCH_OPERATIONS) {
      expect(['prompt', 'gallery_item']).toContain(op.inputKind);
    }
  });

  it('looks up an operation by id', () => {
    expect(getOperation('refine_prompt')?.label).toBeTruthy();
  });

  it('returns undefined for an unknown id', () => {
    expect(getOperation('nope')).toBeUndefined();
  });

  it('runs the tag operation against a gallery item', async () => {
    const op = getOperation('suggest_tags')!;
    await expect(op.run({ id: 'g1', type: 'image', urls: ['x'] }, {} as any)).resolves.toEqual(['sunset']);
  });

  it('propagates an operation failure rather than swallowing it', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    (suggestTagsForItem as any).mockRejectedValueOnce(new Error('vision unavailable'));
    const op = getOperation('suggest_tags')!;
    await expect(op.run({ id: 'g1' }, {} as any)).rejects.toThrow(/vision unavailable/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/batchOperations.test.ts`
Expected: FAIL — cannot resolve `./batchOperations`.

- [ ] **Step 3: Write the implementation**

Create `services/batchOperations.ts`. Before writing the `refine_prompt` and `abstract_image` bodies, **read the actual signatures** at `services/llmService.ts:367` and `:486` — `abstractImage(base64ImageData, promptLength, targetAIModel, settings)` needs a base64 image, so it must load the blob the same way `autoTagService.suggestTagsForItem` does (`getActiveFileManager().getFileAsBlob(item.urls[0])` then `fileToBase64(blob, true)`).

```ts
import type { LLMSettings } from '../types';

export interface BatchOperation {
  id: string;
  label: string;
  inputKind: 'prompt' | 'gallery_item';
  run: (item: any, settings: LLMSettings) => Promise<any>;
}

export const BATCH_OPERATIONS: BatchOperation[] = [
  // ...three entries per the table in this task
];

export function getOperation(id: string): BatchOperation | undefined {
  return BATCH_OPERATIONS.find(o => o.id === id);
}
```

**Errors must propagate.** `runBatch` catches per item and records the failure. An operation that swallows its own error reports a false success.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/batchOperations.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add services/batchOperations.ts services/batchOperations.test.ts
git commit -m "feat(batch): define the operations a batch can run"
```

---

## Task 3: React binding

**Files:**
- Create: `hooks/useBatchRun.ts`
- Test: `hooks/useBatchRun.test.ts`

**Interfaces:**
- Consumes: `runBatch` (Task 1), `getOperation` (Task 2).
- Produces:
  ```ts
  export interface BatchRunState { running: boolean; doneCount: number; total: number; results: ItemResult<any>[]; summary: BatchResult<any> | null }
  export function useBatchRun(): { state: BatchRunState; start: (operationId: string, items: any[], settings: LLMSettings) => Promise<void>; cancel: () => void; reset: () => void }
  ```

**Run state survives navigation** (roadmap acceptance criterion 5) because the handle lives in a module-level ref, not component state. Closing the page does not cancel the run.

- [ ] **Step 1: Write the failing test**

Create `hooks/useBatchRun.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../services/batchOperations', () => ({
  getOperation: () => ({ id: 'x', label: 'X', inputKind: 'prompt', run: async (i: any) => i }),
}));

import { useBatchRun } from './useBatchRun';

describe('useBatchRun', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBatchRun());
    expect(result.current.state.running).toBe(false);
    expect(result.current.state.total).toBe(0);
  });

  it('reports progress and finishes', async () => {
    const { result } = renderHook(() => useBatchRun());
    await act(async () => { await result.current.start('x', [1, 2, 3], {} as any); });
    await waitFor(() => expect(result.current.state.running).toBe(false));
    expect(result.current.state.summary?.completed).toBe(3);
  });

  it('rejects an unknown operation id', async () => {
    vi.resetModules();
    const { result } = renderHook(() => useBatchRun());
    await act(async () => { await result.current.start('missing', [1], {} as any); });
    expect(result.current.state.running).toBe(false);
  });

  it('resets back to idle', async () => {
    const { result } = renderHook(() => useBatchRun());
    await act(async () => { await result.current.start('x', [1], {} as any); });
    act(() => result.current.reset());
    expect(result.current.state.summary).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run hooks/useBatchRun.test.ts`
Expected: FAIL — cannot resolve `./useBatchRun`.

- [ ] **Step 3: Implement the hook**

Wire `runBatch`'s `onProgress` into React state. Keep the `BatchHandle` in a module-level variable so an unmount does not cancel the run, and guard every `setState` behind a mounted check so an unmounted component does not warn.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run hooks/useBatchRun.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/useBatchRun.ts hooks/useBatchRun.test.ts
git commit -m "feat(batch): add useBatchRun hook with navigation-safe run state"
```

---

## Task 4: Batch runner page

**Files:**
- Create: `components/BatchRunnerPage.tsx`
- Test: `components/BatchRunnerPage.test.tsx`
- Modify: `components/App.tsx` (new `ActiveTab` entry), `components/CommandPalette.tsx`

**Required UI elements** (each pinned by a test below):
1. Operation picker listing `BATCH_OPERATIONS` by `label`.
2. Input picker whose source follows the selected operation's `inputKind` — saved prompts or gallery items.
3. **A pre-run summary naming the item count and the active provider.** This is the money guard: a 200-item batch on a paid API should state that before it starts, not after.
4. Live progress showing `doneCount / total`.
5. A prominent Cancel button while running.
6. A per-item report with status and error text.

- [ ] **Step 1: Write the failing test**

Create `components/BatchRunnerPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/batchOperations', () => ({
  BATCH_OPERATIONS: [{ id: 'refine_prompt', label: 'Refine prompt', inputKind: 'prompt', run: async () => 'x' }],
  getOperation: () => ({ id: 'refine_prompt', label: 'Refine prompt', inputKind: 'prompt', run: async () => 'x' }),
}));
vi.mock('../utils/promptStorage', () => ({ loadSavedPrompts: vi.fn(async () => [{ id: 'p1', title: 'One', text: 'a' }]) }));
vi.mock('../utils/galleryStorage', () => ({ loadGalleryItems: vi.fn(async () => []) }));

import { BatchRunnerPage } from './BatchRunnerPage';

describe('BatchRunnerPage', () => {
  it('lists the available operations', () => {
    render(<BatchRunnerPage />);
    expect(screen.getByText('Refine prompt')).toBeTruthy();
  });

  it('shows a pre-run summary with the item count before starting', async () => {
    render(<BatchRunnerPage />);
    expect(await screen.findByText(/0 items selected/i)).toBeTruthy();
  });

  it('disables Run with nothing selected', () => {
    render(<BatchRunnerPage />);
    expect(screen.getByRole('button', { name: /run/i }).hasAttribute('disabled')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/BatchRunnerPage.test.tsx`
Expected: FAIL — cannot resolve `./BatchRunnerPage`.

- [ ] **Step 3: Build the page**

Follow `components/PromptsPage.tsx`'s structure for page chrome and reuse its class names. Register the tab in `components/App.tsx` the same way a neighbouring tab is registered, and add an **"Open Batch Runner"** command to `components/CommandPalette.tsx` under Navigation.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/BatchRunnerPage.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Verify in the running app**

Run `pnpm dev`. Run a 10-prompt refine batch. Confirm: progress advances, cancel stops before the next item, one deliberately broken item does not abort the rest, and navigating away and back leaves the run going.

- [ ] **Step 6: Commit**

```bash
git add components/BatchRunnerPage.tsx components/BatchRunnerPage.test.tsx components/App.tsx components/CommandPalette.tsx
git commit -m "feat(batch): add batch runner page"
```

---

## Task 5: Log the inert capability platform

**Files:**
- Modify: `docs/ISSUES.md`
- Modify: `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md:219`
- Modify: `services/kollektivMcp.ts:345-347`

**Do not skip this.** Option B leaves a real gap. Recording it is what stops the next audit from re-deriving it and what stops someone from trusting `capability_*` tools that return nothing.

- [ ] **Step 1: File the issue**

Add to `docs/ISSUES.md`:

```markdown
### ISSUE-47 — The capability platform is inert: empty registry, stub dispatcher

**Severity:** Medium (dead subsystem, misleading docs and tools)

Two independent defects make the whole capability platform non-functional:

1. **Nothing registers capabilities.** `capabilityRegistry.register()` is never
   called by application code. All 13 references are reads. `capabilityRegistry.list()`
   returns `[]` at runtime, so the five `capability_*` assistant tools return empty
   results.
2. **The step dispatcher is entirely stubs.** `services/executionEngine.ts:213-249`
   returns `status: '... (stub)'` for all eight step kinds. Its own comment at line
   211 says real dispatch is "wired in Layer 8" — that is `services/providerRouter.ts`,
   deleted under ISSUE-32 and never built.

`services/kollektivMcp.ts:345-347` asserts the registry "is populated in the browser
context." It is not; that comment is wrong and is corrected by this issue.

The engine's sequencing, retry, observers, and cancellation ARE real and correct —
only execution is missing.

**Decision:** Phase 4's batch runner was built directly over working services
(Option B) rather than resurrecting this platform. The platform remains inert.
Reviving it is a separate project: register assistant tools as capabilities, then
replace the eight stub branches with real dispatch.

**Related:** ISSUE-31, ISSUE-32, ISSUE-46 — this is the fourth built-but-not-wired case.
```

- [ ] **Step 2: Correct the handbook**

`ARCHITECTURE_CONSTITUTION.md:219` claims the MCP architecture shipped "7 of the original 8 layers." Amend it to record that layers 1-4 exist structurally but do not execute, referencing ISSUE-47.

- [ ] **Step 3: Fix the wrong comment**

Correct `services/kollektivMcp.ts:345-347` so it no longer claims the registry is populated in the browser.

- [ ] **Step 4: Commit**

```bash
git add docs/ISSUES.md docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md services/kollektivMcp.ts
git commit -m "docs: record the inert capability platform (ISSUE-47)"
```

---

## Final Verification

- [ ] `pnpm lint && pnpm test` — clean, green.
- [ ] `pnpm build` succeeds.
- [ ] **Acceptance criteria from the roadmap:**
  1. A 10-item batch completes with a per-item report — Task 4 Step 5.
  2. Cancelling stops before the next item and preserves completed results — Task 1 test 4, Task 4 Step 5.
  3. A single failure does not abort the batch — Task 1 test 2.
  4. Progress comes from callbacks, not polling — Task 1 test 3. *(The roadmap said "the engine's existing observers"; Option B uses `runBatch`'s `onProgress` instead. Same guarantee, different source.)*
  5. Closing and reopening the page does not lose run state — Task 3, Task 4 Step 5.

## Out of Scope

- Reviving the capability platform. Logged as ISSUE-47.
- Parallel execution. Sequential is deliberate; revisit only with a measured bottleneck.
- Scheduling and recurring runs.
- Saved/reusable recipes. Ship one-off runs, learn which chains get used, then decide.
- Multi-step chains within one batch. Ship one operation per run first; chaining is a natural follow-on once `BatchOperation` proves stable.
