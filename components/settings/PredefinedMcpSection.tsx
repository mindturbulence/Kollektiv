import React, { useState, useCallback } from 'react';
import type { LLMSettings, McpServerConfig } from '../../types';
import { MCP_PRESETS, McpPreset } from '../../constants/mcpPresets';
import { mcpService } from '../../services/mcpService';
import { audioService } from '../../services/audioService';
import { CopyIcon } from '../icons';

interface PredefinedMcpSectionProps {
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
}

interface ServerStatus {
    connected: boolean | null;
    toolCount?: number;
    checking: boolean;
}

function genId(): string {
    return 'mcp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

/** Pull the API key back out of a Firecrawl-built URL so the input shows
 *  what's already configured after a reload — the key lives in the URL,
 *  never in a separate stored field. */
function extractFirecrawlKey(url: string): string {
    const m = url.match(/^https:\/\/mcp\.firecrawl\.dev\/([^/]+)\/v2\/mcp$/);
    return m ? m[1] : '';
}

const PredefinedMcpSection: React.FC<PredefinedMcpSectionProps> = ({ settings, handleSettingsChange }) => {
    const servers = settings.mcpServers || [];
    const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({});
    // Ephemeral per-preset key input. For Firecrawl it seeds the stored URL;
    // for Brave it only interpolates into the copyable launch command — Kollektiv
    // never sends this as a header, the local process reads it from its own env.
    const [keyInputs, setKeyInputs] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const p of MCP_PRESETS) {
            if (p.buildUrl) {
                const existing = servers.find(s => s.presetId === p.id);
                if (existing) initial[p.id] = extractFirecrawlKey(existing.url);
            }
        }
        return initial;
    });
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const updateServers = useCallback((next: McpServerConfig[]) => {
        handleSettingsChange('mcpServers', next);
    }, [handleSettingsChange]);

    const findEntry = (presetId: string) => servers.find(s => s.presetId === presetId);

    const testConnection = async (sv: McpServerConfig) => {
        setStatuses(prev => ({ ...prev, [sv.id]: { ...prev[sv.id], checking: true } }));
        try {
            const tools = await mcpService.listTools(sv.url);
            setStatuses(prev => ({ ...prev, [sv.id]: { connected: true, toolCount: tools.length, checking: false } }));
        } catch {
            setStatuses(prev => ({ ...prev, [sv.id]: { connected: false, toolCount: 0, checking: false } }));
        }
    };

    const upsertEntry = (preset: McpPreset, patch: Partial<McpServerConfig>): McpServerConfig => {
        const existing = findEntry(preset.id);
        if (existing) {
            const updated = { ...existing, ...patch };
            updateServers(servers.map(s => s.id === existing.id ? updated : s));
            return updated;
        }
        const created: McpServerConfig = {
            id: genId(),
            name: preset.name,
            url: preset.defaultUrl || '',
            enabled: false,
            presetId: preset.id,
            ...patch,
        };
        updateServers([...servers, created]);
        return created;
    };

    const handleToggle = (preset: McpPreset, enabled: boolean) => {
        audioService.playClick();
        const entry = upsertEntry(preset, { enabled });
        if (enabled && entry.url) testConnection(entry);
    };

    const handleKeyInputChange = (preset: McpPreset, key: string) => {
        setKeyInputs(prev => ({ ...prev, [preset.id]: key }));
        if (preset.buildUrl) upsertEntry(preset, { url: key ? preset.buildUrl(key) : '' });
    };

    const copyCommand = (preset: McpPreset) => {
        const key = keyInputs[preset.id] || 'YOUR_API_KEY';
        const cmd = (preset.launchCommand || '').replace('{apiKey}', key);
        navigator.clipboard?.writeText(cmd).then(() => {
            setCopiedId(preset.id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    return (
        <div className="flex flex-col gap-3 px-6 py-4">
            {MCP_PRESETS.map(preset => {
                const entry = findEntry(preset.id);
                const st = entry ? statuses[entry.id] : undefined;
                const isEnabled = !!entry?.enabled;
                const awaitingKey = !!preset.buildUrl && !entry?.url;
                const cmd = preset.launchCommand
                    ? preset.launchCommand.replace('{apiKey}', keyInputs[preset.id] || 'YOUR_API_KEY')
                    : null;

                return (
                    <div
                        key={preset.id}
                        className="border border-base-content/10 hover:border-base-content/20 bg-base-100/20 transition-all"
                    >
                        <div className="flex items-center justify-between px-5 py-3 gap-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st?.checking ? 'bg-warning animate-pulse' : st?.connected ? 'bg-success' : st?.connected === false ? 'bg-error' : 'bg-base-content/20'}`} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black uppercase tracking-wider truncate">{preset.name}</span>
                                        {st?.toolCount !== undefined && (
                                            <span className="text-[9px] font-mono text-base-content/40 border border-base-content/10 px-1.5 py-0.5">
                                                {st.toolCount} tools
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-medium text-base-content/40 mt-0.5">{preset.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {entry && entry.url && (
                                    <button
                                        onClick={() => { audioService.playClick(); testConnection(entry); }}
                                        disabled={st?.checking}
                                        className="form-btn px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
                                    >
                                        {st?.checking ? '...' : 'Ping'}
                                    </button>
                                )}
                                <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    disabled={awaitingKey}
                                    onChange={e => handleToggle(preset, e.target.checked)}
                                    className="toggle toggle-primary toggle-xs disabled:opacity-30"
                                    title={awaitingKey ? 'Enter an API key first' : undefined}
                                />
                            </div>
                        </div>

                        <div className="border-t border-base-content/10 px-5 py-4 flex flex-col gap-3">
                            {preset.needsApiKey && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-base-content/40">API Key</label>
                                    <input
                                        type="password"
                                        value={keyInputs[preset.id] || ''}
                                        onChange={e => handleKeyInputChange(preset, e.target.value)}
                                        className="form-input font-mono text-xs max-w-md"
                                        placeholder={preset.id === 'firecrawl' ? 'fc-...' : 'API key'}
                                    />
                                </div>
                            )}

                            {cmd && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-base-content/40">Run locally</label>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 text-[11px] font-mono bg-black/30 px-3 py-2.5 text-primary break-all select-all">
                                            {cmd}
                                        </code>
                                        <button
                                            onClick={() => { audioService.playClick(); copyCommand(preset); }}
                                            className="shrink-0 p-2 hover:text-primary transition-colors border border-white/10 hover:border-primary/40"
                                            title="Copy command"
                                        >
                                            {copiedId === preset.id ? <span className="text-[9px] font-black text-success">OK</span> : <CopyIcon className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {preset.launchNotes && (
                                <p className="text-[10px] font-mono text-base-content/40 leading-relaxed">{preset.launchNotes}</p>
                            )}

                            {st && (
                                <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-2 border ${st.connected ? 'bg-success/5 border-success/30 text-success' : st.connected === false ? 'bg-error/5 border-error/30 text-error' : ''}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${st.checking ? 'bg-warning animate-pulse' : st.connected ? 'bg-success' : 'bg-error'}`} />
                                    {st.checking ? 'Checking connection...' : st.connected ? `Connected — ${st.toolCount} tools available` : 'Unreachable — check the server is running'}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PredefinedMcpSection;
