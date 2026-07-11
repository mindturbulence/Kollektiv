import { describe, it, expect } from 'vitest';
import { replacePlaceholders, resolveField } from './templating';

describe('replacePlaceholders', () => {
    const data: Record<string, any> = { name: 'foo', obj: { a: 1 } };
    const resolve = (field: string) => data[field];

    it('substitutes known fields with their string value', () => {
        expect(replacePlaceholders('Hello {{name}}', resolve)).toBe('Hello foo');
    });

    it('stringifies object values as a JSON block', () => {
        expect(replacePlaceholders('{{obj}}', resolve)).toContain('"a": 1');
    });

    it('removes optional placeholders (trailing ?) when the value is undefined', () => {
        expect(replacePlaceholders('[{{missing?}}]', resolve)).toBe('[]');
    });

    it('falls back to undefinedText when provided and the value is undefined', () => {
        expect(replacePlaceholders('{{missing}}', resolve, '-')).toBe('-');
    });
});

describe('resolveField', () => {
    const ctx = {
        fileMetadata: { a: 1 },
        civitaiMetadata: { b: 2 },
        arcencielMetadata: { c: 3 },
        customMetadata: { d: 4 },
    };

    it('resolves unprefixed fields from fileMetadata', () => {
        expect(resolveField('a', ctx, false)).toBe(1);
    });

    it('resolves civitai./arcenciel./custom.-prefixed fields from the matching source', () => {
        expect(resolveField('civitai.b', ctx, false)).toBe(2);
        expect(resolveField('arcenciel.c', ctx, false)).toBe(3);
        expect(resolveField('custom.d', ctx, false)).toBe(4);
    });

    it('returns undefined, or the string "undefined" when showUndefined is true', () => {
        expect(resolveField('missing', ctx, false)).toBeUndefined();
        expect(resolveField('missing', ctx, true)).toBe('undefined');
    });
});
