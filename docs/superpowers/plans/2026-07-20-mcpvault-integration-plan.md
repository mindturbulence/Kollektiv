# Implementation Plan: Replace obsidian-mcp-server with MCPVault

**Date:** 2026-07-20
**Status:** Complete — implemented 2026-07-20. All 7 phases done, 109/109 tests passing.

---

## Overview

Replace the current `obsidian-mcp-server` (external HTTP process requiring the Obsidian Local REST API plugin + API key) with `@bitbonsai/mcpvault` — a direct filesystem-based MCP server with more tools, no runtime dependencies (Obsidian need not be open), and no API key. The existing HTTP-based MCP client infrastructure (`mcpService.ts`, `mcpAssistantTools.ts`) is preserved by wrapping mcpvault in an in-process Streamable HTTP transport.

## Why MCPVault vs Current

| Dimension | Current (`obsidian-mcp-server`) | MCPVault |
|---|---|---|
| Obsidian must be running | Yes (plugin required) | No |
| API key | Yes (ISSUE-6 recurring) | No |
| Total tools | 12 | 16 |
| Batch operations | No | `read_multiple_notes` (up to 10) |
| Vault stats | No | `get_vault_stats`, `get_notes_info` |
| Search quality | Plugin's native search | BM25 relevance reranking |
| Frontmatter safety | Basic | AST-aware YAML preservation |
| File operations | Notes only | `move_file` (any file, binary-safe) |
| Vault-wide tags | `obsidian_list_tags` | `list_all_tags` with occurrence counts |
| Path security | Plugin-bound | Traversal prevention + symlink checks |
| Auto-start complexity | Child process + npx + env vars | In-process import, no child process |

---

## Architecture Decision

**Decision:** Import mcpvault as a direct dependency (`@bitbonsai/mcpvault`) and wrap it with `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport` to expose it on the same port the app already expects (`http://127.0.0.1:3012/mcp`).

**Rationale:**
- Zero changes to `mcpService.ts`, `mcpAssistantTools.ts`, or the MCP settings UI — they continue to connect to `http://127.0.0.1:3012/mcp` as they already do.
- No child process to manage (no npx, no spawn, no cleanup issues).
- Type-safe integration with full IDE support.
- The existing `mcp-bridge.js` is not needed for this path (it's available as fallback if the direct approach hits SDK compatibility issues).

**Rejected alternatives:**
- *Spawn via npx + stdio bridge* — adds unnecessary child-process complexity and npx startup latency.
- *Modify mcpService for stdio* — too invasive; breaks the clean HTTP abstraction.
- *Native File System API (existing plan)* — duplicates mcpvault's already-built, tested functionality; higher maintenance burden.

---

## Phase Breakdown

### Phase 0: Research & Validation (binary go/no-go)

Before touching any production code, validate that the direct-import approach works.

| # | Task | Acceptance Criteria |
|---|---|---|
| 0.1 | Verify mcpvault installs and `createServer` can be imported | `pnpm add @bitbonsai/mcpvault` completes; TypeScript compilation passes |
| 0.2 | Verify `StreamableHTTPServerTransport` exists in the transitive MCP SDK | Import resolves from `@modelcontextprotocol/sdk/server/streamableHttp.js` |
| 0.3 | Build a minimal proof-of-concept: import mcpvault, connect to HTTP transport, list tools via curl | `curl -X POST http://localhost:3012/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` returns tool list |
| 0.4 | Run mcpvault CLI with a real vault to confirm tool behavior | All 16 tools work via `npx @modelcontextprotocol/inspector npx @bitbonsai/mcpvault@latest <vault>` |
| 0.5 | Document the exact tool name mapping from old→new | Table ready for Phase 4 updates |

**Blockers for go decision:** If `StreamableHTTPServerTransport` is not available, fall back to `mcp-bridge.js` stdio→HTTP approach (higher complexity but workable). If mcpvault has incompatible ESM/CJS issues with the app's bundler, escalate.

**Go decision needed from:** Human review of PoC output.

---

### Phase 1: Core Service (`services/obsidianVaultMcp.ts`)

Create a new module that wraps mcpvault's `createServer` with HTTP transport and lifecycle management.

**Task 1.1 — Create the service module**

```
services/obsidianVaultMcp.ts
```

- Import `createServer` from `@bitbonsai/mcpvault`
- Import `StreamableHTTPServerTransport` from the MCP SDK
- Export `startObsidianVaultMcp(options)` and `stopObsidianVaultMcp()`
- Constructor accepts `{ vaultPath: string, port?: number }` (default port: 3012)
- Creates the mcpvault `Server`, connects it to `StreamableHTTPServerTransport`
- Starts a Node `http.createServer` that delegates all POST requests to `transport.handleRequest`
- Returns `{ url: string, port: number }` on successful start
- On `stop()`: closes the HTTP server, disconnects the transport

**Acceptance criteria:**
- [ ] Module starts an HTTP server on the configured port
- [ ] `POST /mcp` returns valid MCP JSON-RPC responses (listTools, callTool, etc.)
- [ ] Module stops cleanly (server closes, no hanging sockets)
- [ ] Error if vault path doesn't exist (graceful, logged, doesn't crash app)

**Files touched:**
- `services/obsidianVaultMcp.ts` (new, ~80 lines)

**Dependencies:** Phase 0 completed.

---

**Task 1.2 — Handle CORS and MCP protocol headers**

- Ensure the HTTP server adds `Content-Type: application/json` and `Access-Control-Allow-Origin: *` headers
- Forward `mcp-session-id` from request to response (session management for Streamable HTTP)
- Handle both JSON-RPC POST and (if SSE is needed) SSE GET
- Support the `?request=listTools` GET shorthand if mcpService uses it (check Phase 0)

**Acceptance criteria:**
- [ ] `mcpService.listTools('http://127.0.0.1:3012/mcp')` succeeds
- [ ] `mcpService.callTool('http://127.0.0.1:3012/mcp', 'read_note', { path: 'test.md' })` succeeds
- [ ] Session state persists across multiple requests

**Files touched:**
- `services/obsidianVaultMcp.ts` (extended)

**Dependencies:** Task 1.1.

---

### Phase 2: Replace Child Process in `server.ts`

**Task 2.1 — Remove old spawn, wire in new module**

In `server.ts`:
- Replace `let obsidianMcpProc: ReturnType<typeof spawn> | null = null` and `startObsidianMcp()`  
- Import `startObsidianVaultMcp, stopObsidianVaultMcp` from new module
- New function `startObsidianVaultMcp()` that:
  - Reads `OBSIDIAN_VAULT_PATH` from env (skip with log if not set, same as current API key pattern)
  - Calls `startObsidianVaultMcp({ vaultPath, port: 3012 })`
  - Stores the returned controller for cleanup
- In the `shutdown` handler: replace `obsidianMcpProc.kill()` with `stopObsidianVaultMcp()`

**Acceptance criteria:**
- [ ] On `pnpm dev` with `OBSIDIAN_VAULT_PATH` set, vault MCP starts on port 3012
- [ ] On `pnpm dev` without `OBSIDIAN_VAULT_PATH`, gracefully skips with log message
- [ ] On SIGINT/SIGTERM, vault MCP shuts down cleanly
- [ ] No more child process for obsidian (check `ps`/`tasklist`)

**Files touched:**
- `server.ts` (replace ~35 lines with ~25 lines)

**Dependencies:** Tasks 1.1, 1.2.

---

**Task 2.2 — Update environment variable name**

- `OBSIDIAN_API_KEY` → `OBSIDIAN_VAULT_PATH`
- All references in server.ts, .env.example, package.json scripts
- Remove the `OBSIDIAN_BASE_URL` and `OBSIDIAN_VERIFY_SSL` env vars (no longer needed; those were for the Obsidian plugin bridge)

**Acceptance criteria:**
- [ ] `grep -r "OBSIDIAN_API_KEY"` returns 0 hits (after cleanup)
- [ ] `grep -r "OBSIDIAN_VAULT_PATH"` returns expected hits in server.ts + .env.example
- [ ] The old API key string no longer appears anywhere in the codebase

**Files touched:**
- `server.ts`
- `.env.example`
- `ISSUES.md` (mark ISSUE-6 fully resolved)

**Dependencies:** Task 2.1.

---

### Phase 3: Package Configuration

**Task 3.1 — Update package.json**

- Remove or update `obsidian:mcp` and `obsidian:mcp:http` scripts
  - Option A: Replace with scripts that start mcpvault directly (if useful for debugging)
  - Option B: Remove entirely (auto-start handles it)
- Remove `cross-env` from devDependencies if no longer referenced by any script
- Verify `@bitbonsai/mcpvault` is in dependencies (added in Phase 0)

**Acceptance criteria:**
- [ ] No script references to `obsidian-mcp-server` remain
- [ ] `pnpm run obsidian:mcp` (if retained) works with mcpvault

**Files touched:**
- `package.json`

**Dependencies:** Phase 2.

---

### Phase 4: Assistant Tool Integration

**Task 4.1 — Update WORKSPACE_CAPABILITIES**

In `services/assistantService.ts`, replace the old tool list with mcpvault's 16 tools:

| New MCPVault Tool | Capability Description |
|---|---|
| `read_note` | Read a note with parsed frontmatter |
| `write_note` | Write note (overwrite/append/prepend) |
| `patch_note` | Replace exact string in a note |
| `list_directory` | List files and directories |
| `delete_note` | Delete note (with confirmation, trash modes) |
| `search_notes` | BM25-relevance-ranked full-text search |
| `move_note` | Move or rename a note |
| `move_file` | Move any file (binary-safe, with confirmation) |
| `read_multiple_notes` | Batch-read up to 10 notes |
| `update_frontmatter` | Update frontmatter without touching content |
| `get_frontmatter` | Read frontmatter only |
| `manage_tags` | Add/remove/list tags in a note |
| `get_vault_stats` | Vault statistics (note count, size, recent files) |
| `get_notes_info` | Metadata for specific notes |
| `list_all_tags` | All vault tags with occurrence counts |
| `get_vault_stats` | Vault-level aggregate stats |

Also update the description to reflect that Obsidian no longer needs to be running.

**Acceptance criteria:**
- [ ] The capabilities string lists all 16 tools with accurate descriptions
- [ ] The "requires Obsidian running" language is replaced with "direct vault access"

**Files touched:**
- `services/assistantService.ts`

**Dependencies:** Phase 2.

---

**Task 4.2 — Update liveAssistantService tool prefix**

In `services/liveAssistantService.ts`, the tool prefix check at line 331:
```typescript
case name.startsWith('obsidian_'):
```

Needs to match the actual tool names from the MCP server. With the MCP tool loader, names become:
`mcp_<serverId>_<toolName>`

If the server ID is `obsidian-vault` (from preset), tools would be:
`mcp_obsidian-vault_read_note`, `mcp_obsidian-vault_write_note`, etc.

Options:
- Check for `name.startsWith('mcp_obsidian')` or
- Check for `name.includes('read_note')` or
- Create a dedicated server ID (map server ID → check)

The cleanest check: `name.startsWith('mcp_obsidian')` catches both `mcp_obsidian-vault_` and `mcp_obsidian-mcp-server_` prefixes.

**Acceptance criteria:**
- [ ] Live voice assistant correctly maps all vault MCP tool calls to "notes" label
- [ ] Old `obsidian_` prefix no longer matched (since old tools are gone)

**Files touched:**
- `services/liveAssistantService.ts`

**Dependencies:** Task 4.1.

---

### Phase 5: MCP Preset & Settings UI

**Task 5.1 — Add Obsidian Vault as a built-in preset**

In `constants/mcpPresets.ts`, add:

```typescript
{
  id: 'obsidian-vault',
  name: 'Obsidian Vault',
  description: 'Direct filesystem access to your Obsidian vault. No plugin required.',
  needsApiKey: false,
  defaultUrl: 'http://127.0.0.1:3012/mcp',
  launchCommand: '', // handled by server.ts auto-start
  launchNotes: 'Set OBSIDIAN_VAULT_PATH in .env to auto-start, or configure the vault path in settings.',
}
```

**Acceptance criteria:**
- [ ] Obsidian Vault appears as a toggleable preset in Settings > MCP > Predefined
- [ ] Connection status shows green when server is running
- [ ] "needsApiKey: false" skips the API key input, shows "Vault path" input instead (may need UI change)

**Files touched:**
- `constants/mcpPresets.ts`

**Dependencies:** Phase 2, Phase 4.

---

**Task 5.2 — Add vault path configuration to PredefinedMcpSection**

Extend `PredefinedMcpSection.tsx` to show a vault path input for the Obsidian preset (similar to how Firecrawl shows an API key input). The path should be saved to the MCP server's custom headers or a new field.

**Alternative:** Keep it simpler — vault path is only env var for v1, no UI for now. This can be Phase 8.

**Acceptance criteria (if implemented):**
- [ ] Obsidian preset shows a text input for vault path
- [ ] Changing vault path updates the server config
- [ ] Path is persisted in settings

**Files touched:**
- `components/settings/PredefinedMcpSection.tsx`
- Maybe `types.ts` (add field to `McpServerConfig`)

**Dependencies:** Task 5.1.

---

### Phase 6: Testing

**Task 6.1 — Unit tests for obsidianVaultMcp service**

- `services/obsidianVaultMcp.test.ts` (new)
- Start the service with a temp directory as vault
- Write test notes to the temp vault
- Call all 16 tools via HTTP and verify responses
- Test error cases: invalid vault path, file not found, path traversal

**Acceptance criteria:**
- [ ] All 16 tools return correct responses
- [ ] Error cases return proper MCP error format
- [ ] Cleanup succeeds (temp directory removed, server closed)

**Dependencies:** Phase 1.

---

**Task 6.2 — Integration test: assistant loads tools**

- Start the app in test mode
- Configure obsidian vault as enabled MCP server
- Verify `loadMcpAssistantTools` returns all 16 tools
- Verify a tool call executes and returns content

**Acceptance criteria:**
- [ ] Tools appear in the assistant's tool list with correct names
- [ ] Tool descriptions are accurate
- [ ] A `read_note` call on a known note returns content

**Dependencies:** Phase 4.

---

**Task 6.3 — Manual end-to-end test**

- Start the app, connect a real vault
- In the assistant, ask: "List files in my vault"
- Ask: "Search for notes about X"
- Ask: "Read note called Y"
- Ask: "Create a new note called test.md"
- Ask: "Get vault statistics"
- Verify all responses

**Acceptance criteria:**
- [ ] All assistant interactions succeed
- [ ] No errors in server logs
- [ ] Notes are correctly read/written on disk

**Dependencies:** All phases.

---

### Phase 7: Cleanup & Documentation

**Task 7.1 — Remove dead code**

- Remove any remaining references to `obsidian-mcp-server` in comments, logs, or config
- Remove `cross-env` from `devDependencies` if no longer used
- Remove `OBSIDIAN_BASE_URL`/`OBSIDIAN_VERIFY_SSL` from any remaining docs

**Acceptance criteria:**
- [ ] `grep -ri "obsidian-mcp-server"` returns 0 hits
- [ ] No dead env vars remain

**Files touched:** Multiple.

---

**Task 7.2 — Update documentation**

- Update `CONTRIBUTING.md` — remove API key guidance, add vault path guidance
- Update `ISSUES.md` — mark ISSUE-6 as **superseded** (mcpvault has no API key)
- Update `docs/superpowers/plans/2026-07-18-features-plan.md` — add note that the native FS API plan is superseded by mcpvault; update or archive
- Update `SECURITY.md` if it references the old setup

**Acceptance criteria:**
- [ ] All docs are internally consistent
- [ ] A new contributor can set up Obsidian access by reading CONTRIBUTING.md

---

## Dependency Graph

```
Phase 0 (Research & PoC)
    │
    ▼
Phase 1 (obsidianVaultMcp.ts)
    │
    ├──▶ Phase 2 (server.ts replacement)
    │       │
    │       ├──▶ Phase 3 (package.json)
    │       │
    │       └──▶ Phase 4 (assistant integration)
    │               │
    │               └──▶ Phase 5 (preset + settings UI)
    │
    └──▶ Phase 6 (testing) — can start after Phase 1 for unit tests
    │
    └──▶ Phase 7 (cleanup) — requires all previous phases
```

**Parallelization opportunities:**
- Phase 3 (package.json) can run alongside Phase 2
- Phase 6.1 (unit tests) can start after Phase 1
- Phase 7.2 (documentation) can run in parallel with Phase 6

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| `StreamableHTTPServerTransport` not available in bundled MCP SDK version | High — forces alternative approach | Low (SDK v1.20+ has it) | Fallback to `mcp-bridge.js` stdio→HTTP bridge; or implement minimal custom transport using the `Transport` interface |
| mcpvault ESM/CJS compatibility issue with app's bundler | High — blocks direct import | Medium | Use `npx` fallback (current child-process pattern but with mcpvault) |
| Vault path resolution differences (Windows vs macOS vs Linux paths) | Medium — broken on some platforms | Low | Use `path.resolve` and test on all platforms; mcpvault already handles this |
| Performance on very large vaults (10k+ notes) | Medium — slow initial listing | Low | mcpvault uses streaming reads; BM25 search is batched (5 files at a time). Add pagination if needed |
| OBSIDIAN_VAULT_PATH not set + user tries to use vault tools | Medium — confusing error | Medium | The MCP preset will show "disconnected" and the settings UI will guide user to set the path |

---

## Open Questions

1. **Tool naming strategy:** What should the `serverId` for the MCP preset be — `obsidian-vault` or `obsidian`? Affects tool prefix: `mcp_obsidian-vault_read_note` vs `mcp_obsidian_read_note`. The latter is cleaner but may collide with the old `obsidian_` prefix check.

2. **Settings vault path UI:** Should v1 support configuring vault path from the UI (new field in PredefinedMcpSection) or require env var only? Env var is simpler and matches the current pattern. UI is better UX.

3. **Backward compatibility:** Should we keep the old `obsidian-mcp-server` as an alternative MCP preset (for users who prefer the plugin approach)? This adds maintenance burden but gives a migration path. Recommendation: remove entirely — mcpvault is strictly better.

4. **Port conflict:** What if port 3012 is already in use? Should the service try the next port, or fail with a clear error? Recommendation: fail with clear error message.

5. **Obsidian open-in-UI:** MCPVault doesn't have `obsidian_open_in_ui`. Should we add a thin native tool that constructs `obsidian://` URIs? This is useful for the "open in Obsidian" flow. Could be a follow-up.

---

## Checkpoint Gates

### Gate 1: After Phase 0
- [ ] Proof-of-concept runs locally
- [ ] Go/no-go decision made
- [ ] **Human review required**

### Gate 2: After Phases 1-2
- [ ] MCPVault starts on port 3012 without Obsidian running
- [ ] `curl` can list tools and call tools
- [ ] Old child-process removal verified
- [ ] **Human review required**

### Gate 3: After Phases 3-5
- [ ] Assistant can discover and call all 16 tools
- [ ] Preset appears in settings UI
- [ ] Live voice shows correct labels
- [ ] **Human review recommended**

### Gate 4: After Phases 6-7
- [ ] All tests pass
- [ ] Documentation is consistent
- [ ] No dead code remains
- [ ] **Ready to ship**

---

## Task Checklist (Concise)

### Phase 0 — Research
- [ ] 0.1 Add mcpvault dependency, verify import
- [ ] 0.2 Verify StreamableHTTPServerTransport
- [ ] 0.3 Build HTTP transport PoC
- [ ] 0.4 Test mcpvault CLI with real vault
- [ ] 0.5 Document tool name mapping
- [ ] **Gate 1: Go/no-go**

### Phase 1 — Core Service
- [ ] 1.1 Create `services/obsidianVaultMcp.ts`
- [ ] 1.2 Handle CORS, sessions, MCP protocol

### Phase 2 — Server Integration
- [ ] 2.1 Replace child process in `server.ts`
- [ ] 2.2 Rename env var (API_KEY → VAULT_PATH)

### Phase 3 — Package Config
- [ ] 3.1 Update `package.json` scripts

### Phase 4 — Assistant Tools
- [ ] 4.1 Update WORKSPACE_CAPABILITIES
- [ ] 4.2 Update liveAssistantService prefix

### Phase 5 — Settings UI
- [ ] 5.1 Add obsidian-vault preset to MCP_PRESETS
- [ ] 5.2 (Optional) Add vault path UI

### Phase 6 — Testing
- [ ] 6.1 Unit tests for obsidianVaultMcp
- [ ] 6.2 Integration test: tool loading
- [ ] 6.3 Manual end-to-end test

### Phase 7 — Cleanup
- [ ] 7.1 Remove dead code and env vars
- [ ] 7.2 Update docs (CONTRIBUTING, ISSUES, plans)
