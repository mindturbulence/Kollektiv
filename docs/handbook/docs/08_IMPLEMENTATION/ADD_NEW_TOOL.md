# Adding a New Assistant Tool

A step-by-step guide to creating a new assistant tool, registering it in the MCP server, and passing all CI gates.

---

## Overview

Every assistant tool exists in two places:

1. **Source code** — TypeScript implementation (`AssistantTool` object with `name`, `description`, `parameters`, and `execute` function)
2. **MCP config** — JSON entry in `mcp-config.json` that exposes it via the Kollektiv MCP server

The CI pipeline enforces that both stay in sync. This guide walks through both sides.

---

## Step 1: Decide Where to Define the Tool

There are two patterns:

### Pattern A: Inline in `services/assistantTools.ts` (simple tools)

Use this for tools that are closely tied to the app's core state (navigation, prompts, notes, media, memory, settings, gallery, generation, MCP, capability).

**Example:** A simple prompt-engineering tool

```typescript
// In the ASSISTANT_TOOLS array, alongside existing tools:
{
    name: 'my_new_tool',
    description: 'Does something useful. Returns JSON.',
    parameters: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'The input to process.' },
        },
        required: ['input'],
    },
    execute: ({ input }, ctx) => {
        // Use ctx.settings for LLM settings, ctx.attachments for images
        return `Processed: ${input}`;
    },
},
```

### Pattern B: Per-category module in `services/tools/*.ts` (many related tools)

Use this for tools that form a natural group (browser, obsidian, gmail, spotify, research, github, rss, exa, reddit, youtube, twitter, tensorart, graph).

**Create the file:**

```typescript
// services/tools/myCategoryTools.ts
import type { AssistantTool } from './types';

export const myCategoryTools: AssistantTool[] = [
    {
        name: 'my_category_tool_1',
        description: 'First tool in this category.',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'Result',
    },
];
```

**Register it in `services/assistantTools.ts`:**

Add the import and spread:

```typescript
import { myCategoryTools } from './tools/myCategoryTools';

// In the ASSISTANT_TOOLS array, spread the tools:
...myCategoryTools,
```

> **Important:** The order of tools in `ASSISTANT_TOOLS` determines which one wins if there's a name collision — `assistantTools.ts` inline definitions are spread first, then per-category modules. The first occurrence wins during deduplication.

---

## Step 2: Implement the Tool Interface

All tools must conform to the `AssistantTool` interface from `services/tools/types.ts`:

```typescript
interface AssistantTool {
  name: string;                          // snake_case, e.g. "my_new_tool"
  description: string;                   // Clear, concise description
  parameters: {
    type: 'object';
    properties: Record<string, Record<string, any>>;  // JSON Schema
    required?: string[];                  // Required parameter names
  };
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
}
```

### Tool Naming Rules

- **Must match** `[a-z][a-z0-9_]*` (validated by CI)
- Use **snake_case** (e.g., `my_new_tool`, `get_current_media`)
- Prefix with category for per-category modules (e.g., `browser_`, `obsidian_`, `github_`)
- No hyphens, no uppercase

### Parameter Schema Rules

- `type` must always be `"object"`
- `properties` must be an object (can be empty for parameterless tools)
- Each property should have `type`, `description`, and optionally `enum` or `items`
- `required` must be an array if present

### Execution Context (`ctx`)

The second argument to `execute` provides:

```typescript
interface ToolContext {
  settings: LLMSettings;       // Current AI settings snapshot
  attachments?: {               // Images from the user's current chat turn
    data: string;
    mimeType: string;
    fileName?: string;
  }[];
}
```

### Execution Kinds

Choose the right execution kind for your tool:

| Kind | When to Use | Can it run server-side? |
|------|-------------|------------------------|
| `browser-context` | Tool needs DOM, `appEventBus`, `localStorage`, IndexedDB, or File System Access API | ❌ Metadata + hint only |
| `server-context` | Tool makes API calls via `fetch()`, doesn't need browser APIs | ✅ Yes (if executor wired) |
| `hybrid` | Reserved for future use | ❌ Not yet implemented |

**Examples of each:**

- **browser-context**: `navigate`, `save_note`, `remember`, `play_media`, `browser_click`, `read_gmail`
- **server-context**: `get_weather`, `github_get_repo`, `scrape_url`, `web_search`, `rss_fetch`

---

## Step 3: Add the Entry to `mcp-config.json`

Add an entry to the `"tools"` array in `mcp-config.json` (at repo root). The file is alphabetically sorted by tool name.

```json
{
  "name": "my_new_tool",
  "description": "Does something useful. Returns JSON.",
  "parameters": {
    "type": "object",
    "properties": {
      "input": { "type": "string", "description": "The input to process." }
    },
    "required": ["input"]
  },
  "executionKind": "server-context",
  "filePath": "services/assistantTools.ts",
  "sourceModule": "ASSISTANT_TOOLS",
  "category": "utility",
  "permissions": ["some:perm"]
}
```

### Fields Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Tool name matching the source code |
| `description` | ✅ | Human-readable description |
| `parameters` | ✅ | JSON Schema object with `type`, `properties`, optional `required` |
| `executionKind` | ✅ | One of `browser-context`, `server-context`, `hybrid` |
| `filePath` | ✅ | Relative path to the source file |
| `sourceModule` | ✅ | Exported array name (e.g., `ASSISTANT_TOOLS`, `browserTools`) |
| `category` | ✅ | Functional category from the [valid categories list](#valid-categories) |
| `permissions` | ❌ | Array of permission strings if the tool requires user authorization |

### Valid Categories

```
navigation  prompts     web         media       files
memory      generation  settings    mcp         gallery
capability  browser     gmail       spotify     obsidian
research    github      rss         exa         reddit
youtube     twitter     tensorart   graph       search
utility
```

### Permission Values

```
screen:share      Browser automation
control:grant     Browser automation
cdp:connected     CDP tab management
google:auth       Gmail read/send
gmail:send        Send email
spotify:auth      Spotify access
vault:read        Obsidian read
vault:write       Obsidian write
tensorart:api     Tensor Art API
gemini:vision     Vision-based automation
```

---

## Step 4: Run Validation Gates

Run all validation steps before committing:

```bash
# 1. Validate config structure and rules
pnpm validate-config

# 2. Run the full test suite (includes config integrity + schema sync tests)
pnpm test

# 3. Type-check
pnpm lint
```

### What the Gates Check

**`pnpm validate-config`** (`scripts/validate-mcp-config.ts`):
- All required fields present on every tool
- Tool names are unique and match `[a-z][a-z0-9_]*`
- `executionKind` is valid
- `category` is known (unknown categories produce warnings, not errors)
- Parameters have correct structure

**`pnpm test`** (`services/mcp-config.test.ts`):
- Config file exists and parses
- At least 90 tools defined
- Every tool has correct field types
- All `filePath` values point to real files
- Permission arrays use correct format
- Schema and validator are in sync (categories, execution kinds, required fields)
- Validator script runs successfully with matching tool count

> **Tip:** If the validator fails with "Missing 'name'" or similar, check that your JSON entry has all required fields. If it fails with "File not found", check that `filePath` is relative to repo root.

---

## Step 4.5: Set Up the Pre-Commit Hook

The project uses [Husky](https://typicode.github.io/husky/) to run `pnpm validate-config` automatically before every `git commit`. This catches config errors before they reach CI.

### One-time Setup

No manual setup needed. The project has `"prepare": "husky"` in `package.json`, so hooks activate **automatically** on `pnpm install`. The `.husky/pre-commit` file is committed to the repo and contains:

```bash
pnpm validate-config
```

The hook runs `pnpm validate-config` before every commit. If the config is valid (exit 0), the commit proceeds. If invalid, the commit is blocked with the validation error output.

### What Happens When It Blocks

If you try to commit with a broken `mcp-config.json`, you'll see:

```
$ tsx scripts/validate-mcp-config.ts
[validate-mcp-config] 100 tools
  ✗ "bad_tool": Missing 'category'

[validate-mcp-config] FAILED — 1 error(s), 0 warning(s)
husky - pre-commit hook exited with code 1 (error)
```

Fix the issue, `git add` the corrected file, and commit again.

### Auto-Fix with `pnpm fix-config`

If you're not sure how to fix the validation errors, run the auto-fix mode to apply sensible defaults:

```bash
pnpm fix-config        # Auto-corrects missing/invalid fields
```

This updates `mcp-config.json` in-place and re-validates. Review the diff, adjust if needed, then commit.

---

## Step 4.6: Pre-Push Hook (Comprehensive Gate)

A **pre-push hook** runs `pnpm lint && pnpm test` automatically before every `git push`. This catches type errors and test failures before they reach the remote — saving CI round-trips.

### Hook Content

The `.husky/pre-push` file is committed to the repo and contains:

```bash
pnpm lint && pnpm test
```

### Tiered Gating Strategy

The two hooks work together as a **tiered safety net**:

| Gate | When | Command | Time | Catches |
|------|------|---------|------|---------|
| **Pre-commit** | Every `git commit` | `pnpm validate-config` | ~2s | Config drift (missing fields, wrong execution kind, stale paths) |
| **Pre-push** | Every `git push` | `pnpm lint && pnpm test` | ~50s | Type errors + test failures |

- Pre-commit is **fast** (~2s) so it never gets in the way of local work
- Pre-push is **comprehensive** (~50s) and runs less frequently
- Both activate automatically via the `prepare` script on `pnpm install`

### What Happens When It Blocks

If you try to push with type errors or failing tests, the push is blocked:

```
$ tsc --noEmit
services/kollektivMcp.ts(99,65): error TS18047: '_nativeConfig' is possibly 'null'.

husky - pre-push script failed (code 2)
error: failed to push some refs to
```

Fix the issue, commit the fix, and push again.

### Bypassing (Emergency Only)

In rare cases (e.g., pushing a WIP branch to share with a colleague), you can skip hooks:

```bash
git push --no-verify
```

Use sparingly — the CI pipeline will still catch any issues on the remote side.

---

## Step 5: (Optional) Wire a Server-Side Executor

If your tool is `server-context` and you want it to work when called via MCP (not just from the in-app assistant), register an executor in `services/kollektivMcp.ts`.

### Pattern A: Call an Express API Endpoint

If the Express server already has a route that does what your tool needs, use the `callApi` helper:

```typescript
_serverExecutors.set("my_new_tool", async (args) => {
    const { ok, data } = await callApi("/api/my-endpoint", {
        input: String(args.input),
    });
    const text = ok
        ? JSON.stringify(data)
        : `Error: ${data?.error || "Request failed"}`;
    return { content: [{ type: "text", text }], isError: !ok };
});
```

### Pattern B: Call an External API Directly

```typescript
_serverExecutors.set("my_new_tool", async (args) => {
    const input = String(args.input || "");
    if (!input) {
        return { content: [{ type: "text", text: "Input is required." }], isError: true };
    }
    try {
        const res = await fetch(`https://api.example.com/${encodeURIComponent(input)}`);
        if (!res.ok) {
            return { content: [{ type: "text", text: `API error: ${res.status}` }], isError: true };
        }
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data) }], isError: false };
    } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e?.message || e}` }], isError: true };
    }
});
```

### Executor Response Format

Every executor must return:

```typescript
{
  content: [{ type: "text", text: string }];  // Always a single text block
  isError: boolean;                            // true if the tool failed
}
```

---

## Step 6: Run the Full CI Pipeline Locally

Before pushing, simulate what CI will run:

```bash
pnpm lint && pnpm validate-config && pnpm test && pnpm build
```

All four must pass. The order in CI is:

1. `pnpm lint` — TypeScript type-check (fastest fail)
2. `pnpm validate-config` — MCP config validation (standalone, no mocks)
3. `pnpm test` — Full Vitest suite (includes config integrity + schema sync)
4. `pnpm build` — Vite production build (only if all above pass)

---

## Full Worked Example: Adding a `lorem_ipsum` Tool

Here's every file you'd touch to add a simple server-context tool that generates placeholder text.

### 1. Tool definition (`services/assistantTools.ts`)

```typescript
{
    name: 'lorem_ipsum',
    description: 'Generate placeholder Lorem Ipsum text of a given length. Returns the generated text.',
    parameters: {
        type: 'object',
        properties: {
            paragraphs: { type: 'integer', description: 'Number of paragraphs (default 3, max 20).' },
        },
    },
    execute: async ({ paragraphs }) => {
        const count = Math.min(Math.max(1, Math.floor(Number(paragraphs) || 3)), 20);
        const lorem = 'Lorem ipsum dolor sit amet...'; // truncated example
        return Array(count).fill(lorem).join('\n\n');
    },
},
```

### 2. MCP config entry (`mcp-config.json`)

```json
{
  "name": "lorem_ipsum",
  "description": "Generate placeholder Lorem Ipsum text of a given length.",
  "parameters": {
    "type": "object",
    "properties": {
      "paragraphs": { "type": "integer", "description": "Number of paragraphs (default 3, max 20)." }
    }
  },
  "executionKind": "server-context",
  "filePath": "services/assistantTools.ts",
  "sourceModule": "ASSISTANT_TOOLS",
  "category": "utility"
}
```

### 3. Server-side executor (`services/kollektivMcp.ts`)

```typescript
_serverExecutors.set("lorem_ipsum", async (args) => {
    const count = Math.min(Math.max(1, Math.floor(Number(args.paragraphs) || 3)), 20);
    const lorem = 'Lorem ipsum dolor sit amet...';
    const text = Array(count).fill(lorem).join('\n\n');
    return { content: [{ type: "text", text }], isError: false };
});
```

### 4. Validation

```bash
pnpm validate-config   # Should show 101 tools, PASSED
pnpm test              # All tests (including "at least 90 tools") pass
pnpm lint              # No type errors
pnpm build             # Build succeeds
```

---

## Common Pitfalls

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `name` doesn't match `[a-z][a-z0-9_]*` | Validator error | Use snake_case, no hyphens |
| `filePath` is wrong | Test fails — "File not found" | Use path relative to repo root (e.g., `services/assistantTools.ts`) |
| `executionKind` is invalid | Validator error | Use exactly `browser-context`, `server-context`, or `hybrid` |
| `category` is not in `VALID_CATEGORIES` | Validator warning | Add it to both `VALID_CATEGORIES` and the schema if it's truly new |
| Duplicate tool name | Validator/test error | Check no other tool has the same `name` |
| Missing `execute` function | TypeScript error | Ensure the tool object has an `execute` method |
| Parameter schema mismatch | Test fails | `parameters.type` must be `"object"` |
| Tool defined but not in `mcp-config.json` | Not exposed via MCP | Add the JSON entry |
| Tool in `mcp-config.json` but not in source code | Orphaned entry — passes CI but won't be found by the assistant | Add the source definition |

---

## Reference

- [AssistantTool interface](../../../services/tools/types.ts) — canonical type definition
- [mcp-config.json](../../../mcp-config.json) — the config file itself
- [validate-mcp-config.ts](../../../scripts/validate-mcp-config.ts) — validation rules
- [generate-mcp-config.ts](../../../scripts/generate-mcp-config.ts) — auto-generation script
- [mcp-config.test.ts](../../../services/mcp-config.test.ts) — test suite
- [kollektivMcp.ts](../../../services/kollektivMcp.ts) — server-side executor registration
- [tools-inventory.md](../../../docs/tools-inventory.md) — complete tool catalog
- [MCP_SPEC.md](../05_MCP/MCP_SPEC.md) — MCP architecture spec
- [MCP_SPEC.md § CI Pipeline](../05_MCP/MCP_SPEC.md#ci-pipeline--validation-gates) — CI gates documentation
- [CAPABILITY_SPEC.md](../02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md) — capability registry (higher-level abstraction above assistant tools)
