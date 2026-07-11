export interface ParsedSafetensors {
    fileMetadata: Record<string, any>;
    rawMetadataStrings: Record<string, string>;
}

const METADATA_SIZE_OFFSET = 0;
const METADATA_CONTENT_OFFSET = 8;

export async function parseHeader(file: File): Promise<ParsedSafetensors> {
    const sizeBuffer = await file.slice(METADATA_SIZE_OFFSET, METADATA_CONTENT_OFFSET).arrayBuffer();
    const metadataSize = new DataView(sizeBuffer).getUint32(0, true);
    const headerBuffer = await file.slice(METADATA_CONTENT_OFFSET, METADATA_CONTENT_OFFSET + metadataSize).arrayBuffer();
    const header = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(headerBuffer)));

    const rawMetadataStrings: Record<string, string> = header['__metadata__'] || {};
    const fileMetadata: Record<string, any> = {};
    for (const key in rawMetadataStrings) {
        const value = rawMetadataStrings[key];
        if (typeof value === 'string') {
            try {
                fileMetadata[key] = JSON.parse(value);
            } catch {
                fileMetadata[key] = value;
            }
        } else {
            fileMetadata[key] = value;
        }
    }
    return { fileMetadata, rawMetadataStrings };
}

export async function buildDownloadBlob(file: File, newMetadata: Record<string, string> | null): Promise<Blob> {
    const sizeBuffer = await file.slice(METADATA_SIZE_OFFSET, METADATA_CONTENT_OFFSET).arrayBuffer();
    const metadataSize = new DataView(sizeBuffer).getUint32(0, true);
    const headerBuffer = await file.slice(METADATA_CONTENT_OFFSET, METADATA_CONTENT_OFFSET + metadataSize).arrayBuffer();
    const currentHeader = JSON.parse(new TextDecoder().decode(headerBuffer));

    if (newMetadata === null) {
        delete currentHeader['__metadata__'];
    } else {
        currentHeader['__metadata__'] = newMetadata;
    }

    const newHeaderBytes = new TextEncoder().encode(JSON.stringify(currentHeader));
    const sizeArray = new Uint32Array([newHeaderBytes.length]);
    const padding = new Uint8Array([0, 0, 0, 0]); // upper 32 bits of the 8-byte little-endian size field
    const remaining = file.slice(METADATA_CONTENT_OFFSET + metadataSize);

    return new Blob([sizeArray.buffer, padding, newHeaderBytes, remaining], { type: 'application/octet-stream' });
}

export function downloadFilename(originalName: string, purge: boolean): string {
    return originalName.replace(/(\..[^.]+)$/, `_${purge ? 'purged' : 'edited'}$1`);
}
