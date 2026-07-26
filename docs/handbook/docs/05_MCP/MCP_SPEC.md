# MCP Specification

## Architecture Overview

The MCP layer uses a **sub-server aggregation** pattern: a single HTTP server (`kollektivMcp.ts`) loads multiple sub-servers as in-process plugins, merges their tool lists, and presents them as one unified endpoint.

### Kollektiv MCP Server

**File:** `services/kollektivMcp.ts`
**Endpoint:** `http://127.0.0.1:3012` (Streamable-HTTP transport)
**Port:** 3012 (auto-started by `server.ts`)

The server aggregates **61 total tools**:
- **46 Playwright browser tools** — navigate, click, type, snapshot, scroll, etc.
- **15 Obsidian vault tools** — search_notes, read_note, write_note, patch_note, list_directory, etc.

### Sub-Server Architecture

Each sub-server is loaded as an in-process `InMemoryTransport` pair:

```
HTTP/StreamableHTTPServer
  └── SubServerClient(playwright)  ← InMemoryTransport
  └── SubServerClient(obsidian)    ← InMemoryTransport
```

- `SubServerClient` wraps an `InMemoryTransport` with a pending-request map keyed by JSON-RPC request ID, enabling concurrent requests without handler clobbering
- Each sub-server is initialized by calling its `tools/list` endpoint at startup
- The parent server merges all tool lists and responds to `tools/list` with the combined list
- Tool calls are routed to the correct sub-server based on tool name prefix matching
- Timeout: 15 seconds per sub-server request

### Boot Behavior

- Always starts when `server.ts` runs (no env var gate)
- If `OBSIDIAN_VAULT_PATH` is set, loads Obsidian vault tools as a sub-server
- Playwright browser tools load **unconditionally** via `@playwright/mcp`
- If a sub-server fails to load (missing dependency, invalid vault path), it logs a warning and continues without it

### CORS Configuration

The MCP server sets the following CORS headers for cross-origin browser access (port 3012 vs main app on 7500):

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, MCP-Session-ID, Accept
Access-Control-Expose-Headers: mcp-session-id
```

The `Access-Control-Expose-Headers: mcp-session-id` header is essential — without it, the browser's JavaScript cannot read the session ID response header cross-origin, causing every MCP call after `initialize` to fail with "Session not found".

### Session Management

- Each `initialize` request creates a new session with a UUID
- Sessions persist in a `Map<string, McpSession>` until the server stops
- Response includes `mcp-session-id` header
- Proxy endpoint at `/api/mcp/proxy` (server.ts) forwards MCP requests server-to-server when direct browser fetch would violate CORS

## Connection Methods

### Direct browser fetch (primary path)
The browser sends `fetch()` requests directly to `http://127.0.0.1:3012` with MCP JSON-RPC payloads. CORS headers handle the cross-origin requirement (different port from main app).

### Server proxy (fallback path)
For environments where direct fetch is blocked (e.g., HTTPS context trying to reach HTTP), the app falls back to the server-side proxy at `/api/mcp/proxy`.

## Settings UI

MCP servers are configured via Settings > Integrations > MCP Servers:

- **Built-In tab:** Single `Kollektiv MCP` preset pointing at `http://127.0.0.1:3012`. Two-column layout: connection info on the left, available tools list on the right. Ping button tests connection and shows tool count.
- **Custom tab:** Add arbitrary MCP server URLs with optional API key and custom headers.

The Built-In tab syncs the URL from the preset definition on every toggle, so URL changes (e.g., after a port migration) propagate automatically. The Ping button uses `preset.defaultUrl` (not the stored entry URL) to ensure it always hits the correct endpoint.

## Infrastructure History (2026-07-25)

- Redundant Playwright child process (port 8931) removed — Playwright now loads as sub-server inside kollektivMcp
- MCP server always starts regardless of OBSIDIAN_VAULT_PATH (Playwright tools unconditional)
- `.env` loading added via `import 'dotenv/config'` for `npx tsx server.ts`
- CORS fix: added `Access-Control-Expose-Headers: mcp-session-id`
- Preset URL sync: URL propagates from `preset.defaultUrl` on every toggle
- Ping button uses effective URL from preset definition

## Public Tools

All 61 MCP tools are discoverable at runtime via `tools/list`. Tool schemas include:
- `name`: unique tool identifier
- `description`: human-readable description (sent to the model)
- `inputSchema`: JSON Schema for tool arguments

## Execution

Tool execution is synchronous from the client's perspective — the HTTP response contains the tool's result. `SubServerClient.send()` sends a JSON-RPC request to the appropriate sub-server and returns the result via the pending-request map.

## Security

- The MCP server is bound to `127.0.0.1` only (not exposed to the network)
- No authentication required (local-only)
- Vault tools only loaded if `OBSIDIAN_VAULT_PATH` is configured
- Tool call routing prevents one sub-server from accessing another's tools
- CORS restricted to `*` but only reachable on localhost

## Related

- [OBSIDIAN.md](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md) — the vault tools sub-server this spec aggregates (the server-side, `OBSIDIAN_VAULT_PATH`-driven half of OBSIDIAN.md's "two independent integrations"; the in-app assistant's `remember`/`knowledge_lifecycle_promote` tools go through the other half instead)
- [ARCHITECTURE_CONSTITUTION.md § Security Hardening](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#security-hardening) — the CSP `connect-src`/CORS posture this local-only server operates under
- [AI_ENGINE.md](../01_AI_ENGINE/AI_ENGINE.md) — the `list_mcp_servers`/`toggle_mcp_server` assistant tools that manage this server from chat
