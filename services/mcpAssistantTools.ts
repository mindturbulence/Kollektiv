import type { LLMSettings, McpServerConfig } from '../types';
import type { AssistantTool } from './assistantTools';
import { mcpService } from './mcpService';

const cache = new Map<string, { url: string; at: number; tools: AssistantTool[] }>();
const TTL_MS = 60_000;

function buildHeaders(cfg: McpServerConfig): Record<string, string> | undefined {
  const h: Record<string, string> = { ...(cfg.headers || {}) };
  if (cfg.apiKey && !h['Authorization']) {
    h['Authorization'] = `Bearer ${cfg.apiKey}`;
  }
  return Object.keys(h).length ? h : undefined;
}

/** Recursively translate one JSON-Schema node into the tool-parameter shape the
 *  assistant's function-calling layer expects. A shallow, type-only translation
 *  is enough for flat params (e.g. a plain `path: string`), but MCP tools with a
 *  discriminated-union param (e.g. Obsidian's `target: {type:'path',path} |
 *  {type:'active'} | {type:'periodic',...}`) need the full nested shape
 *  preserved as `anyOf`/`properties` — otherwise the model has no way to know
 *  what to put inside an object-typed argument and the call fails validation. */
function translateSchemaNode(v: any): Record<string, any> {
  if (!v || typeof v !== 'object') return { type: 'string' };

  const union = v.anyOf || v.oneOf;
  if (Array.isArray(union)) {
    const node: Record<string, any> = { anyOf: union.map(translateSchemaNode) };
    if (v.description) node.description = v.description;
    return node;
  }

  const rawType = typeof v.type === 'string' ? v.type : 'string';
  const node: Record<string, any> = { type: rawType };
  if (v.description) node.description = v.description;
  if (v.enum) node.enum = v.enum;
  else if (v.const !== undefined) node.enum = [v.const];
  if (rawType === 'array' && v.items) node.items = translateSchemaNode(v.items);
  if (rawType === 'object' && v.properties) {
    node.properties = Object.fromEntries(
      Object.entries(v.properties as Record<string, any>).map(([k, sub]) => [k, translateSchemaNode(sub)])
    );
    if (Array.isArray(v.required) && v.required.length) node.required = v.required;
  }
  return node;
}

/** MCP server tools wrapped as assistant tools (name-prefixed mcp_<serverId>_).
 *  Iterates all enabled MCP servers, merges their tools, and caches per server
 *  for 60s. Returns [] when no servers are enabled or all are unreachable. */
export const loadMcpAssistantTools = async (settings: LLMSettings): Promise<AssistantTool[]> => {
  const servers = (settings.mcpServers || []).filter(s => s.enabled && s.url?.trim());
  if (!servers.length) return [];

  const results: AssistantTool[] = [];
  const now = Date.now();

  for (const sv of servers) {
    const url = sv.url.trim();
    const cached = cache.get(sv.id);
    if (cached && cached.url === url && now - cached.at < TTL_MS) {
      results.push(...cached.tools);
      continue;
    }

    const headers = buildHeaders(sv);
    let tools: AssistantTool[] = [];

    try {
      const mcpTools = await mcpService.listTools(url, headers);
      console.debug(`[MCP] Server "${sv.name}" (${url}): ${mcpTools?.length ?? 0} tools`);
      const prefix = `mcp_${sv.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_`;
      tools = (mcpTools || []).map((t: any): AssistantTool => {
        const safeName = String(t.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        return {
          name: `${prefix}${safeName}`.slice(0, 60),
          description: `[MCP] [${sv.name}] ${t.description || t.name}`,
          parameters: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries((t.inputSchema?.properties || {}) as Record<string, any>).map(([k, v]) => [k, translateSchemaNode(v)])
            ),
            ...(Array.isArray(t.inputSchema?.required) && t.inputSchema.required.length ? { required: t.inputSchema.required } : {}),
          },
          execute: async (args) => {
            const out = await mcpService.callTool(url, String(t.name), args || {}, headers);
            const text = Array.isArray(out)
              ? out.map((i: any) => i?.text ?? JSON.stringify(i)).join('\n')
              : typeof out === 'string' ? out : JSON.stringify(out);
            return text.slice(0, 8000);
          },
        };
      });
    } catch {
      tools = [];
    }

    cache.set(sv.id, { url, at: now, tools });
    results.push(...tools);
  }

  return results;
};
