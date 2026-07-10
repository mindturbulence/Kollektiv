import { describe, it, expect } from 'vitest';
import { parseHeader, buildDownloadBlob, downloadFilename } from './safetensors';

function makeSafetensorsFile(metadata: Record<string, string>, tensor: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3, 4])): File {
    const json = JSON.stringify({ __metadata__: metadata });
    const jsonBytes = new TextEncoder().encode(json);
    const header = new Uint8Array(8);
    new DataView(header.buffer).setUint32(0, jsonBytes.length, true);
    return new File([header, jsonBytes, tensor], 'test.safetensors');
}

describe('parseHeader', () => {
    it('decodes __metadata__ and JSON-parses string-encoded values', async () => {
        const file = makeSafetensorsFile({ ss_network_dim: '16', ss_output_name: '"my_lora"' });
        const { fileMetadata } = await parseHeader(file);
        expect(fileMetadata.ss_network_dim).toBe(16);
        expect(fileMetadata.ss_output_name).toBe('my_lora');
    });

    it('falls back to the raw string when a value is not valid JSON', async () => {
        const file = makeSafetensorsFile({ ss_training_comment: 'not json {' });
        const { fileMetadata } = await parseHeader(file);
        expect(fileMetadata.ss_training_comment).toBe('not json {');
    });
});

describe('buildDownloadBlob', () => {
    it('round-trips updated metadata and preserves tensor bytes exactly', async () => {
        const tensor = new Uint8Array([5, 6, 7, 8]);
        const file = makeSafetensorsFile({ ss_output_name: '"old"' }, tensor);
        const blob = await buildDownloadBlob(file, { ss_output_name: '"new"' });
        const rebuilt = new File([blob], 'rebuilt.safetensors');

        const { fileMetadata } = await parseHeader(rebuilt);
        expect(fileMetadata.ss_output_name).toBe('new');

        const rebuiltBuffer = await rebuilt.arrayBuffer();
        const tail = new Uint8Array(rebuiltBuffer).slice(rebuiltBuffer.byteLength - 4);
        expect(Array.from(tail)).toEqual([5, 6, 7, 8]);
    });

    it('purges __metadata__ entirely when newMetadata is null', async () => {
        const file = makeSafetensorsFile({ ss_output_name: '"old"' });
        const blob = await buildDownloadBlob(file, null);
        const rebuilt = new File([blob], 'rebuilt.safetensors');
        const { rawMetadataStrings } = await parseHeader(rebuilt);
        expect(rawMetadataStrings).toEqual({});
    });
});

describe('downloadFilename', () => {
    it('inserts _edited or _purged before the file extension', () => {
        expect(downloadFilename('model.safetensors', false)).toBe('model_edited.safetensors');
        expect(downloadFilename('model.safetensors', true)).toBe('model_purged.safetensors');
    });
});
