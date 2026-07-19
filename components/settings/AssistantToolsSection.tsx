import React, { useState, useEffect, useMemo } from 'react';
import type { LLMSettings } from '../../types';
import type { AssistantTool } from '../../services/assistantTools';
import { ASSISTANT_TOOLS } from '../../services/assistantTools';
import { loadMcpAssistantTools } from '../../services/mcpAssistantTools';
import { SettingsGroup } from './primitives';
import { InformationCircleIcon } from '../icons';

interface AssistantToolsSectionProps {
    settings: LLMSettings;
}

interface DisplayTool {
    name: string;
    description: string;
    category: string;
    source: 'native' | 'mcp';
    serverLabel?: string;
}

/** Flat map for tools with no shared name prefix. Anything not listed here and
 *  not matched by a prefix rule below falls into 'Other' — visible, not silently
 *  dropped, and a nudge to categorize new tools as they're added. */
const NATIVE_CATEGORY_MAP: Record<string, string> = {
    navigate: 'App Control', search_prompts: 'App Control', save_prompt: 'App Control',
    search_gallery: 'App Control', search_cheatsheets: 'App Control',
    list_discovery_collections: 'App Control', search_discovery_prompts: 'App Control',

    refine_prompt: 'Prompt Engine', translate_prompt: 'Prompt Engine', rewrite_prompt: 'Prompt Engine',
    analyze_prompt: 'Prompt Engine', generate_crafter_prompt: 'Prompt Engine',
    save_refiner_preset: 'Prompt Engine', list_wildcards: 'Prompt Engine', abstract_image: 'Prompt Engine',

    send_to_refiner: 'Navigation', send_to_crafter: 'Navigation',
    send_to_prompt_analyzer: 'Navigation', clip_idea: 'Navigation',

    web_search: 'Web', fetch_url: 'Web', open_web_page: 'Web', play_media: 'Web', youtube_search: 'Web',

    save_file: 'Files & Memory', save_note: 'Files & Memory', list_notes: 'Files & Memory',
    update_note: 'Files & Memory', delete_note: 'Files & Memory', remember: 'Files & Memory',
    list_memories: 'Files & Memory', forget: 'Files & Memory',

    generate_image: 'Gallery & Generation', get_gallery_item: 'Gallery & Generation',
    delete_gallery_item: 'Gallery & Generation', save_to_gallery: 'Gallery & Generation',

    update_settings: 'Settings & MCP', list_mcp_servers: 'Settings & MCP', toggle_mcp_server: 'Settings & MCP',
};

function categorizeNativeTool(name: string): string {
    if (name.startsWith('browser_')) return 'Browser Control';
    if (name.startsWith('spotify_')) return 'Spotify';
    if (name.startsWith('tensorart_')) return 'Tensor Art';
    if (name.endsWith('_gmail')) return 'Gmail';
    return NATIVE_CATEGORY_MAP[name] ?? 'Other';
}

/** Every MCP-sourced tool's description is built as `[MCP] [<server name>] ...`
 *  by mcpAssistantTools.ts — pull the server name back out of that rather than
 *  comparing sanitized `mcp_<serverId>_` name prefixes against settings.mcpServers
 *  ids, which is lossy after sanitization. */
function splitMcpDescription(description: string): { serverLabel: string; clean: string } {
    const m = description.match(/^\[MCP\] \[(.+?)\]\s*/);
    return { serverLabel: m?.[1] ?? 'MCP', clean: description.replace(/^\[MCP\] \[.+?\]\s*/, '') };
}

const AssistantToolsSection: React.FC<AssistantToolsSectionProps> = ({ settings }) => {
    const [mcpTools, setMcpTools] = useState<AssistantTool[]>([]);
    const [mcpLoading, setMcpLoading] = useState(false);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        let cancelled = false;
        setMcpLoading(true);
        loadMcpAssistantTools(settings).then(tools => {
            if (!cancelled) { setMcpTools(tools); setMcpLoading(false); }
        });
        return () => { cancelled = true; };
    }, [settings.mcpServers]);

    const allTools = useMemo<DisplayTool[]>(() => {
        const native: DisplayTool[] = ASSISTANT_TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            category: categorizeNativeTool(t.name),
            source: 'native',
        }));
        const mcp: DisplayTool[] = mcpTools.map(t => {
            const { serverLabel, clean } = splitMcpDescription(t.description);
            return { name: t.name, description: clean, category: 'MCP', source: 'mcp', serverLabel };
        });
        return [...native, ...mcp];
    }, [mcpTools]);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return allTools;
        return allTools.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q)
        );
    }, [allTools, filter]);

    const grouped = useMemo(() => {
        const map = new Map<string, DisplayTool[]>();
        for (const t of filtered) {
            const list = map.get(t.category) || [];
            list.push(t);
            map.set(t.category, list);
        }
        return map;
    }, [filtered]);

    return (
        <div className="flex flex-col animate-fade-in pb-12">
            <div className="px-6 py-4">
                <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="form-input w-full max-w-md font-mono text-xs"
                    placeholder="Search tools by name, description, or category..."
                />
            </div>

            {mcpLoading && (
                <div className="px-6 pb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-base-content/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    Checking enabled MCP servers...
                </div>
            )}
            {!mcpLoading && mcpTools.length === 0 && (
                <p className="px-6 pb-2 text-sm font-medium text-base-content/40">
                    No MCP tools — enable a server in the MCP Servers tab.
                </p>
            )}

            {[...grouped.entries()].map(([category, tools]) => (
                <SettingsGroup key={category} title={`${category} [${tools.length}]`}>
                    <div className="flex flex-col gap-2 px-6 py-3">
                        {tools.map(t => (
                            <div
                                key={`${t.source}-${t.name}`}
                                className="border border-base-content/10 hover:border-base-content/20 bg-base-100/20 transition-all px-5 py-3"
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-black uppercase tracking-wider">{t.name}</span>
                                    {t.source === 'native' ? (
                                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-base-content/5 text-base-content/30 border border-base-content/10">
                                            Native
                                        </span>
                                    ) : (
                                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-info/10 text-info border border-info/30">
                                            {t.serverLabel}
                                        </span>
                                    )}
                                </div>
                                <p className="text-base font-medium text-base-content/70 mt-1.5 leading-relaxed">{t.description}</p>
                            </div>
                        ))}
                    </div>
                </SettingsGroup>
            ))}

            <div className="mx-6 mt-4 p-4 bg-info/5 border border-info/20 flex gap-3">
                <InformationCircleIcon className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                <p className="text-base font-medium leading-relaxed text-base-content/70">
                    New native tools are added in <code className="text-primary px-1 bg-base-100/50">services/assistantTools.ts</code>'s <code className="text-primary px-1 bg-base-100/50">ASSISTANT_TOOLS</code> array
                    (each entry: <code className="text-primary px-1 bg-base-100/50">name</code>, <code className="text-primary px-1 bg-base-100/50">description</code>, <code className="text-primary px-1 bg-base-100/50">parameters</code>, <code className="text-primary px-1 bg-base-100/50">execute</code>).
                    This tab reflects that list live.
                </p>
            </div>
        </div>
    );
};

export default AssistantToolsSection;
