import { v4 as uuidv4 } from 'uuid';

export interface MemoryEntry {
    id: string;
    fact: string;
    createdAt: number;
}

const KEY = 'assistantMemories';
const MAX = 50;

export const loadMemories = (): MemoryEntry[] => {
    try {
        if (typeof localStorage === 'undefined') return [];
        const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const persist = (memories: MemoryEntry[]): void => {
    localStorage.setItem(KEY, JSON.stringify(memories));
};

export const addMemory = (fact: string): MemoryEntry | null => {
    const trimmed = fact.trim();
    if (!trimmed) return null;
    const memories = loadMemories();
    if (memories.some(m => m.fact === trimmed)) return null;
    const entry: MemoryEntry = { id: uuidv4(), fact: trimmed, createdAt: Date.now() };
    persist([...memories, entry].slice(-MAX)); // oldest out
    return entry;
};

export const deleteMemory = (id: string): boolean => {
    const memories = loadMemories();
    const next = memories.filter(m => m.id !== id);
    if (next.length === memories.length) return false;
    persist(next);
    return true;
};

/** System-prompt block injected by buildSystemIdentity. Empty string when
 * there is nothing remembered, so it adds zero tokens by default. */
export const memoryPromptBlock = (): string => {
    const memories = loadMemories();
    if (!memories.length) return '';
    return `Persistent memories about the user from earlier sessions (use them, do not recite them unprompted):\n${memories.map(m => `- ${m.fact}`).join('\n')}`;
};

/**
 * A cached block of agent memory (AGENT.md content) for use by the
 * memory consolidation service. Updated by syncAgentMemoryToVault.
 */
let _agentMemoryBlock: string | null = null;

/**
 * Read the in-memory cached AGENT.md block.
 */
export const getAgentMemoryBlock = (): string | null => _agentMemoryBlock;

/**
 * Persist the consolidated AGENT.md content to both the in-memory cache
 * and the vault (via the file system manager). Currently caches in-memory;
 * vault persistence requires the FileSystemManager to be available.
 */
export const syncAgentMemoryToVault = async (content: string): Promise<void> => {
    _agentMemoryBlock = content;
    // Vault persistence happens through memoryConsolidationService.ts's caller
    // which has access to the FileSystemManager. We cache in-memory for
    // quick retrieval.
};
