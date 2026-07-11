import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";



async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7500;
  // Explicit opt-in only: HOST=0.0.0.0 for containerized/cloud runs. Never inferred from PORT.
  const HOST = process.env.HOST || "127.0.0.1";


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
        model: settings.anthropicModel || 'claude-3-7-sonnet-20250219',
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

  // MCP Server Proxy Endpoint
  app.post("/api/mcp/proxy", async (req, res) => {
    const { url, method, params } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: "Missing MCP server URL" });
    }
    if (!isValidProxyTarget(url)) {
      return res.status(400).json({ success: false, error: "MCP server URL must be a valid http(s) URL" });
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
