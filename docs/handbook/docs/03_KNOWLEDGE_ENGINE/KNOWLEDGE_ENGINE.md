# Knowledge Engine

## Karpathy Lifecycle

The knowledge engine treats the workspace as a living knowledge base organized through a **4-stage lifecycle** mapped to vault folder structure:

1. **inbox/** — Raw, uncategorized items awaiting triage
2. **projects/** — Active work in progress
3. **output/** — Completed, publishable items
4. **wiki/** — Permanent reference documentation

**Implementation:** `services/knowledgeLifecycle.ts` — `determineStage()`, `generatePath()`, `buildFrontmatter()`, `promote()`, `stageFromPath()`, `scanVaultFolders()`
**Tests:** 59 unit tests in `services/knowledgeLifecycle.test.ts`

## Knowledge Service

**File:** `services/knowledgeService.ts`

Unified interface over the app's storage systems:

| Method | Description |
|--------|-------------|
| `capture(ref, content)` | Save a knowledge item (note, memory, vault file) |
| `search(query, kinds?)` | Two-pass content scoring across all storage backends |
| `recall(ref)` | Load content for a specific knowledge reference |
| `promote(ref, targetTier, reason)` | Move item from working → long-term → knowledge tiers |
| `distill(ref)` | Compress raw material into a reusable form |
| `archive(ref)` | Move item to cold storage |
| `list(kinds?)` | List all indexed knowledge items, optionally filtered by kind |
| `rebuildIndex()` | Rebuild the full knowledge index from storage |

## Relationship Graph

**File:** `services/relationshipGraph.ts`

A lightweight entity graph connecting prompts, images, styles, notes, and memories:

- **Entity CRUD** — add, get, update, delete entities with metadata
- **Relation management** — directed and undirected edges between entities
- **BFS traversal** — find all entities reachable from a starting node
- **Shortest path** — find optimal path between two entities
- **Subgraph extraction** — export a focused subgraph
- **Tag-based similarity** — `findRelatedByTags(entityId)` scoring
- **Serialization** — export/import to/from JSON

**Tests:** 52 unit tests in `services/relationshipGraph.test.ts`

## Knowledge Context Injection

**Function:** `buildKnowledgeContextBlock()` — defined inline in `services/assistantService.ts` (only its test file, `services/buildKnowledgeContextBlock.test.ts`, is a separate module)

Formats knowledge search results into an LLM prompt context block with kind badges and tag badges. Injected into every assistant request via `buildSystemIdentity()`:

- Empty context → returns empty string
- Relevant results → formatted block with source attribution
- Service unavailable → graceful fallback message

**Tests:** 17 unit tests in `services/buildKnowledgeContextBlock.test.ts`

## Retrieval

Retrieval favors structured local context over broad remote search. The knowledge engine finds related prompts, similar gallery items, and prior project decisions using:
- Tag-based matching
- Metadata similarity
- Relationship graph traversal
- Vault search index (BM25)

## Memory

**File:** `services/memoryTierService.ts`

3-tier memory architecture:
- **Working memory** — conversation context, transient
- **Long-term memory** — user preferences/profile (`utils/memoryStorage.ts`)
- **Knowledge repository** — vault notes persisted via Obsidian

Promotion rules: working → long-term → knowledge with automatic lifecycle folder projection. The `remember` tool auto-promotes to the knowledge (vault) tier immediately on capture — see [MEMORY_SYSTEM.md § Promotion Rules](../04_MEMORY/MEMORY_SYSTEM.md#promotion-rules) for the full picture, including which promotion paths are actually wired up versus implemented-but-dormant.

## Metadata

Prompt text, model names, asset hashes, timestamps, and user annotations all form the retrieval surface. The key storage files:

- `utils/memoryStorage.ts` — durable user preferences and remembered facts
- `utils/notesStorage.ts` — in-app notes with CRUD operations
- `utils/galleryStorage.ts` — gallery item metadata and search
- `utils/promptStorage.ts` — saved prompt library with lineage tracking
- `utils/obsidianStorage.ts` — Obsidian vault read/write/search with BM25 index fallback

## Assistant Tools

- `remember` — captures a fact via `knowledgeService.capture()` (indexing it) and immediately calls `knowledgeService.promote({targetTier: 'knowledge'})`, writing it to the vault in the same turn. No separate promotion step needed.
- `knowledge_lifecycle_promote` — lets the assistant move any already-indexed item between lifecycle stages on demand:
  - Parameters: `kind` (memory/note/vault_note/prompt), `id`, `target_stage` (inbox/projects/output/wiki)
  - Validates item exists in the knowledge index
  - Determines current stage from vault path
  - Loads content, promotes to target stage, updates index
  - Auto-promotes tier to "knowledge" when moving to wiki/output

## Related

- [MEMORY_SYSTEM.md](../04_MEMORY/MEMORY_SYSTEM.md) — covers the same 3-tier working/long-term/knowledge model from the memory side (injection, promotion rules, tests); read both, they describe one system from two angles
- [OBSIDIAN.md](OBSIDIAN.md) — the vault backend this engine's knowledge repository tier persists to via `utils/obsidianStorage.ts` (the browser-side FS Access API integration, **not** the server-side MCP bridge — see OBSIDIAN.md's "two independent integrations" section, since they're easy to conflate)
- [MCP_SPEC.md](../05_MCP/MCP_SPEC.md) — a separate exposure of vault tools over MCP for external clients (Claude Code, Claude Desktop); this engine does not go through it
