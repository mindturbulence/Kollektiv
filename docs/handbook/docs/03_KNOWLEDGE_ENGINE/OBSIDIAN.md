# Obsidian Integration

## Architecture

Obsidian integration uses a **direct vault folder access** model via `OBSIDIAN_VAULT_PATH` env var. The old `obsidian-mcp-server` child process (port 27124, gated on `OBSIDIAN_API_KEY`) was fully retired in favor of the new MCP vault bridge.

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

## Vault Search Index

**File:** `utils/vaultSearch.ts`

BM25 full-text search engine built on top of the Obsidian vault:

- **Index building:** Chunked async build with `requestIdleCallback` polyfill
- **Storage:** Index persisted to IndexedDB for fast reload
- **Search:** BM25 scoring with configurable k/b parameters
- **Auto-rebuild:** Debounced `_scheduleSearchRebuild()` triggered after vault mutations
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
