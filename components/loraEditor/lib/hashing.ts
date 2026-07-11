import type { FileHashes } from '../types';

const TWO_GB = 2 * 1024 * 1024 * 1024;
const CHUNK_SIZE = 16 * 1024 * 1024;

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256WholeFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return bufferToHex(await crypto.subtle.digest('SHA-256', buffer));
}

export async function sha256SkipMetadata(file: File): Promise<string> {
    const headerBuffer = await file.slice(0, 8).arrayBuffer();
    const metadataSize = new DataView(headerBuffer).getUint32(0, true);
    const rest = await file.slice(metadataSize + 8).arrayBuffer();
    return bufferToHex(await crypto.subtle.digest('SHA-256', rest));
}

async function hashInChunks(file: File, start: number, onProgress?: (pct: number) => void): Promise<string> {
    const { createSHA256 } = await import('hash-wasm');
    const hasher = await createSHA256();
    const totalBytes = file.size - start;
    const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
    for (let i = 0; i < totalChunks; i++) {
        const chunkStart = start + i * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size);
        const chunk = await file.slice(chunkStart, chunkEnd).arrayBuffer();
        hasher.update(new Uint8Array(chunk));
        onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }
    return hasher.digest('hex');
}

export async function sha256WholeFileChunked(file: File, onProgress?: (pct: number) => void): Promise<string> {
    return hashInChunks(file, 0, onProgress);
}

export async function sha256SkipMetadataChunked(file: File, onProgress?: (pct: number) => void): Promise<string> {
    const headerBuffer = await file.slice(0, 8).arrayBuffer();
    const metadataSize = new DataView(headerBuffer).getUint32(0, true);
    return hashInChunks(file, metadataSize + 8, onProgress);
}

export async function calculateFileHashes(
    file: File,
    sizeThreshold: number = TWO_GB,
    onProgress?: (message: string, pct: number) => void
): Promise<FileHashes> {
    const result: FileHashes = {};

    if (file.size > sizeThreshold) {
        try {
            result.sha256_autov3 = await sha256SkipMetadataChunked(file, (p) => onProgress?.('Calculating AutoV3 hash...', p));
        } catch {
            result.sha256 = await sha256WholeFileChunked(file, (p) => onProgress?.('Calculating AutoV2 hash...', p));
        }
    } else {
        onProgress?.('Calculating AutoV2 hash...', 25);
        result.sha256 = await sha256WholeFile(file);
        onProgress?.('Calculating AutoV3 hash...', 50);
        result.sha256_autov3 = await sha256SkipMetadata(file);
    }

    if (result.sha256) result.autov2 = result.sha256.substring(0, 10);
    if (result.sha256_autov3) result.autov3 = result.sha256_autov3.substring(0, 12);
    return result;
}
