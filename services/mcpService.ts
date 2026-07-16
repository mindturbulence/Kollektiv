export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: {
    name: string;
    description?: string;
    required?: boolean;
  }[];
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Track per-server MCP session initialization
const initializedSessions = new Set<string>();

/**
 * Perform the MCP initialize handshake so the server accepts tools/list etc.
 * The bridge maintains a persistent stdio connection; once initialized the
 * session stays initialized for subsequent calls.
 */
async function ensureSession(url: string, headers?: Record<string, string>): Promise<void> {
  if (initializedSessions.has(url)) return;

  const initResult = await rawRequest(url, 'initialize', {
    protocolVersion: '0.1.0',
    capabilities: {},
    clientInfo: { name: 'kollektiv', version: '1.0.0' },
  }, headers);

  if (!initResult.success) {
    throw new Error(initResult.error || 'MCP initialize handshake failed');
  }

  await rawRequest(url, 'notifications/initialized', {}, headers);

  initializedSessions.add(url);
}

/**
 * Low-level JSON-RPC call (no auto-initialize).
 */
async function rawRequest(
  url: string,
  method: string,
  params: Record<string, any> = {},
  headers?: Record<string, string>,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const cleanUrl = url.trim();
  let mcpHostname = '';
  try { mcpHostname = new URL(cleanUrl).hostname; } catch {}

  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...headers,
  };

  const jsonRpcPayload: Record<string, any> = { jsonrpc: '2.0', id: Date.now(), method, params };
  if (method === 'notifications/initialized') {
    delete jsonRpcPayload.id;
  }
  const body = JSON.stringify(jsonRpcPayload);

  const isLocalHost = mcpHostname === 'localhost' ||
                      mcpHostname === '127.0.0.1' ||
                      mcpHostname === '0.0.0.0' ||
                      mcpHostname === '[::1]' || mcpHostname === '::1' ||
                      mcpHostname.startsWith('192.168.') ||
                      mcpHostname.startsWith('10.');

  if (isLocalHost) {
    try {
      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers: mergedHeaders,
        body,
      });
      if (response.ok) {
        const text = await response.text();
        if (!text) return { success: true, data: {} };
        return { success: true, data: JSON.parse(text) };
      }
    } catch {
      // fall through to proxy
    }
  }

  const response = await fetch('/api/mcp/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: cleanUrl, method, params, headers }),
  });

  if (!response.ok) return { success: false, error: `HTTP error ${response.status}` };
  return await response.json();
}

/**
 * Base helper to issue MCP request with automatic session initialization.
 * Retries initialization once if the server rejects the request with a
 * "session initialization" error (e.g. after bridge restart).
 */
async function executeMcpRequest(
  serverUrl: string,
  method: string,
  params: Record<string, any> = {},
  headers?: Record<string, string>,
): Promise<any> {
  await ensureSession(serverUrl, headers);
  const result = await rawRequest(serverUrl, method, params, headers);
  if (!result.success && result.error?.includes?.('session initialization')) {
    initializedSessions.delete(serverUrl);
    await ensureSession(serverUrl, headers);
    return rawRequest(serverUrl, method, params, headers);
  }
  return result;
}

export const mcpService = {
  async ping(serverUrl: string, headers?: Record<string, string>): Promise<boolean> {
    const json = await executeMcpRequest(serverUrl, 'tools/list', {}, headers);
    if (!json.success) throw new Error(json.error || 'Request unsuccessful');
    return true;
  },

  async listTools(serverUrl: string, headers?: Record<string, string>): Promise<MCPTool[]> {
    try {
      const json = await executeMcpRequest(serverUrl, 'tools/list', {}, headers);
      if (!json.success) throw new Error(json.error || 'Request failed');
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.tools || (Array.isArray(resultObj) ? resultObj : []);
    } catch (err: any) {
      console.error("Failed to list MCP tools:", err);
      throw err;
    }
  },

  async callTool(serverUrl: string, name: string, args: Record<string, any>, headers?: Record<string, string>): Promise<any> {
    try {
      const json = await executeMcpRequest(serverUrl, 'tools/call', { name, arguments: args }, headers);
      if (!json.success) throw new Error(json.error || 'Request failed');
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.content || resultObj;
    } catch (err: any) {
      console.error(`Failed to call MCP tool ${name}:`, err);
      throw err;
    }
  },

  async listPrompts(serverUrl: string, headers?: Record<string, string>): Promise<MCPPrompt[]> {
    try {
      const json = await executeMcpRequest(serverUrl, 'prompts/list', {}, headers);
      if (!json.success) throw new Error(json.error || 'Request failed');
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.prompts || (Array.isArray(resultObj) ? resultObj : []);
    } catch (err: any) {
      console.error("Failed to list MCP prompts:", err);
      return [];
    }
  },

  async listResources(serverUrl: string, headers?: Record<string, string>): Promise<MCPResource[]> {
    try {
      const json = await executeMcpRequest(serverUrl, 'resources/list', {}, headers);
      if (!json.success) throw new Error(json.error || 'Request failed');
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.resources || (Array.isArray(resultObj) ? resultObj : []);
    } catch (err: any) {
      console.error("Failed to list MCP resources:", err);
      return [];
    }
  },
};
