# MCP Tools — Native Assistant Tool Exposure

## Overview

The Kollektiv MCP server (`services/kollektivMcp.ts`, port **3012**) now exposes **all native assistant tools** via the Model Context Protocol (MCP). This means any MCP client can:

- **Discover** every native tool via `tools/list`
- **Inspect** tool schemas (name, description, parameters)
- **Call** tools (with limitations — see below)

Previously, only Obsidian vault tools and Playwright browser tools were available via MCP. Now ~100 native tools are also registered in the server's tool index.

---

## How It Works

### Config File

`mcp-config.json` at the repo root is the single source of truth. It contains every native tool with:

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

### Schema

`mcp-config.schema.json` defines the validation rules for the config file.

### Generation Script

`scripts/generate-mcp-config.ts` scans tool source files and regenerates `mcp-config.json`. Run:

```bash
pnpm generate-mcp-config
```

> **Note:** The generation script uses regex-based parsing and may not handle all edge cases (e.g., backtick template-literal descriptions). The hand-crafted `mcp-config.json` is the source of truth.

### Validation Script

`scripts/validate-mcp-config.ts` checks the config for correctness:

```bash
pnpm validate-config
```

CI runs this on every push.

---

## Tool Categories

| Category | Source Module | Count | Examples |
|----------|--------------|-------|---------|
| `navigation` | ASSISTANT_TOOLS | 1 | `navigate` |
| `prompts` | ASSISTANT_TOOLS | ~12 | `refine_prompt`, `analyze_prompt`, `search_prompts` |
| `web` | ASSISTANT_TOOLS | ~8 | `web_search`, `fetch_url`, `scrape_url` |
| `media` | ASSISTANT_TOOLS | ~4 | `play_media`, `stop_media`, `youtube_search` |
| `files` | ASSISTANT_TOOLS | ~5 | `save_file`, `save_note`, `list_notes` |
| `memory` | ASSISTANT_TOOLS | ~5 | `remember`, `search_memories`, `forget` |
| `generation` | ASSISTANT_TOOLS | ~3 | `generate_image`, `generate_and_ingest` |
| `settings` | ASSISTANT_TOOLS | 1 | `update_settings` |
| `mcp` | ASSISTANT_TOOLS | 2 | `list_mcp_servers`, `toggle_mcp_server` |
| `gallery` | ASSISTANT_TOOLS | ~3 | `search_gallery`, `save_to_gallery` |
| `capability` | ASSISTANT_TOOLS | 5 | `capability_search`, `capability_list` |
| `browser` | browserTools | ~21 | `browser_click`, `browser_type`, `browser_navigate` |
| `gmail` | gmailTools | 3 | `read_gmail`, `send_gmail`, `delete_gmail` |
| `spotify` | spotifyTools | 3 | `spotify_list_playlists`, `spotify_play` |
| `obsidian` | obsidianTools | ~7 | `obsidian_search_notes`, `obsidian_write_note` |
| `research` | researchTools | 2 | `append_findings`, `expand_source` |
| `github` | githubTools | 3 | `github_get_repo`, `github_search` |
| `rss` | rssTools | 1 | `rss_fetch` |
| `exa` | exaTools | 1 | `exa_search` |
| `reddit` | redditTools | 1 | `reddit_fetch` |
| `youtube` | youtubeTranscriptTools | 1 | `youtube_get_transcript` |
| `twitter` | twitterTools | 1 | `twitter_get_tweet` |
| `tensorart` | tensorArtTools | 2 | `tensorart_list_models`, `tensorart_generate` |
| `graph` | graphTools | 1 | `find_related_knowledge` |

---

## Execution Kinds

- **`browser-context`**: Requires a browser environment (DOM, `appEventBus`, `localStorage`). These tools **return metadata** when called via MCP — they cannot execute server-side.
- **`server-context`**: Could theoretically run server-side (pure API calls). Server-side execution is **not yet wired** — calling these via MCP returns a `not implemented` response.
- **`hybrid`**: Mixed execution context (reserved for future use).

---

## Permission Model

Tools that require user permissions have a `permissions` array:

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

Permissions are managed via `grantMcpPermissions()` / `revokeMcpPermissions()` in `services/kollektivMcp.ts`.

---

## MCP Server Details

| Property | Value |
|----------|-------|
| URL | `http://127.0.0.1:3012` |
| Protocol | Streamable HTTP (JSON-RPC) |
| Transport | SSE + HTTP POST |
| Server name | `kollektiv-mcp` |
| Version | `1.0.0` |

### Connecting from an MCP Client

```json
{
  "mcpServers": {
    "kollektiv": {
      "url": "http://127.0.0.1:3012"
    }
  }
}
```

---

## Adding a New Tool

1. Define the tool in the appropriate `services/tools/*.ts` file or in `services/assistantTools.ts`
2. Add an entry to `mcp-config.json` with the tool's name, description, parameters, and metadata
3. Run `pnpm validate-config` to verify the config
4. Run `pnpm test` to verify all tests pass

---

## Architecture Diagram

```
MCP Client (e.g. Cursor, Claude Code)
       │
       │  tools/list, tools/call
       ▼
Kollektiv MCP Server (port 3012)
       │
       ├── Native tools (mcp-config.json)
       │     └── browser-context → metadata only
       │     └── server-context  → not yet wired
       │
       ├── Obsidian vault tools (mcpvault)
       │     └── Full read/write execution
       │
       └── Playwright browser tools
             └── Full browser automation
```
