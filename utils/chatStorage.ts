export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    updatedAt: number;
}

const STORAGE_KEY = 'kollektiv_chat_sessions';

export const getSavedChatSessions = (): ChatSession[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            return JSON.parse(data).sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt);
        }
    } catch (error) {
        console.error('Failed to parse chat sessions', error);
    }
    return [];
};

export const saveChatSession = (session: ChatSession): void => {
    const sessions = getSavedChatSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
        sessions[existingIndex] = { ...session, updatedAt: Date.now() };
    } else {
        sessions.push({ ...session, updatedAt: Date.now() });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

export const deleteChatSession = (id: string): void => {
    const sessions = getSavedChatSessions();
    const filtered = sessions.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const clearAllChatSessions = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};
