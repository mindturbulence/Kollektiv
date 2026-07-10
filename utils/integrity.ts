import { fileSystemManager } from './fileUtils';
import type { LLMSettings } from '../types';

// --- File Manifest ---
interface FileManifestEntry {
    path: string;
    type: 'json' | 'text';
    getDefaultContent: () => any;
}

const fileManifest: FileManifestEntry[] = [
    {
        path: 'kollektiv_gallery_manifest.json',
        type: 'json',
        getDefaultContent: () => ({ galleryItems: [], categories: [], pinnedIds: [] }),
    },
    {
        path: 'prompts_manifest.json',
        type: 'json',
        getDefaultContent: () => ({ prompts: [], categories: [] }),
    },
    {
        path: 'crafter_manifest.json',
        type: 'json',
        getDefaultContent: () => ({
            templates: [
                {
                    name: "Character Concept",
                    content: "A beautiful girl wearing __outfits__ standing in __locations__, smiling to the viewer"
                }
            ]
        }),
    },
    {
        path: 'refiner_presets_manifest.json',
        type: 'json',
        getDefaultContent: () => ({ presets: [] }),
    },
    {
        path: 'composer_presets_manifest.json',
        type: 'json',
        getDefaultContent: () => ({ presets: [] }),
    },
    {
        path: 'artstyles_cheatsheet.json',
        type: 'json',
        getDefaultContent: () => ([]),
    },
    {
        path: 'artists_cheatsheet.json',
        type: 'json',
        getDefaultContent: () => ([]),
    },
    {
        path: 'cheatsheet.json',
        type: 'json',
        getDefaultContent: () => ([]),
    }
];

// --- Utility and Recovery Helpers ---

/**
 * Strips whitespace and cleans common JSON formatting mistakes (like trailing commas before braces/brackets).
 */
export const sanitizeJsonString = (str: string): string => {
    if (!str) return '';
    let cleaned = str.trim();
    // Remove trailing commas before closing braces/brackets
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    return cleaned;
};

/**
 * A highly resilient JSON parser that attempts to repair and parse partially broken or truncated JSON.
 */
export const forceParseJson = (str: string): any => {
    let sanitized = sanitizeJsonString(str);
    try {
        return JSON.parse(sanitized);
    } catch (e) {
        // Attempt manual structural repair for unclosed braces/brackets/quotes
        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escaped = false;
        
        for (let i = 0; i < sanitized.length; i++) {
            const char = sanitized[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (char === '{') openBraces++;
                if (char === '}') openBraces--;
                if (char === '[') openBrackets++;
                if (char === ']') openBrackets--;
            }
        }
        
        if (inString) sanitized += '"';
        
        while (openBrackets > 0) {
            sanitized += ']';
            openBrackets--;
        }
        
        while (openBraces > 0) {
            sanitized += '}';
            openBraces--;
        }
        
        sanitized = sanitizeJsonString(sanitized);
        
        try {
            return JSON.parse(sanitized);
        } catch (err) {
            console.warn("[Integrity] Could not repair or parse JSON string:", err);
            return null;
        }
    }
};

/**
 * Sanitizes and repairs a gallery item (post) ensuring all required fields have valid fallbacks.
 */
export const sanitizeGalleryItem = (item: any): any => {
    if (!item || typeof item !== 'object') return null;
    
    // Ensure ID is a valid string
    if (!item.id || typeof item.id !== 'string') {
        item.id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    
    // Ensure title is a string
    if (typeof item.title !== 'string') {
        item.title = String(item.title || 'Untitled Post');
    }
    
    // Ensure valid media type
    if (item.type !== 'image' && item.type !== 'video') {
        item.type = 'image';
    }
    
    // Ensure urls is a valid array of strings
    if (!Array.isArray(item.urls)) {
        if (typeof item.urls === 'string' && item.urls) {
            item.urls = [item.urls];
        } else {
            item.urls = [];
        }
    } else {
        item.urls = item.urls.filter((u: any) => typeof u === 'string');
    }
    
    // Ensure sources is a valid array of strings
    if (!Array.isArray(item.sources)) {
        if (typeof item.sources === 'string' && item.sources) {
            item.sources = [item.sources];
        } else {
            item.sources = [];
        }
    } else {
        item.sources = item.sources.filter((s: any) => typeof s === 'string');
    }
    
    // Ensure tags is a valid array of strings
    if (item.tags && !Array.isArray(item.tags)) {
        if (typeof item.tags === 'string') {
            item.tags = (item.tags as string).split(',').map(t => t.trim()).filter(Boolean);
        } else {
            item.tags = [];
        }
    } else if (!item.tags) {
        item.tags = [];
    } else {
        item.tags = item.tags.filter((t: any) => typeof t === 'string');
    }
    
    // Ensure valid timestamp
    if (item.createdAt === undefined || isNaN(Number(item.createdAt))) {
        item.createdAt = Date.now();
    } else {
        item.createdAt = Number(item.createdAt);
    }
    
    // Ensure boolean isNsfw
    item.isNsfw = Boolean(item.isNsfw);
    
    return item;
};

/**
 * Sanitizes and repairs a saved prompt template, ensuring robust default values.
 */
export const sanitizeSavedPrompt = (prompt: any): any => {
    if (!prompt || typeof prompt !== 'object') return null;
    
    if (!prompt.id || typeof prompt.id !== 'string') {
        prompt.id = `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    
    if (typeof prompt.title !== 'string') {
        prompt.title = String(prompt.title || 'Untitled Prompt');
    }
    
    if (typeof prompt.text !== 'string') {
        prompt.text = String(prompt.text || '');
    }
    
    if (!Array.isArray(prompt.tags)) {
        if (typeof prompt.tags === 'string') {
            prompt.tags = (prompt.tags as string).split(',').map(t => t.trim()).filter(Boolean);
        } else {
            prompt.tags = [];
        }
    } else {
        prompt.tags = prompt.tags.filter((t: any) => typeof t === 'string');
    }
    
    if (prompt.createdAt === undefined || isNaN(Number(prompt.createdAt))) {
        prompt.createdAt = Date.now();
    } else {
        prompt.createdAt = Number(prompt.createdAt);
    }
    
    return prompt;
};

/**
 * Recursively scans a directory for files ending with '_metadata.json' to reconstruct lost or broken posts.
 */
export async function scanDirectoryForMetadataFiles(dirPath: string): Promise<string[]> {
    const paths: string[] = [];
    try {
        for await (const handle of fileSystemManager.listDirectoryContents(dirPath)) {
            if (handle.kind === 'directory') {
                const subPath = dirPath ? `${dirPath}/${handle.name}` : handle.name;
                const subPaths = await scanDirectoryForMetadataFiles(subPath);
                paths.push(...subPaths);
            } else if (handle.kind === 'file') {
                if (handle.name.endsWith('_metadata.json')) {
                    const filePath = dirPath ? `${dirPath}/${handle.name}` : handle.name;
                    paths.push(filePath);
                }
            }
        }
    } catch (e) {
        console.warn(`[Integrity] Directory scan bypassed or unavailable for path "${dirPath}":`, e);
    }
    return paths;
}

// --- Maintenance Logic ---

/**
 * Rebuilds the gallery database by scanning the file system.
 * It reads the existing manifest (using forceParseJson) and also scans for individual metadata files,
 * sanitizes every item to repair broken structures, and saves the cleaned manifest back.
 */
export const rebuildGalleryDatabase = async (onProgress: (msg: string) => void): Promise<void> => {
    console.log('[Integrity] Starting gallery database rebuild');
    const originalProvider = fileSystemManager.storageProvider;
    fileSystemManager.storageProvider = 'local';
    try {
        onProgress('> MOUNTING VAULT...');
        await new Promise(r => setTimeout(r, 200));
        onProgress('> SCANNING INDEX...');
        await new Promise(r => setTimeout(r, 200));
        
        const manifestStr = await fileSystemManager.readFile('kollektiv_gallery_manifest.json');
        
        let manifest: any = { galleryItems: [], categories: [], pinnedIds: [] };
        if (manifestStr) {
            const parsed = forceParseJson(manifestStr);
            if (parsed && typeof parsed === 'object') {
                manifest.galleryItems = Array.isArray(parsed.galleryItems) ? parsed.galleryItems : [];
                manifest.categories = Array.isArray(parsed.categories) ? parsed.categories : [];
                manifest.pinnedIds = Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds : [];
            }
        }
        
        // Map to keep track of items by ID to avoid duplicates
        const itemsMap = new Map<string, any>();
        for (const item of manifest.galleryItems) {
            const sanitized = sanitizeGalleryItem(item);
            if (sanitized) {
                itemsMap.set(sanitized.id, sanitized);
            }
        }
        
        // Recursively scan the 'gallery' folder for individual metadata files to recover missing posts
        onProgress('> RECOVERING DISK POSTS...');
        const metadataPaths = await scanDirectoryForMetadataFiles('gallery');
        console.log(`[Integrity] Found ${metadataPaths.length} individual metadata files`);
        
        for (let idx = 0; idx < metadataPaths.length; idx++) {
            const path = metadataPaths[idx];
            try {
                if (idx % 10 === 0) {
                    onProgress(`> PARSING META [${idx}/${metadataPaths.length}]`);
                }
                const content = await fileSystemManager.readFile(path);
                if (content) {
                    const parsed = forceParseJson(content);
                    const sanitized = sanitizeGalleryItem(parsed);
                    if (sanitized) {
                        const existing = itemsMap.get(sanitized.id);
                        // Prefer disk content if missing or newer
                        if (!existing || (sanitized.createdAt && sanitized.createdAt > (existing.createdAt || 0))) {
                            itemsMap.set(sanitized.id, sanitized);
                        }
                    }
                }
            } catch (err) {
                console.error(`Failed to parse individual metadata ${path}:`, err);
            }
        }
        
        manifest.galleryItems = Array.from(itemsMap.values());
        
        // Sort items by createdAt descending
        manifest.galleryItems.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
        
        const itemCount = manifest.galleryItems.length;
        console.log(`[Integrity] Gallery successfully rebuilt with ${itemCount} items`);
        
        // Write the cleaned manifest back to disk
        await fileSystemManager.saveFile('kollektiv_gallery_manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
        
        onProgress(`> VAULT RECOVERY COMPLETED [${itemCount} ITEMS]`);
    } catch (error) {
        console.error("rebuildGalleryDatabase failed:", error);
    } finally {
        fileSystemManager.storageProvider = originalProvider;
    }
};

/**
 * Rebuilds the prompt library index by scanning the prompts/ folder and repairing the manifest structure.
 */
export const rebuildPromptDatabase = async (onProgress: (msg: string) => void): Promise<void> => {
    console.log('[Integrity] Starting prompt database rebuild');
    const originalProvider = fileSystemManager.storageProvider;
    fileSystemManager.storageProvider = 'local';
    try {
        onProgress('> INIT NEURAL INDEX...');
        await new Promise(r => setTimeout(r, 200));
        onProgress('> PARSING LIBRARY...');
        await new Promise(r => setTimeout(r, 200));
        
        const manifestStr = await fileSystemManager.readFile('prompts_manifest.json');
        
        let manifest: any = { prompts: [], categories: [] };
        if (manifestStr) {
            const parsed = forceParseJson(manifestStr);
            if (parsed && typeof parsed === 'object') {
                manifest.prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
                manifest.categories = Array.isArray(parsed.categories) ? parsed.categories : [];
            }
        }
        
        // Sanitize every prompt
        const sanitizedPrompts: any[] = [];
        for (const prompt of manifest.prompts) {
            const sanitized = sanitizeSavedPrompt(prompt);
            if (sanitized) {
                if (!sanitized.text) {
                    try {
                        const txt = await fileSystemManager.readFile(`prompts/${sanitized.id}.txt`);
                        if (txt) sanitized.text = txt;
                    } catch (e) {
                        // ignore
                    }
                }
                sanitizedPrompts.push(sanitized);
            }
        }
        
        manifest.prompts = sanitizedPrompts;
        
        // Write the cleaned prompts manifest back to disk
        await fileSystemManager.saveFile('prompts_manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
        
        const promptCount = manifest.prompts.length;
        console.log(`[Integrity] Prompts rebuild complete with ${promptCount} entries`);
        onProgress(`> INDEX SYNCED [${promptCount} ENTRIES]`);
    } catch (error) {
        console.error("rebuildPromptDatabase failed:", error);
    } finally {
        fileSystemManager.storageProvider = originalProvider;
    }
};

/**
 * Strips whitespace and prunes dead links from all manifests to minimize footprint.
 */
export const optimizeManifests = async (onProgress: (msg: string) => void): Promise<void> => {
    console.log('[Integrity] Starting manifest optimization');
    const originalProvider = fileSystemManager.storageProvider;
    fileSystemManager.storageProvider = 'local';
    try {
        onProgress('> COMPRESSING REGISTRIES...');
        await new Promise(r => setTimeout(r, 200));
        const files = ['kollektiv_gallery_manifest.json', 'prompts_manifest.json', 'crafter_manifest.json', 'refiner_presets_manifest.json', 'composer_presets_manifest.json'];
        
        for (const file of files) {
            try {
                const content = await fileSystemManager.readFile(file);
                if (content) {
                    const parsed = forceParseJson(content);
                    if (parsed) {
                        await fileSystemManager.saveFile(file, new Blob([JSON.stringify(parsed)], { type: 'application/json' }));
                    }
                }
            } catch (e) {
                // Skip files that can't be read
            }
        }
        console.log('[Integrity] Optimization complete');
        onProgress('> REGISTRIES COMPRESSED');
    } catch (error) {
        console.error("optimizeManifests failed:", error);
    } finally {
        fileSystemManager.storageProvider = originalProvider;
    }
};

// --- Main Verification and File Repair Logic ---
export const verifyAndRepairFiles = async (onProgress: (message: string, progress?: number) => void, _settings: LLMSettings): Promise<boolean> => {
    console.log('[Integrity] Starting file verification');
    const originalProvider = fileSystemManager.storageProvider;
    // ponytail: repair tooling only understands the local vault. Running it while
    // provider is 'drive' used to stamp default manifests into a stale local folder.
    if (originalProvider === 'drive') {
        console.warn('[Integrity] Drive storage active — skipping local file verification');
        onProgress('> DRIVE STORAGE ACTIVE — VERIFICATION SKIPPED', 1);
        return true;
    }
    fileSystemManager.storageProvider = 'local';
    try {
        onProgress('> INITIATING SYSTEM CHECK...');
        await new Promise(r => setTimeout(r, 300));

        const totalSteps = fileManifest.length;

        for (let i = 0; i < totalSteps; i++) {
            const entry = fileManifest[i];
            try {
                const progress = (i + 1) / totalSteps;
                const status = i % 2 === 0 ? '[CHECK]' : '[VERIFY]';
                onProgress(`${status} ${entry.path.replace('.json', '').toUpperCase()}`, progress);
                await new Promise(r => setTimeout(r, 150));

                const content = await fileSystemManager.readFile(entry.path);

                if (content === null) {
                    // readFile returns null for BOTH "absent" and "read failed/timed out".
                    // Only create defaults when the file is confirmed absent.
                    let exists = true;
                    try {
                        exists = await fileSystemManager.fileExists(entry.path);
                    } catch (checkErr) {
                        console.warn(`[Integrity] Could not verify existence of ${entry.path}; leaving it untouched`, checkErr);
                    }
                    if (!exists) {
                        console.log(`[Integrity] Creating ${entry.path}`);
                        onProgress(`[CREATE] ${entry.path.replace('.json', '').toUpperCase()}`);
                        const defaultContent = entry.getDefaultContent();
                        const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                        const blob = new Blob([contentString], { type: entry.type === 'json' ? 'application/json' : 'text/plain' });
                        await fileSystemManager.saveFile(entry.path, blob);
                        await new Promise(r => setTimeout(r, 100));
                    } else {
                        console.warn(`[Integrity] ${entry.path} exists but could not be read; skipping to avoid data loss`);
                        onProgress(`[SKIP] ${entry.path.replace('.json', '').toUpperCase()}`);
                    }
                } else if (entry.type === 'json') {
                    let strictOk = false;
                    try { JSON.parse(content); strictOk = true; } catch {}
                    if (strictOk) {
                        // File parses cleanly — leave it alone. (Previously it was
                        // re-pretty-printed on every startup, churning the vault.)
                        continue;
                    }
                    const parsed = forceParseJson(content);
                    // Whatever happens next overwrites the original — keep a backup first.
                    await fileSystemManager.saveFile(`${entry.path}.bak`, new Blob([content], { type: 'text/plain' }));
                    if (parsed === null) {
                        console.log(`[Integrity] Repairing ${entry.path} with default content (completely corrupt; original saved to ${entry.path}.bak)`);
                        onProgress(`[REPAIR] ${entry.path.replace('.json', '').toUpperCase()}`);
                        const defaultContent = entry.getDefaultContent();
                        const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                        await fileSystemManager.saveFile(entry.path, new Blob([contentString], { type: 'application/json' }));
                        await new Promise(r => setTimeout(r, 100));
                    } else {
                        console.log(`[Integrity] Structurally repaired ${entry.path} (original saved to ${entry.path}.bak)`);
                        onProgress(`[REPAIR] ${entry.path.replace('.json', '').toUpperCase()}`);
                        await fileSystemManager.saveFile(entry.path, new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' }));
                    }
                }
            } catch (e) {
                console.error(`Error processing ${entry.path}:`, e);
            }
        }

        console.log('[Integrity] File verification complete');
        onProgress('> SYSTEM VERIFIED [OK]', 1);
        return true;
    } catch (error) {
        console.error("verifyAndRepairFiles failed:", error);
        return false;
    } finally {
        fileSystemManager.storageProvider = originalProvider;
    }
};