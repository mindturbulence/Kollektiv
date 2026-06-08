import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";

// Array to keep track of active SSE connections
let clients: express.Response[] = [];

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7500;
  const HOST = process.env.PORT ? "0.0.0.0" : "127.0.0.1";

  app.use(cors());

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
        }
      }

      const response = await fetch(targetUrl, fetchOptions);
      console.log(`[Google-API Proxy] <<< ${req.method} ${targetUrl} -> Status ${response.status} (${Date.now() - start}ms)`);

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

  // --- Proxy Routes (to support local Hermes / Ollama / Remote bypasses in both development and production) ---
  
  // Proxy for local Hermes gateway
  app.use("/hermes-local", async (req, res) => {
    try {
      const subPath = req.url;
      const targetUrl = `http://127.0.0.1:18789${subPath}`;
      
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
        console.warn('Hermes IPv4 proxy failed, trying localhost fallback...', err.message);
        try {
          const fallbackUrl = `http://localhost:18789${subPath}`;
          response = await fetch(fallbackUrl, fetchOptions);
        } catch (fallbackErr: any) {
          console.warn('Hermes localhost proxy failed, trying IPv6 fallback...', fallbackErr.message);
          const ipv6Url = `http://[::1]:18789${subPath}`;
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
      console.error('Hermes Local Proxy Error:', err);
      if (!res.headersSent) {
        const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
        const customMessage = isCloudEnv
          ? "Connection refused to 127.0.0.1:18789. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http 18789') and update the secure URL in settings."
          : `Connection refused. Please make sure your Hermes agent gateway is running locally on port 18789: ${err.message}`;
        res.status(502).json({ 
          error: 'Hermes proxy failed', 
          message: customMessage, 
          code: 'ECONNREFUSED' 
        });
      }
    }
  });

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
        console.warn('Llama.cpp IPv4 proxy failed, trying localhost fallback...', err.message);
        try {
          const fallbackUrl = `http://localhost:8080${subPath}`;
          response = await fetch(fallbackUrl, fetchOptions);
        } catch (fallbackErr: any) {
          console.warn('Llama.cpp localhost proxy failed, trying IPv6 fallback...', fallbackErr.message);
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
      console.error('Llama.cpp Local Proxy Error:', err);
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
  app.use("/proxy-remote", async (req, res) => {
    try {
      const target = req.headers['x-target-url'] || req.headers['X-Target-Url'];
      if (!target || typeof target !== 'string') {
        return res.status(400).json({ error: 'Missing x-target-url header' });
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
          message = `The remote URL host ${host ? `'${host}' ` : ''}could not be resolved. Please verify that the endpoint configured in your Settings (under AI Engine, OpenRouter, or Hermes Agent) is correct, free of typos, and currently available.`;
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

  // MCP Server Proxy Endpoint
  app.post("/api/mcp/proxy", async (req, res) => {
    const { url, method, params } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: "Missing MCP server URL" });
    }

    try {
      // Standard JSON-RPC 2.0 payload format for MCP
      const jsonRpcPayload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: method || "tools/list",
        params: params || {}
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(jsonRpcPayload)
      });

      if (!response.ok) {
        throw new Error(`MCP Server responded with status ${response.status}`);
      }

      const data = await response.json();
      res.json({ success: true, data });
    } catch (err: any) {
      console.warn("MCP JSON-RPC proxy failed, attempting REST API fallback:", err.message);
      
      // If the target is a REST-based model server or simple node agent, let's fall back to REST GET/POST
      try {
        const actionMatch = method?.split('/') || [];
        const action = actionMatch[actionMatch.length - 1] || "tools"; // tools, prompts, resources
        const targetUrl = url.endsWith('/') ? `${url}${action}` : `${url}/${action}`;
        
        const isWrite = method?.includes('call') || method?.includes('write') || method?.includes('execute');
        const response = await fetch(targetUrl, {
          method: isWrite ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          body: isWrite ? JSON.stringify(params || {}) : undefined
        });

        if (response.ok) {
          const data = await response.json();
          return res.json({ success: true, isRest: true, data });
        }
      } catch (restErr: any) {
        console.error("MCP REST fallback also failed:", restErr.message);
      }

      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SSE endpoint for Kollektiv frontend to receive commands
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection establish event
    res.write("data: {\"type\": \"connected\"}\n\n");

    clients.push(res);

    req.on("close", () => {
      clients = clients.filter((client) => client !== res);
    });
  });

  // Endpoint for Hermes (or external agent) to send control commands
  // E.g. POST /api/hermes/control -> { "action": "navigate", "payload": "prompts" }
  app.post("/api/hermes/control", (req, res) => {
    const { action, payload } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    const commandStr = JSON.stringify({ action, payload });

    // Broadcast the command to all connected frontend clients
    clients.forEach((client) => {
      client.write(`data: ${commandStr}\n\n`);
    });

    res.json({ success: true, message: `Command '${action}' sent to ${clients.length} clients.` });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  }).on('error', (err: any) => {
    console.error('Failed to start Express server:', err);
  });
}

startServer();
