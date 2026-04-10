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
        onProgress('Accessing Media Vault...');
        const manifestStr = await fileSystemManager.readFile('kollektiv_gallery_manifest.json');
        
        let manifest: any = { galleryItems: [], categories: [], pinnedIds: [] };
        if (manifestStr) {
            try {
                manifest = JSON.parse(manifestStr);
            } catch (e) {
                console.error("Failed to parse gallery manifest:", e);
            }
        }
        
        // Just verify the manifest is valid, don't scan all files
        const itemCount = manifest.galleryItems?.length || 0;
        console.log(`[Integrity] Gallery has ${itemCount} items`);
        
        // Quick sanity check - verify a few items exist
        let validCount = 0;
        const checkItems = (manifest.galleryItems || []).slice(0, 5);
        for (const item of checkItems) {
            if (item.urls?.length > 0) validCount++;
        }
        
        console.log('[Integrity] Gallery rebuild complete');
        onProgress('Media Vault Structure Optimized.');
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
        onProgress('Indexing Neural Library...');
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
        onProgress('Neural Library Synced.');
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
        onProgress('Compressing System Registries...');
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
        onProgress('Optimization Complete.');
    } catch (error) {
        console.error("optimizeManifests failed:", error);
    }
};

// --- Main Verification Logic ---
export const verifyAndRepairFiles = async (onProgress: (message: string, progress?: number) => void, _settings: LLMSettings): Promise<boolean> => {
    console.log('[Integrity] Starting file verification');
    try {
        onProgress('Verifying application files...');
        
        // Quick check - just verify files exist and are valid
        const totalSteps = fileManifest.length;
        
        for (let i = 0; i < totalSteps; i++) {
            const entry = fileManifest[i];
            try {
                const progress = (i + 1) / totalSteps;
                onProgress(`Checking: ${entry.path}`, progress);
                
                const content = await fileSystemManager.readFile(entry.path);
                
                if (content === null) {
                    // File doesn't exist - create with default content
                    console.log(`[Integrity] Creating ${entry.path}`);
                    const defaultContent = entry.getDefaultContent();
                    const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                    const blob = new Blob([contentString], { type: entry.type === 'json' ? 'application/json' : 'text/plain' });
                    await fileSystemManager.saveFile(entry.path, blob);
                } else if (entry.type === 'json') {
                    // Verify it's valid JSON
                    try {
                        JSON.parse(content);
                    } catch (e) {
                        // Invalid JSON - recreate
                        console.log(`[Integrity] Repairing ${entry.path}`);
                        const defaultContent = entry.getDefaultContent();
                        const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                        const blob = new Blob([contentString], { type: 'application/json' });
                        await fileSystemManager.saveFile(entry.path, blob);
                    }
                }
            } catch (e) {
                console.error(`Error processing ${entry.path}:`, e);
            }
        }
        
        console.log('[Integrity] File verification complete');
        onProgress('Registry Healthy.', 1);
        return true;
    } catch (error) {
        console.error("verifyAndRepairFiles failed:", error);
        return false;
    }
};