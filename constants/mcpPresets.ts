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
        id: 'kollektiv-mcp',
        name: 'Kollektiv MCP',
        description: 'Internal MCP control panel — browser automation, vault tools, and assistant capabilities. Auto-started by the dev server on port 3012.',
        needsApiKey: false,
        defaultUrl: 'http://127.0.0.1:3012',
        launchNotes: 'No API key needed. Auto-started by the dev server — toggle it on, then Ping to verify. Serves 60+ tools across browser automation and vault access.',
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
        // Sync the URL from the preset on every update so that changes to
        // preset.defaultUrl (e.g. after a server migration) propagate to
        // existing stored entries without requiring a manual reset.
        const updated = { ...existing, url: preset.defaultUrl || existing.url, ...patch };
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
