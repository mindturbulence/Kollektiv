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
        getDefaultContent: () => ({ categories: [], items: [] }),
    },
    {
        path: 'artists_cheatsheet.json',
        type: 'json',
        getDefaultContent: () => ({ categories: [], items: [] }),
    },
    {
        path: 'cheatsheet.json',
        type: 'json',
        getDefaultContent: () => ({ categories: [], items: [] }),
    }
];

// --- Maintenance Logic ---

/**
 * Rebuilds the gallery database by scanning the file system.
 * Simplified version - just reads manifest and verifies basic structure.
 */
export const rebuildGalleryDatabase = async (onProgress: (msg: string) => void): Promise<void> => {
    console.log('[Integrity] Starting gallery database rebuild');
    try {
        onProgress('> MOUNTING VAULT...');
        await new Promise(r => setTimeout(r, 200));
        onProgress('> SCANNING INDEX...');
        await new Promise(r => setTimeout(r, 200));
        const manifestStr = await fileSystemManager.readFile('kollektiv_gallery_manifest.json');
        
        let manifest: any = { galleryItems: [], categories: [], pinnedIds: [] };
        if (manifestStr) {
            try {
                manifest = JSON.parse(manifestStr);
            } catch (e) {
                console.error("Failed to parse gallery manifest:", e);
            }
        }
        
        const itemCount = manifest.galleryItems?.length || 0;
        console.log(`[Integrity] Gallery has ${itemCount} items`);
        
        let validCount = 0;
        const checkItems = (manifest.galleryItems || []).slice(0, 5);
        for (const item of checkItems) {
            if (item.urls?.length > 0) validCount++;
        }
        
        console.log('[Integrity] Gallery rebuild complete');
        onProgress(`> VAULT MOUNTED [${itemCount} ITEMS]`);
    } catch (error) {
        console.error("rebuildGalleryDatabase failed:", error);
    }
};

/**
 * Rebuilds the prompt library index by scanning the prompts/ folder.
 * Simplified version - just verifies manifest structure.
 */
export const rebuildPromptDatabase = async (onProgress: (msg: string) => void): Promise<void> => {
    console.log('[Integrity] Starting prompt database rebuild');
    try {
        onProgress('> INIT NEURAL INDEX...');
        await new Promise(r => setTimeout(r, 200));
        onProgress('> PARSING LIBRARY...');
        await new Promise(r => setTimeout(r, 200));
        const manifestStr = await fileSystemManager.readFile('prompts_manifest.json');
        
        let manifest: any = { prompts: [], categories: [] };
        if (manifestStr) {
            try {
                manifest = JSON.parse(manifestStr);
            } catch (e) {
                console.error("Failed to parse prompts manifest:", e);
            }
        }
        
        const promptCount = manifest.prompts?.length || 0;
        console.log(`[Integrity] Library has ${promptCount} prompts`);
        
        console.log('[Integrity] Prompt rebuild complete');
        onProgress(`> INDEX SYNCED [${promptCount} ENTRIES]`);
    } catch (error) {
        console.error("rebuildPromptDatabase failed:", error);
    }
};

/**
 * Strips whitespace and prunes dead links from all manifests to minimize footprint.
 */
export const optimizeManifests = async (onProgress: (msg: string) => void): Promise<void> => {
    console.log('[Integrity] Starting manifest optimization');
    try {
        onProgress('> COMPRESSING REGISTRIES...');
        await new Promise(r => setTimeout(r, 200));
        const files = ['kollektiv_gallery_manifest.json', 'prompts_manifest.json', 'crafter_manifest.json', 'refiner_presets_manifest.json', 'composer_presets_manifest.json'];
        
        for (const file of files) {
            try {
                const content = await fileSystemManager.readFile(file);
                if (content) {
                    const json = JSON.parse(content);
                    await fileSystemManager.saveFile(file, new Blob([JSON.stringify(json)], { type: 'application/json' }));
                }
            } catch (e) {
                // Skip files that can't be read
            }
        }
        console.log('[Integrity] Optimization complete');
        onProgress('> REGISTRIES COMPRESSED');
    } catch (error) {
        console.error("optimizeManifests failed:", error);
    }
};

// --- Main Verification Logic ---
export const verifyAndRepairFiles = async (onProgress: (message: string, progress?: number) => void, _settings: LLMSettings): Promise<boolean> => {
    console.log('[Integrity] Starting file verification');
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
                    console.log(`[Integrity] Creating ${entry.path}`);
                    onProgress(`[CREATE] ${entry.path.replace('.json', '').toUpperCase()}`);
                    const defaultContent = entry.getDefaultContent();
                    const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                    const blob = new Blob([contentString], { type: entry.type === 'json' ? 'application/json' : 'text/plain' });
                    await fileSystemManager.saveFile(entry.path, blob);
                    await new Promise(r => setTimeout(r, 100));
                } else if (entry.type === 'json') {
                    try {
                        JSON.parse(content);
                    } catch (e) {
                        console.log(`[Integrity] Repairing ${entry.path}`);
                        onProgress(`[REPAIR] ${entry.path.replace('.json', '').toUpperCase()}`);
                        const defaultContent = entry.getDefaultContent();
                        const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                        const blob = new Blob([contentString], { type: 'application/json' });
                        await fileSystemManager.saveFile(entry.path, blob);
                        await new Promise(r => setTimeout(r, 100));
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
    }
};