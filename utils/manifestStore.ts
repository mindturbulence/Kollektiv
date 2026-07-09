import { fileSystemManager } from './fileUtils';
import { forceParseJson } from './integrity';

export interface ManifestLoad<T> {
    data: T;
    /**
     * false = the file may exist but could not be read or parsed.
     * Saving `data` back would overwrite real user data with an empty manifest.
     */
    safeToSave: boolean;
}

export class ManifestWriteBlockedError extends Error {
    constructor(manifestName: string) {
        super(`Refusing to overwrite ${manifestName}: it exists but could not be read. Run Settings > Neural Integrity to repair it, then retry.`);
        this.name = 'ManifestWriteBlockedError';
    }
}

/** Minimal surface of fileSystemManager needed here; injectable for tests. */
export interface ManifestFs {
    readFile(path: string): Promise<string | null>;
    fileExists(path: string): Promise<boolean>;
}

export const loadManifestSafe = async <T>(
    manifestName: string,
    validate: (parsed: any) => T | null,
    empty: () => T,
    fs: ManifestFs = fileSystemManager
): Promise<ManifestLoad<T>> => {
    let content: string | null = null;
    try {
        content = await fs.readFile(manifestName);
    } catch {
        content = null;
    }

    if (content) {
        const parsed = forceParseJson(content);
        const validated = parsed == null ? null : validate(parsed);
        if (validated !== null) return { data: validated, safeToSave: true };
        console.error(`[manifestStore] ${manifestName} present but not valid — writes blocked for this operation.`);
        return { data: empty(), safeToSave: false };
    }

    // readFile returned null: absent OR unreadable (timeout / permission). Disambiguate.
    try {
        const exists = await fs.fileExists(manifestName);
        if (!exists) return { data: empty(), safeToSave: true }; // genuinely new vault
    } catch {
        // Existence unknown — assume the file is there and protect it.
    }
    console.error(`[manifestStore] ${manifestName} unreadable but may exist — writes blocked for this operation.`);
    return { data: empty(), safeToSave: false };
};
