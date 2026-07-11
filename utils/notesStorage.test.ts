import { describe, it, expect, beforeEach } from 'vitest';
import { loadNotes, addNote, updateNote, deleteNote, clearNotes } from './notesStorage';

beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
    };
});

describe('notesStorage', () => {
    it('adds a note with derived title and lists newest first', () => {
        addNote('', 'remember the neon palette');
        const second = addNote('Palette', 'cyan + magenta');
        const notes = loadNotes();
        expect(notes).toHaveLength(2);
        expect(notes[0].id).toBe(second.id);
        expect(notes[1].title).toBe('remember the neon palette');
    });
    it('updates title/content and persists', () => {
        const n = addNote('a', 'b');
        const updated = updateNote(n.id, { content: 'c' });
        expect(updated?.content).toBe('c');
        expect(loadNotes()[0].content).toBe('c');
    });
    it('update of unknown id returns null', () => {
        expect(updateNote('nope', { title: 'x' })).toBeNull();
    });
    it('deletes and clears', () => {
        const n = addNote('a', 'b');
        expect(deleteNote(n.id)).toBe(true);
        expect(deleteNote(n.id)).toBe(false);
        addNote('a', 'b');
        clearNotes();
        expect(loadNotes()).toHaveLength(0);
    });
    it('survives corrupted storage', () => {
        (globalThis as any).localStorage.setItem('assistantNotes', '{broken');
        expect(loadNotes()).toEqual([]);
    });
});
