import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createObsidianServer } from "@bitbonsai/mcpvault";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export interface KollektivMcpOptions {
  vaultPath?: string;
  port?: number;
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
    const allTools: Array<{ name: string; [key: string]: any }> = [];
    for (const sub of subServers) {
      allTools.push(...sub.tools);
    }
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;
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
  //
  // Each incoming initialize request gets its own StreamableHTTPServerTransport
  // + Server pair.  Subsequent requests carry the mcp-session-id header and
  // are routed to the correct session.  This lets the browser page be refreshed
  // without getting "Server already initialized" errors.

  const sessions = new Map<string, Session>();

  const httpServer = createHttpServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, MCP-Session-ID, Accept"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Read body once so we can inspect it before handing off to the transport
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

      // Extract session ID from request headers
      const rawSessionId = req.headers["mcp-session-id"];
      const sessionId =
        typeof rawSessionId === "string"
          ? rawSessionId
          : Array.isArray(rawSessionId)
            ? rawSessionId[0]
            : undefined;

      // ── Route to existing session ──────────────────────────────────────
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

      // ── New session (initialize request) ───────────────────────────────
      //
      // If the client includes a session ID that we recognise, resume that
      // session instead of creating a brand-new one (handles the case where
      // the front-end re-initialises after a reconnect).
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, parsedBody);
        return;
      }

      // Create transport + server for a brand-new session
      const transport = createSessionTransport(sessions);
      const server = createSessionServer(subServers, toolToServer);
      await server.connect(transport);

      // Pass the pre-parsed body so the transport doesn't try to re-read
      await transport.handleRequest(req, res, parsedBody);

      // Capture the session ID that the transport generated
      const newSessionId = transport.sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, { transport, server });
      }
    },
  );

  return new Promise((resolvePromise, reject) => {
    httpServer.listen(port, "127.0.0.1", () => {
      console.log(
        `[Kollektiv MCP] serving on http://127.0.0.1:${port} with ${subServers.length} sub-server(s) (${toolToServer.size} total tools)`,
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
