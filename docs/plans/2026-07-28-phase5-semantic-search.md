# Phase 5 — Semantic Vault Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Task 1 is a gate.** It verifies an external API contract against the user's own Ollama instance. Do not write Task 2 onward until Task 1's real response is pasted into this document.

**Goal:** Make the vault searchable by meaning as well as by keyword, computed locally through the existing Ollama bridge, with no required cloud dependency and no regression to exact-term search.

**Architecture:** BM25 stays exactly as it is, synchronous and untouched. A parallel vector index lives beside it in IndexedDB, and the already-async `searchNotes()` combines both scores. When no Ollama instance is reachable, semantic silently contributes nothing and the user gets today's behaviour.

**Tech Stack:** TypeScript (strict), IndexedDB via `idb`, Vitest.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green.
- New settings follow the 4-step recipe in `AI_WORKER_RULES.md:43-44`, including **the allow-list at `components/SetupPage.tsx:436`**.
- Test assertions use `toBeTruthy()`, **not** `toBeInTheDocument()`. `vite.config.ts:178` sets `setupFiles: []`.
- Conventional Commits. Work on `development`.
- **No cloud embedding provider.** Local-first is the entire reason for doing it this way.

## Verified Codebase Facts

| Fact | Location |
|---|---|
| `VaultSearchIndex.search(query, maxResults = DEFAULT_MAX_RESULTS): SearchResult[]` is **synchronous** | `utils/vaultSearch.ts:272` |
| `SearchResult = { path, title, snippet, score, matchCount }` | `utils/vaultSearch.ts:42-50` |
| `VaultNote = { path, title, content }` | `utils/vaultSearch.ts:36-40` |
| `getSearchIndex()` singleton + `_setSearchIndex()` test seam | `utils/vaultSearch.ts:457, 465` |
| `build(notes: VaultNote[]): Promise<void>` chunks via `requestIdleCallback` | `utils/vaultSearch.ts:173` region |
| The index is a snapshot and goes stale until rebuilt | `utils/vaultSearch.ts:26-28` (its own note) |
| `searchNotes(query, limit)` is **already async** and is the command-palette entry point | `utils/obsidianStorage.ts:394`, called at `components/CommandPalette.tsx:47` |
| `getOllamaConfig(settings)` rewrites `localhost:11434` to the `/ollama-local` proxy path | `services/ollamaService.ts:32-45` |
| **Ollama has no embedding call in this repo today** | grep `embed` in `services/ollamaService.ts` → no matches |

### The constraint that shapes the design

`search()` is **synchronous**. Embedding a query is a network round-trip, which is not. Making `search()` async would ripple through every caller and break acceptance criterion 2.

**Therefore:** `search()` is not touched. Semantic scoring is a separate async function, and the already-async `searchNotes()` at `obsidianStorage.ts:394` is where the two combine. That is the only seam that needs to change.

## File Structure

| File | Responsibility |
|---|---|
| `services/embeddingService.ts` (create) | Turn text into a vector via the local Ollama bridge. Nothing else. |
| `services/embeddingService.test.ts` (create) | Tests. |
| `utils/semanticIndex.ts` (create) | IndexedDB vector store, cosine similarity, resumable backfill. |
| `utils/semanticIndex.test.ts` (create) | Tests. |
| `utils/obsidianStorage.ts` (modify) | Hybrid ranking inside `searchNotes`. |
| `types.ts`, `utils/settingsStorage.ts`, `components/SetupPage.tsx` (modify) | Settings. |
| `components/settings/` (modify) | Backfill control and index-size display. |

---

## Task 1: GATE — verify the Ollama embeddings contract

**No code is written in this task.** Its output is a pasted real response.

**Why this gate exists:** this repo contains no embedding call. Ollama's embedding endpoint has been `/api/embeddings` (singular request body `{model, prompt}`) and, in newer versions, `/api/embed` (`{model, input}`) with a different response shape. Writing tasks against the wrong one produces code that fails on first run. **Do not guess. Capture it.**

- [ ] **Step 1: Confirm an embedding-capable model is present**

```bash
curl -s http://127.0.0.1:11434/api/tags
```

Look for an embedding model (`nomic-embed-text`, `mxbai-embed-large`, `all-minilm`). If none is installed, stop and pull one:

```bash
ollama pull nomic-embed-text
```

- [ ] **Step 2: Try both endpoint shapes**

```bash
curl -s http://127.0.0.1:11434/api/embeddings -d '{"model":"nomic-embed-text","prompt":"a cinematic sunset"}'
curl -s http://127.0.0.1:11434/api/embed      -d '{"model":"nomic-embed-text","input":"a cinematic sunset"}'
```

- [ ] **Step 3: Record the truth in this document**

Fill this in before continuing. An empty block means Task 2 is not ready to start.

```
Endpoint that worked:
Request body:
Response shape (top-level keys):
Vector length:
Model used:
Date captured:
```

- [ ] **Step 4: Commit the captured contract**

```bash
git add docs/plans/2026-07-28-phase5-semantic-search.md
git commit -m "docs(semantic): capture the real Ollama embeddings contract"
```

---

## Task 2: Embedding service

**Blocked on Task 1.**

**Files:**
- Create: `services/embeddingService.ts`, `services/embeddingService.test.ts`
- Modify: `types.ts`, `utils/settingsStorage.ts`, `components/SetupPage.tsx:436`

**Interfaces:**
- Produces:
  ```ts
  export async function embedText(text: string, settings: LLMSettings): Promise<number[] | null>
  export async function isEmbeddingAvailable(settings: LLMSettings): Promise<boolean>
  ```

**`embedText` returns `null` rather than throwing when Ollama is unreachable.** Semantic search is an enhancement; its absence must degrade silently to BM25, which is acceptance criterion 4.

- [ ] **Step 1: Write the failing test**

Create `services/embeddingService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedText } from './embeddingService';
import type { LLMSettings } from '../types';

const settings = { ollamaBaseUrl: 'http://127.0.0.1:11434', embeddingModel: 'nomic-embed-text' } as unknown as LLMSettings;

describe('embedText', () => {
  beforeEach(() => { global.fetch = vi.fn() as any; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the vector from a successful response', async () => {
    // Adjust this mock to the shape captured in Task 1.
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ embedding: [0.1, 0.2, 0.3] }) });
    await expect(embedText('sunset', settings)).resolves.toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null when Ollama is unreachable', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Failed to fetch'));
    await expect(embedText('sunset', settings)).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(embedText('sunset', settings)).resolves.toBeNull();
  });

  it('returns null for empty text without calling the network', async () => {
    await expect(embedText('   ', settings)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when the response has no vector', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(embedText('sunset', settings)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/embeddingService.test.ts`
Expected: FAIL — cannot resolve `./embeddingService`.

- [ ] **Step 3: Implement, using Task 1's captured contract**

Create `services/embeddingService.ts`. Use `getOllamaConfig(settings)` from `services/ollamaService.ts:32` for the base URL — it already rewrites `localhost:11434` to the `/ollama-local` proxy, so this inherits the working CSP and proxy path for free. Use the endpoint, request body, and response key **captured in Task 1**, not the ones in the test mock above.

- [ ] **Step 4: Add the `embeddingModel` setting**

Apply the 4-step recipe: field on `LLMSettings` (`embeddingModel: string`), default `'nomic-embed-text'`, hydration line, and **`'embeddingModel'` in the allow-list at `SetupPage.tsx:436`**.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run services/embeddingService.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add services/embeddingService.ts services/embeddingService.test.ts types.ts utils/settingsStorage.ts components/SetupPage.tsx
git commit -m "feat(semantic): add local embedding service via the Ollama bridge"
```

---

## Task 3: Vector store and cosine similarity

**Files:**
- Create: `utils/semanticIndex.ts`, `utils/semanticIndex.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function cosineSimilarity(a: number[], b: number[]): number
  export async function putVector(path: string, vector: number[], contentHash: string): Promise<void>
  export async function getAllVectors(): Promise<Array<{ path: string; vector: number[]; contentHash: string }>>
  export async function deleteVector(path: string): Promise<void>
  export async function getIndexStats(): Promise<{ count: number; approxBytes: number }>
  export async function clearVectors(): Promise<void>
  ```

**`contentHash` is what makes backfill resumable and re-embedding correct** — a note whose hash is unchanged is skipped. Use `hash-wasm`, already a dependency.

- [ ] **Step 1: Write the failing test**

Create `utils/semanticIndex.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { cosineSimilarity, putVector, getAllVectors, deleteVector, getIndexStats, clearVectors } from './semanticIndex';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('returns -1 for opposed vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it('returns 0 for a zero vector rather than NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it('returns 0 for mismatched lengths rather than throwing', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
  });
});

describe('vector store', () => {
  beforeEach(async () => { await clearVectors(); });

  it('round-trips a vector', async () => {
    await putVector('a.md', [0.1, 0.2], 'h1');
    const all = await getAllVectors();
    expect(all).toHaveLength(1);
    expect(all[0].path).toBe('a.md');
    expect(all[0].contentHash).toBe('h1');
  });

  it('overwrites on the same path', async () => {
    await putVector('a.md', [0.1], 'h1');
    await putVector('a.md', [0.9], 'h2');
    const all = await getAllVectors();
    expect(all).toHaveLength(1);
    expect(all[0].contentHash).toBe('h2');
  });

  it('deletes a vector', async () => {
    await putVector('a.md', [0.1], 'h1');
    await deleteVector('a.md');
    expect(await getAllVectors()).toHaveLength(0);
  });

  it('reports count and approximate size', async () => {
    await putVector('a.md', [0.1, 0.2, 0.3], 'h1');
    const stats = await getIndexStats();
    expect(stats.count).toBe(1);
    expect(stats.approxBytes).toBeGreaterThan(0);
  });
});
```

> These tests need IndexedDB in jsdom. Check how `utils/db.test.ts` handles this and follow the same approach — if it uses a fake-indexeddb shim, reuse it; if `utils/db.ts` is already mockable, mock it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run utils/semanticIndex.test.ts`
Expected: FAIL — cannot resolve `./semanticIndex`.

- [ ] **Step 3: Implement**

Create `utils/semanticIndex.ts`. Follow the IndexedDB access pattern already in `utils/db.ts` rather than opening a database directly. Store vectors as plain `number[]`; `approxBytes` can be `count × vectorLength × 8`, which is close enough for a settings display.

Guard `cosineSimilarity` against zero-magnitude and length mismatch, returning `0` in both cases — a `NaN` leaking into ranking silently corrupts every result.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run utils/semanticIndex.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/semanticIndex.ts utils/semanticIndex.test.ts
git commit -m "feat(semantic): add IndexedDB vector store and cosine similarity"
```

---

## Task 4: Resumable backfill

**Files:**
- Modify: `utils/semanticIndex.ts`, `utils/semanticIndex.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function backfillVectors(
    notes: VaultNote[],
    settings: LLMSettings,
    onProgress?: (done: number, total: number) => void,
    shouldStop?: () => boolean,
  ): Promise<{ embedded: number; skipped: number; failed: number }>
  ```

**Resumption works by content hash, not by position.** A run interrupted at item 400 of 1000 re-runs from the start but skips the 400 already-hashed notes, so it costs one cheap hash each rather than 400 network calls. That satisfies acceptance criterion 3 with no checkpoint state to corrupt.

- [ ] **Step 1: Write the failing test**

Append to `utils/semanticIndex.test.ts`:

```ts
import { vi } from 'vitest';
import { backfillVectors } from './semanticIndex';

vi.mock('../services/embeddingService', () => ({
  embedText: vi.fn(async (t: string) => (t.includes('fail') ? null : [0.1, 0.2, 0.3])),
}));

const notes = [
  { path: 'a.md', title: 'A', content: 'alpha' },
  { path: 'b.md', title: 'B', content: 'beta' },
];

describe('backfillVectors', () => {
  beforeEach(async () => { await clearVectors(); });

  it('embeds every note on a cold index', async () => {
    const r = await backfillVectors(notes, {} as any);
    expect(r.embedded).toBe(2);
    expect(r.skipped).toBe(0);
  });

  it('skips notes whose content has not changed', async () => {
    await backfillVectors(notes, {} as any);
    const second = await backfillVectors(notes, {} as any);
    expect(second.skipped).toBe(2);
    expect(second.embedded).toBe(0);
  });

  it('re-embeds a note whose content changed', async () => {
    await backfillVectors(notes, {} as any);
    const changed = [{ ...notes[0], content: 'alpha revised' }, notes[1]];
    const r = await backfillVectors(changed, {} as any);
    expect(r.embedded).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('counts a failed embedding without aborting', async () => {
    const r = await backfillVectors([...notes, { path: 'c.md', title: 'C', content: 'fail me' }], {} as any);
    expect(r.failed).toBe(1);
    expect(r.embedded).toBe(2);
  });

  it('stops early when shouldStop returns true and writes no duplicates', async () => {
    let calls = 0;
    await backfillVectors(notes, {} as any, undefined, () => ++calls > 1);
    const all = await getAllVectors();
    expect(all.length).toBeLessThan(2);
  });

  it('reports progress', async () => {
    const onProgress = vi.fn();
    await backfillVectors(notes, {} as any, onProgress);
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls.at(-1)?.[1]).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run utils/semanticIndex.test.ts`
Expected: FAIL — `backfillVectors is not a function`.

- [ ] **Step 3: Implement**

Hash each note's `content` with `hash-wasm` (already a dependency). Skip when the stored `contentHash` matches. Call `embedText`; a `null` return counts as `failed` and moves on. Check `shouldStop()` before each note.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run utils/semanticIndex.test.ts`
Expected: PASS — 15 tests total.

- [ ] **Step 5: Commit**

```bash
git add utils/semanticIndex.ts utils/semanticIndex.test.ts
git commit -m "feat(semantic): add hash-based resumable backfill"
```

---

## Task 5: Hybrid ranking

**Files:**
- Modify: `utils/obsidianStorage.ts:394` (`searchNotes`)
- Create: `utils/hybridSearch.test.ts`

**Interfaces:**
- Consumes: `getSearchIndex().search()` (sync BM25), `embedText`, `getAllVectors`, `cosineSimilarity`.
- Produces: no signature change to `searchNotes`.

**Do not touch `VaultSearchIndex.search()`.** Acceptance criterion 2 is that every existing `vaultSearch.test.ts` test passes unmodified. Combining happens one level up, in the already-async `searchNotes`.

**Ranking:** normalize BM25 scores to 0-1 across the returned set, take cosine as 0-1, then `final = 0.6 × bm25 + 0.4 × semantic`. Exact-term matches must keep winning, which is why BM25 carries the larger weight.

- [ ] **Step 1: Write the failing test**

Create `utils/hybridSearch.test.ts` covering:

1. With embeddings unavailable (`embedText` → `null`), results are exactly BM25's, in BM25's order.
2. With embeddings available, a note that shares no query term but has a near-identical vector appears in the results.
3. An exact-term match still ranks above a merely-similar note.
4. An empty query returns `[]` without calling `embedText`.
5. A note present in BM25 but missing from the vector index still appears, scored on BM25 alone.

Write these as real assertions with mocked `embedText`/`getAllVectors`, matching the mock style used in `utils/vaultSearch.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run utils/hybridSearch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement inside `searchNotes`**

Read `utils/obsidianStorage.ts:394` first to see its current body and return type, then add the semantic pass **around** the existing BM25 call without changing what it does.

- [ ] **Step 4: Verify BM25 did not regress**

Run: `pnpm vitest run utils/vaultSearch.test.ts`
Expected: PASS, **with no edits to that file.** If you had to change a single existing assertion, the design is wrong — back the change out and combine one level higher instead.

- [ ] **Step 5: Commit**

```bash
git add utils/obsidianStorage.ts utils/hybridSearch.test.ts
git commit -m "feat(semantic): combine BM25 and vector scores in searchNotes"
```

---

## Task 6: Backfill control and index size in settings

**Files:**
- Modify: `components/settings/` (the section that already hosts vault/index controls)

**Required elements:**
1. A **"Build semantic index"** button showing `done / total` progress and offering Stop.
2. **Index size display** — `getIndexStats()`'s count and approximate megabytes. This is acceptance criterion 5, and it is what stops the vector store from growing invisibly.
3. A status line when no embedding model is reachable: *"No local embedding model found. Search will use keywords only."*

- [ ] **Step 1: Build the UI**

Reuse the markup and class names of the existing vault-integrity control in that settings area rather than inventing new chrome.

- [ ] **Step 2: Verify by hand**

Run `pnpm dev` with Ollama running. Build the index over a real vault. Mid-run, reload the page, then restart the backfill — confirm it resumes and reports most notes as skipped rather than re-embedding them. Confirm the reported size is plausible.

- [ ] **Step 3: Verify graceful degradation**

Stop Ollama. Search from the command palette. Confirm results still appear with **no error shown** — acceptance criterion 4.

- [ ] **Step 4: Commit**

```bash
git add components/settings/
git commit -m "feat(semantic): add backfill control and index size display"
```

---

## Final Verification

- [ ] `pnpm lint && pnpm test` — clean, green.
- [ ] `pnpm build` succeeds.
- [ ] **Acceptance criteria from the roadmap:**
  1. A conceptual query returns relevant prompts sharing no literal keyword — Task 5 test 2, plus a manual check.
  2. Every existing `vaultSearch.test.ts` test passes **unmodified** — Task 5 Step 4.
  3. Backfill over 1,000 items resumes after a mid-run reload with no duplicate vectors — Task 4 test 5, Task 6 Step 2.
  4. With no Ollama running, search degrades to BM25 with no error — Task 6 Step 3.
  5. Index size is visible in settings — Task 6.

## Out of Scope

- Image embeddings and visual similarity. Text first. CLIP-style image search becomes cheap once this vector store exists, and it is the natural place to revisit ISSUE-46's unshipped "visual search" and "similarity clustering."
- Cloud embedding providers.
- Semantic edges in the relationship graph. Phase 3 builds tag-derived edges; meaning-derived edges become possible after this phase, as a follow-on.
- Approximate nearest neighbour indexing. A linear cosine scan over a few thousand vectors is sub-millisecond. Add HNSW only if a measured vault makes it slow.
