import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import http from "http";
import net from "net";
import multer from "multer";
import { execFile, spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
import { DEFAULT_ANTHROPIC_MODEL } from "./constants/llmDefaults";
import { chromeLauncher } from "./services/chromeLauncher";
import { startKollektivMcp, type KollektivMcpInstance } from "./services/kollektivMcp";

/**
 * Try to free a TCP port by killing whatever process is listening on it.
 * Returns true if the port is now free, false if it couldn't be freed.
 * Works on Windows via netstat + taskkill.
 */
function freePort(port: number): boolean {
  try {
    const stdout = execSync(
      `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
      { encoding: "utf8", timeout: 5000 },
    );
    // Parse PID from the last column of the first matching line
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 });
        console.log(`[Port] Killed PID ${pid} to free port ${port}.`);
      }
    }
    return true;
  } catch {
    // No process found listening on this port — that's fine
    return true;
  }
}

/**
 * Probe a TCP port to see if it's available.
 */
function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, host);
  });
}

const PLAYWRIGHT_MCP_PORT = 8931;
const PLAYWRIGHT_MCP_FALLBACK_PORT = 8932;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7500;
  // Explicit opt-in only: HOST=0.0.0.0 for containerized/cloud runs. Never inferred from PORT.
  const HOST = process.env.HOST || "127.0.0.1";

  // Reject cross-origin browser requests. This server proxies traffic with
  // auth headers (Google, Anthropic, MCP, CDP), so only the Kollektiv
  // front-end served from this same host may call it. Same-origin GETs send
  // no Origin header; same-origin POSTs send one that matches Host.
  //
  // WebSocket upgrade requests (Vite HMR, etc.) must bypass this check:
  // the browser sends `Upgrade: websocket` which is NOT an API call and has
  // no auth headers to leak. Blocking it would cause Vite's HMR client to
  // fall back to a full page reload, creating a reload loop.
  app.use((req, res, next) => {
    const upgrade = req.headers.upgrade;
    if (upgrade && typeof upgrade === 'string' && upgrade.toLowerCase() === 'websocket') {
      return next();
    }
    const origin = req.headers.origin;
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.headers.host) return next();
    } catch { /* malformed Origin falls through to 403 */ }
    res.status(403).json({ error: "Cross-origin requests are not allowed" });
  });

  // Proxy for Google Drive / Google APIs (Bypasses body parsing on GETs to avoid hangs)
  app.use("/google-api", async (req, res) => {
    const start = Date.now();
    const subPath = req.url; // e.g. /drive/v3/files?q=... or /oauth2/v3/userinfo
    const targetUrl = `https://www.googleapis.com${subPath}`;
    console.log(`[Google-API Proxy] >>> ${req.method} ${targetUrl}`);
    
    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value && typeof value === 'string') {
          const lowerKey = key.toLowerCase();
          if (lowerKey !== 'host' && lowerKey !== 'connection' && lowerKey !== 'origin' && lowerKey !== 'referer') {
            headers[key] = value;
          }
        }
      }

      const fetchOptions: any = {
        method: req.method,
        headers: headers
      };

      const hasContent = req.headers['content-length'] && parseInt(req.headers['content-length'] as string, 10) > 0;
      const isChunked = req.headers['transfer-encoding'];

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && (hasContent || isChunked)) {
        // Since this route runs before express.json(), we can reliably read the untouched raw request stream
        const bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', (err) => reject(err));
        });
        if (bodyBuffer.length > 0) {
          fetchOptions.body = bodyBuffer;
          console.log(`[Google-API Proxy] Request body size: ${bodyBuffer.length} bytes.`);
        } else {
          console.warn(`[Google-API Proxy] Expected body but bodyBuffer is empty (0 bytes)`);
        }
      }

      const response = await fetch(targetUrl, fetchOptions);
      console.log(`[Google-API Proxy] <<< ${req.method} ${targetUrl} -> Status ${response.status} (${Date.now() - start}ms)`);

      if (response.status >= 400) {
        try {
          const cloneRes = response.clone();
          const errText = await cloneRes.text();
          console.error(`[Google-API Proxy] Error response from Google (${response.status}):`, errText);
        } catch (e) {
          console.error(`[Google-API Proxy] Error response clone/read failed:`, e);
        }
      }

      res.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== 'transfer-encoding' && lowerKey !== 'content-encoding' && lowerKey !== 'content-length') {
          res.setHeader(key, value);
        }
      }

      if (!response.body) {
        res.end();
        return;
      }

      const arrayBuf = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
    } catch (err: any) {
      console.error(`[Google-API Proxy] ERR for ${req.method} ${req.url}:`, err);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Google API proxy failed',
          message: err.message
        });
      }
    }
  });

  app.use(express.json());

  // --- Proxy Routes (to support local Ollama / Remote bypasses in both development and production) ---
  
  // Proxy for local Ollama gateway
  app.use("/ollama-local", async (req, res) => {
    try {
      const subPath = req.url;
      const targetUrl = `http://127.0.0.1:11434${subPath}`;
      
      const fetchOptions: any = {
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
        }
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      let response;
      try {
        response = await fetch(targetUrl, fetchOptions);
      } catch (err: any) {
        console.warn('Ollama IPv4 proxy failed, trying localhost fallback...', err.message);
        try {
          const fallbackUrl = `http://localhost:11434${subPath}`;
          response = await fetch(fallbackUrl, fetchOptions);
        } catch (fallbackErr: any) {
          console.warn('Ollama localhost proxy failed, trying IPv6 fallback...', fallbackErr.message);
          const ipv6Url = `http://[::1]:11434${subPath}`;
          response = await fetch(ipv6Url, fetchOptions);
        }
      }

      res.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      }

      if (!response.body) {
        res.end();
        return;
      }

      const reader = (response.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err: any) {
      console.error('Ollama Local Proxy Error:', err);
      if (!res.headersSent) {
        const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
        const customMessage = isCloudEnv
          ? "Connection refused to 127.0.0.1:11434. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http 11434') and update the secure URL in settings."
          : `Connection refused. Please make sure your Ollama instance is running locally on port 11434: ${err.message}`;
        res.status(502).json({ 
          error: 'Ollama proxy failed', 
          message: customMessage, 
          code: 'ECONNREFUSED' 
        });
      }
    }
  });

  // Proxy for local Llama.cpp gateway
  app.use("/llamacpp-local", async (req, res) => {
    try {
      const subPath = req.url;
      const targetUrl = `http://127.0.0.1:8080${subPath}`;
      
      const fetchOptions: any = {
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
        }
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      let response;
      try {
        response = await fetch(targetUrl, fetchOptions);
      } catch (err: any) {
        try {
          const fallbackUrl = `http://localhost:8080${subPath}`;
          response = await fetch(fallbackUrl, fetchOptions);
        } catch (fallbackErr: any) {
          const ipv6Url = `http://[::1]:8080${subPath}`;
          response = await fetch(ipv6Url, fetchOptions);
        }
      }

      res.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      }

      if (!response.body) {
        res.end();
        return;
      }

      const reader = (response.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err: any) {
      const isConnRefused = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED';
      if (!isConnRefused) {
        console.error('Llama.cpp Local Proxy Error:', err);
      }
      if (!res.headersSent) {
        const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
        const customMessage = isCloudEnv
          ? "Connection refused to 127.0.0.1:8080. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http 8080') and update the secure URL in settings."
          : `Connection refused. Please make sure your llama.cpp server is running locally on port 8080: ${err.message}`;
        res.status(502).json({ 
          error: 'Llama.cpp proxy failed', 
          message: customMessage, 
          code: 'ECONNREFUSED' 
        });
      }
    }
  });

  // Proxy for remote URLs to handle mixed content and CORS in cloud/production
  const isValidProxyTarget = (raw: string): boolean => {
    try {
      const u = new URL(raw);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  app.use("/proxy-remote", async (req, res) => {
    try {
      const target = req.headers['x-target-url'] || req.headers['X-Target-Url'];
      if (!target || typeof target !== 'string') {
        return res.status(400).json({ error: 'Missing x-target-url header' });
      }
      if (!isValidProxyTarget(target)) {
        return res.status(400).json({ error: 'x-target-url must be a valid http(s) URL' });
      }

      const subPath = req.url;
      const targetUrl = `${target.replace(/\/+$/, '')}${subPath}`;
      
      const fetchOptions: any = {
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
        }
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);

      res.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      }

      if (!response.body) {
        res.end();
        return;
      }

      const reader = (response.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err: any) {
      const code = err.code || (err.cause && err.cause.code);
      const isDnsError = code === 'ENOTFOUND' || (err.cause && err.cause.message && err.cause.message.includes('ENOTFOUND')) || (err.message && err.message.includes('ENOTFOUND'));
      
      if (isDnsError) {
        console.warn('Remote Proxy DNS Resolution Failed:', err.message || err);
      } else {
        console.error('Remote Proxy Error:', err);
      }

      if (!res.headersSent) {
        let message = err.message || 'Unknown network error';
        
        if (isDnsError) {
          const host = err.cause?.hostname || '';
          message = `The remote URL host ${host ? `'${host}' ` : ''}could not be resolved. Please verify that the endpoint configured in your Settings (under AI Engine or OpenRouter) is correct, free of typos, and currently available.`;
        } else if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
          message = 'The remote server refused the connection. Please verify that the remote service is active, reachable over the internet, and not blocked by any firewall rules or ports.';
        } else if (code === 'ETIMEDOUT' || message.includes('timeout')) {
          message = 'The connection to the remote server timed out. Please check your network connection and verify that the host is currently responsive.';
        }

        res.status(502).json({ 
          error: 'Remote proxy failed', 
          message,
          code: code || 'FETCH_FAILED'
        });
      }
    }
  });



  // --- API Routes ---
  
  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // OpenAI Realtime API — mint ephemeral token for client-side WebRTC
  app.get("/api/openai/token", async (_req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in your environment.' });
    try {
      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: 'gpt-realtime-2.1',
            audio: {
              output: { voice: 'marin' },
            },
          },
        }),
      });
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      console.error('[OpenAI Token] error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to generate token' });
    }
  });

  // Spotify OAuth callback — redirects to static HTML page that performs
  // the PKCE token exchange entirely client-side (no server-side env vars needed).
  app.get("/auth/spotify/callback", (req, res) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(`/spotify-callback.html${qs}`);
  });

  // Anthropic API Proxy Endpoint
  app.post("/api/anthropic/chat", async (req, res) => {
    try {
      const { messages, settings, stream } = req.body;
      
      const isSubscriptionMode = settings.anthropicConnectionMode === 'subscription';
      const apiKey = isSubscriptionMode 
        ? (settings.anthropicSubscriptionKey || '')
        : (settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
      
      const baseUrl = isSubscriptionMode
        ? (settings.anthropicSubscriptionUrl || 'http://localhost:8000')
        : 'https://api.anthropic.com/v1/messages';

      if (!isSubscriptionMode && !apiKey) {
        return res.status(400).json({ error: "Anthropic API Key is missing. Please set it in Settings -> Integrations -> Anthropic." });
      }

      // Format messages for Anthropic
      // Anthropic does not allow 'system' in messages, only user and assistant. System instruction is a top-level property.
      const systemMessage = messages.find((m: any) => m.role === 'system');
      const systemInstruction = systemMessage ? systemMessage.content : (settings.masterRolePrompt || '');
      
      const otherMessages = messages.filter((m: any) => m.role !== 'system');
      
      const formattedMessages = otherMessages.map((msg: any) => {
        let content: any = msg.content;
        
        if (msg.attachments && msg.attachments.length > 0) {
          content = [
            { type: "text", text: msg.content || " " }
          ];
          
          for (const att of msg.attachments) {
            if (att.mimeType.startsWith('image/')) {
              const mime = att.mimeType;
              const base64Data = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
              
              content.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime,
                  data: base64Data
                }
              });
            }
          }
        }
        
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content
        };
      });

      const requestBody: any = {
        model: settings.anthropicModel || DEFAULT_ANTHROPIC_MODEL,
        messages: formattedMessages,
        max_tokens: 4096,
        stream: stream !== false
      };

      if (systemInstruction) {
        requestBody.system = systemInstruction;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (!isSubscriptionMode) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
      } else {
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
          headers["x-api-key"] = apiKey;
        }
      }

      console.log(`[Anthropic Proxy] Calling ${baseUrl} with model ${requestBody.model}`);
      const response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });

      res.status(response.status);
      
      for (const [key, value] of response.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== 'transfer-encoding' && lowerKey !== 'content-encoding' && lowerKey !== 'content-length') {
          res.setHeader(key, value);
        }
      }

      if (!response.body) {
        res.end();
        return;
      }

      const reader = (response.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();

    } catch (err: any) {
      console.error("[Anthropic Proxy Error]:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to communicate with Anthropic service", message: err.message });
      }
    }
  });

  /**
   * Parse an SSE response body and extract the JSON from the data: field.
   * Also returns the session ID from the event id field as a fallback
   * (the mcp-session-id header is the primary source).
   */
  function parseSseBody(sseText: string): { jsonData?: any; lastEventId?: string } {
    let jsonData: string | undefined;
    let lastEventId: string | undefined;

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
      try { return { jsonData: JSON.parse(jsonData), lastEventId }; } catch {}
    }

    return { jsonData: undefined, lastEventId };
  }

  // MCP Server Proxy Endpoint (Streamable HTTP compatible)
  app.post("/api/mcp/proxy", async (req, res) => {
    const { url, method, params, headers: extraHeaders } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: "Missing MCP server URL" });
    }
    if (!isValidProxyTarget(url)) {
      return res.status(400).json({ success: false, error: "MCP server URL must be a valid http(s) URL" });
    }

    // Debug: log incoming headers
    console.log('[MCP Proxy] Incoming headers:', JSON.stringify(req.headers));

    // Forward mcp-session-id from incoming request headers
    const incomingSessionId = req.headers['mcp-session-id'];
    console.log('[MCP Proxy] Incoming session ID:', incomingSessionId);

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(extraHeaders || {}),
    };

    if (incomingSessionId) {
      requestHeaders['mcp-session-id'] = Array.isArray(incomingSessionId) ? incomingSessionId[0] : incomingSessionId;
    }

    try {
      const jsonRpcPayload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: method || "tools/list",
        params: params || {}
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(jsonRpcPayload)
      });

      console.log('[MCP Proxy] Response status:', response.status);
      console.log('[MCP Proxy] Response headers:', Object.fromEntries(response.headers.entries()));

      // Capture session ID from response headers (Streamable HTTP)
      const sessionId = response.headers.get('mcp-session-id') || undefined;

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // Streamable HTTP: parse SSE response
        const text = await response.text();
        const { jsonData } = parseSseBody(text);
        if (jsonData) {
          return res.json({ success: true, data: jsonData, sessionId });
        }
        // If no SSE data found but response is ok, return empty
        if (response.ok) {
          return res.json({ success: true, data: {}, sessionId });
        }
        throw new Error(`MCP Server responded with status ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`MCP Server responded with status ${response.status}`);
      }

      // Regular JSON response
      const data = await response.json();
      res.json({ success: true, data, sessionId });
    } catch (err: any) {
      console.warn("MCP JSON-RPC proxy failed:", err.message, err.cause ? `(cause: ${err.cause.message || err.cause.code || JSON.stringify(err.cause)})` : '');

      try {
        const actionMatch = method?.split('/') || [];
        const action = actionMatch[actionMatch.length - 1] || "tools";
        const targetUrl = url.endsWith('/') ? `${url}${action}` : `${url}/${action}`;

        const isWrite = method?.includes('call') || method?.includes('write') || method?.includes('execute');
        const response = await fetch(targetUrl, {
          method: isWrite ? 'POST' : 'GET',
          headers: requestHeaders,
          body: isWrite ? JSON.stringify(params || {}) : undefined
        });

        if (response.ok) {
          const data = await response.json();
          return res.json({ success: true, isRest: true, data });
        }
      } catch (restErr: any) {
        console.error("MCP REST fallback also failed:", restErr.message, restErr.cause ? `(cause: ${restErr.cause.message || restErr.cause.code || JSON.stringify(restErr.cause)})` : '');
      }

      const causeCode = err.cause?.code || err.cause?.cause?.code || '';
      const friendlyMsg = causeCode === 'ECONNREFUSED'
        ? `Connection refused to ${url}. The MCP server is not running. Start it first.`
        : causeCode === 'ENOTFOUND'
        ? `DNS resolution failed for ${url}. Check the MCP server URL.`
        : err.message;
      res.status(500).json({ success: false, error: friendlyMsg });
    }
  });

  // --- CDP (Chrome DevTools Protocol) Bridge for External Browser Control ---
  // Allows the assistant to control tabs in the user's Chrome browser via CDP,
  // requiring Chrome to be started with --remote-debugging-port=9222.

  const CDP_DEFAULT_PORT = 9222;
  // Track the actual CDP port — may differ from default when Chrome auto-launches
  // (the launcher tries ports 9222-9232 and picks the first free one).
  let cdpActualPort = CDP_DEFAULT_PORT;
  let cdpWs: WebSocket | null = null;
  let cdpConnected = false;
  let cdpChromeAvailable = false;
  let cdpTargetId: string | null = null;
  let cdpTargetTitle: string | null = null;
  let cdpMsgId = 0;
  let cdpPending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

  function cdpSend(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!cdpWs || cdpWs.readyState !== WebSocket.OPEN) {
        reject(new Error('CDP not connected'));
        return;
      }
      const id = ++cdpMsgId;
      cdpPending.set(id, { resolve, reject });
      cdpWs.send(JSON.stringify({ id, method, params }));
    });
  }

  function cdpGet(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      }).on('error', reject);
    });
  }

  async function cdpListTargets(port: number): Promise<{ id: string; title: string; url: string; wsUrl: string }[]> {
    const list: any[] = await cdpGet(`http://127.0.0.1:${port}/json/list`);
    return list.map((t: any) => ({
      id: t.id,
      title: t.title || '(untitled)',
      url: t.url || '',
      wsUrl: t.webSocketDebuggerUrl || '',
    })).filter((t: any) => t.wsUrl && t.url !== 'about:blank');
  }

  async function cdpConnectToTarget(wsUrl: string, targetId: string, title: string): Promise<boolean> {
    if (cdpWs) {
      cdpWs.onclose = null;
      cdpWs.onerror = null;
      cdpWs.onmessage = null;
      try { cdpWs.close(); } catch {}
    }
    cdpPending.clear();
    cdpConnected = false;

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => { ws.close(); resolve(false); }, 8000);

        ws.onopen = async () => {
          cdpWs = ws;
          cdpTargetId = targetId;
          cdpTargetTitle = title;            try {
            await cdpSend('Page.enable');
            await cdpSend('Runtime.enable');
            // Input domain has no enable() method — using dispatchMouseEvent does not require it
            cdpConnected = true;
            clearTimeout(timeout);
            resolve(true);
          } catch (e) {
            clearTimeout(timeout);
            cdpWs = null;
            cdpConnected = false;
            resolve(false);
          }
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.id !== undefined && cdpPending.has(msg.id)) {
              const p = cdpPending.get(msg.id)!;
              cdpPending.delete(msg.id);
              if (msg.error) p.reject(new Error(msg.error.message));
              else p.resolve(msg.result);
            }
          } catch {}
        };

        ws.onerror = () => { clearTimeout(timeout); cdpConnected = false; resolve(false); };
        ws.onclose = () => { cdpConnected = false; };
      } catch {
        resolve(false);
      }
    });
  }

  function cdpDisconnect(): void {
    if (cdpWs) {
      cdpWs.onclose = null;
      cdpWs.onerror = null;
      try { cdpWs.close(); } catch {}
    }
    cdpWs = null;
    cdpConnected = false;
    cdpTargetId = null;
    cdpTargetTitle = null;
    cdpPending.clear();
  }

  // GET /api/cdp/status — check connection state
  app.get("/api/cdp/status", (_req, res) => {
    res.json({
      connected: cdpConnected,
      chromeAvailable: cdpChromeAvailable,
      targetId: cdpTargetId,
      targetTitle: cdpTargetTitle,
    });
  });

  // POST /api/cdp/connect — verify Chrome debug port is reachable and list targets
  app.post("/api/cdp/connect", async (req, res) => {
    const port = parseInt(req.body.port as string) || CDP_DEFAULT_PORT;
    try {
      const version: any = await cdpGet(`http://127.0.0.1:${port}/json/version`);
      cdpChromeAvailable = true;
      cdpActualPort = port; // Track the port for tab management endpoints
      res.json({ success: true, browser: version.Browser });
    } catch {
      cdpChromeAvailable = false;
      res.json({ success: false, error: `Cannot reach Chrome on port ${port}. Make sure Chrome is started with --remote-debugging-port=${port}.` });
    }
  });

  // GET /api/cdp/targets — list available browser tabs
  app.get("/api/cdp/targets", async (req, res) => {
    const port = parseInt(req.query.port as string) || CDP_DEFAULT_PORT;
    try {
      const targets = await cdpListTargets(port);
      res.json({ success: true, targets });
    } catch {
      res.json({ success: false, targets: [], error: 'Failed to list targets.' });
    }
  });

  // POST /api/cdp/select — connect to a specific target tab
  app.post("/api/cdp/select", async (req, res) => {
    const { targetId, wsUrl, title } = req.body;
    if (!targetId || !wsUrl) {
      return res.status(400).json({ success: false, error: 'Missing targetId or wsUrl.' });
    }
    const ok = await cdpConnectToTarget(wsUrl, targetId, title || '');
    if (ok) {
      // Get viewport dimensions for coordinate mapping
      try {
        const metrics = await cdpSend('Page.getLayoutMetrics');
        res.json({ success: true, title: cdpTargetTitle, viewport: metrics?.layoutViewport || null });
      } catch {
        res.json({ success: true, title: cdpTargetTitle, viewport: null });
      }
    } else {
      res.json({ success: false, error: 'Failed to connect to target.' });
    }
  });

  // POST /api/cdp/disconnect
  app.post("/api/cdp/disconnect", (_req, res) => {
    cdpDisconnect();
    cdpChromeAvailable = false;
    res.json({ success: true });
  });

  // POST /api/cdp/open_tab — open a new tab with the given URL
  app.post("/api/cdp/open_tab", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { url } = req.body;
      const result: any = await cdpSend('Target.createTarget', {
        url: url || 'about:blank',
        newWindow: false,
        background: false,
      });
      if (result?.targetId) {
        // Automatically connect to the new tab
        // Use the actual CDP port (may differ from default when auto-launched)
        const targets = await cdpListTargets(cdpActualPort);
        const newTarget = targets.find((t: any) => t.id === result.targetId);
        if (newTarget) {
          const ok = await cdpConnectToTarget(newTarget.wsUrl, newTarget.id, newTarget.title);
          if (ok) {
            return res.json({ success: true, targetId: result.targetId, switched: true });
          }
        }
        res.json({ success: true, targetId: result.targetId, switched: false, note: 'Tab created but could not auto-switch.' });
      } else {
        res.json({ success: false, error: 'Failed to create target.' });
      }
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/close_tab — close a tab by target id
  app.post("/api/cdp/close_tab", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { targetId } = req.body;
      if (!targetId) return res.json({ success: false, error: 'Missing targetId.' });
      await cdpSend('Target.closeTarget', { targetId: String(targetId) });
      // If the closed tab was the active one, disconnect
      if (targetId === cdpTargetId) {
        cdpDisconnect();
      }
      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/switch_tab — switch active connection to a different tab
  app.post("/api/cdp/switch_tab", async (req, res) => {
    try {
      const { targetId } = req.body;
      if (!targetId) return res.json({ success: false, error: 'Missing targetId.' });
      // Use the actual CDP port (may differ from default when auto-launched)
      const targets = await cdpListTargets(cdpActualPort);
      const target = targets.find((t: any) => t.id === targetId);
      if (!target) return res.json({ success: false, error: `No tab with id "${targetId}".` });
      const ok = await cdpConnectToTarget(target.wsUrl, target.id, target.title);
      if (ok) {
        res.json({ success: true, targetId: target.id, title: target.title });
      } else {
        res.json({ success: false, error: 'Failed to connect to target.' });
      }
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // Helper: map capture coordinates to target viewport
  async function cdpMapCoords(nx: number, ny: number, captureW?: number, captureH?: number): Promise<{ x: number; y: number }> {
    const metrics = await cdpSend('Page.getLayoutMetrics');
    const vw = metrics?.layoutViewport?.clientWidth || 1280;
    const vh = metrics?.layoutViewport?.clientHeight || 720;
    const cw = captureW || 1024;
    const ch = captureH || (vh / vw * 1024);
    return {
      x: Math.round((nx / cw) * vw),
      y: Math.round((ny / ch) * vh),
    };
  }

  // POST /api/cdp/click
  app.post("/api/cdp/click", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { nx, ny, captureW, captureH } = req.body;
      const { x, y } = await cdpMapCoords(nx, ny, captureW, captureH);
      await cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      res.json({ success: true, result: `Clicked at (${x}, ${y}) in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/double_click
  app.post("/api/cdp/double_click", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { nx, ny, captureW, captureH } = req.body;
      const { x, y } = await cdpMapCoords(nx, ny, captureW, captureH);
      await cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2 });
      await cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 });
      res.json({ success: true, result: `Double-clicked at (${x}, ${y}) in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/right_click
  app.post("/api/cdp/right_click", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { nx, ny, captureW, captureH } = req.body;
      const { x, y } = await cdpMapCoords(nx, ny, captureW, captureH);
      await cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
      await cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
      res.json({ success: true, result: `Right-clicked at (${x}, ${y}) in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/hover
  app.post("/api/cdp/hover", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { nx, ny, captureW, captureH } = req.body;
      const { x, y } = await cdpMapCoords(nx, ny, captureW, captureH);
      await cdpSend('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      res.json({ success: true, result: `Hovered at (${x}, ${y}) in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/type — type text into focused element
  app.post("/api/cdp/type", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { text } = req.body;
      if (!text) return res.json({ success: false, error: 'Missing text.' });
      await cdpSend('Input.insertText', { text: String(text) });
      res.json({ success: true, result: `Typed "${String(text).slice(0, 200)}"${String(text).length > 200 ? '…' : ''} in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/press_key
  app.post("/api/cdp/press_key", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { key } = req.body;
      if (!key) return res.json({ success: false, error: 'Missing key.' });

      const parts = String(key).split('+').map(k => k.trim().toLowerCase());
      const mainKeyRaw = parts.pop() || '';

      const keyMap: Record<string, { windowsVirtualKeyCode: number }> = {
        Enter: { windowsVirtualKeyCode: 13 },
        Tab: { windowsVirtualKeyCode: 9 },
        Escape: { windowsVirtualKeyCode: 27 },
        Backspace: { windowsVirtualKeyCode: 8 },
        Delete: { windowsVirtualKeyCode: 46 },
        ArrowUp: { windowsVirtualKeyCode: 38 },
        ArrowDown: { windowsVirtualKeyCode: 40 },
        ArrowLeft: { windowsVirtualKeyCode: 37 },
        ArrowRight: { windowsVirtualKeyCode: 39 },
        Home: { windowsVirtualKeyCode: 36 },
        End: { windowsVirtualKeyCode: 35 },
        PageUp: { windowsVirtualKeyCode: 33 },
        PageDown: { windowsVirtualKeyCode: 34 },
        Space: { windowsVirtualKeyCode: 32 },
      };

      const k = mainKeyRaw.length === 1 ? mainKeyRaw.toUpperCase() : (mainKeyRaw.charAt(0).toUpperCase() + mainKeyRaw.slice(1));
      const codeInfo = keyMap[k] || { windowsVirtualKeyCode: k.charCodeAt(0) };
      
      const ctrlKey = parts.includes('control') || parts.includes('ctrl');
      const shiftKey = parts.includes('shift');
      const altKey = parts.includes('alt');
      const metaKey = parts.includes('meta') || parts.includes('command') || parts.includes('cmd');
      
      let modifiers = 0;
      if (altKey) modifiers |= 1;
      if (ctrlKey) modifiers |= 2;
      if (metaKey) modifiers |= 4;
      if (shiftKey) modifiers |= 8;

      await cdpSend('Input.dispatchKeyEvent', {
        type: 'keyDown',
        windowsVirtualKeyCode: codeInfo.windowsVirtualKeyCode,
        key: k,
        modifiers
      });
      await cdpSend('Input.dispatchKeyEvent', {
        type: 'keyUp',
        windowsVirtualKeyCode: codeInfo.windowsVirtualKeyCode,
        key: k,
        modifiers
      });
      res.json({ success: true, result: `Pressed "${key}" in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/scroll
  app.post("/api/cdp/scroll", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { dx, dy } = req.body;
      const sx = Math.round((dx || 0) * 1000);
      const sy = Math.round((dy || 0) * 1000);
      await cdpSend('Input.synthesizeScrollGesture', {
        x: 100, y: 100, xDistance: sx, yDistance: sy,
        xOverscroll: 0, yOverscroll: 0,
        preventFling: true, speedMultiplier: 0.5,
      });
      res.json({ success: true, result: `Scrolled by (${sx}, ${sy}) px in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/scroll_to
  app.post("/api/cdp/scroll_to", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { frac } = req.body;
      const f = Math.max(0, Math.min(1, Number(frac || 0)));
      await cdpSend('Runtime.evaluate', {
        expression: `window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * ${f}, behavior: 'instant' })`,
      });
      res.json({ success: true, result: `Scrolled to ${Math.round(f * 100)}% in target page.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/drag — simulate mouse drag from (nx, ny) to (endNx, endNy)
  app.post("/api/cdp/drag", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { nx, ny, endNx, endNy, captureW, captureH } = req.body;
      if (nx === undefined || ny === undefined || endNx === undefined || endNy === undefined) {
        return res.json({ success: false, error: 'Missing drag coordinates.' });
      }
      const start = await cdpMapCoords(Number(nx), Number(ny), captureW, captureH);
      const end = await cdpMapCoords(Number(endNx), Number(endNy), captureW, captureH);

      // mousePressed at start
      await cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', clickCount: 1 });

      // Interpolate intermediate moves for smooth drag
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mx = Math.round(start.x + (end.x - start.x) * t);
        const my = Math.round(start.y + (end.y - start.y) * t);
        await cdpSend('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'left' });
      }

      // mouseReleased at end
      await cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', clickCount: 1 });

      res.json({ success: true, result: `Dragged from (${start.x}, ${start.y}) to (${end.x}, ${end.y}).` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/upload — upload a file to a file input element
  app.post("/api/cdp/upload", async (req, res) => {
    let tmpPath: string | null = null;
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { cssSelector, data, filename } = req.body;
      if (!cssSelector || !data || !filename) {
        return res.json({ success: false, error: 'Missing cssSelector, data, or filename.' });
      }

      // Write the base64 data to a temp file in the OS temp directory
      const tmpDir = path.join(os.tmpdir(), 'kollektiv-cdp-upload');
      try { if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
      tmpPath = path.join(tmpDir, `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      fs.writeFileSync(tmpPath, Buffer.from(String(data), 'base64'));

      // Enable DOM domain, get document, find the file input, set files
      await cdpSend('DOM.enable');
      const docResult: any = await cdpSend('DOM.getDocument');
      if (!docResult?.root?.nodeId) {
        return res.json({ success: false, error: 'Could not get DOM document node.' });
      }

      const queryResult: any = await cdpSend('DOM.querySelector', {
        nodeId: docResult.root.nodeId,
        selector: String(cssSelector),
      });
      if (!queryResult?.nodeId) {
        return res.json({ success: false, error: `No element found for selector "${cssSelector}".` });
      }

      await cdpSend('DOM.setFileInputFiles', {
        nodeId: queryResult.nodeId,
        files: [tmpPath],
      });

      res.json({ success: true, result: `Uploaded "${filename}" to <${cssSelector}>.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    } finally {
      // Clean up temp file immediately after upload
      if (tmpPath) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }
  });

  // POST /api/cdp/navigate
  app.post("/api/cdp/navigate", async (req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const { url } = req.body;
      if (!url) return res.json({ success: false, error: 'Missing url.' });
      await cdpSend('Page.navigate', { url: String(url) });
      res.json({ success: true, result: `Navigated to ${url}.` });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // GET /api/cdp/screenshot — capture a JPEG screenshot of the current tab
  app.get("/api/cdp/screenshot", async (_req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const result: any = await cdpSend('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 70,
        fromSurface: true,
        captureBeyondViewport: false,
      });
      // Page.captureScreenshot returns base64-encoded data (no data: prefix)
      // width/height are not returned by the CDP command — callers should infer
      // dimensions from the data if needed.
      res.json({
        success: true,
        data: result?.data || '',
      });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // GET /api/cdp/content — read page text content
  app.get("/api/cdp/content", async (_req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const title: any = await cdpSend('Runtime.evaluate', { expression: 'document.title' });
      const url: any = await cdpSend('Runtime.evaluate', { expression: 'window.location.href' });
      const body: any = await cdpSend('Runtime.evaluate', {
        expression: `(function(){const n=document.body?.innerText||'';return n.substring(0,5000)+(n.length>5000?'\\n… (truncated)':'');})()`,
      });
      res.json({
        success: true,
        title: title?.result?.value || '',
        url: url?.result?.value || '',
        content: body?.result?.value || '',
      });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // POST /api/cdp/launch — auto-launch Chrome with remote debugging
  app.post("/api/cdp/launch", async (_req, res) => {
    const result = await chromeLauncher.launch(CDP_DEFAULT_PORT);
    if (result.success) {
      cdpChromeAvailable = true;
      cdpActualPort = result.port!; // Track the actual auto-launch port
      // Poll until Chrome's CDP endpoint is actually reachable
      let reachable = false;
      for (let i = 0; i < 15; i++) {
        try {
          await cdpGet(`http://127.0.0.1:${result.port}/json/version`);
          reachable = true;
          break;
        } catch {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      res.json({
        success: true,
        port: result.port,
        pid: result.pid,
        exe: result.exe,
        reachable,
      });
    } else {
      res.json(result);
    }
  });

  // GET /api/cdp/launch-status — check auto-launch state
  app.get("/api/cdp/launch-status", (_req, res) => {
    res.json({
      isRunning: chromeLauncher.isRunning,
      port: chromeLauncher.port,
    });
  });

  // GET /api/cdp/structure — read interactive elements
  app.get("/api/cdp/structure", async (_req, res) => {
    try {
      if (!cdpConnected) return res.json({ success: false, error: 'CDP not connected.' });
      const result: any = await cdpSend('Runtime.evaluate', {
        expression: `(function(){
          const tags=['h1','h2','h3','h4','a','button','input','textarea','select','[role="button"]','[tabindex]'];
          const seen=new Set(); const items=[];
          for(const sel of tags){document.querySelectorAll(sel).forEach(el=>{
            if(seen.has(el))return; const r=el.getBoundingClientRect();
            if(r.top<innerHeight&&r.bottom>0&&r.width>0){
              seen.add(el);
              const tag=el.tagName.toLowerCase();
              const t=(el.textContent||'').trim().slice(0,60);
              const p=(el.placeholder||'');
              items.push('<'+tag+'> "'+(t||p||tag)+'"');
            }
          });}
          return items.slice(0,100).join('\\n')||'No interactive elements found.';
        })()`,
      });
      res.json({ success: true, structure: result?.result?.value || '' });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // --- Topaz Gigapixel AI Upscale API ---
  const TOPAZ_TMP = path.join(process.cwd(), '.topaz-tmp');
  try { if (!fs.existsSync(TOPAZ_TMP)) fs.mkdirSync(TOPAZ_TMP, { recursive: true }); } catch {}
  const topazUpload = multer({ dest: TOPAZ_TMP, limits: { fileSize: 100 * 1024 * 1024 } });

  // Search for the Gigapixel executable in common install locations + env override
  function findTopazExe(): string | null {
    const override = process.env.TOPAZ_GIGAPIXEL_PATH;
    if (override && fs.existsSync(override)) return override;

    const basePaths = [
      'C:\\Program Files\\Topaz Labs LLC\\Topaz Gigapixel AI',
      'C:\\Program Files (x86)\\Topaz Labs LLC\\Topaz Gigapixel AI',
    ];
    const candidates: string[] = [];
    for (const base of basePaths) {
      candidates.push(path.join(base, 'gigapixel.exe'));        // CLI binary
      candidates.push(path.join(base, 'Topaz Gigapixel AI.exe')); // fallback GUI
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  const TOPAZ_EXE = findTopazExe();

  // GET /api/topaz-status — check if Topaz Gigapixel is available
  app.get("/api/topaz-status", (_req, res) => {
    res.json({
      available: !!TOPAZ_EXE,
      path: TOPAZ_EXE || null,
      envOverride: !!process.env.TOPAZ_GIGAPIXEL_PATH,
    });
  });

  // POST /api/topaz-upscale — upscale an image using locally installed Topaz Gigapixel AI
  app.post("/api/topaz-upscale", topazUpload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

    const ext = path.extname(req.file.originalname) || '.png';
    // Multer saves without extension — rename so Gigapixel can detect the format
    const inputPath = req.file.path + ext;
    try { fs.renameSync(req.file.path, inputPath); } catch {}

    const outputPath = path.join(TOPAZ_TMP, 'out_' + req.file.filename + ext);

    const scale = String(req.body.scale || '4');
    const model = String(req.body.model || 'std');

    // Re-check availability each call (allows installing after server starts)
    const exe = findTopazExe();
    if (!exe) {
      return res.status(503).json({
        error: 'Topaz Gigapixel AI not found. Install from https://www.topazlabs.com/gigapixel-ai',
        hint: 'Set TOPAZ_GIGAPIXEL_PATH environment variable to the executable path if installed in a non-default location.',
      });
    }

    try {
      await new Promise<void>((resolve, reject) => {
        // CLI syntax from `gigapixel.exe --help`:
        //   -i PATH  input file
        //   -o PATH  output file
        //   --scale MULTIPLIER
        //   -m MODEL / --model MODEL
        const child = execFile(exe, [
          '-i', inputPath,
          '-o', outputPath,
          '--scale', scale,
          '-m', model,
        ], { timeout: 300_000 });

        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.stdout?.on('data', (_chunk: Buffer) => { /* progress info */ });
        child.on('error', (err) => reject(err));
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Topaz exited with code ${code}. ${stderr.slice(0, 500)}`));
        });
      });

      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({ error: 'Topaz did not produce an output file.' });
      }

      const outputBuf = fs.readFileSync(outputPath);
      res.set('Content-Type', `image/${ext.replace('.', '')}`);
      res.send(outputBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Topaz upscale failed.' });
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    // hmr.server must point at the SAME http.Server Express listens on.
    // Without it, Vite's middlewareMode has no server to attach its HMR
    // websocket to, so it falls back to a second standalone listener on a
    // hardcoded port (24678). That fallback has no reconnect grace period —
    // any failure to reach it (port already held by a stale server.ts
    // process, firewall, whatever) makes the browser's Vite client treat it
    // as "server connection lost" and call location.reload() forever.
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback. Express 5 (path-to-regexp 8) rejects app.get('*'),
    // so use a plain middleware for the catch-all.
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // New opt-in path: direct vault access via kollektivMcp.ts (services/kollektivMcp.ts),
  // superseding the legacy obsidian-mcp-server child process below. Kept side-by-side
  // (not a replacement) so the existing OBSIDIAN_API_KEY setup keeps working untouched —
  // see ISSUE-14 in ISSUES.md: the new module's tool names (read_note, search_notes, ...)
  // differ from the old obsidian_* names, so WORKSPACE_CAPABILITIES and the assistant's
  // obsidian_ prefix filter haven't been migrated yet. Only one of the two paths runs.
  let kollektivMcpInstance: KollektivMcpInstance | null = null;
  const startKollektivMcpVault = async () => {
    if (!process.env.OBSIDIAN_VAULT_PATH) return;
    try {
      kollektivMcpInstance = await startKollektivMcp({ vaultPath: process.env.OBSIDIAN_VAULT_PATH, port: 3012 });
    } catch (err) {
      console.error(`[Kollektiv MCP] failed to start: ${err instanceof Error ? err.message : err}`);
    }
  };

  // Start Obsidian MCP server as child process (opt-in: requires OBSIDIAN_API_KEY in the environment)
  let obsidianMcpProc: ReturnType<typeof spawn> | null = null;
  const startObsidianMcp = () => {
    if (obsidianMcpProc) return;
    if (process.env.OBSIDIAN_VAULT_PATH) return; // new path (above) already owns port 3012
    if (!process.env.OBSIDIAN_API_KEY) {
      console.log(`[Obsidian MCP] OBSIDIAN_API_KEY not set — skipping local Obsidian bridge.`);
      return;
    }
    const env = {
      ...process.env,
      OBSIDIAN_BASE_URL: process.env.OBSIDIAN_BASE_URL || "https://127.0.0.1:27124",
      OBSIDIAN_VERIFY_SSL: process.env.OBSIDIAN_VERIFY_SSL || "false",
      MCP_TRANSPORT_TYPE: "http",
      MCP_HTTP_PORT: "3012",
    };
    obsidianMcpProc = spawn("npx -y obsidian-mcp-server@latest", [], {
      env,
      shell: true, // needed on Windows
      stdio: ["ignore", "pipe", "pipe"],
    });
    obsidianMcpProc.stdout?.on("data", (d) => console.log(`[Obsidian MCP] ${d.toString().trim()}`));
    obsidianMcpProc.stderr?.on("data", (d) => console.error(`[Obsidian MCP] ${d.toString().trim()}`));
    obsidianMcpProc.on("exit", (code) => {
      console.log(`[Obsidian MCP] exited with code ${code}`);
      obsidianMcpProc = null;
    });
    console.log(`[Obsidian MCP] starting on http://127.0.0.1:3012/mcp`);
  };

  void startKollektivMcpVault();
  startObsidianMcp();

  // Start Playwright MCP server as child process — no API key needed, so it
  // always starts (matches the Predefined MCP tab's Playwright preset, which
  // points at this same port by default).
  // If the default port is taken, tries a fallback port.
  let playwrightMcpProc: ReturnType<typeof spawn> | null = null;
  const startPlaywrightMcp = async () => {
    if (playwrightMcpProc) return;

    // Check if default port is free; if not, try fallback
    let pwPort = PLAYWRIGHT_MCP_PORT;
    const pwFree = await isPortFree(pwPort, "127.0.0.1");
    if (!pwFree) {
      console.warn(`[Playwright MCP] Port ${pwPort} is in use, trying fallback port ${PLAYWRIGHT_MCP_FALLBACK_PORT}...`);
      freePort(pwPort);
      await new Promise(r => setTimeout(r, 500));
      const fallbackFree = await isPortFree(PLAYWRIGHT_MCP_FALLBACK_PORT, "127.0.0.1");
      if (fallbackFree) {
        pwPort = PLAYWRIGHT_MCP_FALLBACK_PORT;
        console.log(`[Playwright MCP] Using fallback port ${pwPort}.`);
      } else {
        console.error(`[Playwright MCP] Both ports ${PLAYWRIGHT_MCP_PORT} and ${PLAYWRIGHT_MCP_FALLBACK_PORT} are in use — skipping.`);
        return;
      }
    }

    playwrightMcpProc = spawn(`npx @playwright/mcp@latest --port ${pwPort}`, [], {
      shell: true, // needed on Windows
      stdio: ["ignore", "pipe", "pipe"],
    });
    playwrightMcpProc.stdout?.on("data", (d) => console.log(`[Playwright MCP] ${d.toString().trim()}`));
    playwrightMcpProc.stderr?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg.includes("EADDRINUSE") || msg.includes("address already in use")) {
        console.warn(`[Playwright MCP] Port conflict: ${msg}`);
      } else {
        console.error(`[Playwright MCP] ${msg}`);
      }
    });
    playwrightMcpProc.on("exit", (code) => {
      console.log(`[Playwright MCP] exited with code ${code}`);
      playwrightMcpProc = null;
    });
    console.log(`[Playwright MCP] starting on http://localhost:${pwPort}/mcp`);
  };

  startPlaywrightMcp();

  // Cleanup on shutdown
  const shutdown = () => {
    if (kollektivMcpInstance) {
      console.log(`[Kollektiv MCP] shutting down...`);
      void kollektivMcpInstance.stop();
    }
    if (obsidianMcpProc) {
      console.log(`[Obsidian MCP] shutting down...`);
      obsidianMcpProc.kill();
    }
    if (playwrightMcpProc) {
      console.log(`[Playwright MCP] shutting down...`);
      playwrightMcpProc.kill();
    }
    if (chromeLauncher.isRunning) {
      console.log(`[Chrome Launcher] shutting down...`);
      chromeLauncher.kill();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 'exit' only allows synchronous work, so this covers the case SIGINT/SIGTERM
  // don't: a hard crash (uncaught exception) or a plain process.exit() call
  // elsewhere, either of which would otherwise leave chromeLauncher's Chrome
  // process (and the MCP child processes) orphaned.
  const killChildProcessesSync = () => {
    if (obsidianMcpProc) obsidianMcpProc.kill();
    if (playwrightMcpProc) playwrightMcpProc.kill();
    if (chromeLauncher.isRunning) chromeLauncher.kill();
  };
  process.on("exit", killChildProcessesSync);
  process.on("uncaughtException", (err) => {
    console.error("[Server] Uncaught exception:", err);
    killChildProcessesSync();
    process.exit(1);
  });

  // Pre-flight: check if port is free before attempting to listen
  const portFree = await isPortFree(PORT, HOST);
  if (!portFree) {
    console.warn(`[Port] Port ${PORT} is already in use. Attempting to free it...`);
    freePort(PORT);
    // Give the OS a moment to release the port
    await new Promise(r => setTimeout(r, 500));
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[FATAL] Port ${PORT} is already in use and could not be freed.`);
      console.error(`[FATAL] Ensure no other instance of the server is running, then try again.`);
      console.error(`[FATAL] You can run: taskkill /F /IM node.exe (kills ALL node processes)`);
    } else {
      console.error('Failed to start Express server:', err);
    }
    process.exit(1);
  });
}

startServer();
