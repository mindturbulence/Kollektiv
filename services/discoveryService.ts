
export interface DiscoveryCollection {
    id: string;
    name: string;
    repo: string;
    description: string;
    stars?: number;
    tags: string[];
    sourceType?: 'github' | 'huggingface';
    config?: string;
}

export interface PromptItem {
    id: string;
    category: string;
    title: string;
    prompt: string;
    imageUrl?: string;
    createdAt?: string;
}

const COLLECTIONS: DiscoveryCollection[] = [
    {
        id: 'flux-prompting',
        name: 'Flux Prompting',
        repo: 'VincentGOURBIN/FluxPrompting',
        config: 'default',
        description: 'Comprehensive dataset of high-fidelity prompts optimized for Flux and state-of-the-art diffusion models.',
        tags: ['Flux', 'High-Fidelity', 'Prompting'],
        sourceType: 'huggingface'
    }
];

export const discoveryService = {
    getCollections: async (): Promise<DiscoveryCollection[]> => {
        return COLLECTIONS;
    },

    fetchPrompts: async (collection: DiscoveryCollection, offset: number = 0, length: number = 50): Promise<string> => {
        if (collection.sourceType === 'huggingface') {
            try {
                // Primary endpoint: Datasets Server Rows
                const config = collection.config || 'default';
                const url = `https://datasets-server.huggingface.co/rows?dataset=${collection.repo}&config=${config}&split=train&offset=${offset}&length=${length}`;
                
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.rows && data.rows.length > 0) {
                        return `---HF_JSON_PAYLOAD---\n${JSON.stringify(data)}`;
                    }
                }
                
                // Secondary check: Config might be missing or different
                const infoUrl = `https://datasets-server.huggingface.co/info?dataset=${collection.repo}`;
                const infoRes = await fetch(infoUrl);
                if (infoRes.ok) {
                    const info = await infoRes.json();
                    const actualConfig = Object.keys(info.dataset_info || {})[2] || Object.keys(info.dataset_info || {})[0] || config;
                    const fallbackUrl = `https://datasets-server.huggingface.co/rows?dataset=${collection.repo}&config=${actualConfig}&split=train&offset=${offset}&length=${length}`;
                    
                    const fallbackRes = await fetch(fallbackUrl);
                    if (fallbackRes.ok) {
                        const fbData = await fallbackRes.json();
                        if (fbData && fbData.rows && fbData.rows.length > 0) {
                            return `---HF_JSON_PAYLOAD---\n${JSON.stringify(fbData)}`;
                        }
                    }
                }

                return `---ERROR---\nValidation failed: Database "${collection.name}" is currently unreachable or restricted.`;
            } catch (err) {
                console.error('HF fetch failed:', err);
                return `---ERROR---\nConnection interrupted: ${err instanceof Error ? err.message : 'Unknown Network Error'}`;
            }
        }
        return `---ERROR---\nInvalid Source Configuration`;
    },

    searchPrompts: async (collection: DiscoveryCollection, query: string, offset: number = 0, length: number = 50): Promise<string> => {
        if (!query) return JSON.stringify({ rows: [] });

        if (collection.sourceType === 'huggingface') {
            try {
                const config = collection.config || 'default';
                const url = `https://datasets-server.huggingface.co/search?dataset=${collection.repo}&config=${config}&split=train&query=${encodeURIComponent(query)}&offset=${offset}&length=${length}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    return `---HF_JSON_PAYLOAD---\n${JSON.stringify(data)}`;
                }
                
                // Search often fails if indexing isn't complete, fallback to list
                return discoveryService.fetchPrompts(collection, offset, length);
            } catch (err) {
                return `---ERROR---\nSearch synchronization failed`;
            }
        }
        return `---ERROR---\nOperation not supported`;
    },

    parsePromptsFromMarkdown: (markdown: string): PromptItem[] => {
        if (!markdown || markdown.startsWith('---ERROR---')) return [];

        if (markdown.startsWith('---HF_JSON_PAYLOAD---')) {
            try {
                const data = JSON.parse(markdown.replace('---HF_JSON_PAYLOAD---\n', ''));
                const rows = data.rows || [];
                return rows.map((row: any, idx: number) => {
                    const r = row.row;
                    
                    // Comprehensive field mapping for image prompt datasets
                    const prompt = r.final_prompt || r.revised_prompt || r.gpt_prompt || r.Prompt || r.prompt || r.text || r.content || r.instruction || 
                                   r.text_raw || r.caption || r.image_caption || r.user_prompt || r.description || '';
                                   
                    const category = r.theme || r.sampler || r.model || r.source || r.category || r.label || '';
                    const timestamp = r.timestamp || r.created_at || r.date || new Date().toISOString();
                    
                    return {
                        id: row.row_idx !== undefined ? `hf-${row.row_idx}` : `hf-${idx}-${Math.random().toString(36).substr(2, 5)}`,
                        category: category ? String(category).substring(0, 20) : 'Archive Record',
                        title: String(prompt).length > 0 ? (String(prompt).substring(0, 50).trim() + (String(prompt).length > 50 ? '...' : '')) : 'Untitled Record',
                        prompt: String(prompt).trim(),
                        createdAt: timestamp
                    };
                }).filter((p: any) => p.prompt.length > 5);
            } catch (e) {
                console.error('HF JSON parse error:', e);
            }
        }
        return [];
    }
};
