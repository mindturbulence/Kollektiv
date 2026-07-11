import { describe, it, expect } from 'vitest';
import { sha256WholeFile, sha256SkipMetadata, calculateFileHashes } from './hashing';

function makeSafetensorsFile(metadata: Record<string, string>, tensor: Uint8Array<ArrayBuffer>): File {
    const json = JSON.stringify({ __metadata__: metadata });
    const jsonBytes = new TextEncoder().encode(json);
    const header = new Uint8Array(8);
    new DataView(header.buffer).setUint32(0, jsonBytes.length, true);
    return new File([header, jsonBytes, tensor], 'test.safetensors');
}

async function hexDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('sha256WholeFile', () => {
    it('hashes the entire file (header + tensor bytes)', async () => {
        const file = makeSafetensorsFile({ a: '1' }, new Uint8Array([1, 2, 3]));
        const hash = await sha256WholeFile(file);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('sha256SkipMetadata', () => {
    it('hashes only the tensor bytes, excluding the header', async () => {
        const tensor = new Uint8Array([9, 9, 9]);
        const file = makeSafetensorsFile({ a: '1' }, tensor);
        const expected = await hexDigest(tensor);
        const actual = await sha256SkipMetadata(file);
        expect(actual).toBe(expected);
    });
});

describe('calculateFileHashes', () => {
    it('computes both hashes and derives autov2/autov3 prefixes under the size threshold', async () => {
        const file = makeSafetensorsFile({ a: '1' }, new Uint8Array(100));
        const hashes = await calculateFileHashes(file);
        expect(hashes.sha256).toHaveLength(64);
        expect(hashes.autov2).toBe(hashes.sha256!.substring(0, 10));
        expect(hashes.sha256_autov3).toHaveLength(64);
        expect(hashes.autov3).toBe(hashes.sha256_autov3!.substring(0, 12));
    });

    it('uses the chunked hash-wasm path when the file exceeds sizeThreshold', async () => {
        const file = makeSafetensorsFile({ a: '1' }, new Uint8Array(100));
        // Force the chunked branch on a tiny file by passing a tiny threshold.
        const hashes = await calculateFileHashes(file, 10);
        expect(hashes.autov3).toHaveLength(12);
    });
});
