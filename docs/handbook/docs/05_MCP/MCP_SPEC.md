# MCP Specification

## Architecture Overview

The MCP layer uses a **three-layer aggregation** pattern: a single HTTP server (`kollektivMcp.ts`) loads:

1. **Native assistant tools** from `mcp-config.json` — ~65 tools registered as metadata + server-side executors
2. **Playwright browser tools** via `@playwright/mcp` sub-server — ~46 tools
3. **Obsidian vault tools** via `@bitbonsai/mcpvault` sub-server — ~15 tools

All layers merge their tool lists and present them as one unified endpoint.

### Kollektiv MCP Server

**File:** `services/kollektivMcp.ts`
**Endpoint:** `http://127.0.0.1:3012` (Streamable-HTTP transport)
**Port:** 3012 (auto-started by `server.ts`)

### Sub-Server Architecture

Each sub-server is loaded as an in-process `InMemoryTransport` pair:

```
HTTP/StreamableHTTPServer (port 3012)
  │
  ├── Native tools (mcp-config.json)
  │     ├── Server-context executors → HTTP calls to Express API
  │     └── Browser-context tools    → metadata + hint (cannot execute)
  │
  ├── SubServerClient(playwright)  ← InMemoryTransport
  │     └── Full browser automation (navigate, click, type, …)
  │
  └── SubServerClient(obsidian)    ← InMemoryTransport
        └── Full vault read/write (search_notes, read_note, …)
```

- `SubServerClient` wraps an `InMemoryTransport` with a pending-request map keyed by JSON-RPC request ID, enabling concurrent requests without handler clobbering
- Each sub-server is initialized by calling its `tools/list` endpoint at startup
- The parent server merges all tool lists and responds to `tools/list` with the combined list
- Tool calls are routed by checking native tools first, then sub-server prefix matching
- Timeout: 15 seconds per sub-server request

### Native Tools Layer

**Single source of truth:** `mcp-config.json` at the repo root. It contains every native assistant tool with:

| Field | Description |
|-------|-------------|
| `name` | Unique tool name matching `AssistantTool.name` |
| `description` | Human-readable description |
| `parameters` | JSON Schema for tool arguments |
| `executionKind` | `browser-context`, `server-context`, or `hybrid` |
| `filePath` | Source file where the tool is defined |
| `sourceModule` | Exported array name (e.g. `ASSISTANT_TOOLS`, `browserTools`) |
| `category` | Functional category for grouping |
| `permissions` | Optional permission strings the caller needs |

**Schema validation:** `mcp-config.schema.json` defines validation rules. Run `pnpm validate-config` to check.

**Config generation:** `scripts/generate-mcp-config.ts` scans tool source files and regenerates the config. Run `pnpm generate-mcp-config`.

#### Server-Side Executors

Tools marked `server-context` may have an executor registered in `initServerExecutors()`. These run in the Node.js process by calling:
- External HTTP APIs directly (e.g., `wttr.in` for weather)
- The Express app's internal API endpoints (e.g., `/api/reach/github`, `/api/scrape-url`)

Currently wired executors:

| Tool | Backend |
|------|---------|
| `get_weather` | `wttr.in` API |
| `github_get_repo`, `github_search`, `github_get_file` | `POST /api/reach/github` |
| `rss_fetch` | `POST /api/reach/rss` |
| `exa_search` | `POST /api/reach/exa` |
| `reddit_fetch` | `POST /api/reach/reddit` |
| `youtube_get_transcript` | `POST /api/reach/youtube-transcript` |
| `twitter_get_tweet` | `POST /api/reach/twitter` |
| `scrape_url` | `POST /api/scrape-url` |
| `scrape_url_playwright` | `POST /api/scrape-url-playwright` |
| `web_search` | `POST /api/web-search` |

Tools marked `browser-context` (e.g., `navigate`, `save_note`, `remember`) return a descriptive error explaining they require the Kollektiv app's browser context.

#### Permission Model

Tools that require user permissions have a `permissions` array. Permissions are managed via `grantMcpPermissions()` / `revokeMcpPermissions()` in `services/kollektivMcp.ts`.

| Permission | Required By |
|-----------|-------------|
| `screen:share` | Browser interaction tools |
| `control:grant` | Browser interaction tools |
| `cdp:connected` | Tab management tools |
| `google:auth` | Gmail tools |
| `gmail:send` | `send_gmail` |
| `spotify:auth` | Spotify tools |
| `vault:read` | Obsidian read tools |
| `vault:write` | Obsidian write tools |
| `tensorart:api` | Tensor Art tools |
| `gemini:vision` | `browser_complete_task` |

### Boot Behavior

- Always starts when `server.ts` runs (no env var gate)
- Native tools config (`mcp-config.json`) is loaded on every `tools/list` and `tools/call`
- If `OBSIDIAN_VAULT_PATH` is set, loads Obsidian vault tools as a sub-server
- Playwright browser tools load **unconditionally** via `@playwright/mcp`
- If a sub-server fails to load (missing dependency, invalid vault path), it logs a warning and continues without it
- Server-side executors are initialized once at startup with the Express HTTP port

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

## CI Pipeline Diagram

See [diagrams/mcp-ci-pipeline.md](../../diagrams/mcp-ci-pipeline.md) for a visual flowchart of the commit → lint → validate → test → build → merge pipeline, including details on what each validation gate checks.

## Public Tools

All MCP tools (~126 total) are discoverable at runtime via `tools/list`. Tool schemas include:
- `name`: unique tool identifier
- `description`: human-readable description (sent to the model)
- `inputSchema`: JSON Schema for tool arguments

## Execution

Tool execution is synchronous from the client's perspective — the HTTP response contains the tool's result. The routing order is:
1. Native tool check: look up in `mcp-config.json` → use server-side executor or return context hint
2. Sub-server check: route to `SubServerClient.send()` for the matching sub-server

## Security

- The MCP server is bound to `127.0.0.1` only (not exposed to the network)
- No authentication required (local-only)
- Native tools show metadata + execution hints (no sensitive data exposed)
- Vault tools only loaded if `OBSIDIAN_VAULT_PATH` is configured
- Tool call routing prevents one sub-server from accessing another's tools
- Permission enforcement blocks sensitive tools without `grantMcpPermissions()`
- CORS restricted to `*` but only reachable on localhost

## CI Pipeline & Validation Gates

The MCP tool configuration is protected by a multi-layered validation pipeline that runs on every push and PR. This ensures `mcp-config.json` never drifts from its schema or the source code it describes.

### 1. Schema Validation (`pnpm validate-config`)

**Script:** `scripts/validate-mcp-config.ts`

This is the primary gate. It validates `mcp-config.json` against a hard-coded set of rules:

- **Required fields:** Every tool entry must have `name`, `description`, `parameters`, `executionKind`, `filePath`, `sourceModule`, and `category`
- **Name uniqueness:** No two tools may share the same name
- **Name pattern:** All names must match `[a-z][a-z0-9_]*`
- **Execution kind:** Must be one of `browser-context`, `server-context`, or `hybrid`
- **Category:** Must be a known category from `VALID_CATEGORIES` (unknown categories produce warnings)
- **Parameters:** Must have `type: "object"`, `properties` must be an object, `required` must be an array if present

Usage:

```bash
pnpm validate-config           # via npm script
npx tsx scripts/validate-mcp-config.ts  # direct
```

### 2. Schema vs. Validator Sync Tests (`pnpm test`)

**Test file:** `services/mcp-config.test.ts`

The Vitest suite (`schema <-> validator sync` describe block) enforces that the JSON schema (`mcp-config.schema.json`) stays in sync with the validator script. It cross-checks:

- `VALID_CATEGORIES` set in `validate-mcp-config.ts` matches the category `enum` in `mcp-config.schema.json`
- `VALID_EXECUTION_KINDS` set matches the executionKind `enum` in the schema
- Required fields in the `ToolDefinition` schema match the fields the validator checks
- All sets are deduplicated (no duplicates in either location)

If a developer adds a new category or execution kind in one place but forgets the other, this test catches it.

### 3. Config Integrity Tests (`pnpm test`)

Also in `services/mcp-config.test.ts`, these tests verify:

- `mcp-config.json` exists and parses as valid JSON
- Version is `1.0.0`
- At least 90 tools are defined
- Every tool has all required fields with correct types
- All tool names are unique and match the naming pattern
- `filePath` values point to real files on disk
- Well-known tools are present (e.g., `navigate`, `web_search`, `generate_image`)
- Parameter schemas are correct (e.g., parameterless tools have empty properties, tools with params have property definitions)
- Permission arrays are correct:
  - All permission values use `namespace:action` format
  - Browser automation tools declare both `screen:share` and `control:grant`
  - CDP-only tools only require `cdp:connected`
  - Gmail tools require `google:auth`; `send_gmail` additionally requires `gmail:send`
  - Spotify tools require `spotify:auth`
  - Obsidian vault tools require `vault:read` or `vault:write`
- All major source modules are represented (`ASSISTANT_TOOLS`, `browserTools`, `obsidianTools`, etc.)

### 4. Config Generation Check (`pnpm generate-mcp-config --check`)

**Script:** `scripts/generate-mcp-config.ts`

This script scans the TypeScript source files for `AssistantTool` definitions and regenerates `mcp-config.json`. While the hand-crafted config is the source of truth (the regex parser cannot handle all edge cases like backtick template-literals), the `--check` mode can be used to detect when the config has drifted significantly from the source:

```bash
pnpm generate-mcp-config --check
```

If the generated config differs from the checked-in file, it exits with code 1 and prints a diff. The `--dry-run` mode outputs the generated config to stdout without writing.

### CI Pipeline Integration

**File:** `.github/workflows/ci.yml`

The CI pipeline runs all MCP validation gates on every push (branches: `main`, `dev`, `local-dev`) and pull request:

```yaml
# CI job steps:
- uses: pnpm/action-setup@v4          # Install pnpm
- run: pnpm install --frozen-lockfile # Install dependencies
- run: pnpm lint                      # TypeScript type-check
- run: pnpm validate-config           # MCP config validation gate
- run: pnpm test                      # Vitest suite (includes config integrity + schema sync tests)
- run: pnpm build                     # Vite production build
```

**Gate order matters:**
1. `pnpm lint` fails fast on type errors before running expensive validation
2. `pnpm validate-config` is a standalone script — no dependencies on test mocks
3. `pnpm test` runs after, covering the in-depth config integrity checks
4. `pnpm build` only runs if all other steps pass

All five steps must pass before a PR can merge. This catches config drift (missing fields, wrong execution kind, stale file paths), schema/validator desynchronization, and broken tool definitions before they reach production.

### 5. Pre-Commit Hook (Local Gate)

**File:** `.husky/pre-commit`

Beyond CI, a **local pre-commit hook** runs `pnpm validate-config` automatically before every `git commit`. This catches config errors even before they reach the remote — saving the round-trip of a failed CI run.

#### Setup

The `.husky/pre-commit` file is committed to the repo, and `"prepare": "husky"` is set in `package.json`. Hooks activate **automatically** on the first `pnpm install` — no manual setup needed.

#### Behavior

The hook simply runs `pnpm validate-config`. If validation passes (exit 0), the commit proceeds normally. If validation fails (exit non-zero), the commit is blocked with the full error output:

```
$ tsx scripts/validate-mcp-config.ts
[validate-mcp-config] 100 tools
  ✗ "bad_tool": Missing 'category'

[validate-mcp-config] FAILED — 1 error(s), 0 warning(s)
husky - pre-commit hook exited with code 1 (error)
```

#### Auto-Fix

If validation fails, auto-correct common issues and try again:

```bash
pnpm fix-config         # Auto-corrects missing/invalid fields in mcp-config.json
git add mcp-config.json # Stage the fixed file
git commit              # Re-trigger the hook (should now pass)
```

The `--fix` mode (`scripts/validate-mcp-config.ts --fix`) infers sensible defaults for missing fields from tool names, deduplicates entries, and sorts the config alphabetically.

---

## Infrastructure History

### 2026-07-26 — Native tools wiring

- `mcp-config.json` created as the single source of truth for all ~65 native assistant tool definitions
- `mcp-config.schema.json` added for validation
- `scripts/generate-mcp-config.ts` — scans tool source files and regenerates config
- `scripts/validate-mcp-config.ts` — CI gate that validates config on every push
- Server-side executors added for weather, GitHub, RSS, Exa, Reddit, YouTube, Twitter, and URL scraping tools
- Permission model with `grantMcpPermissions()`/`revokeMcpPermissions()`
- Test suite (`services/mcp-config.test.ts`) validates config loading and tool call routing
- Documentation: `docs/tools-inventory.md` (complete catalog). A separate `docs/mcp-tools.md` usage guide existed alongside this spec but was removed 2026-07-28 — its config-field table, permission table, and server details had become a near-verbatim duplicate of the sections above.

### 2026-07-25 — Sub-server consolidation

- Redundant Playwright child process (port 8931) removed — Playwright now loads as sub-server inside kollektivMcp
- MCP server always starts regardless of OBSIDIAN_VAULT_PATH (Playwright tools unconditional)
- `.env` loading added via `import 'dotenv/config'` for `npx tsx server.ts`
- CORS fix: added `Access-Control-Expose-Headers: mcp-session-id`
- Preset URL sync: URL propagates from `preset.defaultUrl` on every toggle
- Ping button uses effective URL from preset definition

## Related

- [docs/tools-inventory.md](../../../docs/tools-inventory.md) — complete catalog of all native assistant tools
- [KOLLEKTIV_TOOLS_FOR_AGENTS.md](./KOLLEKTIV_TOOLS_FOR_AGENTS.md) — making Kollektiv's tools available to Mission Control agents
- [OBSIDIAN.md](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md) — the vault tools sub-server this spec aggregates
- [ARCHITECTURE_CONSTITUTION.md § Security Hardening](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#security-hardening) — the CSP `connect-src`/CORS posture this local-only server operates under
- [AI_ENGINE.md](../01_AI_ENGINE/AI_ENGINE.md) — the `list_mcp_servers`/`toggle_mcp_server` assistant tools that manage this server from chat
