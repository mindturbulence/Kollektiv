/**
 * validate-mcp-config.ts
 *
 * Validates mcp-config.json against the schema and checks:
 * - All tools have required fields
 * - All tool names are unique
 * - Tool names match pattern [a-z][a-z0-9_]*
 * - Categories are valid
 * - Execution kinds are valid
 *
 * Usage:
 *   npx tsx scripts/validate-mcp-config.ts       # Validate only
 *   npx tsx scripts/validate-mcp-config.ts --fix  # Validate + auto-correct
 *   npx validate-config  (via npm script)
 *   npx fix-config       (via npm script, with --fix)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const VALID_CATEGORIES = new Set([
  "navigation", "prompts", "web", "media", "files",
  "memory", "generation", "settings", "mcp",
  "gallery", "capability", "browser", "gmail",
  "spotify", "obsidian", "research", "github",
  "rss", "exa", "reddit", "youtube", "twitter",
  "tensorart", "graph", "search", "utility",
]);

const VALID_EXECUTION_KINDS = new Set([
  "browser-context",
  "server-context",
  "hybrid",
]);

/** Categories that strongly imply server-context tools. */
const SERVER_CONTEXT_CATEGORIES = new Set([
  "github", "rss", "exa", "reddit", "youtube", "twitter",
  "tensorart", "capability",
]);

interface McpConfigTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  executionKind: string;
  filePath: string;
  sourceModule: string;
  category: string;
  permissions?: string[];
}

interface McpConfig {
  version: string;
  tools: McpConfigTool[];
}

// ─── Category inference ───────────────────────────────────────────────────

const CATEGORY_BY_PREFIX: [RegExp, string][] = [
  [/^browser_/, "browser"],
  [/^obsidian_/, "obsidian"],
  [/^gmail_/, "gmail"],
  [/^spotify_/, "spotify"],
  [/^tensorart_/, "tensorart"],
  [/^github_/, "github"],
  [/^youtube_/, "youtube"],
  [/^twitter_/, "twitter"],
  [/^rss_/, "rss"],
  [/^exa_/, "exa"],
  [/^reddit_/, "reddit"],
  [/^capability_/, "capability"],
  [/^knowledge_/, "memory"],
  [/^generate_/, "generation"],
  [/^search_/, "search"],
  [/^save_/, "files"],
  [/^append_/, "research"],
  [/^expand_/, "research"],
  [/^find_/, "graph"],
];

function inferCategory(name: string): string {
  for (const [re, cat] of CATEGORY_BY_PREFIX) {
    if (re.test(name)) return cat;
  }
  if (name.includes("prompt") || name.includes("wildcard") || name.includes("discovery") || name.includes("cheatsheet"))
    return "prompts";
  if (name.includes("media") || name.includes("play") || name.includes("stop") || name.includes("youtube"))
    return "media";
  if (name.includes("web") || name.includes("fetch") || name.includes("scrape") || name.includes("weather") || name.includes("open_web"))
    return "web";
  if (name.includes("note") || name.includes("file"))
    return "files";
  if (name.includes("memory") || name.includes("remember") || name.includes("forget") || name.includes("knowledge"))
    return "memory";
  if (name.includes("mcp") || name.includes("toggle"))
    return "mcp";
  if (name.includes("gallery"))
    return "gallery";
  if (name.includes("settings") || name.includes("update_setting"))
    return "settings";
  if (name.includes("navigate") || name.includes("list_discovery"))
    return "navigation";
  return "utility";
}

function inferFilePath(sourceModule: string): string {
  const moduleToPath: Record<string, string> = {
    "ASSISTANT_TOOLS": "services/assistantTools.ts",
    "browserTools": "services/tools/browserTools.ts",
    "obsidianTools": "services/tools/obsidianTools.ts",
    "gmailTools": "services/tools/gmailTools.ts",
    "spotifyTools": "services/tools/spotifyTools.ts",
    "tensorArtTools": "services/tools/tensorArtTools.ts",
    "researchTools": "services/tools/researchTools.ts",
    "graphTools": "services/tools/graphTools.ts",
    "rssTools": "services/tools/rssTools.ts",
    "githubTools": "services/tools/githubTools.ts",
    "exaTools": "services/tools/exaTools.ts",
    "redditTools": "services/tools/redditTools.ts",
    "youtubeTranscriptTools": "services/tools/youtubeTranscriptTools.ts",
    "twitterTools": "services/tools/twitterTools.ts",
  };
  return moduleToPath[sourceModule] || `services/tools/${sourceModule}.ts`;
}

function inferExecutionKind(category: string): string {
  return SERVER_CONTEXT_CATEGORIES.has(category) ? "server-context" : "browser-context";
}

/**
 * Collect all fixable issues and return the corrections.
 * Each entry is a human-readable description of what was changed.
 */
function computeFixes(config: McpConfig): { tool: McpConfigTool; fixes: string[] }[] {
  const fixLogs: { tool: McpConfigTool; fixes: string[] }[] = [];

  for (const tool of config.tools) {
    const fixes: string[] = [];

    // Fix missing description
    if (!tool.description) {
      tool.description = `Auto-generated tool: ${tool.name || "(unnamed)"}`;
      fixes.push(`description → "${tool.description}"`);
    }

    // Fix missing sourceModule
    if (!tool.sourceModule) {
      tool.sourceModule = "ASSISTANT_TOOLS";
      fixes.push(`sourceModule → "${tool.sourceModule}"`);
    }

    // Fix missing filePath (infer from sourceModule)
    if (!tool.filePath && tool.sourceModule) {
      tool.filePath = inferFilePath(tool.sourceModule);
      fixes.push(`filePath → "${tool.filePath}"`);
    }

    // Fix missing category (infer from name)
    if (!tool.category && tool.name) {
      tool.category = inferCategory(tool.name);
      fixes.push(`category → "${tool.category}" (inferred from name)`);
    } else if (!tool.category && !tool.name) {
      tool.category = "utility";
      fixes.push('category → "utility" (default fallback)');
    }

    // Fix unknown category
    if (tool.category && !VALID_CATEGORIES.has(tool.category)) {
      const inferred = tool.name ? inferCategory(tool.name) : "utility";
      fixes.push(`category "${tool.category}" → "${inferred}" (unknown → inferred)`);
      tool.category = inferred;
    }

    // Fix missing executionKind (infer from category)
    if (!tool.executionKind && tool.category) {
      tool.executionKind = inferExecutionKind(tool.category);
      fixes.push(`executionKind → "${tool.executionKind}" (inferred from category)`);
    } else if (!tool.executionKind) {
      tool.executionKind = "browser-context";
      fixes.push('executionKind → "browser-context" (default fallback)');
    }

    // Fix invalid executionKind
    if (tool.executionKind && !VALID_EXECUTION_KINDS.has(tool.executionKind)) {
      const inferred = inferExecutionKind(tool.category || "utility");
      fixes.push(`executionKind "${tool.executionKind}" → "${inferred}" (invalid → inferred)`);
      tool.executionKind = inferred;
    }

    // Fix missing parameters
    if (!tool.parameters) {
      tool.parameters = { type: "object", properties: {} };
      fixes.push('parameters → { type: "object", properties: {} }');
    }

    // Fix parameters.type not being "object"
    if (tool.parameters && tool.parameters.type !== "object") {
      fixes.push(`parameters.type "${tool.parameters.type}" → "object"`);
      tool.parameters.type = "object";
    }

    // Fix parameters.properties not being an object
    if (tool.parameters && tool.parameters.properties && typeof tool.parameters.properties !== "object") {
      fixes.push(`parameters.properties → {} (was not an object)`);
      (tool.parameters as any).properties = {};
    }

    // Fix parameters.required not being an array
    if (tool.parameters && tool.parameters.required !== undefined && !Array.isArray(tool.parameters.required)) {
      fixes.push(`parameters.required → [] (was not an array)`);
      (tool.parameters as any).required = [];
    }

    if (fixes.length > 0) {
      fixLogs.push({ tool, fixes });
    }
  }

  return fixLogs;
}

function removeDuplicates(tools: McpConfigTool[]): { removed: number; } {
  const seen = new Set<string>();
  const deduped: McpConfigTool[] = [];
  for (const tool of tools) {
    if (tool.name && seen.has(tool.name)) {
      continue; // skip duplicate
    }
    if (tool.name) seen.add(tool.name);
    deduped.push(tool);
  }
  const removed = tools.length - deduped.length;
  tools.length = 0;
  tools.push(...deduped);
  return { removed };
}

function validate() {
  const configPath = resolve(ROOT, "mcp-config.json");
  if (!existsSync(configPath)) {
    console.error(`[validate-mcp-config] File not found: ${configPath}`);
    process.exit(1);
  }

  let config: McpConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.error(`[validate-mcp-config] Failed to parse JSON:`, err);
    process.exit(1);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const seenNames = new Set<string>();

  // Check version
  if (config.version !== "1.0.0") {
    warnings.push(`Unexpected version: "${config.version}" (expected "1.0.0")`);
  }

  // Check tools array
  if (!Array.isArray(config.tools)) {
    errors.push("'tools' must be an array");
    report(errors, warnings);
    return;
  }

  for (let i = 0; i < config.tools.length; i++) {
    const tool = config.tools[i];
    const idx = `[${i}]`;

    // Required fields
    if (!tool.name) errors.push(`${idx} Missing 'name'`);
    if (!tool.description) errors.push(`${idx} "${tool.name || "?"}": Missing 'description'`);
    if (!tool.executionKind) {
      errors.push(`${idx} "${tool.name || "?"}": Missing 'executionKind'`);
    } else if (!VALID_EXECUTION_KINDS.has(tool.executionKind)) {
      errors.push(`${idx} "${tool.name}": Invalid executionKind "${tool.executionKind}"`);
    }
    if (!tool.filePath) errors.push(`${idx} "${tool.name || "?"}": Missing 'filePath'`);
    if (!tool.sourceModule) errors.push(`${idx} "${tool.name || "?"}": Missing 'sourceModule'`);
    if (!tool.category) {
      errors.push(`${idx} "${tool.name || "?"}": Missing 'category'`);
    } else if (!VALID_CATEGORIES.has(tool.category)) {
      warnings.push(`${idx} "${tool.name}": Unknown category "${tool.category}"`);
    }

    // Name uniqueness and pattern
    if (tool.name) {
      if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
        errors.push(`"${tool.name}": Name must match pattern [a-z][a-z0-9_]*`);
      }
      if (seenNames.has(tool.name)) {
        errors.push(`"${tool.name}": Duplicate tool name`);
      }
      seenNames.add(tool.name);
    }

    // Parameters
    if (tool.parameters) {
      if (tool.parameters.type !== "object") {
        errors.push(`"${tool.name || "?"}": parameters.type must be "object"`);
      }
      if (tool.parameters.properties && typeof tool.parameters.properties !== "object") {
        errors.push(`"${tool.name || "?"}": parameters.properties must be an object`);
      }
      if (tool.parameters.required && !Array.isArray(tool.parameters.required)) {
        errors.push(`"${tool.name || "?"}": parameters.required must be an array`);
      }
    } else {
      errors.push(`"${tool.name || "?"}": Missing 'parameters'`);
    }
  }

  report(errors, warnings, config.tools.length);
}

function runFix() {
  const configPath = resolve(ROOT, "mcp-config.json");
  if (!existsSync(configPath)) {
    console.error(`[validate-mcp-config] File not found: ${configPath}`);
    process.exit(1);
  }

  let config: McpConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.error(`[validate-mcp-config] Failed to parse JSON:`, err);
    process.exit(1);
  }

  if (!Array.isArray(config.tools)) {
    console.error("[validate-mcp-config] 'tools' must be an array — cannot fix.");
    process.exit(1);
  }

  // 1. Remove duplicate tools (first occurrence wins)
  const { removed: dupesRemoved } = removeDuplicates(config.tools);

  // 2. Fix individual tool issues
  const fixLog = computeFixes(config);

  // 3. Sort alphabetically by name
  config.tools.sort((a, b) => a.name.localeCompare(b.name));

  // 4. Write the corrected config
  const json = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(configPath, json, "utf-8");

  // 5. Report summary
  const totalFixes = fixLog.reduce((sum, entry) => sum + entry.fixes.length, 0) + dupesRemoved;
  console.log(`\n[validate-mcp-config] Fixed ${totalFixes} issue(s):`);

  if (dupesRemoved > 0) {
    console.log(`  ✓ Removed ${dupesRemoved} duplicate tool(s)`);
  }

  for (const { tool, fixes } of fixLog) {
    for (const fix of fixes) {
      console.log(`  ✓ [${tool.name || "?"}] ${fix}`);
    }
  }

  console.log(`\n[validate-mcp-config] Config written to ${configPath}`);

  // Re-validate to confirm fixes resolved the issues
  console.log("");
  validate();
}

function report(errors: string[], warnings: string[], toolCount?: number) {
  if (toolCount !== undefined) {
    console.log(`\n[validate-mcp-config] ${toolCount} tools`);
  }

  for (const w of warnings) {
    console.warn(`  ⚠ ${w}`);
  }
  for (const e of errors) {
    console.error(`  ✗ ${e}`);
  }

  const hasErrors = errors.length > 0;
  if (hasErrors) {
    console.error(`\n[validate-mcp-config] FAILED — ${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(1);
  }

  console.log(`[validate-mcp-config] PASSED — 0 errors, ${warnings.length} warning(s)`);
}

// ─── CLI entry point ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes("--fix")) {
  runFix();
} else {
  validate();
}

