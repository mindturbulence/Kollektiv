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

**File:** `services/assistantService.ts` — `memoryPromptBlock()`

Memory is injected into every assistant request **contextually** by filtering against the user's latest message. This ensures only relevant memories are surfaced to the model:

- The user's latest message is used as a query
- `searchMemories()` filters by text overlap against memory facts and tags
- Results are formatted as a structured `[MEMORY CTX]` block
- Empty results produce no block (no wasted tokens)

## Knowledge Context Block

**File:** `services/buildKnowledgeContextBlock.ts`

Formats knowledge search results into an LLM prompt context block:
- Kind badges (memory, note, vault_note, prompt)
- Tag badges
- Source attribution
- Truncation for token budget

## Promotion Rules

Items move through tiers with automatic lifecycle folder projection (`services/knowledgeLifecycle.ts`):

1. **Working → Long-term:** Explicit user request (assistant `remember` tool) or repeated pattern detection
2. **Long-term → Knowledge:** Manual promotion via `knowledge_lifecycle_promote` tool or `knowledgeService.promote()`
3. **Knowledge lifecycle:** Items are projected into vault folders: `inbox/` → `projects/` → `output/` → `wiki/`

## Tests

- `utils/memoryStorage.test.ts` — memory CRUD and search
- `services/buildKnowledgeContextBlock.test.ts` — 17 tests for context formatting
- `services/knowledgeLifecycle.test.ts` — 59 tests for lifecycle and projection
- `utils/vaultSearch.test.ts` — 27 tests for BM25 search index

## Current Repository Alignment

The implementation already supports memory-like behavior through:
- `utils/memoryStorage.ts` — durable preferences and remembered facts
- `utils/notesStorage.ts` — in-app notes with CRUD
- `services/knowledgeService.ts` — unified knowledge interface
- `services/knowledgeLifecycle.ts` — lifecycle folder projection
- `services/relationshipGraph.ts` — cross-entity relationship tracking

## Related

- [KNOWLEDGE_ENGINE.md](../03_KNOWLEDGE_ENGINE/KNOWLEDGE_ENGINE.md) — covers the same 3-tier model from the knowledge-lifecycle side (vault folder projection, relationship graph, retrieval); read both, they describe one system from two angles
- [OBSIDIAN.md](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md) — the vault backend the knowledge repository tier persists to
