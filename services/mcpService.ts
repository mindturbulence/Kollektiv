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

/**
 * Base helper to issue MCP request either client-side directly (for localhost) or proxied through cloud backend (for remote hosts)
 */
async function executeMcpRequest(serverUrl: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const cleanUrl = serverUrl.trim();
  const isLocalHost = cleanUrl.includes('localhost') || 
                      cleanUrl.includes('127.0.0.1') || 
                      cleanUrl.includes('0.0.0.0') || 
                      cleanUrl.includes('[::1]') || 
                      cleanUrl.includes('192.168.') || 
                      cleanUrl.includes('10.');

  if (isLocalHost) {
    // Attempt standard direct client-side fallback so browser can reach local containers/servers directly
    try {
      const jsonRpcPayload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      };

      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(jsonRpcPayload)
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }
    } catch (clientErr: any) {
      console.warn("Direct browser-to-local MCP connection failed (usually due to CORS policies or local process offline), passing to remote proxy fallback:", clientErr.message);
    }
  }

  // Fallback / standard remote mode: route through server proxy
  const response = await fetch('/api/mcp/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: cleanUrl,
      method,
      params
    })
  });

  if (!response.ok) throw new Error(`HTTP error ${response.status}`);
  const json = await response.json();
  return json;
}

export const mcpService = {
  /**
   * Pings / tests connection to MCP server by listing tools
   */
  async ping(serverUrl: string): Promise<boolean> {
    const json = await executeMcpRequest(serverUrl, 'tools/list', {});
    if (!json.success) {
      throw new Error(json.error || 'Request unsuccessful');
    }
    return true;
  },

  /**
   * Lists available tools from the MCP server
   */
  async listTools(serverUrl: string): Promise<MCPTool[]> {
    try {
      const json = await executeMcpRequest(serverUrl, 'tools/list', {});
      if (!json.success) throw new Error(json.error || 'Request failed');
      
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.tools || (Array.isArray(resultObj) ? resultObj : []);
    } catch (err: any) {
      console.error("Failed to list MCP tools:", err);
      throw err;
    }
  },

  /**
   * Call a tool on the MCP Server
   */
  async callTool(serverUrl: string, name: string, args: Record<string, any>): Promise<any> {
    try {
      const json = await executeMcpRequest(serverUrl, 'tools/call', {
        name,
        arguments: args
      });
      if (!json.success) throw new Error(json.error || 'Request failed');
      
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.content || resultObj;
    } catch (err: any) {
      console.error(`Failed to call MCP tool ${name}:`, err);
      throw err;
    }
  },

  /**
   * Lists available custom prompts from the MCP server
   */
  async listPrompts(serverUrl: string): Promise<MCPPrompt[]> {
    try {
      const json = await executeMcpRequest(serverUrl, 'prompts/list', {});
      if (!json.success) throw new Error(json.error || 'Request failed');
      
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.prompts || (Array.isArray(resultObj) ? resultObj : []);
    } catch (err: any) {
      console.error("Failed to list MCP prompts:", err);
      return [];
    }
  },

  /**
   * Lists available resources from the MCP server
   */
  async listResources(serverUrl: string): Promise<MCPResource[]> {
    try {
      const json = await executeMcpRequest(serverUrl, 'resources/list', {});
      if (!json.success) throw new Error(json.error || 'Request failed');
      
      const payload = json.data;
      const resultObj = payload.result || payload;
      return resultObj.resources || (Array.isArray(resultObj) ? resultObj : []);
    } catch (err: any) {
      console.error("Failed to list MCP resources:", err);
      return [];
    }
  }
};
