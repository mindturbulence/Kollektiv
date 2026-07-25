import React, { useState, useCallback } from 'react';
import type { LLMSettings, McpServerConfig } from '../../types';
import { MCP_PRESETS, findMcpPresetEntry, upsertMcpPresetEntry } from '../../constants/mcpPresets';
import { mcpService } from '../../services/mcpService';
import { audioService } from '../../services/audioService';
import { CpuChipIcon } from '../icons';

interface PredefinedMcpSectionProps {
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
}

interface ServerStatus {
    connected: boolean | null;
    toolCount?: number;
    tools?: { name: string; description?: string }[];
    checking: boolean;
}

const PredefinedMcpSection: React.FC<PredefinedMcpSectionProps> = ({ settings, handleSettingsChange }) => {
    const servers = settings.mcpServers || [];
    const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({});

    const updateServers = useCallback((next: McpServerConfig[]) => {
        handleSettingsChange('mcpServers', next);
    }, [handleSettingsChange]);

    const preset = MCP_PRESETS[0];
    const entry = preset ? findMcpPresetEntry(servers, preset.id) : undefined;
    // Use the preset's current defaultUrl for all operations, overriding any
    // stale URL the user may have stored (e.g. from a previous preset URL).
    const effectiveUrl = preset?.defaultUrl || entry?.url || '';
    const st = entry ? statuses[entry.id] : undefined;
    const isEnabled = !!entry?.enabled;

    const testConnection = async (sv: McpServerConfig) => {
        setStatuses(prev => ({ ...prev, [sv.id]: { ...prev[sv.id], checking: true } }));
        try {
            const tools = await mcpService.listTools(sv.url);
            setStatuses(prev => ({ ...prev, [sv.id]: { connected: true, toolCount: tools.length, tools: tools as any[], checking: false } }));
        } catch {
            setStatuses(prev => ({ ...prev, [sv.id]: { connected: false, toolCount: 0, tools: [], checking: false } }));
        }
    };

    const handleToggle = (enabled: boolean) => {
        audioService.playClick();
        if (!preset) return;
        const { servers: next, entry: updated } = upsertMcpPresetEntry(servers, preset, { enabled });
        updateServers(next);
        if (enabled && updated.url) testConnection(updated);
    };

    if (!preset) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 py-4">
            {/* ── Left column: Kollektiv MCP info card ── */}
            <div className="border border-base-content/10 bg-base-100/20 transition-all self-start">
                <div className="flex items-center justify-between px-5 py-4 gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st?.checking ? 'bg-warning animate-pulse' : st?.connected ? 'bg-success' : st?.connected === false ? 'bg-error' : 'bg-base-content/20'}`} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black uppercase tracking-wider">{preset.name}</span>
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
                        {effectiveUrl && (
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    testConnection({ ...(entry || { id: '' }), url: effectiveUrl } as McpServerConfig);
                                }}
                                disabled={st?.checking}
                                className="form-btn px-3 py-1.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
                            >
                                {st?.checking ? '...' : 'Ping'}
                            </button>
                        )}
                        <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={e => handleToggle(e.target.checked)}
                            className="toggle toggle-primary toggle-xs"
                        />
                    </div>
                </div>

                <div className="border-t border-base-content/10 px-5 py-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-base-content/50">
                        <span className="uppercase font-black tracking-wider text-[9px] text-base-content/30">URL</span>
                        <code className="text-primary/80 select-all">{preset.defaultUrl}</code>
                    </div>

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

            {/* ── Right column: Available tools list ── */}
            <div className="border border-base-content/10 bg-base-100/20 transition-all self-start">
                <div className="px-5 py-3 border-b border-base-content/10">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-base-content/30 flex items-center gap-2">
                        <CpuChipIcon className="w-3.5 h-3.5" />
                        Available Tools
                        {st?.toolCount !== undefined && (
                            <span className="text-[9px] font-mono text-base-content/40 border border-base-content/10 px-1.5 py-0.5">{st.toolCount}</span>
                        )}
                    </h4>
                </div>
                <div className="divide-y divide-base-content/5 max-h-[400px] overflow-y-auto">
                    {st?.tools && st.tools.length > 0 ? (
                        st.tools.map((tool, i) => (
                            <div key={i} className="px-5 py-2.5 hover:bg-base-100/30 transition-colors">
                                <div className="flex items-center gap-2">
                                    <code className="text-[11px] font-mono font-bold text-primary">
                                        {tool.name}
                                    </code>
                                </div>
                                {tool.description && (
                                    <p className="text-[10px] font-medium text-base-content/40 mt-0.5 leading-relaxed line-clamp-2">
                                        {tool.description}
                                    </p>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <CpuChipIcon className="w-8 h-8 text-base-content/10" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-base-content/30 text-center px-4">
                                {st?.checking
                                    ? 'Loading tools...'
                                    : st?.connected === false
                                    ? 'Server unreachable — Ping to retry'
                                    : st?.connected === true
                                    ? '0 tools registered on this server'
                                    : 'Click Ping to discover available tools'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredefinedMcpSection;
