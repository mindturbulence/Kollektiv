# Obsidian Integration

## Two independent integrations — do not conflate them

There are **two separate Obsidian connections** in this codebase, each with its own vault handle, its own connect step, and its own consumers. Setting `OBSIDIAN_VAULT_PATH` does **not** give the in-app assistant chat write access to the vault — that requires the second integration below to be connected too.

| | Server-side MCP bridge | Browser-side FS Access API |
|---|---|---|
| **File** | `services/kollektivMcp.ts` | `utils/obsidianStorage.ts` |
| **Connect step** | `OBSIDIAN_VAULT_PATH` env var, read at server boot | User clicks "Connect" in Settings → Integrations → Obsidian (`pickObsidianVault()` → `showDirectoryPicker()`) |
| **Vault handle** | Plain Node `fs` path | `FileSystemDirectoryHandle`, persisted in IndexedDB (`utils/db.ts`) |
| **Consumers** | External MCP clients (Claude Code, Claude Desktop) via the 61-tool endpoint at `http://127.0.0.1:3012` — see [MCP_SPEC.md](../05_MCP/MCP_SPEC.md) | The in-app assistant's own tools: `remember`, `knowledge_lifecycle_promote`, `knowledgeService`/`knowledgeLifecycle` (see [MEMORY_SYSTEM.md](../04_MEMORY/MEMORY_SYSTEM.md)) |
| **Reconnects on app boot?** | N/A — server reads the env var fresh each start | Yes — `initObsidianVault()` is called from `hooks/useBootSequence.ts` to reacquire a previously-granted handle |

**Practical implication:** if a user has `OBSIDIAN_VAULT_PATH` set but has never clicked "Connect" in Settings, the assistant's `remember`/`knowledge_lifecycle_promote` tools silently no-op on the vault write (they still succeed locally) — `isObsidianConnected()` returns `false` and `knowledgeService.promote()`/`knowledgeLifecycle.promote()` catch and skip. This was the root cause of memories never appearing in the vault even though "the connection already worked" from the server-side/MCP-client point of view.

## Architecture

The server-side integration uses a **direct vault folder access** model via `OBSIDIAN_VAULT_PATH` env var. The old `obsidian-mcp-server` child process (port 27124, gated on `OBSIDIAN_API_KEY`) was fully retired in favor of the new MCP vault bridge.

## MCP Vault Bridge

**File:** `services/kollektivMcp.ts`

The Obsidian integration is a sub-server inside the Kollektiv MCP aggregator:
- Loaded when `OBSIDIAN_VAULT_PATH` is set in the server's environment
- Uses `@bitbonsai/mcpvault`'s `createServer` for file operations
- Exposes **15 vault tools** over MCP: `read_note`, `write_note`, `patch_note`, `search_notes`, `list_directory`, `delete_note`, `move_note`, `move_file`, `read_multiple_notes`, `update_frontmatter`, `get_vault_stats`, etc.
- Tools aggregated alongside Playwright browser tools (46 tools) for a combined 61-tool MCP endpoint
- No API key needed — reads vault files directly via the filesystem

## Storage Layer

**File:** `utils/obsidianStorage.ts`

Provides the practical integration surface:
- `readNote(path)` — read a note's content
- `writeNote(path, content)` — write/overwrite a note
- `deleteNote(path)` — delete a note
- `searchNotes(query)` — search notes by title and content
- `patchNote(path, content)` — partial update
- `moveNote(from, to)` — rename/move a note
- `listDirectory(path)` — list vault contents

## Lifecycle Folder Bootstrap

**Function:** `ensureFolders(folders)` in `utils/obsidianStorage.ts`

Creates any of the given vault-relative folder paths that don't already exist, via `getDirectoryHandle(name, {create: true})` (idempotent — no-op per path that's already there). Called once per boot from `hooks/useBootSequence.ts`, right after `initObsidianVault()` reconnects a previously-granted handle:

```
if (await initObsidianVault()) {
  await ensureFolders(Object.values(knowledgeLifecycle.getAllStageConfigs()).map(c => c.folder));
}
```

This guarantees `knowledge/inbox`, `knowledge/projects`, `knowledge/output`, and `knowledge/wiki` exist in the vault as soon as it's connected, rather than only appearing the first time something happens to be promoted into them. `knowledgeService.rebuildIndex()` is also called at boot (previously dead code — nothing invoked it) so memories/notes/vault files from prior sessions are indexed and promotable, not just newly-captured items.

## Vault Search Index

**File:** `utils/vaultSearch.ts`

BM25 full-text search engine built on top of the Obsidian vault:

- **Index building:** Chunked async build with `requestIdleCallback` polyfill
- **Storage:** Index persisted to IndexedDB for fast reload
- **Search:** BM25 scoring with configurable k/b parameters
- **Auto-rebuild:** Debounced `_scheduleSearchRebuild()` triggered after vault mutations (lives in `utils/obsidianStorage.ts`, not `vaultSearch.ts` itself — it calls into the search index after every mutation)
- **Integration:** Search results appear in the Command Palette for instant note lookup
- **Loading indicator:** Subtle "searching notes…" shown while building

**Tests:** 27 unit tests in `utils/vaultSearch.test.ts`

## File Watcher

Note operations are synchronous (read/write/delete). The vault search index listens for mutation events from `obsidianStorage.ts` and auto-rebuilds on changes via a debounced observer pattern.

## Recovery

- Missing files: `readNote` returns null (gracefully handled)
- Index drift: `rebuildSearchIndex()` reconstructs from scratch
- `isBuilding` guard prevents concurrent rebuilds
- No OPFS/indexedDB state leaks on error

## Environment Setup

```
# .env
OBSIDIAN_VAULT_PATH=C:/Users/YourName/Obsidian/MyVault
```

The Kollektiv MCP server logs "OBSIDIAN_VAULT_PATH not set — skipping Obsidian tools" if the env var is missing, and starts with Playwright tools only.

## Settings UI

Obsidian is configured via the **Built-In** tab in Settings > Integrations > MCP Servers (not a separate settings section). The `kollektiv-mcp` preset auto-detects the vault path from `OBSIDIAN_VAULT_PATH` and shows vault tools in the right column when Ping succeeds.

## Related

- [MCP_SPEC.md](../05_MCP/MCP_SPEC.md) — the sub-server aggregation architecture that exposes the 15 vault tools described above
- [KNOWLEDGE_ENGINE.md](KNOWLEDGE_ENGINE.md) — how this vault backend serves as the knowledge repository tier
- [MEMORY_SYSTEM.md](../04_MEMORY/MEMORY_SYSTEM.md) — the memory-tier promotion path that lands durable facts here
