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

// Track per-server MCP session state
interface SessionState {
  initialized: boolean;
  sessionId?: string;
}
const sessionStates = new Map<string, SessionState>();

/** localStorage key prefix for persisting MCP session IDs across page reloads. */
const LS_SESSION_PREFIX = "kollektiv_mcp_session_";

/** Escape a server URL so it can be used as a localStorage key. */
function lsKey(url: string): string {
  return LS_SESSION_PREFIX + url.replace(/[^a-zA-Z0-9._~-]/g, "_");
}

/**
 * Persist the session ID for a server URL to localStorage so it survives
 * page refresh.  The server-side multi-session transport will recognise
 * the session ID on reconnect and avoid "Server already initialized".
 */
function persistSessionId(url: string, sessionId: string): void {
  try {
    localStorage.setItem(lsKey(url), sessionId);
  } catch {
    // localStorage may be unavailable (private browsing, quota)
  }
}

/** Clear a persisted session ID from localStorage. */
function clearPersistedSessionId(url: string): void {
  try {
    localStorage.removeItem(lsKey(url));
  } catch {
    // ignore
  }
}

/**
 * Restore session state from localStorage if available.
 * Returns true if a persisted session was found and loaded.
 */
function tryRestoreSession(url: string): boolean {
  if (sessionStates.has(url)) return true; // already loaded
  try {
    const stored = localStorage.getItem(lsKey(url));
    if (stored) {
      sessionStates.set(url, { initialized: true, sessionId: stored });
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Parse an SSE (Server-Sent Events) response text and extract JSON from data: fields.
 */
function parseSseResponse(sseText: string): { sessionId?: string; jsonData?: any; error?: string } {
  let lastEventId: string | undefined;
  let jsonData: string | undefined;

  for (const line of sseText.split('\n')) {
    if (line.startsWith('id: ')) {
      lastEventId = line.slice(4).trim();
    } else if (line.startsWith('data: ')) {
      const dataStr = line.slice(6).trim();
      if (dataStr) {
        jsonData = dataStr;
      }
    }
  }

  if (jsonData) {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed.error) {
        return { sessionId: lastEventId, error: parsed.error.message || JSON.stringify(parsed.error), jsonData: parsed };
      }
      return { sessionId: lastEventId, jsonData: parsed };
    } catch {
      return { sessionId: lastEventId, jsonData: undefined, error: 'Failed to parse SSE JSON data' };
    }
  }

  // Check for plain JSON responses (some servers fall back to this)
  const trimmed = sseText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.error) {
        return { error: parsed.error.message || JSON.stringify(parsed.error), jsonData: parsed };
      }
      return { jsonData: parsed };
    } catch {
      // not json
    }
  }

  return { sessionId: lastEventId, error: undefined };
}

/**
 * Perform the MCP initialize handshake so the server accepts tools/list etc.
 */
async function ensureSession(url: string, headers?: Record<string, string>): Promise<void> {
  const state = sessionStates.get(url);
  if (state?.initialized) return;

  // Before sending a fresh initialize, try restoring a persisted session ID
  // from localStorage.  If the server still has that session alive, we skip
  // the expensive handshake and go straight to tools/list etc.
  if (tryRestoreSession(url)) return;

  const initResult = await rawRequest(url, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'kollektiv', version: '1.0.0' },
  }, headers);

  if (!initResult.success) {
    throw new Error(initResult.error || 'MCP initialize handshake failed');
  }

  // Send notifications/initialized — fire-and-forget. Some servers (e.g. Apify)
  // don't support it and return an error; that's fine, we ignore it.
  try {
    await rawRequest(url, 'notifications/initialized', {}, headers);
  } catch {
    // notification ignored by server — not an error
  }

  sessionStates.set(url, { initialized: true, sessionId: initResult.sessionId });

  // Persist the session ID so future page loads can reconnect without
  // a fresh initialize handshake.
  if (initResult.sessionId) {
    persistSessionId(url, initResult.sessionId);
  }
}

/**
 * Low-level JSON-RPC call (no auto-initialize).
 */
async function rawRequest(
  url: string,
  method: string,
  params: Record<string, any> = {},
  headers?: Record<string, string>,
): Promise<{ success: boolean; data?: any; error?: string; sessionId?: string }> {
  const cleanUrl = url.trim();
  let mcpHostname = '';
  try { mcpHostname = new URL(cleanUrl).hostname; } catch {}

  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    ...headers,
  };

  const sessionState = sessionStates.get(cleanUrl);
  if (sessionState?.sessionId) {
    mergedHeaders['mcp-session-id'] = sessionState.sessionId;
  }

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

  async function handleResponse(response: Response): Promise<{ success: boolean; data?: any; error?: string; sessionId?: string }> {
    // Extract session ID from response headers (Streamable HTTP)
    const responseSessionId = response.headers.get('mcp-session-id') || undefined;

    // If session ID changed, store it (both in-memory and persisted)
    if (responseSessionId && responseSessionId !== sessionState?.sessionId) {
      const existing = sessionStates.get(cleanUrl) || { initialized: false };
      sessionStates.set(cleanUrl, { ...existing, sessionId: responseSessionId });
      persistSessionId(cleanUrl, responseSessionId);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!text.trim()) {
      return { success: true, data: {}, sessionId: responseSessionId };
    }

    if (contentType.includes('text/event-stream')) {
      // Streamable HTTP: parse SSE response
      const parsed = parseSseResponse(text);
      if (parsed.error) {
        return { success: false, error: parsed.error, sessionId: parsed.sessionId || responseSessionId };
      }
      if (parsed.jsonData) {
        return { success: true, data: parsed.jsonData, sessionId: parsed.sessionId || responseSessionId };
      }
      return { success: true, data: {}, sessionId: parsed.sessionId || responseSessionId };
    }

    // Regular JSON response
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) {
        return { success: false, error: parsed.error.message || JSON.stringify(parsed.error), sessionId: responseSessionId };
      }
      return { success: true, data: parsed, sessionId: responseSessionId };
    } catch {
      return { success: false, error: 'Invalid response from MCP server', sessionId: responseSessionId };
    }
  }

  if (isLocalHost) {
    try {
      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers: mergedHeaders,
        body,
      });
      return await handleResponse(response);
    } catch {
      // fall through to proxy
    }
  }

  const response = await fetch('/api/mcp/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: cleanUrl,
      method,
      params,
      headers: mergedHeaders,
    }),
  });

  if (!response.ok) {
    return { success: false, error: `HTTP error ${response.status}` };
  }

  // Parse proxy response (proxy normalizes SSE to JSON)
  try {
    const proxyResult = await response.json();
    return {
      success: proxyResult.success !== false,
      data: proxyResult.data,
      error: proxyResult.error,
      sessionId: proxyResult.sessionId,
    };
  } catch {
    return { success: false, error: 'Invalid proxy response' };
  }
}

/**
 * Base helper to issue MCP request with automatic session initialization.
 * Retries initialization once if the server rejects the request.
 */
async function executeMcpRequest(
  serverUrl: string,
  method: string,
  params: Record<string, any> = {},
  headers?: Record<string, string>,
): Promise<any> {
  await ensureSession(serverUrl, headers);
  const result = await rawRequest(serverUrl, method, params, headers);
  if (!result.success && result.error?.toLowerCase?.().includes?.('session')) {
    // Stale session — clear both in-memory and persisted state, then retry
    sessionStates.delete(serverUrl);
    clearPersistedSessionId(serverUrl);
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
