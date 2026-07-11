import type { LLMSettings } from '../types';
import type { AssistantTool } from './assistantTools';
import { mcpService } from './mcpService';

let cache: { url: string; at: number; tools: AssistantTool[] } | null = null;
const TTL_MS = 60_000;

/** MCP server tools wrapped as assistant tools (name-prefixed mcp_). Returns
 * [] when MCP is disabled, unconfigured, or unreachable — the assistant then
 * simply runs with the built-in tool set. Cached per URL for 60s so turn
 * loops don't hammer the server. */
export const loadMcpAssistantTools = async (settings: LLMSettings): Promise<AssistantTool[]> => {
    const url = settings.mcpEnabled ? settings.mcpServerUrl?.trim() : '';
    if (!url) return [];
    if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) return cache.tools;
    let tools: AssistantTool[] = [];
    try {
        const mcpTools = await mcpService.listTools(url);
        tools = (mcpTools || []).map((t: any): AssistantTool => ({
            name: `mcp_${String(t.name)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60),
            description: `[MCP] ${t.description || t.name}`,
            parameters: {
                type: 'object',
                // Flattened best-effort mapping: nested MCP schemas are reduced to
                // their top-level properties with primitive types (Gemini's
                // uppercase-type conversion only handles flat property maps).
                properties: Object.fromEntries(
                    Object.entries((t.inputSchema?.properties || {}) as Record<string, any>).map(([k, v]) => [
                        k,
                        { type: typeof v?.type === 'string' ? v.type : 'string', description: String(v?.description || '') },
                    ])
                ),
                ...(Array.isArray(t.inputSchema?.required) && t.inputSchema.required.length ? { required: t.inputSchema.required } : {}),
            },
            execute: async (args) => {
                const out = await mcpService.callTool(url, String(t.name), args || {});
                const text = Array.isArray(out)
                    ? out.map((i: any) => i?.text ?? JSON.stringify(i)).join('\n')
                    : typeof out === 'string' ? out : JSON.stringify(out);
                return text.slice(0, 8000);
            },
        }));
    } catch {
        tools = []; // unreachable server — cache the miss too, retry after TTL
    }
    cache = { url, at: Date.now(), tools };
    return tools;
};
