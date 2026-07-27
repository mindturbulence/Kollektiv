/**
 * generate-mcp-config.ts
 *
 * Scans `services/tools/*.ts` and `services/assistantTools.ts` for
 * AssistantTool definitions and generates a canonical `mcp-config.json`
 * that the Kollektiv MCP server uses to expose native tools.
 *
 * Usage:
 *   npx tsx scripts/generate-mcp-config.ts            # Write (default)
 *   npx tsx scripts/generate-mcp-config.ts --check    # Diff without writing
 *   npx tsx scripts/generate-mcp-config.ts --dry-run  # Print to stdout only
 *
 * The generated file validates against mcp-config.schema.json.
 *
 * WARNING: The regex-based parser in this script cannot handle backtick
 * template-literal descriptions (common in assistantTools.ts). The
 * hand-crafted mcp-config.json is the source of truth. Use --check to
 * safely see what the auto-generator would produce before overwriting.
 */

import { readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── CLI flags ───────────────────────────────────────────────────────────
// `--dry-run` takes precedence over `--check`.

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const isDryRun = args.includes("--dry-run");

// ─── Types matching AssistantTool interface ───────────────────────────────

interface ToolParam {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, any>;
}

interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParam>;
  required?: string[];
}

interface ToolEntry {
  name: string;
  description: string;
  parameters: ToolParameters;
  executionKind: "browser-context" | "server-context" | "hybrid";
  filePath: string;
  sourceModule: string;
  category: string;
  permissions?: string[];
}

// ─── Category mapping by prefix/keyword ──────────────────────────────────

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
  // Heuristic fallbacks
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
  if (name.includes("settings"))
    return "settings";
  if (name.includes("navigate") || name.includes("list_discovery"))
    return "navigation";
  return "utility";
}

// ─── Parse a TypeScript source file for AssistantTool definitions ─────────
// This is a simplified parser that extracts tool names, descriptions, and
// parameter schemas using regex. For a production build, a proper AST parser
// (e.g., ts-morph) would be more reliable, but regex works for the
// consistent format used in this codebase.

interface ParsedTool {
  name: string;
  description: string;
  parameters: ToolParameters;
}

function extractToolsFromSource(source: string, _filePath: string): ParsedTool[] {
  const tools: ParsedTool[] = [];

  // Match tool object literals: { name: '...', description: '...', parameters: { ... }, execute: ... }
  // Each tool starts with `{` or `{ //comment` and has a `name:` field and `execute:` field.
  const toolBlocks = source.split(/\{\s*name:\s*'/);

  for (let i = 1; i < toolBlocks.length; i++) {
    const block = toolBlocks[i];
    const nameMatch = block.match(/^([a-z_][a-z0-9_]*)/);
    if (!nameMatch) continue;

    const name = nameMatch[1];

    // Extract description
    const descMatch = block.match(/description:\s*'((?:[^'\\]|\\.)*)'/);
    if (!descMatch) continue;
    const description = descMatch[1];

    // Extract parameters block
    const paramsStart = block.indexOf("parameters: {");
    if (paramsStart === -1) {
      // No parameters -> empty object
      tools.push({ name, description, parameters: { type: "object", properties: {} } });
      // Check if this tool has `execute:` to know if we should include it
      const hasExecute = block.includes("execute:");
      if (!hasExecute) {
        tools.pop();
      }
      continue;
    }

    // Try to parse parameters block - look for type:'object' and properties
    const paramsBlock = block.slice(paramsStart);
    const typeMatch = paramsBlock.match(/type:\s*'(object)'/);
    if (!typeMatch) {
      tools.push({ name, description, parameters: { type: "object", properties: {} } });
      continue;
    }

    // Extract properties
    const props: Record<string, ToolParam> = {};
    const propsStart = paramsBlock.indexOf("properties: {");
    if (propsStart !== -1) {
      const propsStr = paramsBlock.slice(propsStart + "properties: {".length);
      // Find the matching closing brace for properties
      let depth = 1;
      let propsEnd = 0;
      for (let j = 0; j < propsStr.length; j++) {
        if (propsStr[j] === "{") depth++;
        if (propsStr[j] === "}") {
          depth--;
          if (depth === 0) { propsEnd = j; break; }
        }
      }
      const propsBody = propsStr.slice(0, propsEnd);

      // Extract each property: key: { type: '...', description: '...', ... }
      const propRegex = /([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/g;
      let match;
      while ((match = propRegex.exec(propsBody)) !== null) {
        const key = match[1];
        // Skip if this is nested inside another property definition
        const beforeKey = propsBody.slice(Math.max(0, match.index - 20), match.index).trim();
        // Check if this key is a property definition (preceded by nothing or whitespace/comma)
        if (beforeKey.length > 0 && !beforeKey.endsWith(",") && !beforeKey.endsWith("{")) continue;

        const valStart = match.index + match[0].length;
        let valDepth = 1;
        let valEnd = valStart;
        for (let j = valStart; j < propsBody.length; j++) {
          if (propsBody[j] === "{") valDepth++;
          if (propsBody[j] === "}") {
            valDepth--;
            if (valDepth === 0) { valEnd = j; break; }
          }
        }
        const valStr = propsBody.slice(valStart, valEnd);

        const typeMatch2 = valStr.match(/type:\s*'([^']+)'/);
        const descMatch2 = valStr.match(/description:\s*'((?:[^'\\]|\\.)*)'/);
        const enumMatch = valStr.match(/enum:\s*\[([^\]]+)\]/);

        const prop: ToolParam = {
          type: typeMatch2 ? typeMatch2[1] : "string",
        };
        if (descMatch2) prop.description = descMatch2[1];
        if (enumMatch) {
          prop.enum = enumMatch[1].split(",").map((e) => e.trim().replace(/^'|'$/g, ""));
        }
        // Handle items
        const itemsMatch = valStr.match(/items:\s*\{[^}]*type:\s*'([^']+)'/);
        if (itemsMatch) {
          prop.items = { type: itemsMatch[1] };
        }
        props[key] = prop;
      }
    }

    // Extract required array
    const required: string[] = [];
    const reqMatch = paramsBlock.match(/required:\s*\[([^\]]+)\]/);
    if (reqMatch) {
      reqMatch[1].split(",").forEach((r) => {
        const trimmed = r.trim().replace(/^'|'$/g, "");
        if (trimmed) required.push(trimmed);
      });
    }

    tools.push({
      name,
      description,
      parameters: { type: "object", properties: props, required: required.length > 0 ? required : undefined },
    });
  }

  return tools;
}

// ─── Source files to scan ───────────────────────────────────────────────

const TOOL_SOURCES: { filePath: string; sourceModule: string }[] = [
  { filePath: "services/tools/browserTools.ts", sourceModule: "browserTools" },
  { filePath: "services/tools/obsidianTools.ts", sourceModule: "obsidianTools" },
  { filePath: "services/tools/gmailTools.ts", sourceModule: "gmailTools" },
  { filePath: "services/tools/spotifyTools.ts", sourceModule: "spotifyTools" },
  { filePath: "services/tools/tensorArtTools.ts", sourceModule: "tensorArtTools" },
  { filePath: "services/tools/researchTools.ts", sourceModule: "researchTools" },
  { filePath: "services/tools/graphTools.ts", sourceModule: "graphTools" },
  { filePath: "services/tools/rssTools.ts", sourceModule: "rssTools" },
  { filePath: "services/tools/githubTools.ts", sourceModule: "githubTools" },
  { filePath: "services/tools/exaTools.ts", sourceModule: "exaTools" },
  { filePath: "services/tools/redditTools.ts", sourceModule: "redditTools" },
  { filePath: "services/tools/youtubeTranscriptTools.ts", sourceModule: "youtubeTranscriptTools" },
  { filePath: "services/tools/twitterTools.ts", sourceModule: "twitterTools" },
  { filePath: "services/assistantTools.ts", sourceModule: "ASSISTANT_TOOLS" },
];

// ─── Main ────────────────────────────────────────────────────────────────

function generate() {
  const allTools: ToolEntry[] = [];
  let totalFound = 0;

  for (const { filePath, sourceModule } of TOOL_SOURCES) {
    const absPath = join(ROOT, filePath);
    try {
      if (!statSync(absPath).isFile()) continue;
    } catch {
      console.warn(`[generate-mcp-config] File not found: ${absPath} — skipping`);
      continue;
    }

    const source = readFileSync(absPath, "utf-8");
    const parsed = extractToolsFromSource(source, filePath);

    for (const tool of parsed) {
      const existing = allTools.find((t) => t.name === tool.name);
      if (existing) {
        // Deduplicate — keep the first occurrence (which is the canonical one)
        continue;
      }

      const category = inferCategory(tool.name);
      // Determine execution kind based on category
      let executionKind: ToolEntry["executionKind"] = "browser-context";

      // Server-context tools are those that don't use browser APIs
      const serverContextCats = [
        "github", "rss", "exa", "reddit", "youtube", "twitter",
        "tensorart", "capability",
      ];
      // Also tools that are pure API calls
      const serverContextNames = [
        "get_weather", "youtube_search", "refine_prompt", "translate_prompt",
        "rewrite_prompt", "generate_crafter_prompt", "analyze_prompt",
        "generate_image", "generate_and_ingest", "abstract_image",
        "save_refiner_preset", "scrape_url", "scrape_url_playwright",
        "fetch_url", "open_web_page", "obsidian_search_notes", "obsidian_read_note",
        "obsidian_write_note", "obsidian_delete_note", "obsidian_list_tags",
        "obsidian_list_files", "obsidian_get_file", "capability_search",
        "capability_describe", "capability_execute", "capability_list",
        "capability_health",
      ];

      if (serverContextCats.includes(category) || serverContextNames.includes(tool.name)) {
        executionKind = "server-context";
      }

      allTools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        executionKind,
        filePath,
        sourceModule,
        category,
      });
      totalFound++;
    }
  }

  // ── Sort alphabetically by name ─────────────────────────────────────────
  allTools.sort((a, b) => a.name.localeCompare(b.name));

  // ── Output the config ──────────────────────────────────────────────────
  const config = { version: "1.0.0", tools: allTools };
  const generatedJson = JSON.stringify(config, null, 2) + "\n";
  const outPath = join(ROOT, "mcp-config.json");

  if (isDryRun) {
    // Print to stdout so the user can pipe/inspect
    console.log(generatedJson);
    console.log(`[generate-mcp-config] Dry-run: ${totalFound} tools (printed above).`);
    return;
  }

  if (isCheck) {
    if (!existsSync(outPath)) {
      console.log(`[generate-mcp-config] Check: no existing file at ${outPath} — generated ${totalFound} tools.`);
      console.log("  Run without --check to create it.");
      process.exit(1);
    }
    const currentJson = readFileSync(outPath, "utf-8");
    if (currentJson === generatedJson) {
      console.log(`[generate-mcp-config] Check: config is up to date (${totalFound} tools).`);
      process.exit(0);
    }
    // Diff mode: show additions (+) and removals (-) line by line
    const currentLines = currentJson.split("\n");
    const generatedLines = generatedJson.split("\n");
    console.log(`[generate-mcp-config] Check: config differs — ${totalFound} generated vs current tools.`);

    const maxLen = Math.max(currentLines.length, generatedLines.length);
    for (let i = 0; i < maxLen; i++) {
      const genLine = i < generatedLines.length ? generatedLines[i] : "";
      const curLine = i < currentLines.length ? currentLines[i] : "";
      if (genLine === curLine) continue;
      if (genLine.trim()) console.log(`  + ${genLine}`);
      if (curLine.trim()) console.log(`  - ${curLine}`);
    }
    console.log("");
    console.log("  Run without --check to overwrite, or review the diff above.");
    process.exit(1);
  }

  // Default: write
  writeFileSync(outPath, generatedJson, "utf-8");
  console.log(`[generate-mcp-config] Generated ${outPath} with ${totalFound} tools.`);
}

generate();
