export interface ChatMessageAttachment {
    data: string; // Base64 data including or excluding data URI prefix? Let's use data URI prefix for UI rendering, and rip it out for Gemini payload.
    mimeType: string;
    fileName?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: ChatMessageAttachment[];
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
            const sessions: ChatSession[] = JSON.parse(data);
            // Defensive: a past bug could have persisted a non-string content
            // (e.g. a raw event payload object) into a saved session. Coerce
            // here, the one place every consumer reads persisted sessions
            // through, rather than guarding every render site downstream.
            for (const session of sessions) {
                for (const msg of session.messages || []) {
                    if (typeof msg.content !== 'string') {
                        msg.content = msg.content == null ? '' : String(msg.content);
                    }
                }
            }
            return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
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
