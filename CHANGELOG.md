# Changelog

## [Unreleased]

### Added

- **MCP Native Tool Exposure** — All ~100 native assistant tools are now discoverable via the Kollektiv MCP server (port 3012). Any MCP client can `tools/list` to see and inspect every tool.
  - `mcp-config.json` — Single source of truth for MCP-exposed tool definitions, with JSON Schema validation (`mcp-config.schema.json`).
  - `scripts/generate-mcp-config.ts` — Scans tool source files and regenerates the config (bootstrap aid).
  - `scripts/validate-mcp-config.ts` — Validates the config for CI enforcement.
  - `services/kollektivMcp.ts` — Modified to load native tools from `mcp-config.json` and register them in the MCP server's `ListToolsRequestSchema` handler.
  - Permission enforcement via `grantMcpPermissions()` / `revokeMcpPermissions()` — Tools declare required permissions; unauthorized calls are rejected.
  - `docs/tools-inventory.md` — Complete inventory of all ~65 native assistant tools with names, descriptions, file paths, and categories.
  - `docs/mcp-tools.md` — Usage documentation for the MCP tool exposure feature.
  - Tests validate the config integrity, tool uniqueness, permission model, and schema correctness.

### Scripts

- `pnpm validate-config` — Validates `mcp-config.json` against the schema.
- `pnpm generate-mcp-config` — Auto-generates `mcp-config.json` from source files.
