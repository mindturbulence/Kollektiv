import { describe, it, expect } from 'vitest';
import { evaluateCustomFields } from './customFields';
import type { CustomFieldContext } from '../types';

function baseContext(overrides: Partial<CustomFieldContext> = {}): CustomFieldContext {
    return {
        fileMetadata: {},
        civitaiMetadata: {},
        arcencielMetadata: {},
        basemodelMetadata: {},
        vaeMetadata: {},
        safetensorsFile: null,
        ...overrides,
    };
}

describe('evaluateCustomFields', () => {
    it('evaluates expressions in declaration order, later fields can reference earlier customMetadata', () => {
        const defs = [
            { label: 'a', calc: 'fileMetadata.x + 1' },
            { label: 'b', calc: 'customMetadata.a * 2' },
        ];
        const result = evaluateCustomFields(defs, baseContext({ fileMetadata: { x: 5 } }));
        expect(result).toEqual({ a: 6, b: 12 });
    });

    it('swallows evaluation errors and continues with remaining fields', () => {
        const defs = [
            { label: 'bad', calc: 'nonexistent.property' },
            { label: 'ok', calc: '1 + 1' },
        ];
        const result = evaluateCustomFields(defs, baseContext());
        expect(result.bad).toBeUndefined();
        expect(result.ok).toBe(2);
    });

    it('has access to fileMetadata, civitaiMetadata, and safetensorsFile by name', () => {
        const file = new File(['x'], 'model.safetensors');
        const defs = [
            { label: 'name', calc: 'safetensorsFile.name' },
            { label: 'modelId', calc: 'civitaiMetadata.modelId' },
        ];
        const result = evaluateCustomFields(defs, baseContext({ safetensorsFile: file, civitaiMetadata: { modelId: 42 } }));
        expect(result.name).toBe('model.safetensors');
        expect(result.modelId).toBe(42);
    });

    it('skips malformed definitions without throwing', () => {
        const defs = [{ label: 'ok' } as any, { calc: '1' } as any, { label: 'good', calc: '2' }];
        const result = evaluateCustomFields(defs, baseContext());
        expect(result).toEqual({ good: 2 });
    });

    it('seeds customMetadata so expressions can reference pre-computed values (e.g. file hashes)', () => {
        const defs = [{ label: 'short_hash', calc: 'customMetadata.sha256.substring(0, 4)' }];
        const result = evaluateCustomFields(defs, baseContext(), { sha256: 'abcdef123456' });
        expect(result.short_hash).toBe('abcd');
        expect(result.sha256).toBe('abcdef123456');
    });
});
