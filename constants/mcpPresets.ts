/** Curated, battle-tested MCP servers offered on Settings > MCP Servers > Predefined.
 *  Each preset maps to a single McpServerConfig entry (tagged with `presetId`)
 *  in the same settings.mcpServers array the Custom tab manages — the tool
 *  loader (services/mcpAssistantTools.ts) doesn't distinguish origin at all. */

import type { McpServerConfig } from '../types';

export interface McpPreset {
    id: string;
    name: string;
    description: string;
    /** True if the server needs an API key to function at all. */
    needsApiKey: boolean;
    /** Hosted, remote servers: build the connection URL from the user's API key.
     *  Kollektiv sends no extra auth — the key is already embedded in the URL. */
    buildUrl?: (apiKey: string) => string;
    /** Local servers: the default URL once the user has the local process running.
     *  Kollektiv connects with no auth header — the key (if any) configures the
     *  LOCAL process the user launches, not a header Kollektiv sends. */
    defaultUrl?: string;
    /** Local servers only: the command to run, with {apiKey} as a placeholder
     *  substituted from the user's input before showing/copying it. */
    launchCommand?: string;
    /** Short note shown under the launch command (API key source, caveats). */
    launchNotes?: string;
}

export const MCP_PRESETS: McpPreset[] = [
    {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: 'Web scraping and search that handles JS-rendered pages. Hosted — no local process required.',
        needsApiKey: true,
        buildUrl: (apiKey) => `https://mcp.firecrawl.dev/${apiKey}/v2/mcp`,
        launchNotes: 'Get a free API key at firecrawl.dev — paste it below, no local setup needed.',
    },
    {
        id: 'brave-search',
        name: 'Brave Search',
        description: 'Web, image, video, news, and local search via the official Brave Search API.',
        needsApiKey: true,
        defaultUrl: 'http://127.0.0.1:8080/mcp',
        launchCommand: 'set BRAVE_API_KEY={apiKey} && npx -y @brave/brave-search-mcp-server --transport http',
        launchNotes: 'Free API key at api-dashboard.search.brave.com. Runs locally — leave the command running in a terminal, then Ping to verify.',
    },
    {
        id: 'playwright',
        name: 'Playwright',
        description: 'Official Microsoft browser automation — navigate, click, screenshot, extract content.',
        needsApiKey: false,
        defaultUrl: 'http://localhost:8931/mcp',
        launchNotes: 'No API key needed. Auto-started by the dev server (server.ts) on port 8931 — just toggle it on, then Ping to verify.',
    },
];

export function genMcpServerId(): string {
    return 'mcp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

/** Find the settings.mcpServers entry derived from a given preset, if any. */
export function findMcpPresetEntry(servers: McpServerConfig[], presetId: string): McpServerConfig | undefined {
    return servers.find(s => s.presetId === presetId);
}

/** Create-or-update the entry for a preset within a servers array. Single
 *  definition of "how a preset becomes a settings.mcpServers entry" — shared
 *  by the Predefined Settings UI and the assistant's toggle_mcp_server tool. */
export function upsertMcpPresetEntry(
    servers: McpServerConfig[],
    preset: McpPreset,
    patch: Partial<McpServerConfig>,
): { servers: McpServerConfig[]; entry: McpServerConfig } {
    const existing = findMcpPresetEntry(servers, preset.id);
    if (existing) {
        const updated = { ...existing, ...patch };
        return { servers: servers.map(s => s.id === existing.id ? updated : s), entry: updated };
    }
    const created: McpServerConfig = {
        id: genMcpServerId(),
        name: preset.name,
        url: preset.defaultUrl || '',
        enabled: false,
        presetId: preset.id,
        ...patch,
    };
    return { servers: [...servers, created], entry: created };
}
