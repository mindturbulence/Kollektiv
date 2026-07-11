import { v4 as uuidv4 } from 'uuid';
import { appEventBus } from './eventBus';

export interface AssistantNote {
    id: string;
    title: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    source: 'assistant' | 'user';
}

const KEY = 'assistantNotes';

export const loadNotes = (): AssistantNote[] => {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const persist = (notes: AssistantNote[]): void => {
    localStorage.setItem(KEY, JSON.stringify(notes));
    appEventBus.emit('notesChanged', notes);
};

export const addNote = (title: string, content: string, source: 'assistant' | 'user' = 'assistant'): AssistantNote => {
    const now = Date.now();
    const note: AssistantNote = {
        id: uuidv4(),
        title: title.trim() || content.trim().slice(0, 40) || 'Untitled note',
        content,
        createdAt: now,
        updatedAt: now,
        source,
    };
    persist([note, ...loadNotes()]);
    return note;
};

export const updateNote = (id: string, patch: Partial<Pick<AssistantNote, 'title' | 'content'>>): AssistantNote | null => {
    const notes = loadNotes();
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    notes[idx] = { ...notes[idx], ...patch, updatedAt: Date.now() };
    persist(notes);
    return notes[idx];
};

export const deleteNote = (id: string): boolean => {
    const notes = loadNotes();
    const next = notes.filter(n => n.id !== id);
    if (next.length === notes.length) return false;
    persist(next);
    return true;
};

export const clearNotes = (): void => persist([]);
