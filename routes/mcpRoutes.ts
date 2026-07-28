import express from "express";

const router = express.Router();

function isValidProxyTarget(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

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
router.post("/api/mcp/proxy", async (req, res) => {
  const { url, method, params, headers: extraHeaders } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: "Missing MCP server URL" });
  }
  if (!isValidProxyTarget(url)) {
    return res.status(400).json({ success: false, error: 'MCP server URL must be a valid http(s) URL' });
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
      // Try to parse JSON error body from MCP server — pass it through so
      // the client's retry logic can detect stale sessions by error message.
      try {
        const errData = await response.json();
        if (errData?.error?.message && typeof errData.error.message === 'string') {
          return res.json({ success: false, error: errData.error.message, sessionId });
        }
      } catch { /* not JSON — fall through to generic error */ }
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

export default router;
