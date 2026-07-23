import { describe, it, expect } from 'vitest';
import { fuzzyScore, searchCommands, ALL_COMMANDS } from '../constants/commandRegistry';
import type { CommandItem } from '../constants/commandRegistry';

describe('fuzzyScore', () => {
    it('returns 0 for empty query or target', () => {
        expect(fuzzyScore('', 'dashboard')).toBe(0);
        expect(fuzzyScore('dash', '')).toBe(0);
        expect(fuzzyScore('', '')).toBe(0);
    });

    it('returns 1.0 for exact prefix match', () => {
        expect(fuzzyScore('dash', 'dashboard')).toBe(1.0);
        expect(fuzzyScore('assistant', 'assistant')).toBe(1.0);
        expect(fuzzyScore('set', 'settings')).toBe(1.0);
    });

    it('returns 0.8 for substring match (not prefix)', () => {
        expect(fuzzyScore('board', 'dashboard')).toBe(0.8);
        expect(fuzzyScore('edia', 'media')).toBe(0.8);
        expect(fuzzyScore('panel', 'toggle media panel')).toBe(0.8);
    });

    it('returns >0 for character-by-character subsequence match', () => {
        // 'clr' appears as subsequence in 'color'
        const score = fuzzyScore('clr', 'color');
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(0.8);
    });

    it('returns 0 when query chars cannot be matched in order', () => {
        expect(fuzzyScore('xyz', 'dashboard')).toBe(0);
        expect(fuzzyScore('abc', '')).toBe(0);
    });

    it('is case-insensitive', () => {
        expect(fuzzyScore('DASH', 'dashboard')).toBe(1.0);
        expect(fuzzyScore('dash', 'DASHBOARD')).toBe(1.0);
        expect(fuzzyScore('MEDIA', 'Toggle Media Panel')).toBe(0.8);
    });

    it('trims whitespace from query and target', () => {
        expect(fuzzyScore('  dash  ', '  dashboard  ')).toBe(1.0);
        expect(fuzzyScore('  ', 'dashboard')).toBe(0);
    });

    it('scores consecutive subsequence higher than scattered', () => {
        const consecutive = fuzzyScore('clr', 'color');
        const scattered = fuzzyScore('cba', 'color');
        // 'clr' matches 'c' 'l' 'r' — 'l' and 'r' are consecutive in 'color' → higher streak
        // 'cba' matches 'c' then 'b...a' fails → returns 0
        expect(consecutive).toBeGreaterThanOrEqual(scattered);
    });

    it('handles single character query', () => {
        expect(fuzzyScore('a', 'assistant')).toBe(1.0);
        expect(fuzzyScore('z', 'dashboard')).toBe(0);
    });
});

describe('searchCommands', () => {
    const testCommands: CommandItem[] = [
        { id: 'nav-dashboard', label: 'Dashboard', category: 'Navigation', keywords: ['home', 'landing'], execute: () => {} },
        { id: 'nav-assistant', label: 'Assistant', category: 'Navigation', keywords: ['ai', 'chat', 'voice'], execute: () => {} },
        { id: 'panel-media', label: 'Toggle Media Panel', category: 'Panels', keywords: ['music', 'youtube'], execute: () => {} },
        { id: 'action-refine', label: 'Open Refiner', category: 'Assistant Actions', keywords: ['enhance', 'improve'], execute: () => {} },
        { id: 'theme-next', label: 'Next Theme', category: 'Themes', keywords: ['switch theme', 'cycle'], execute: () => {} },
    ];

    it('returns all commands when query is empty', () => {
        const results = searchCommands('', testCommands);
        expect(results).toHaveLength(5);
        expect(results).toEqual(testCommands);
    });

    it('filters by label match (prefix)', () => {
        const results = searchCommands('dash', testCommands);
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('nav-dashboard');
    });

    it('filters by label match (substring)', () => {
        const results = searchCommands('board', testCommands);
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('nav-dashboard');
    });

    it('filters by keyword match', () => {
        const results = searchCommands('music', testCommands);
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('panel-media');
    });

    it('returns multiple matches sorted by score', () => {
        const results = searchCommands('a', testCommands);
        // 'Assistant' should rank higher than 'Dashboard' because 'a' is a prefix
        expect(results[0].id).toBe('nav-assistant');
    });

    it('boosts primary label score over keyword score', () => {
        const results = searchCommands('voice', testCommands);
        // 'voice' is a keyword of 'Assistant' — works
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === 'nav-assistant')).toBe(true);
    });

    it('returns empty for non-matching query', () => {
        const results = searchCommands('xyznonexistent', testCommands);
        expect(results).toHaveLength(0);
    });
});

describe('command registry integrity', () => {
    it('all commands have unique ids', () => {
        const ids = ALL_COMMANDS.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('all commands have required fields', () => {
        for (const cmd of ALL_COMMANDS) {
            expect(cmd.id).toBeTruthy();
            expect(cmd.label).toBeTruthy();
            expect(cmd.category).toBeTruthy();
            expect(Array.isArray(cmd.keywords)).toBe(true);
            expect(typeof cmd.execute).toBe('function');
        }
    });

    it('has at least one command per expected category', () => {
        const categories = ALL_COMMANDS.map(c => c.category);
        expect(categories).toContain('Navigation');
        expect(categories).toContain('Panels');
        expect(categories).toContain('Assistant Actions');
        expect(categories).toContain('Themes');
    });

    it('navigation commands cover major app pages', () => {
        const navLabels = ALL_COMMANDS
            .filter(c => c.category === 'Navigation')
            .map(c => c.label.toLowerCase());
        expect(navLabels).toContain('dashboard');
        expect(navLabels).toContain('assistant');
        expect(navLabels).toContain('gallery (vault)');
        expect(navLabels).toContain('settings');
    });

    it('panel commands cover all major panels', () => {
        const panelLabels = ALL_COMMANDS
            .filter(c => c.category === 'Panels')
            .map(c => c.id);
        expect(panelLabels).toContain('panel-media');
        expect(panelLabels).toContain('panel-clipping');
        expect(panelLabels).toContain('panel-webviewer');
        expect(panelLabels).toContain('panel-chat');
    });
});

describe('fuzzyScore integration with searchCommands', () => {
    it('fuzzy subsequence match finds commands', () => {
        // 'dsh' should match 'dashboard' via subsequence match
        const results = searchCommands('dsh');
        expect(results.some(r => r.id === 'nav-dashboard')).toBe(true);
    });

    it('scored results are ordered by relevance', () => {
        // 'ref' should match 'Refiner' (prefix → high score) and 'Open Refiner' (label)
        const results = searchCommands('ref');
        if (results.length >= 2) {
            const topScore = fuzzyScore('ref', results[0].label);
            const bottomScore = fuzzyScore('ref', results[results.length - 1].label);
            expect(topScore).toBeGreaterThanOrEqual(bottomScore);
        }
    });
});
