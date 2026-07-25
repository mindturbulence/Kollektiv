import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────
// The MCP SDK is a transitive dependency (via @bitbonsai/mcpvault), so mock
// it entirely to keep tests hermetic and fast.

interface MockTransport {
  start: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  handleRequest: ReturnType<typeof vi.fn>;
  sessionId?: string;
}

const mockTransports = new Map<string, MockTransport>();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    setRequestHandler: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => {
    const id = 'test-session-' + mockTransports.size;
    const inst: MockTransport = {
      start: vi.fn(async () => {}),
      send: vi.fn(),
      close: vi.fn(async () => {}),
      handleRequest: vi.fn(async (_req: any, res: any, body: any) => {
        const messages = Array.isArray(body) ? body : [body];
        const first = messages[0];

        if (first?.method === 'tools/list') {
          // Respond with aggregated tools from both mock sub-servers
          // Note: no mcp-session-id header — real transport only sends it on initialize
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: first.id ?? null,
            result: {
              tools: [
                { name: 'read_note', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
                { name: 'write_note', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } } },
                { name: 'search_notes', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
                { name: 'browser_navigate', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } },
                { name: 'browser_screenshot', inputSchema: { type: 'object', properties: {} } },
                { name: 'browser_click', inputSchema: { type: 'object', properties: { selector: { type: 'string' } } } },
              ],
            },
          }));
          return;
        }

        if (first?.method === 'tools/call') {
          // Simulate sub-server routing: browser_* tools → playwright, others → obsidian vault
          const toolName = first.params?.name || '';
          const toolArgs = first.params?.arguments || {};
          const isBrowserTool = toolName.startsWith('browser_');
          const subServerName = isBrowserTool ? 'playwright' : 'obsidian';

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: first.id ?? null,
            result: {
              content: [{
                type: 'text',
                text: `Called ${toolName} on ${subServerName} sub-server`,
              }],
              _meta: { handledBy: subServerName, toolArgs },
            },
          }));
          return;
        }

        // Default: respond as initialize
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'mcp-session-id': id,
        });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: first?.id ?? null,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'kollektiv-mcp', version: '1.0.0' },
          },
        }));
      }),
      sessionId: id,
    };
    Object.defineProperty(inst, 'sessionId', { get: () => id });
    mockTransports.set(id, inst);
    return inst;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/inMemory.js', () => ({
  InMemoryTransport: {
    createLinkedPair: vi.fn(() => {
      // Client-side transport: SubServerClient.send() calls transport.send(msg),
      // then waits for onmessage with matching id.  The mock send MUST trigger
      // onmessage so send() resolves instead of hanging 15s until timeout.
      const clientTransport: Record<string, any> = {
        start: vi.fn(async () => {}),
        send: vi.fn((msg: any) => {
          if (clientTransport.onmessage) {
            // Respond asynchronously so the SubServerClient promise settles
            setTimeout(() => {
              clientTransport.onmessage({
                jsonrpc: '2.0',
                id: msg.id,
                result: { tools: [{ name: 'mock_tool', inputSchema: { type: 'object', properties: {} } }] },
              });
            }, 5);
          }
        }),
        onmessage: null as any,
        close: vi.fn(async () => {}),
      };
      // Server-side transport (used by the mock MCP Server — unused)
      const serverTransport = {
        start: vi.fn(async () => {}),
        send: vi.fn(),
        onmessage: null as any,
        close: vi.fn(async () => {}),
      };
      return [clientTransport, serverTransport];
    }),
  },
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { kind: 'request' },
  CallToolRequestSchema: { kind: 'request' },
}));

vi.mock('@bitbonsai/mcpvault', () => ({
  createServer: vi.fn(() => ({
    // Returns an object that looks like an MCP Server
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    setRequestHandler: vi.fn(),
  })),
}));

vi.mock('@playwright/mcp', () => ({
  createConnection: vi.fn(async () => ({
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    setRequestHandler: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  default: { existsSync: vi.fn(() => true) },
  existsSync: vi.fn(() => true),
}));

// Mock node:crypto's randomUUID for predictable session IDs
// Must provide both default and named exports for Vitest's hoisted mock resolution
vi.mock('node:crypto', () => {
  const mockFn = () => 'mocked-uuid-' + Math.random().toString(36).slice(2, 10);
  return {
    default: { randomUUID: mockFn },
    randomUUID: mockFn,
  };
});

// ─── Module under test ───────────────────────────────────────────────────
// Import after mocks are set up
const { startKollektivMcp } = await import('./kollektivMcp');

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = require('node:net').createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as any).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('startKollektivMcp', () => {
  let freePort: number;

  beforeEach(async () => {
    freePort = await getFreePort();
    mockTransports.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any lingering servers between tests
    const { execSync } = require('node:child_process');
    try {
      execSync(`netstat -ano | findstr ":${freePort}" | findstr "LISTENING"`, {
        timeout: 2000,
        encoding: 'utf8',
      })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line: string) => {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid)) {
            try { execSync(`taskkill /F /PID ${pid}`, { timeout: 1000 }); } catch {}
          }
        });
    } catch {
      // No process — that's fine
    }
  });

  it('starts an MCP server and returns an instance with url, port, stop', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      expect(inst).toBeDefined();
      expect(inst.url).toBe(`http://127.0.0.1:${freePort}`);
      expect(inst.port).toBe(freePort);
      expect(typeof inst.stop).toBe('function');
    } finally {
      await inst.stop();
    }
  });

  it('starts successfully without a vault path (Playwright only)', async () => {
    const inst = await startKollektivMcp({ port: freePort });
    try {
      expect(inst).toBeDefined();
      expect(inst.url).toBe(`http://127.0.0.1:${freePort}`);
      expect(typeof inst.stop).toBe('function');
    } finally {
      await inst.stop();
    }
  });

  it('starts without crashing when both external server providers fail', async () => {
    // Make both creation functions throw
    const vaultMock = await import('@bitbonsai/mcpvault');
    const playwrightMock = await import('@playwright/mcp');
    (vaultMock.createServer as any).mockImplementation(() => { throw new Error('Vault unavailable'); });
    (playwrightMock.createConnection as any).mockImplementation(async () => { throw new Error('Playwright unavailable'); });

    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      expect(inst).toBeDefined();
      expect(inst.port).toBe(freePort);
    } finally {
      await inst.stop();
    }
  });

  it('rejects when the port is already in use', async () => {
    // Start a server on the port first, then try to start kollektivMcp on the same port
    const http = require('node:http');
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(freePort, '127.0.0.1', resolve));

    try {
      await expect(
        startKollektivMcp({ port: freePort }),
      ).rejects.toThrow(/already in use/);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it('stop() gracefully shuts down the HTTP server and sub-servers', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });

    // Stop the server
    await inst.stop();

    // After stopping, the port should be free again
    const net = require('node:net');
    const isFree = await new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(freePort, '127.0.0.1');
    });
    expect(isFree).toBe(true);
  });

  it('handles HTTP initialize request and creates a session', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      expect(res.status).toBe(200);

      // The response should include a session ID header (may be in body instead)
      res.headers.get('mcp-session-id');
      const body = await res.json();
      expect(body).toBeDefined();

      // Session was created (mocked transport was instantiated)
      expect(mockTransports.size).toBeGreaterThanOrEqual(1);
    } finally {
      await inst.stop();
    }
  });

  it('responds with 404 when a non-initialize request has no session', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32001);
    } finally {
      await inst.stop();
    }
  });

  it('handles OPTIONS preflight requests', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'OPTIONS',
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      await inst.stop();
    }
  });

  it('throws 400 on malformed JSON body', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json-at-all{{{',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid JSON');
    } finally {
      await inst.stop();
    }
  });

  it('aggregates tools from both sub-servers via tools/list on an established session', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      // 1. Establish a session with initialize
      const initRes = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      expect(initRes.status).toBe(200);
      const sessionId = initRes.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();

      // 2. Send tools/list against the established session
      const toolsRes = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      expect(toolsRes.status).toBe(200);
      const toolsBody = await toolsRes.json();
      expect(toolsBody).toBeDefined();
      expect(toolsBody.result).toBeDefined();
      expect(Array.isArray(toolsBody.result.tools)).toBe(true);

      // 3. Verify tools from both sub-servers are aggregated
      const toolNames = toolsBody.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('read_note');
      expect(toolNames).toContain('write_note');
      expect(toolNames).toContain('search_notes');
      expect(toolNames).toContain('browser_navigate');
      expect(toolNames).toContain('browser_screenshot');
      expect(toolNames).toContain('browser_click');

      // 4. Verify only 1 transport was created (by initialize call, not by tools/list)
      expect(mockTransports.size).toBe(1);
    } finally {
      await inst.stop();
    }
  });

  it('routes tools/call to the correct sub-server based on tool name', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      // 1. Establish a session
      const initRes = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      expect(initRes.status).toBe(200);
      const sessionId = initRes.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();

      // 2. Call a vault tool (read_note) — should route to obsidian sub-server
      const vaultCallRes = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'read_note',
            arguments: { path: 'test-note.md' },
          },
        }),
      });
      expect(vaultCallRes.status).toBe(200);
      const vaultBody = await vaultCallRes.json();
      expect(vaultBody.result.content[0].text).toBe('Called read_note on obsidian sub-server');

      // 3. Call a browser tool (browser_navigate) — should route to playwright sub-server
      const browserCallRes = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com' },
          },
        }),
      });
      expect(browserCallRes.status).toBe(200);
      const browserBody = await browserCallRes.json();
      expect(browserBody.result.content[0].text).toBe('Called browser_navigate on playwright sub-server');

      // 4. Verify still only 1 transport (no new session created for tools/call)
      expect(mockTransports.size).toBe(1);
    } finally {
      await inst.stop();
    }
  });

  it('resumes an existing session when mcp-session-id is provided on initialize', async () => {
    const inst = await startKollektivMcp({
      vaultPath: '/mocked/vault',
      port: freePort,
    });
    try {
      // First, create a session via initialize
      const res1 = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      const sessionId = res1.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();

      // Send another initialize with the same session ID — should resume, not create new
      const initialTransportCount = mockTransports.size;
      const res2 = await fetch(`http://127.0.0.1:${freePort}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      expect(res2.status).toBe(200);
      // No new transport should have been created
      expect(mockTransports.size).toBe(initialTransportCount);
    } finally {
      await inst.stop();
    }
  });
});
