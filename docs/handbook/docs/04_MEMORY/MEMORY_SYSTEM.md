# Memory System

## 3-Tier Architecture

The memory system uses three tiers based on durability and scope:

### 1. Working Memory
- Holds the current task context: active prompt, active asset, current assistant conversation
- Short-lived — cleared between sessions
- Managed by React state and `TurnManager` conversation history
- Transient by nature — not persisted to storage

### 2. Long-Term Memory
- Stores durable user preferences and recurring patterns
- Survives browser sessions via `localStorage`
- Managed by `utils/memoryStorage.ts`:
  - `addMemory(fact, opts?)` — store a remembered fact with optional category and tags
  - `loadMemories()` — load all memories
  - `deleteMemory(id)` — remove a memory
  - Categories: `user_preference`, `style_pattern`, `prompt_formula`, `workflow_step`, `general`
- Assistant tools: `remember`, `list_memories`, `search_memories`, `forget`

### 3. Knowledge Repository
- Durable vault notes persisted via Obsidian
- Managed by `utils/obsidianStorage.ts` and `services/knowledgeService.ts`
- Promoted from working/long-term via the lifecycle system
- Supports BM25 full-text search via `utils/vaultSearch.ts`

## Memory Injection

**Function:** `memoryPromptBlock()` — defined in `utils/memoryStorage.ts`, imported into `services/assistantService.ts`

Memory is injected into every assistant request **contextually** by filtering against the user's latest message. This ensures only relevant memories are surfaced to the model:

- The user's latest message is used as a query
- `searchMemories()` filters by text overlap against memory facts and tags
- Results are formatted as a structured `[MEMORY CTX]` block
- Empty results produce no block (no wasted tokens)

## Knowledge Context Block

**Function:** `buildKnowledgeContextBlock()` — defined inline in `services/assistantService.ts`

Formats knowledge search results into an LLM prompt context block:
- Kind badges (memory, note, vault_note, prompt)
- Tag badges
- Source attribution
- Truncation for token budget

## Promotion Rules

Items move through tiers with automatic lifecycle folder projection (`services/knowledgeLifecycle.ts`):

1. **Working → Long-term:** Explicit user request (assistant `remember` tool).
2. **Long-term → Knowledge (vault):** The `remember` tool (`services/assistantTools.ts`) now does this **immediately and automatically** — it calls `knowledgeService.capture({kind: 'memory', tier: 'long-term'})` followed by `knowledgeService.promote({targetTier: 'knowledge'})` in the same execution, so a remembered fact is indexed *and* written to `knowledge/projects/memory/*.md` in the vault as soon as it's remembered — no separate manual step required. This requires the browser-side Obsidian connection (see [OBSIDIAN.md](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md#two-independent-integrations--do-not-conflate-them)) to actually be connected; if not, the capture still succeeds locally and the vault write is silently skipped.
3. **Manual promotion:** `knowledge_lifecycle_promote` tool or `knowledgeService.promote()` can still move any indexed item between lifecycle stages (`inbox` → `projects` → `output` → `wiki`) or force a tier change directly.
4. **Access-count auto-promotion (`services/memoryTierService.ts`) is implemented but dormant.** The service defines "3+ accesses → long-term" and "10+ accesses → knowledge" rules and is read from (`searchAll()`, used by `buildKnowledgeContextBlock()`), but the two functions that would feed it — `addToWorkingMemory()` and `trackAccess()` — have **no callers anywhere in the app**. Working memory is therefore always empty in production and this promotion path never fires. Don't rely on it or assume facts get promoted "after enough uses" until something is wired to call these.

## Tests

- `utils/memoryStorage.test.ts` — memory CRUD and search
- `services/buildKnowledgeContextBlock.test.ts` — 17 tests for context formatting (tests a function defined in `assistantService.ts`, not a same-named source file)
- `services/knowledgeLifecycle.test.ts` — 59 tests for lifecycle and projection
- `utils/vaultSearch.test.ts` — 27 tests for BM25 search index

## Current Repository Alignment

The implementation already supports memory-like behavior through:
- `utils/memoryStorage.ts` — durable preferences and remembered facts
- `utils/notesStorage.ts` — in-app notes with CRUD
- `services/knowledgeService.ts` — unified knowledge interface
- `services/knowledgeLifecycle.ts` — lifecycle folder projection
- `services/relationshipGraph.ts` — cross-entity relationship tracking

**At app boot** (`hooks/useBootSequence.ts`), after the IndexedDB stores init: the Obsidian vault handle is reconnected and the four lifecycle folders are ensured (see [OBSIDIAN.md § Lifecycle Folder Bootstrap](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md#lifecycle-folder-bootstrap)), then `knowledgeService.rebuildIndex()` runs so memories/notes/vault files from prior sessions are indexed and immediately promotable — this call previously existed but had no caller anywhere in the app.

**Dead code, do not build on it:** `syncAgentMemoryToVault(content)` in `utils/memoryStorage.ts` is named as if it writes to the vault but only sets an in-memory variable (`_agentMemoryBlock`) — it has zero callers anywhere in the codebase. Treat it as an unfinished stub, not a real sync path.

## Related

- [KNOWLEDGE_ENGINE.md](../03_KNOWLEDGE_ENGINE/KNOWLEDGE_ENGINE.md) — covers the same 3-tier model from the knowledge-lifecycle side (vault folder projection, relationship graph, retrieval); read both, they describe one system from two angles
- [OBSIDIAN.md](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md) — the vault backend the knowledge repository tier persists to
