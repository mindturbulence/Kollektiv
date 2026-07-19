import React, { useState, useEffect, useCallback } from 'react';
import type { LLMSettings, McpServerConfig } from '../../types';
import { mcpService } from '../../services/mcpService';
import { audioService } from '../../services/audioService';
import { CpuChipIcon, PlusIcon, CloseIcon } from '../icons';
import PredefinedMcpSection from './PredefinedMcpSection';

interface McpSectionProps {
    activeSubTab: string;
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
}

type McpTab = 'predefined' | 'custom';

interface ServerStatus {
    connected: boolean | null;
    toolCount?: number;
    checking: boolean;
}

function genId(): string {
    return 'mcp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

const McpSection: React.FC<McpSectionProps> = ({ activeSubTab, settings, handleSettingsChange }) => {
    if (activeSubTab !== 'mcp') return null;

    const [tab, setTab] = useState<McpTab>('predefined');
    const allServers = settings.mcpServers || [];
    // Predefined-tab entries (tagged with presetId) live in the same array but
    // are never shown or mutated here — they merge back untouched on every write.
    const servers = allServers.filter(s => !s.presetId);
    const [editId, setEditId] = useState<string | null>(null);
    const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({});

    const updateServers = useCallback((nextCustom: McpServerConfig[]) => {
        const presetEntries = allServers.filter(s => s.presetId);
        handleSettingsChange('mcpServers', [...presetEntries, ...nextCustom]);
    }, [handleSettingsChange, allServers]);

    const addServer = () => {
        audioService.playClick();
        const newServer: McpServerConfig = {
            id: genId(),
            name: 'New MCP Server',
            url: 'http://localhost:3010',
            enabled: false,
        };
        updateServers([...servers, newServer]);
        setEditId(newServer.id);
    };

    const removeServer = (id: string) => {
        audioService.playClick();
        updateServers(servers.filter(s => s.id !== id));
        if (editId === id) setEditId(null);
    };

    const updateOne = (id: string, patch: Partial<McpServerConfig>) => {
        updateServers(servers.map(s => s.id === id ? { ...s, ...patch } : s));
    };

    const testConnection = async (sv: McpServerConfig) => {
        setStatuses(prev => ({ ...prev, [sv.id]: { ...prev[sv.id], checking: true } }));
        const headers: Record<string, string> = { ...(sv.headers || {}) };
        if (sv.apiKey && !headers['Authorization']) headers['Authorization'] = `Bearer ${sv.apiKey}`;
        const extra = Object.keys(headers).length ? headers : undefined;
        try {
            const tools = await mcpService.listTools(sv.url, extra);
            setStatuses(prev => ({
                ...prev,
                [sv.id]: { connected: true, toolCount: tools.length, checking: false },
            }));
        } catch {
            setStatuses(prev => ({
                ...prev,
                [sv.id]: { connected: false, toolCount: 0, checking: false },
            }));
        }
    };

    // Auto-test servers that are enabled but have no status yet
    useEffect(() => {
        if (tab !== 'custom') return;
        for (const sv of servers) {
            if (sv.enabled && sv.url && statuses[sv.id] === undefined) {
                testConnection(sv);
            }
        }
    }, [servers, tab]);

    return (
        <div className="flex flex-col animate-fade-in pb-12">
            <div className="px-6 py-4 border-b border-base-content/10">
                <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-base-content/30">Model Context Protocol</h3>
                <p className="text-[10px] font-medium text-base-content/40 mt-1 uppercase leading-relaxed">
                    Connect to MCP servers for extended AI tools. Tools are exposed to the assistant as <code className="text-primary px-1 bg-base-100/50">mcp_&lt;server&gt;_&lt;tool&gt;</code>.
                </p>
                <div className="flex gap-0 mt-4">
                    <button
                        onClick={() => { audioService.playClick(); setTab('predefined'); }}
                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 ${tab === 'predefined' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                    >
                        Predefined
                    </button>
                    <button
                        onClick={() => { audioService.playClick(); setTab('custom'); }}
                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 ${tab === 'custom' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                    >
                        Custom [{servers.length}]
                    </button>
                </div>
            </div>

            {tab === 'predefined' && (
                <PredefinedMcpSection settings={settings} handleSettingsChange={handleSettingsChange} />
            )}

            {tab === 'custom' && (
                <>
                    <div className="px-6 py-4 flex justify-end">
                        <button
                            onClick={addServer}
                            className="form-btn px-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add Server
                        </button>
                    </div>

                    {servers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <CpuChipIcon className="w-12 h-12 text-base-content/10" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-base-content/30">No custom MCP servers configured</p>
                            <button onClick={addServer} className="form-btn px-4 text-[10px] font-black uppercase tracking-widest">
                                <PlusIcon className="w-3.5 h-3.5 inline mr-1" />
                                Add your first server
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col gap-3 px-6 py-4">
                        {servers.map(sv => {
                            const st = statuses[sv.id];
                            const isEditing = editId === sv.id;
                            return (
                                <div
                                    key={sv.id}
                                    className={`border transition-all ${isEditing ? 'border-primary/40 bg-primary/5' : 'border-base-content/10 hover:border-base-content/20 bg-base-100/20'}`}
                                >
                                    {/* Header row */}
                                    <div className="flex items-center justify-between px-5 py-3 gap-4">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st?.checking ? 'bg-warning animate-pulse' : st?.connected ? 'bg-success' : st?.connected === false ? 'bg-error' : 'bg-base-content/20'}`} />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-black uppercase tracking-wider truncate">{sv.name}</span>
                                                    {st?.toolCount !== undefined && (
                                                        <span className="text-[9px] font-mono text-base-content/40 border border-base-content/10 px-1.5 py-0.5">
                                                            {st.toolCount} tools
                                                        </span>
                                                    )}
                                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 ${sv.enabled ? 'bg-success/10 text-success border border-success/30' : 'bg-base-content/5 text-base-content/30 border border-base-content/10'}`}>
                                                        {sv.enabled ? 'Active' : 'Disabled'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-mono text-base-content/40 truncate mt-0.5">{sv.url}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                onClick={() => { audioService.playClick(); setEditId(isEditing ? null : sv.id); }}
                                                className={`form-btn px-3 text-[10px] font-black uppercase tracking-widest ${isEditing ? 'text-primary' : ''}`}
                                            >
                                                {isEditing ? 'Close' : 'Edit'}
                                            </button>
                                            <button
                                                onClick={() => { audioService.playClick(); testConnection(sv); }}
                                                disabled={st?.checking || !sv.url}
                                                className="form-btn px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
                                            >
                                                {st?.checking ? '...' : 'Ping'}
                                            </button>
                                            <button
                                                onClick={() => removeServer(sv.id)}
                                                className="form-btn px-3 text-[10px] font-black uppercase tracking-widest text-error hover:bg-error/10"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded edit panel */}
                                    {isEditing && (
                                        <div className="border-t border-primary/20 px-5 py-4 flex flex-col gap-4 animate-fade-in">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-base-content/40">Server Name</label>
                                                    <input
                                                        type="text"
                                                        value={sv.name}
                                                        onChange={e => updateOne(sv.id, { name: e.target.value })}
                                                        className="form-input font-bold text-sm"
                                                        placeholder="My MCP Server"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-base-content/40">Server URL</label>
                                                    <input
                                                        type="text"
                                                        value={sv.url}
                                                        onChange={e => updateOne(sv.id, { url: e.target.value })}
                                                        className="form-input font-mono text-xs"
                                                        placeholder="http://localhost:3010"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-base-content/40">
                                                        API Key <span className="text-base-content/20 font-normal">(optional, sent as Bearer token)</span>
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={sv.apiKey || ''}
                                                        onChange={e => updateOne(sv.id, { apiKey: e.target.value })}
                                                        className="form-input font-mono text-xs"
                                                        placeholder="sk-..."
                                                    />
                                                </div>
                                                <div className="flex items-end">
                                                    <label className="label cursor-pointer justify-start gap-3 p-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={sv.enabled}
                                                            onChange={e => updateOne(sv.id, { enabled: e.target.checked })}
                                                            className="toggle toggle-primary toggle-xs"
                                                        />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Enable this server</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Custom headers */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-base-content/40">
                                                        Custom Headers <span className="text-base-content/20 font-normal">(optional)</span>
                                                    </label>
                                                    <button
                                                        onClick={() => {
                                                            const next = { ...(sv.headers || {}), '': '' };
                                                            updateOne(sv.id, { headers: next });
                                                        }}
                                                        className="text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary-focus"
                                                    >
                                                        + Add Header
                                                    </button>
                                                </div>
                                                {sv.headers && Object.entries(sv.headers).map(([k, v], i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={k}
                                                            onChange={e => {
                                                                const next = { ...sv.headers };
                                                                delete next[k];
                                                                next[e.target.value] = v;
                                                                updateOne(sv.id, { headers: next });
                                                            }}
                                                            className="form-input flex-1 font-mono text-[10px]"
                                                            placeholder="Header-Name"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={v}
                                                            onChange={e => {
                                                                const next = { ...sv.headers, [k]: e.target.value };
                                                                if (!k) {
                                                                    delete next[''];
                                                                    if (e.target.value) next[''] = e.target.value;
                                                                }
                                                                updateOne(sv.id, { headers: next });
                                                            }}
                                                            className="form-input flex-[2] font-mono text-[10px]"
                                                            placeholder="Value"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const next = { ...sv.headers };
                                                                delete next[k];
                                                                if (Object.keys(next).length === 0) {
                                                                    updateOne(sv.id, { headers: undefined });
                                                                } else {
                                                                    updateOne(sv.id, { headers: next });
                                                                }
                                                            }}
                                                            className="form-btn px-2 text-error"
                                                        >
                                                            <CloseIcon className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Connection status detail */}
                                            {st && (
                                                <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-2 border ${st.connected ? 'bg-success/5 border-success/30 text-success' : st.connected === false ? 'bg-error/5 border-error/30 text-error' : ''}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${st.checking ? 'bg-warning animate-pulse' : st.connected ? 'bg-success' : 'bg-error'} ${st.connected === null ? 'bg-base-content/20' : ''}`} />
                                                    {st.checking ? 'Checking connection...' : st.connected ? `Connected — ${st.toolCount} tools available` : st.connected === false ? 'Unreachable — check URL and network' : 'Not tested'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default McpSection;
