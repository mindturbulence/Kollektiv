import { describe, it, expect, beforeEach } from 'vitest';
import { loadMemories, addMemory, deleteMemory, memoryPromptBlock } from './memoryStorage';

beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
    };
});

describe('memoryStorage', () => {
    it('adds and lists memories', () => {
        addMemory('prefers 85mm portraits');
        expect(loadMemories()).toHaveLength(1);
    });
    it('rejects empty and exact duplicates', () => {
        expect(addMemory('  ')).toBeNull();
        addMemory('likes neon');
        expect(addMemory('likes neon')).toBeNull();
        expect(loadMemories()).toHaveLength(1);
    });
    it('caps at 50, dropping the oldest', () => {
        for (let i = 0; i < 55; i++) addMemory(`fact ${i}`);
        const facts = loadMemories().map(m => m.fact);
        expect(facts).toHaveLength(50);
        expect(facts).not.toContain('fact 0');
        expect(facts).toContain('fact 54');
    });
    it('deletes by id', () => {
        const m = addMemory('temp')!;
        expect(deleteMemory(m.id)).toBe(true);
        expect(deleteMemory(m.id)).toBe(false);
    });
    it('builds a prompt block, empty when no memories', () => {
        expect(memoryPromptBlock()).toBe('');
        addMemory('speaks German');
        expect(memoryPromptBlock()).toContain('speaks German');
    });
});
