import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createObsidianServer } from "@bitbonsai/mcpvault";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { resolve, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const _repoRoot = resolve(_thisDir, "..");

/** Express HTTP server port, set at startup. */
let _httpPort = 3001;

export interface KollektivMcpOptions {
  vaultPath?: string;
  port?: number;
  /** Port the Express HTTP server is listening on (default 3001).
   *  Used by server-context tools to call internal API endpoints. */
  httpPort?: number;
}

export interface KollektivMcpInstance {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

interface McpSubServer {
  name: string;
  transport: InMemoryTransport;
  tools: Array<{ name: string; [key: string]: any }>;
}

/** Schema for native tool entries in mcp-config.json */
interface McpConfig {
  version: string;
  tools: McpConfigTool[];
}

interface McpConfigTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  executionKind: "browser-context" | "server-context" | "hybrid";
  filePath: string;
  sourceModule: string;
  category: string;
  permissions?: string[];
}

/** Permissions that the caller must have to invoke a tool. */
const CALLER_PERMISSIONS = new Set<string>();

/**
 * Grant permissions to the caller (e.g., "screen:share", "control:grant").
 * Called when the browser side has verified the user has granted these.
 */
export function grantMcpPermissions(...perms: string[]): void {
  for (const p of perms) CALLER_PERMISSIONS.add(p);
}

/**
 * Revoke permissions.
 */
export function revokeMcpPermissions(...perms: string[]): void {
  for (const p of perms) CALLER_PERMISSIONS.delete(p);
}

/**
 * Check whether the caller has all required permissions.
 */
function checkPermissions(required: string[] | undefined): string | null {
  if (!required || required.length === 0) return null;
  const missing = required.filter((p) => !CALLER_PERMISSIONS.has(p));
  return missing.length > 0
    ? `Missing required permissions: ${missing.join(", ")}`
    : null;
}

// ─── Load native tool definitions from mcp-config.json ─────────────────

let _nativeConfig: McpConfig | null = null;

function loadNativeConfig(): McpConfig {
  if (_nativeConfig) return _nativeConfig;
  try {
    const configPath = resolve(_repoRoot, "mcp-config.json");
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const parsed: McpConfig = JSON.parse(raw);
      _nativeConfig = parsed;
      console.log(`[Kollektiv MCP] Loaded native tool config (${parsed.tools.length} tools)`);
      return parsed;
    }
    console.warn("[Kollektiv MCP] mcp-config.json not found — native tools will not be exposed");
    const fallback: McpConfig = { version: "1.0.0", tools: [] };
    _nativeConfig = fallback;
    return fallback;
  } catch (err) {
    console.warn("[Kollektiv MCP] Failed to load mcp-config.json:", err);
    const fallback: McpConfig = { version: "1.0.0", tools: [] };
    _nativeConfig = fallback;
    return fallback;
  }
}

// ─── Server-side tool executors ────────────────────────────────────────
// These run in the Node.js process and handle tools that do not require
// browser APIs (DOM, appEventBus, localStorage, etc.).
//
// Executors call either:
//   - External HTTP APIs directly (e.g., wttr.in for weather)
//   - The Express app's internal API endpoints (e.g., /api/reach/github)

const _serverExecutors = new Map<string, (args: Record<string, any>) => Promise<{
  content: { type: string; text: string }[];
  isError: boolean;
}>>();

function initServerExecutors(httpPort: number): void {
  const apiBase = `http://127.0.0.1:${httpPort}`;

  _serverExecutors.clear();

  // Helper: call an internal Express API route
  const callApi = async (path: string, body: Record<string, any>) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  };

  // ── get_weather ───────────────────────────────────────────────────────
  _serverExecutors.set("get_weather", async (args) => {
    const city = String(args.city || "");
    if (!city) {
      return { content: [{ type: "text", text: "City is required." }], isError: true };
    }
    try {
      const res = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h`,
      );
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Weather lookup failed: ${res.status}` }],
          isError: true,
        };
      }
      const text = await res.text();
      return {
        content: [{ type: "text", text: `Weather in ${city}: ${text.trim()}` }],
        isError: false,
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Weather lookup failed: ${e?.message || e}` }],
        isError: true,
      };
    }
  });

  // ── github_get_repo ───────────────────────────────────────────────────
  _serverExecutors.set("github_get_repo", async (args) => {
    const { ok, data } = await callApi("/api/reach/github", {
      op: "repo_info",
      owner: String(args.owner),
      repo: String(args.repo),
    });
    const text = ok ? JSON.stringify(data) : `Error: ${data?.error || "GitHub request failed"}`;
    return { content: [{ type: "text", text }], isError: !ok };
  });

  // ── github_search ────────────────────────────────────────────────────
  _serverExecutors.set("github_search", async (args) => {
    const { ok, data } = await callApi("/api/reach/github", {
      op: "search",
      type: args.type,
      query: String(args.query),
      maxResults: args.maxResults ? Number(args.maxResults) : undefined,
    });
    const text = ok ? JSON.stringify(data) : `Error: ${data?.error || "GitHub search failed"}`;
    return { content: [{ type: "text", text }], isError: !ok };
  });

  // ── github_get_file ──────────────────────────────────────────────────
  _serverExecutors.set("github_get_file", async (args) => {
    const { ok, data } = await callApi("/api/reach/github", {
      op: "file",
      owner: String(args.owner),
      repo: String(args.repo),
      path: args.path ? String(args.path) : undefined,
      ref: args.ref ? String(args.ref) : undefined,
    });
    if (!ok) {
      const text = `Error: ${data?.error || "GitHub file fetch failed"}`;
      return { content: [{ type: "text", text }], isError: true };
    }
    const contentText = `${data.content}${data.truncated ? "\n\n[...truncated]" : ""}`;
    return { content: [{ type: "text", text: contentText }], isError: false };
  });

  // ── rss_fetch ────────────────────────────────────────────────────────
  _serverExecutors.set("rss_fetch", async (args) => {
    const { ok, data } = await callApi("/api/reach/rss", {
      url: String(args.url),
      maxItems: args.maxItems ? Number(args.maxItems) : undefined,
    });
    const text = ok ? JSON.stringify(data) : `Error: ${data?.error || "RSS fetch failed"}`;
    return { content: [{ type: "text", text }], isError: !ok };
  });

  // ── exa_search ───────────────────────────────────────────────────────
  _serverExecutors.set("exa_search", async (args) => {
    const { ok, data } = await callApi("/api/reach/exa", args);
    const text = ok ? JSON.stringify(data) : `Error: ${data?.error || "Exa search failed"}`;
    return { content: [{ type: "text", text }], isError: !ok };
  });

  // ── reddit_fetch ─────────────────────────────────────────────────────
  _serverExecutors.set("reddit_fetch", async (args) => {
    const { ok, data } = await callApi("/api/reach/reddit", args);
    const text = ok ? JSON.stringify(data) : `Error: ${data?.error || "Reddit request failed"}`;
    return { content: [{ type: "text", text }], isError: !ok };
  });

  // ── youtube_get_transcript ───────────────────────────────────────────
  _serverExecutors.set("youtube_get_transcript", async (args) => {
    const { ok, data } = await callApi("/api/reach/youtube-transcript", {
      videoId: String(args.videoId),
      lang: args.lang ? String(args.lang) : undefined,
    });
    if (!ok) {
      return {
        content: [{
          type: "text",
          text: `Transcript unavailable: ${data?.error || "fetch blocked or disabled"}.`,
        }],
        isError: true,
      };
    }
    const text = (data.segments || []).map((s: any) => s.text).join(" ");
    return { content: [{ type: "text", text: text || "Transcript was empty." }], isError: false };
  });

  // ── twitter_get_tweet ────────────────────────────────────────────────
  _serverExecutors.set("twitter_get_tweet", async (args) => {
    const { ok, data } = await callApi("/api/reach/twitter", { tweetId: String(args.tweetId) });
    if (!ok) {
      return {
        content: [{ type: "text", text: `Could not fetch tweet: ${data?.error || "unknown error"}.` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(data.tweet) }], isError: false };
  });

  // ── web_search ──────────────────────────────────────────────────────
  // Calls the Express /api/web-search endpoint (multi-engine web search).
  _serverExecutors.set("web_search", async (args) => {
    const query = String(args.query || "");
    if (!query) {
      return { content: [{ type: "text", text: "Query is required." }], isError: true };
    }
    const body: Record<string, any> = { query };
    if (Array.isArray(args.engines)) body.engines = args.engines;
    if (args.fetch_content === true) body.fetchContent = true;
    try {
      const { ok, data } = await callApi("/api/web-search", body);
      if (!ok) {
        return {
          content: [{ type: "text", text: `Web search failed: ${data?.error || data?.message || "unknown error"}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        isError: false,
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Web search error: ${e?.message || e}` }],
        isError: true,
      };
    }
  });

  // ── scrape_url ────────────────────────────────────────────────────────
  // Calls the Express /api/scrape-url endpoint (server-side readability extraction).
  _serverExecutors.set("scrape_url", async (args) => {
    const url = String(args.url || "");
    if (!url) {
      return { content: [{ type: "text", text: "URL is required." }], isError: true };
    }
    try {
      const { ok, data } = await callApi("/api/scrape-url", { url, mode: "simple" });
      if (!ok || !data.success) {
        const errMsg = data?.error || "scrape failed";
        return { content: [{ type: "text", text: `Error scraping ${url}: ${errMsg}` }], isError: true };
      }
      const byline = [data.author && `Author: ${data.author}`, data.published && `Published: ${data.published}`, data.site && `Site: ${data.site}`].filter(Boolean).join(" | ");
      const text = `# ${data.title || url}\n${byline ? `${byline}\n\n` : ""}${data.content || "No readable content found."}`.slice(0, 50_000);
      return { content: [{ type: "text", text }], isError: false };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error scraping ${url}: ${e?.message || e}` }], isError: true };
    }
  });

  // ── scrape_url_playwright ─────────────────────────────────────────────
  // Calls the Express /api/scrape-url-playwright endpoint (headless browser rendering).
  _serverExecutors.set("scrape_url_playwright", async (args) => {
    const url = String(args.url || "");
    if (!url) {
      return { content: [{ type: "text", text: "URL is required." }], isError: true };
    }
    try {
      const { ok, data } = await callApi("/api/scrape-url-playwright", { url });
      if (!ok || !data.success) {
        const errMsg = data?.error || "Playwright scrape failed";
        return { content: [{ type: "text", text: `Error scraping ${url} with Playwright: ${errMsg}` }], isError: true };
      }
      const byline = [data.author && `Author: ${data.author}`, data.published && `Published: ${data.published}`, data.site && `Site: ${data.site}`].filter(Boolean).join(" | ");
      const text = `# ${data.title || url}\n${byline ? `${byline}\n\n` : ""}${data.content || "No readable content found."}`.slice(0, 50_000);
      return { content: [{ type: "text", text }], isError: false };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error scraping ${url} with Playwright: ${e?.message || e}` }], isError: true };
    }
  });

  // ── fetch_url / open_web_page ─────────────────────────────────────────
  // These use DOMParser and appEventBus which are browser-only — no server-side
  // executor needed. The Express server has no DOMParser or proxy-remote route
  // that returns readability-extracted markdown (only raw HTML proxy).
  // ── capability_* tools ───────────────────────────────────────────────
  // NOTE: The in-memory capabilityRegistry is NOT populated at runtime
  // (capabilityRegistry.register() is never called by app code). The
  // dispatchStep function in executionEngine.ts returns stubs for all
  // eight step kinds. The five capability_* assistant tools return empty
  // results. See ISSUE-47 for the full record.
  // ── tensorart_* tools ─────────────────────────────────────────────────
  // These require the tensorartService which runs in the browser.
  // ── obsidian_* tools ──────────────────────────────────────────────────
  // Already handled by the @bitbonsai/mcpvault sub-server.

  console.log(`[Kollektiv MCP] Initialized ${_serverExecutors.size} server-side tool executors`);
}

/** Convert a native McpConfigTool to the MCP SDK tool shape. */
function nativeToolToMcpSchema(tool: McpConfigTool) {
  return {
    name: tool.name,
    description: `${tool.description} [kind: ${tool.executionKind}]`,
    inputSchema: {
      type: "object",
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  };
}

/** Convert a native McpConfigTool input to MCP tool call response. */
async function nativeToolCallResponse(
  tool: McpConfigTool,
  args: Record<string, any>,
): Promise<{ content: { type: string; text: string }[]; isError: boolean }> {
  const missingPerms = checkPermissions(tool.permissions);
  if (missingPerms) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: missingPerms,
            tool: tool.name,
            hint:
              "This tool requires browser-context permissions. Use the Kollektiv app's assistant (chat or voice) to execute it.",
          }),
        },
      ],
      isError: true,
    };
  }

  // 1. Check server-side executor first
  const executor = _serverExecutors.get(tool.name);
  if (executor) {
    try {
      return await executor(args);
    } catch (e: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Server-side execution error: ${e?.message || e}`,
            tool: tool.name,
          }),
        }],
        isError: true,
      };
    }
  }

  // 2. Browser-context tools cannot execute server-side
  if (tool.executionKind === "browser-context") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `${tool.name} requires a browser context (DOM, appEventBus, or localStorage) to execute.`,
            tool: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            args,
            hint:
              "This native assistant tool cannot be called from the MCP server directly. Use the Kollektiv app's chat/voice assistant instead.",
          }),
        },
      ],
      isError: true,
    };
  }

  // 3. Server-context tools without an executor
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: false,
          error: `Server-side execution for ${tool.name} is not yet implemented.`,
          tool: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          args,
          hint:
            "This tool can be called server-side but the executor is not wired yet. Use the Kollektiv app's assistant instead.",
        }),
      },
    ],
    isError: true,
  };
}

// ─── Existing session-scoped components ──────────────────────────────────

/** Wraps an InMemoryTransport pair so concurrent callers don't clobber
 *  each other's onmessage handler.  Each call queues internally and
 *  resolves with the matching JSON-RPC response by ID. */
class SubServerClient {
  private transport: InMemoryTransport;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 0;

  constructor(transport: InMemoryTransport, _name: string) {
    this.transport = transport;
    transport.onmessage = (msg: any) => {
      if (msg?.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg);
      }
    };
  }

  async send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  close() {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Sub-server closed"));
    }
    this.pending.clear();
  }
}

async function createSubServer(
  name: string,
  server: Server
): Promise<McpSubServer> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await clientTransport.start();
  const client = new SubServerClient(clientTransport, name);
  const result = await client.send("tools/list");
  const tools = result.result?.tools || [];
  return { name, transport: clientTransport, tools };
}

/** Read the full body of a Node.js IncomingMessage as a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ─── Session-scoped components ────────────────────────────────────────────

interface Session {
  transport: StreamableHTTPServerTransport;
  server: Server;
}

function createSessionTransport(sessions: Map<string, Session>): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessionclosed: (sessionId: string | undefined) => {
      if (sessionId) {
        const sess = sessions.get(sessionId);
        if (sess) {
          sessions.delete(sessionId);
        }
      }
    },
  });
}

function createSessionServer(
  subServers: McpSubServer[],
  toolToServer: Map<string, McpSubServer>,
): Server {
  const server = new Server(
    { name: "kollektiv-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Load native tools config
    const nativeConfig = loadNativeConfig();
    const nativeTools = nativeConfig.tools.map((t) =>
      nativeToolToMcpSchema(t)
    );

    // Collect sub-server tools
    const subServerTools: Array<{ name: string; [key: string]: any }> = [];
    for (const sub of subServers) {
      subServerTools.push(...sub.tools);
    }

    const allTools = [...nativeTools, ...subServerTools];
    console.log(
      `[Kollektiv MCP] ListTools: ${nativeTools.length} native + ${subServerTools.length} sub-server = ${allTools.length} total`,
    );
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    // 1. Check if it's a native tool
    const nativeConfig = loadNativeConfig();
    const nativeTool = nativeConfig.tools.find((t) => t.name === toolName);
    if (nativeTool) {
      return await nativeToolCallResponse(nativeTool, args || {});
    }

    // 2. Check sub-servers
    const sub = toolToServer.get(toolName);
    if (!sub) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }
    try {
      const client = new SubServerClient(sub.transport, toolName);
      const result = await client.send("tools/call", {
        name: toolName,
        arguments: args,
      });
      return result.result || { content: [] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startKollektivMcp(
  options: KollektivMcpOptions
): Promise<KollektivMcpInstance> {
  const vaultPath = options.vaultPath ? resolve(options.vaultPath) : undefined;
  const port = options.port ?? 3012;
  _httpPort = options.httpPort ?? 3001;

  // Initialize server-side tool executors
  initServerExecutors(_httpPort);

  // ── Shared sub-servers (created once, reused across sessions) ──────────

  const subServers: McpSubServer[] = [];

  if (vaultPath && existsSync(vaultPath)) {
    try {
      const obsidianServer = createObsidianServer(vaultPath, {
        name: "kollektiv-obsidian-vault",
        version: "1.0.0",
      });
      const sub = await createSubServer("obsidian", obsidianServer);
      subServers.push(sub);
      console.log(`[Kollektiv MCP] Obsidian vault tools loaded (${sub.tools.length} tools)`);
    } catch (err) {
      console.log(`[Kollektiv MCP] Obsidian vault tools not available: ${err instanceof Error ? err.message : err}`);
    }
  } else if (vaultPath) {
    console.log(`[Kollektiv MCP] Obsidian vault path not found: ${vaultPath} — skipping`);
  } else {
    console.log(`[Kollektiv MCP] OBSIDIAN_VAULT_PATH not set — skipping Obsidian tools`);
  }

  try {
    const { createConnection } = await import("@playwright/mcp");
    const playwrightServer = await createConnection({
      capabilities: ["core", "network", "vision", "pdf", "devtools"],
    });
    const sub = await createSubServer("playwright", playwrightServer);
    subServers.push(sub);
    console.log(`[Kollektiv MCP] Playwright browser tools loaded (${sub.tools.length} tools)`);
  } catch (err) {
    console.log(`[Kollektiv MCP] Playwright tools not available: ${err instanceof Error ? err.message : err}`);
  }

  const toolToServer = new Map<string, McpSubServer>();
  for (const sub of subServers) {
    for (const tool of sub.tools) {
      toolToServer.set(tool.name, sub);
    }
  }

  // ── Multi-session transport routing ────────────────────────────────────

  const sessions = new Map<string, Session>();

  const httpServer = createHttpServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, MCP-Session-ID, Accept"
      );
      res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      let body: string;
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read request body" }));
        return;
      }

      let parsedBody: any;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
      const isInitialize = messages.some(
        (m: any) => m.method === "initialize",
      );

      const rawSessionId = req.headers["mcp-session-id"];
      const sessionId =
        typeof rawSessionId === "string"
          ? rawSessionId
          : Array.isArray(rawSessionId)
            ? rawSessionId[0]
            : undefined;

      if (!isInitialize) {
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32001, message: "Session not found" },
              id: null,
            }),
          );
          return;
        }
        await session.transport.handleRequest(req, res, parsedBody);
        return;
      }

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, parsedBody);
        return;
      }

      const transport = createSessionTransport(sessions);
      const server = createSessionServer(subServers, toolToServer);
      await server.connect(transport);

      await transport.handleRequest(req, res, parsedBody);

      const newSessionId = transport.sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, { transport, server });
      }
    },
  );

  return new Promise((resolvePromise, reject) => {
    httpServer.listen(port, "127.0.0.1", () => {
      const nativeConfig = loadNativeConfig();
      console.log(
        `[Kollektiv MCP] serving on http://127.0.0.1:${port} with ${subServers.length} sub-server(s) ` +
        `(${toolToServer.size} sub-server tools + ${nativeConfig.tools.length} native tools = ${toolToServer.size + nativeConfig.tools.length} total)`,
      );
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        port,
        stop: async () => {
          for (const [, session] of sessions) {
            await session.transport.close();
            await session.server.close();
          }
          sessions.clear();
          httpServer.close();
          for (const sub of subServers) {
            sub.transport.close();
          }
        },
      });
    });
    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
  });
}
