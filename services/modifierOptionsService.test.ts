import { describe, it, expect } from 'vitest';
import { modifierOptionsService, type CustomOptionEntry } from './modifierOptionsService';

describe('modifierOptionsService.mergeOptions', () => {
    it('returns builtin options unchanged when custom is empty', () => {
        const builtin = ['A', 'B', 'C'];
        const result = modifierOptionsService.mergeOptions(builtin, []);
        expect(result).toEqual(builtin);
    });

    it('appends custom entries not in builtin', () => {
        const builtin = ['A', 'B'];
        const custom: (string | CustomOptionEntry)[] = ['C', 'D'];
        const result = modifierOptionsService.mergeOptions(builtin, custom);
        expect(result).toContain('A');
        expect(result).toContain('B');
        expect(result).toContain('C');
        expect(result).toContain('D');
    });

    it('deduplicates case-insensitively', () => {
        const builtin = ['Sunset'];
        const custom: (string | CustomOptionEntry)[] = ['sunset'];
        const result = modifierOptionsService.mergeOptions(builtin, custom);
        expect(result.length).toBe(1);
    });

    it('handles descriptive custom entries with description', () => {
        const builtin = ['A'];
        const custom: (string | CustomOptionEntry)[] = [{ name: 'B', description: 'Custom B' }];
        const result = modifierOptionsService.mergeOptions(builtin, custom);
        expect(result).toContain('A');
        expect(result.some(v => v.includes('B'))).toBe(true);
    });
});

describe('modifierOptionsService instance', () => {
    it('is a singleton with expected methods', () => {
        expect(modifierOptionsService).toBeDefined();
        expect(typeof modifierOptionsService.loadCustomOptions).toBe('function');
        expect(typeof modifierOptionsService.addCustomOption).toBe('function');
        expect(typeof modifierOptionsService.removeCustomOption).toBe('function');
        expect(typeof modifierOptionsService.mergeOptions).toBe('function');
    });

    it('loadCustomOptions returns empty object when no directory selected', async () => {
        const result = await modifierOptionsService.loadCustomOptions();
        expect(typeof result).toBe('object');
    });
});
