# MCP CI Pipeline Flow

```mermaid
flowchart TD
    %% ── Entry ──
    A(["📦 Developer pushes commit"]) --> B["⚙️ GitHub Actions CI triggers"]
    B --> C["📥 Install dependencies\npnpm install --frozen-lockfile"]

    %% ── Gate 1: Lint (fast fail) ──
    C --> D["🔍 TypeScript type-check\npnpm lint"]
    D --> E{"Exit code 0?"}
    E -->|"❌ No"| F["🚫 PR blocked —\ntype errors to fix"]
    E -->|"✅ Yes"| G["🔬 Validate config\npnpm validate-config"]

    %% ── Gate 2: Config validation ──
    G --> H{"Validates?"}
    H -->|"❌ No"| I["🚫 PR blocked —\nconfig errors:\n• missing fields\n• duplicate names\n• bad execution kind"]
    H -->|"✅ Yes"| J["🧪 Run Vitest suite\npnpm test"]

    %% ── Gate 3: Tests ──
    J --> K{"All tests pass?"}

    K -->|"❌ No"| L["🚫 PR blocked —\nfailing tests:\n• config integrity\n• schema sync\n• permission checks"]

    K -->|"✅ Yes"| M["🏗️ Production build\npnpm build"]

    %% ── Gate 4: Build ──
    M --> N{"Build succeeds?"}

    N -->|"❌ No"| O["🚫 PR blocked —\nbuild failure"]
    N -->|"✅ Yes"| P["✅ PR ready to merge"]

    %% ── Styling ──
    style A fill:#1a1a2e,stroke:#e94560,color:#fff,stroke-width:2px
    style B fill:#16213e,stroke:#0f3460,color:#fff
    style C fill:#0f3460,stroke:#16213e,color:#fff
    style D fill:#533483,stroke:#e94560,color:#fff
    style E fill:#e94560,stroke:#533483,color:#fff
    style F fill:#c70039,stroke:#900c3f,color:#fff,stroke-width:2px
    style G fill:#533483,stroke:#e94560,color:#fff
    style H fill:#e94560,stroke:#533483,color:#fff
    style I fill:#c70039,stroke:#900c3f,color:#fff,stroke-width:2px
    style J fill:#533483,stroke:#e94560,color:#fff
    style K fill:#e94560,stroke:#533483,color:#fff
    style L fill:#c70039,stroke:#900c3f,color:#fff,stroke-width:2px
    style M fill:#533483,stroke:#e94560,color:#fff
    style N fill:#e94560,stroke:#533483,color:#fff
    style O fill:#c70039,stroke:#900c3f,color:#fff,stroke-width:2px
    style P fill:#2d6a4f,stroke:#52b788,color:#fff,stroke-width:3px
```

## Validation Detail

### Gate: `pnpm validate-config` (`scripts/validate-mcp-config.ts`)

Checks that `mcp-config.json` conforms to these rules:

| Check | Details |
|-------|---------|
| **Required fields** | Every tool must have `name`, `description`, `parameters`, `executionKind`, `filePath`, `sourceModule`, `category` |
| **Name uniqueness** | No duplicate tool names allowed |
| **Name pattern** | Must match `[a-z][a-z0-9_]*` |
| **Execution kind** | One of `browser-context`, `server-context`, `hybrid` |
| **Category** | Must be a known category from `VALID_CATEGORIES` — unknown entries produce warnings |
| **Parameters** | Must have `type: "object"`, `properties` must be an object, `required` must be an array if present |

### Gate: `pnpm test` (`services/mcp-config.test.ts`)

The Vitest suite covers three groups of tests:

**Config Integrity** — 7 test cases:
- File exists and parses as valid JSON
- Version is `1.0.0`
- At least 90 tools defined
- Each tool has all required fields with correct types
- Tool names are unique and match naming pattern
- `filePath` values point to real files on disk
- Well-known tools present (e.g., `navigate`, `web_search`, `generate_image`)

**Schema Sync** — 7 test cases:
- `VALID_CATEGORIES` matches the JSON schema category `enum`
- `VALID_EXECUTION_KINDS` matches the schema executionKind `enum`
- Required fields in schema match validator error checks
- No duplicates in either location
- Validator runs and exits 0
- Tool count in output matches parsed config count

**Permissions** — 10 test cases:
- All permission values use `namespace:action` format
- Browser tools declare `screen:share` + `control:grant`
- CDP-only tools only require `cdp:connected`
- Gmail tools require `google:auth`; `send_gmail` also `gmail:send`
- Spotify tools require `spotify:auth`
- Obsidian tools declare `vault:read` or `vault:write`
- `browser_complete_task` also declares `gemini:vision`

---

*See [MCP_SPEC.md](../docs/05_MCP/MCP_SPEC.md#ci-pipeline--validation-gates) for the full prose specification.*
