# Phase 3 — Relationship Graph Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make multi-hop traversal and path-finding across vault artifacts actually work, then expose both to the assistant and to a browsable vault map.

**Architecture:** The graph's traversal methods already exist and are tested, but they walk an **edge set that is never populated**. This phase's first and largest task is building edges from shared tags during rehydration. Traversal exposure is the easy part that follows.

**Tech Stack:** TypeScript (strict), React 19, Vitest.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green.
- Test assertions use `toBeTruthy()`, **not** `toBeInTheDocument()`. `vite.config.ts:178` sets `setupFiles: []`.
- Conventional Commits. Work on `development`.
- Rehydration stays on-demand and in-memory. **Nothing in this phase persists the graph.**

## The Finding That Reshaped This Phase

The roadmap said this phase would "surface the graph traversal already built and tested." That framing was wrong, and an implementer following it would ship methods that return nothing.

**Verified 2026-07-28:**

| Fact | Evidence |
|---|---|
| `hydrateTaggedEntities()` calls `addEntity` only — **`addRelation` appears zero times** | `services/tools/graphTools.ts:15-26`, `grep -c addRelation` → `0` |
| `traverse` walks adjacency (the relation set), not tags | `services/relationshipGraph.ts:362-375` — BFS over a queue seeded from `_adjacency` |
| `findRelatedByTags` works today because it compares entity `tags` arrays directly, bypassing relations entirely | `services/relationshipGraph.ts:336` |
| **`findPaths` does not exist.** The real method is `findShortestPath(sourceKind, sourceId, targetKind, targetId): PathNode[]` | `services/relationshipGraph.ts:410`. The name `findPaths` appears only in that file's own header comment at line 13, and was copied into `ARCHITECTURE_CONSTITUTION.md` from there |

**Consequence:** on today's code, `traverse(kind, id)` returns exactly one element — the start node — because the queue never expands. `findShortestPath` returns `[]` for any two distinct entities. `getSubgraph` returns entities with `relations: []`.

**Therefore Task 1 builds the edges.** Everything else in this phase is inert without it.

## Verified Codebase Facts

| Fact | Location |
|---|---|
| `addRelation(type, sourceKind, sourceId, targetKind, targetId, weight?, metadata?): Relation \| null` | `services/relationshipGraph.ts:177` |
| `traverse(kind, id, maxDepth = 3, relationType?): PathNode[]` | `services/relationshipGraph.ts:362` |
| `findShortestPath(sourceKind, sourceId, targetKind, targetId): PathNode[]` | `services/relationshipGraph.ts:410` |
| `getSubgraph(entityKeys: string[]): { entities, relations }` | `services/relationshipGraph.ts:454` |
| `PathNode = { entity: GraphEntity; relation?: Relation }` | `services/relationshipGraph.ts:66-69` |
| `similar_to` and `associated_with` are the **bidirectional** relation types | `services/relationshipGraph.ts:73` |
| Rehydration source: `loadMemories`, `loadGalleryItems`, `loadSavedPrompts` | `services/tools/graphTools.ts:16-25` |
| Relatable kinds: `memory`, `gallery_item`, `prompt` | `services/tools/graphTools.ts:8` |

## File Structure

| File | Responsibility |
|---|---|
| `services/tools/graphHydration.ts` (create) | Extracted + extended rehydration, now including edges. |
| `services/tools/graphHydration.test.ts` (create) | Tests, including the cost measurement. |
| `services/tools/graphTools.ts` (modify) | Import shared hydration instead of its private copy. |
| `services/tools/graphTraversalTools.ts` (create) | `traverse_knowledge` + `find_knowledge_path` tools. |
| `components/VaultMapPanel.tsx` (create) | Read-only visual map. |
| `components/CommandPalette.tsx` (modify) | Open-map command. |

---

## Task 1: Build tag-derived relations during hydration

**Files:**
- Create: `services/tools/graphHydration.ts`
- Test: `services/tools/graphHydration.test.ts`
- Modify: `services/tools/graphTools.ts`

**Interfaces:**
- Produces: `hydrateKnowledgeGraph(): Promise<{ entities: number; relations: number; ms: number }>`

**Design:** two entities get a bidirectional `similar_to` edge when they share at least one tag. Weight is the Jaccard index of their tag sets, so a pair sharing three of four tags outranks a pair sharing one of twenty.

**Cost:** this is O(n²) over tagged entities. That is deliberate and bounded — see Task 2 for the measurement that decides whether it stays.

- [ ] **Step 1: Write the failing test**

Create `services/tools/graphHydration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { relationshipGraph } from '../relationshipGraph';

const { loadMemories, loadGalleryItems, loadSavedPrompts } = vi.hoisted(() => ({
  loadMemories: vi.fn(async () => [] as any[]),
  loadGalleryItems: vi.fn(async () => [] as any[]),
  loadSavedPrompts: vi.fn(async () => [] as any[]),
}));
vi.mock('../../utils/memoryStorage', () => ({ loadMemories }));
vi.mock('../../utils/galleryStorage', () => ({ loadGalleryItems }));
vi.mock('../../utils/promptStorage', () => ({ loadSavedPrompts }));

import { hydrateKnowledgeGraph } from './graphHydration';

describe('hydrateKnowledgeGraph', () => {
  beforeEach(() => {
    loadMemories.mockResolvedValue([]);
    loadGalleryItems.mockResolvedValue([]);
    loadSavedPrompts.mockResolvedValue([]);
  });

  it('adds entities from all three stores', async () => {
    loadMemories.mockResolvedValue([{ id: 'm1', fact: 'likes cinematic light', tags: ['cinematic'] }]);
    loadGalleryItems.mockResolvedValue([{ id: 'g1', title: 'Sunset', tags: ['cinematic'] }]);
    loadSavedPrompts.mockResolvedValue([{ id: 'p1', title: 'Golden', text: 'x', tags: ['cinematic'] }]);
    const stats = await hydrateKnowledgeGraph();
    expect(stats.entities).toBe(3);
  });

  it('creates a relation between two entities sharing a tag', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic'] },
    ]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g2').length).toBeGreaterThan(0);
  });

  it('creates NO relation between entities with no shared tag', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['portrait'] },
    ]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g2')).toEqual([]);
  });

  it('relates entities across different stores', async () => {
    loadMemories.mockResolvedValue([{ id: 'm1', fact: 'f', tags: ['cinematic'] }]);
    loadSavedPrompts.mockResolvedValue([{ id: 'p1', title: 'P', text: 'x', tags: ['cinematic'] }]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.getRelationsBetween('memory', 'm1', 'prompt', 'p1').length).toBeGreaterThan(0);
  });

  it('makes traverse return more than the start node once edges exist', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic'] },
    ]);
    await hydrateKnowledgeGraph();
    expect(relationshipGraph.traverse('gallery_item', 'g1', 2).length).toBeGreaterThan(1);
  });

  it('ignores entities with no tags', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: [] },
      { id: 'g2', title: 'B' },
    ]);
    const stats = await hydrateKnowledgeGraph();
    expect(stats.entities).toBe(2);
    expect(stats.relations).toBe(0);
  });

  it('weights a fully-overlapping pair above a barely-overlapping one', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['x', 'y'] },
      { id: 'g2', title: 'B', tags: ['x', 'y'] },
      { id: 'g3', title: 'C', tags: ['x', 'a', 'b', 'c', 'd'] },
    ]);
    await hydrateKnowledgeGraph();
    const strong = relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g2')[0];
    const weak = relationshipGraph.getRelationsBetween('gallery_item', 'g1', 'gallery_item', 'g3')[0];
    expect(strong.weight).toBeGreaterThan(weak.weight);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/tools/graphHydration.test.ts`
Expected: FAIL — cannot resolve `./graphHydration`.

- [ ] **Step 3: Write the implementation**

Create `services/tools/graphHydration.ts`:

```ts
/**
 * Knowledge-graph hydration.
 *
 * Extracted from graphTools.ts and extended: the original only added
 * entities, which left traverse/findShortestPath/getSubgraph walking an
 * empty edge set and returning nothing useful. This builds tag-derived
 * edges so those methods have something to walk.
 *
 * ponytail: rehydrated from persistent stores on every call rather than
 * kept live via addEntity at every save site. Edge building is O(n²) over
 * tagged entities — see MAX_TAGGED_ENTITIES for the bound and the plan
 * document for the measurement that justifies it.
 */

import { relationshipGraph } from '../relationshipGraph';
import type { KnowledgeKind } from '../knowledgeService';
import { loadMemories } from '../../utils/memoryStorage';
import { loadGalleryItems } from '../../utils/galleryStorage';
import { loadSavedPrompts } from '../../utils/promptStorage';

/** Above this many tagged entities, edge building is skipped rather than
 *  freezing the UI. The map degrades to entities-only, which is still
 *  more useful than a blocked main thread. */
const MAX_TAGGED_ENTITIES = 2000;

interface Tagged { kind: KnowledgeKind; id: string; tags: string[] }

/** Jaccard index — shared tags over total distinct tags. Rewards a tight
 *  overlap over an incidental one on a heavily-tagged item. */
function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared === 0) return 0;
  return shared / (a.size + b.size - shared);
}

export async function hydrateKnowledgeGraph(): Promise<{ entities: number; relations: number; ms: number }> {
  const started = performance.now();
  relationshipGraph.clear();

  const [memories, galleryItems, prompts] = await Promise.all([
    loadMemories(),
    loadGalleryItems(),
    loadSavedPrompts(),
  ]);

  const tagged: Tagged[] = [];
  const add = (kind: KnowledgeKind, id: string, label: string, tags: string[]) => {
    relationshipGraph.addEntity(kind, id, label, tags);
    if (tags.length > 0) tagged.push({ kind, id, tags });
  };

  for (const m of memories) add('memory', m.id, m.fact.slice(0, 80), m.tags || []);
  for (const g of galleryItems) add('gallery_item', g.id, g.title, g.tags || []);
  for (const p of prompts) add('prompt', p.id, p.title || p.text.slice(0, 80), p.tags || []);

  const entities = memories.length + galleryItems.length + prompts.length;
  let relations = 0;

  if (tagged.length <= MAX_TAGGED_ENTITIES) {
    const sets = tagged.map(t => new Set(t.tags.map(s => s.toLowerCase())));
    for (let i = 0; i < tagged.length; i++) {
      for (let j = i + 1; j < tagged.length; j++) {
        const weight = jaccard(sets[i], sets[j]);
        if (weight === 0) continue;
        // similar_to is bidirectional, so one call writes both directions.
        const rel = relationshipGraph.addRelation(
          'similar_to',
          tagged[i].kind, tagged[i].id,
          tagged[j].kind, tagged[j].id,
          weight,
        );
        if (rel) relations++;
      }
    }
  } else {
    console.warn(`[graphHydration] ${tagged.length} tagged entities exceeds ${MAX_TAGGED_ENTITIES}; skipping edge build.`);
  }

  return { entities, relations, ms: performance.now() - started };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/tools/graphHydration.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Point `graphTools.ts` at the shared hydration**

In `services/tools/graphTools.ts`, delete the private `hydrateTaggedEntities` function (lines 15-26) and its now-unused store imports, then import and call `hydrateKnowledgeGraph()` in its place inside `find_related_knowledge`'s `execute`.

- [ ] **Step 6: Verify nothing regressed**

Run: `pnpm lint && pnpm test`
Expected: clean, green. `graphTools.test.ts`'s 6 existing tests must pass unmodified — `find_related_knowledge` uses `findRelatedByTags`, which reads entity tags directly and is unaffected by the new edges.

- [ ] **Step 7: Commit**

```bash
git add services/tools/graphHydration.ts services/tools/graphHydration.test.ts services/tools/graphTools.ts
git commit -m "feat(graph): build tag-derived relations during hydration"
```

---

## Task 2: Measure hydration cost and decide on caching

**Files:**
- Modify: `services/tools/graphHydration.test.ts`

**This task carries the roadmap's acceptance criterion 4 and is a genuine decision point, not a formality.**

- [ ] **Step 1: Write the cost test**

Append to `services/tools/graphHydration.test.ts`:

```ts
describe('hydration cost', () => {
  it('builds a 500-entity graph in under 500ms', async () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `g${i}`,
      title: `Item ${i}`,
      // ~8 tags drawn from a 40-tag vocabulary — realistic overlap density.
      tags: [`t${i % 40}`, `t${(i * 7) % 40}`, `t${(i * 13) % 40}`],
    }));
    loadGalleryItems.mockResolvedValue(items);
    const stats = await hydrateKnowledgeGraph();
    expect(stats.entities).toBe(500);
    expect(stats.relations).toBeGreaterThan(0);
    expect(stats.ms).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run it and record the real number**

Run: `pnpm vitest run services/tools/graphHydration.test.ts -t 'hydration cost'`

Write the observed `stats.ms` into this plan file, right here, as a line reading `Observed: <N>ms for 500 entities on <date>.` A future reader needs the actual number, not the assertion bound.

- [ ] **Step 3: Decide**

- **Under 500ms:** do nothing. Record the number and move on.
- **Over 500ms:** add an in-memory cache in `graphHydration.ts` keyed on the combined store item counts, invalidated whenever any count changes.

  **The cache must be in-memory only, invalidated on any vault mutation, and never persisted.** A persisted graph cache is the write-path plumbing ISSUE-31 deliberately avoided, and it reintroduces the staleness class this phase's out-of-scope section rules out.

- [ ] **Step 4: Commit**

```bash
git add services/tools/graphHydration.test.ts docs/plans/2026-07-28-phase3-relationship-graph.md
git commit -m "test(graph): measure hydration cost at 500 entities"
```

---

## Task 3: Expose traversal as assistant tools

**Files:**
- Create: `services/tools/graphTraversalTools.ts`
- Test: `services/tools/graphTraversalTools.test.ts`

**Interfaces:**
- Consumes: `hydrateKnowledgeGraph` (Task 1), `relationshipGraph.traverse` / `.findShortestPath`.
- Produces: `graphTraversalTools: AssistantTool[]` — `traverse_knowledge`, `find_knowledge_path`.

**Note the method name.** It is `findShortestPath`, **not** `findPaths`. The latter appears in `relationshipGraph.ts`'s own header comment at line 13 and in `ARCHITECTURE_CONSTITUTION.md`, but no such method exists.

- [ ] **Step 1: Write the failing test**

Create `services/tools/graphTraversalTools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadMemories, loadGalleryItems, loadSavedPrompts } = vi.hoisted(() => ({
  loadMemories: vi.fn(async () => [] as any[]),
  loadGalleryItems: vi.fn(async () => [] as any[]),
  loadSavedPrompts: vi.fn(async () => [] as any[]),
}));
vi.mock('../../utils/memoryStorage', () => ({ loadMemories }));
vi.mock('../../utils/galleryStorage', () => ({ loadGalleryItems }));
vi.mock('../../utils/promptStorage', () => ({ loadSavedPrompts }));

import { graphTraversalTools } from './graphTraversalTools';

const tool = (name: string) => graphTraversalTools.find(t => t.name === name)!;

describe('traverse_knowledge', () => {
  beforeEach(() => {
    loadMemories.mockResolvedValue([]);
    loadSavedPrompts.mockResolvedValue([]);
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic', 'portrait'] },
      { id: 'g3', title: 'C', tags: ['portrait'] },
    ]);
  });

  it('returns the multi-hop neighbourhood', async () => {
    const out = await tool('traverse_knowledge').execute({ kind: 'gallery_item', id: 'g1', max_depth: 2 });
    expect(out).toContain('g2');
    expect(out).toContain('g3');
  });

  it('rejects an unknown kind', async () => {
    const out = await tool('traverse_knowledge').execute({ kind: 'nonsense', id: 'g1' });
    expect(out).toMatch(/kind must be one of/i);
  });

  it('reports a missing id clearly', async () => {
    const out = await tool('traverse_knowledge').execute({ kind: 'gallery_item', id: 'missing' });
    expect(out).toMatch(/no gallery_item item with id/i);
  });
});

describe('find_knowledge_path', () => {
  beforeEach(() => {
    loadMemories.mockResolvedValue([]);
    loadSavedPrompts.mockResolvedValue([]);
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g2', title: 'B', tags: ['cinematic', 'portrait'] },
      { id: 'g3', title: 'C', tags: ['portrait'] },
    ]);
  });

  it('finds a path through a shared intermediate tag', async () => {
    const out = await tool('find_knowledge_path').execute({
      from_kind: 'gallery_item', from_id: 'g1',
      to_kind: 'gallery_item', to_id: 'g3',
    });
    expect(out).toContain('g2');
  });

  it('reports when no path exists', async () => {
    loadGalleryItems.mockResolvedValue([
      { id: 'g1', title: 'A', tags: ['cinematic'] },
      { id: 'g9', title: 'Z', tags: ['unrelated'] },
    ]);
    const out = await tool('find_knowledge_path').execute({
      from_kind: 'gallery_item', from_id: 'g1',
      to_kind: 'gallery_item', to_id: 'g9',
    });
    expect(out).toMatch(/no path/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/tools/graphTraversalTools.test.ts`
Expected: FAIL — cannot resolve `./graphTraversalTools`.

- [ ] **Step 3: Write the implementation**

Create `services/tools/graphTraversalTools.ts`. Mirror the structure of `graphTools.ts` exactly — same `AssistantTool` shape, same kind validation, same "use search_* to find current items" error phrasing.

```ts
import type { AssistantTool } from './types';
import type { KnowledgeKind } from '../knowledgeService';
import { relationshipGraph } from '../relationshipGraph';
import { hydrateKnowledgeGraph } from './graphHydration';

const RELATABLE_KINDS = ['memory', 'gallery_item', 'prompt'] as const;
type RelatableKind = (typeof RELATABLE_KINDS)[number];

const badKind = () => `Error: kind must be one of ${RELATABLE_KINDS.join(', ')}.`;
const missing = (kind: string, id: string) =>
  `Error: no ${kind} item with id "${id}". Use search_memories / search_gallery / search_prompts to find current items.`;

export const graphTraversalTools: AssistantTool[] = [
  {
    name: 'traverse_knowledge',
    description:
      "Walk outward from one item to everything connected within N hops, following shared-tag links across memories, gallery items, and saved prompts. Use find_related_knowledge for direct neighbours only; use this to see a whole cluster.",
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Kind of the starting item.', enum: [...RELATABLE_KINDS] },
        id: { type: 'string', description: 'Id of the starting item.' },
        max_depth: { type: 'number', description: 'How many hops to walk (default 2, max 4).' },
      },
      required: ['kind', 'id'],
    },
    execute: async ({ kind, id, max_depth }) => {
      if (!RELATABLE_KINDS.includes(kind as RelatableKind)) return badKind();
      await hydrateKnowledgeGraph();
      const k = kind as KnowledgeKind;
      if (!relationshipGraph.hasEntity(k, String(id))) return missing(String(kind), String(id));
      const depth = Math.min(Math.max(Number(max_depth) || 2, 1), 4);
      const nodes = relationshipGraph.traverse(k, String(id), depth);
      if (nodes.length <= 1) return 'No connected items found (this item shares no tags with anything else).';
      return JSON.stringify(nodes.map(n => ({
        kind: n.entity.kind,
        id: n.entity.id,
        label: n.entity.label,
        via: n.relation?.type,
      })));
    },
  },
  {
    name: 'find_knowledge_path',
    description:
      "Show how two items are connected — the shortest chain of shared-tag links between them. Answers 'what links this prompt to that image?'.",
    parameters: {
      type: 'object',
      properties: {
        from_kind: { type: 'string', description: 'Kind of the source item.', enum: [...RELATABLE_KINDS] },
        from_id: { type: 'string', description: 'Id of the source item.' },
        to_kind: { type: 'string', description: 'Kind of the target item.', enum: [...RELATABLE_KINDS] },
        to_id: { type: 'string', description: 'Id of the target item.' },
      },
      required: ['from_kind', 'from_id', 'to_kind', 'to_id'],
    },
    execute: async ({ from_kind, from_id, to_kind, to_id }) => {
      if (!RELATABLE_KINDS.includes(from_kind as RelatableKind)) return badKind();
      if (!RELATABLE_KINDS.includes(to_kind as RelatableKind)) return badKind();
      await hydrateKnowledgeGraph();
      const fk = from_kind as KnowledgeKind, tk = to_kind as KnowledgeKind;
      if (!relationshipGraph.hasEntity(fk, String(from_id))) return missing(String(from_kind), String(from_id));
      if (!relationshipGraph.hasEntity(tk, String(to_id))) return missing(String(to_kind), String(to_id));
      const path = relationshipGraph.findShortestPath(fk, String(from_id), tk, String(to_id));
      if (path.length === 0) return 'No path found — these items share no chain of tags.';
      return JSON.stringify(path.map(n => ({
        kind: n.entity.kind,
        id: n.entity.id,
        label: n.entity.label,
        via: n.relation?.type,
      })));
    },
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/tools/graphTraversalTools.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Register the tools**

Find where `graphTools` is spread into the assistant's tool list (grep `graphTools` in `services/assistantTools.ts`) and add `...graphTraversalTools` alongside it, importing from the new file.

- [ ] **Step 6: Verify the tool count moved**

Run: `pnpm validate-config`
Expected: PASSED, with the tool count **two higher** than the 100 reported before this phase. If the count did not move, the tools are not registered — go back to Step 5.

- [ ] **Step 7: Commit**

```bash
git add services/tools/graphTraversalTools.ts services/tools/graphTraversalTools.test.ts services/assistantTools.ts
git commit -m "feat(graph): expose traverse and shortest-path as assistant tools"
```

---

## Task 4: Vault map panel

**Files:**
- Create: `components/VaultMapPanel.tsx`
- Test: `components/VaultMapPanel.test.tsx`
- Modify: `components/CommandPalette.tsx`

**Scope:** a **read-only** force-free layout. No physics simulation, no new dependency. Entities are placed on concentric rings by kind and connected with SVG lines whose opacity tracks relation weight. This is the laziest thing that answers "what is clustered with what," and it renders 500 nodes without a layout engine.

- [ ] **Step 1: Write the failing test**

Create `components/VaultMapPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VaultMapPanel } from './VaultMapPanel';

vi.mock('../services/tools/graphHydration', () => ({
  hydrateKnowledgeGraph: vi.fn(async () => ({ entities: 2, relations: 1, ms: 5 })),
}));
vi.mock('../services/relationshipGraph', () => ({
  relationshipGraph: {
    getEntities: () => [
      { kind: 'gallery_item', id: 'g1', label: 'Sunset', tags: ['cinematic'] },
      { kind: 'prompt', id: 'p1', label: 'Golden hour', tags: ['cinematic'] },
    ],
    getRelations: () => [{ id: 'r1', type: 'similar_to', source: 'gallery_item::g1', target: 'prompt::p1', weight: 0.5 }],
  },
}));

describe('VaultMapPanel', () => {
  it('renders entity labels once hydrated', async () => {
    render(<VaultMapPanel />);
    await waitFor(() => expect(screen.getByText('Sunset')).toBeTruthy());
    expect(screen.getByText('Golden hour')).toBeTruthy();
  });

  it('reports the entity and relation counts', async () => {
    render(<VaultMapPanel />);
    await waitFor(() => expect(screen.getByText(/2 items/i)).toBeTruthy());
    expect(screen.getByText(/1 link/i)).toBeTruthy();
  });

  it('shows an empty state when the vault has no tagged items', async () => {
    const { relationshipGraph } = await import('../services/relationshipGraph');
    (relationshipGraph.getEntities as any) = () => [];
    (relationshipGraph.getRelations as any) = () => [];
    render(<VaultMapPanel />);
    await waitFor(() => expect(screen.getByText(/nothing tagged yet/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/VaultMapPanel.test.tsx`
Expected: FAIL — cannot resolve `./VaultMapPanel`.

- [ ] **Step 3: Implement the panel**

Build `components/VaultMapPanel.tsx` as an SVG map. Requirements the tests above pin down:

- Calls `hydrateKnowledgeGraph()` on mount, in an effect with a cancellation guard so an unmount mid-hydration does not set state.
- Renders each entity's `label` as an SVG `<text>`, positioned on a ring chosen by `kind` (`memory`, `gallery_item`, `prompt` → three radii), angle by index within the kind.
- Renders each relation as an SVG `<line>` with `strokeOpacity` proportional to `weight`.
- Shows `"N items · M links"` so the counts test passes.
- Shows `"Nothing tagged yet — add tags to gallery items or prompts to see connections."` when there are no entities.
- Match the panel chrome of an existing overlay panel (`components/ActivityPanel.tsx` is the closest structural sibling); reuse its container classes rather than inventing new ones.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/VaultMapPanel.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add the command-palette entry**

In `components/CommandPalette.tsx`, add a command under the Panels group: **"Open Vault Map"**. Follow the exact shape of a neighbouring panel-toggle command in that file.

- [ ] **Step 6: Verify in the running app**

Run `pnpm dev`, tag several gallery items with an overlapping tag, open the map from Ctrl+K, and confirm the tagged items appear connected. Watch the console for the `MAX_TAGGED_ENTITIES` warning — if it fires on a real vault, revisit Task 2's decision.

- [ ] **Step 7: Commit**

```bash
git add components/VaultMapPanel.tsx components/VaultMapPanel.test.tsx components/CommandPalette.tsx
git commit -m "feat(graph): add read-only vault map panel"
```

---

## Task 5: Correct the `findPaths` name in the handbook

**Files:**
- Modify: `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md:349`
- Modify: `services/relationshipGraph.ts:13`

- [ ] **Step 1: Fix both references**

The constitution's ISSUE-31 row names `findPaths` as an unused method. No such method exists — it is `findShortestPath` (`relationshipGraph.ts:410`). Correct the constitution's row, and fix the same wrong name in `relationshipGraph.ts`'s own header comment at line 13, which is where the error originated.

While editing the constitution's row, update it to record that `traverse`, `findShortestPath`, and `getSubgraph` are now reachable, and that edges are built during hydration as of this phase.

- [ ] **Step 2: Commit**

```bash
git add docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md services/relationshipGraph.ts
git commit -m "docs(graph): correct findPaths to findShortestPath"
```

---

## Final Verification

- [ ] `pnpm lint && pnpm test` — clean, green.
- [ ] `pnpm validate-config` — tool count is two higher than before this phase.
- [ ] `pnpm build` succeeds.
- [ ] **Acceptance criteria from the roadmap:**
  1. `traverse` from a tagged gallery item returns its n-hop neighbourhood — Task 3 test 1. *(Note: on pre-Task-1 code this was impossible; the edge build is what makes it true.)*
  2. `find_knowledge_path` between two artifacts sharing an intermediate tag returns a path — Task 3.
  3. The map renders 500+ entities without blocking beyond 100ms — verify by hand against a real vault; the ring layout does no iterative solving.
  4. Rehydration cost measured and recorded, with the caching decision made — Task 2.

## Out of Scope

- Persisting the graph. On-demand rehydration is the established pattern and avoids a staleness class.
- Prompt lineage. Already solved by `SavedPrompt.lineage`; a second source of truth would conflict.
- Editing the graph from the map. Read-only, deliberately — relations are derived from tags, so the way to change a relation is to change a tag.
- Semantic (`similar_to`-by-meaning) edges. Those need embeddings; revisit after Phase 5.
