import { fileSystemManager } from './fileUtils';
import { ART_STYLES_DATA } from '../constants/cheatsheetData';
import { ARTIST_CHEATSHEET_DATA } from '../constants/cheatsheetData';
import { CHEATSHEET_DATA } from '../constants/cheatsheetData';
import type { CheatsheetCategory, LLMSettings, GalleryItem, GalleryCategory, SavedPrompt } from '../types';

// --- Helper Functions ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        getDefaultContent: () => ART_STYLES_DATA.map(category => ({
            ...category,
            items: category.items.map(item => ({
                ...item,
                id: item.id || `artstyle-${category.category.replace(/\s+/g, '-')}-${item.name.replace(/\s+/g, '-')}`,
                imageUrls: item.imageUrls || [],
            }))
        })),
    },
    {
        path: 'artists_cheatsheet.json',
        type: 'json',
        getDefaultContent: () => ARTIST_CHEATSHEET_DATA.map(category => ({
            ...category,
            items: category.items.map(item => ({
                ...item,
                id: item.id || `artist-${category.category.replace(/\s+/g, '-')}-${item.name.replace(/\s+/g, '-')}`,
                imageUrls: item.imageUrls || [],
            }))
        })),
    },
    {
        path: 'cheatsheet.json',
        type: 'json',
        getDefaultContent: () => CHEATSHEET_DATA.map(category => ({
            ...category,
            items: category.items.map(item => ({
                ...item,
                id: item.id || `cheatsheet-${category.category.replace(/\s+/g, '-')}-${item.name.replace(/\s+/g, '-')}`,
                imageUrls: item.imageUrls || [],
            }))
        })),
    }
];

// --- Maintenance Logic ---

/**
 * Rebuilds the gallery database by scanning the file system.
 * Fixes: Prunes missing files, relocates files to correct category folders, imports orphans.
 */
export const rebuildGalleryDatabase = async (onProgress: (msg: string) => void): Promise<void> => {
    onProgress('Accessing Media Vault...');
    const manifestStr = await fileSystemManager.readFile('kollektiv_gallery_manifest.json');
    if (!manifestStr) return;
    
    let manifest = JSON.parse(manifestStr);
    const items: GalleryItem[] = manifest.galleryItems;
    const categories: GalleryCategory[] = manifest.categories;
    const updatedItems: GalleryItem[] = [];

    // 1. Verify and Relocate existing items
    onProgress('Synchronizing Artifact Paths...');
    for (const item of items) {
        const cat = categories.find(c => c.id === item.categoryId);
        // Correct path is gallery/[CategoryName] (if it exists) or just gallery/
        const expectedDir = cat ? `gallery/${cat.name}` : 'gallery';
        const newUrls: string[] = [];

        for (const url of item.urls) {
            if (url.startsWith('data:')) {
                newUrls.push(url);
                continue;
            }

            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob) {
                const fileName = url.split('/').pop() || `${item.id}_media`;
                const expectedPath = `${expectedDir}/${fileName}`;
                
                if (url !== expectedPath) {
                    onProgress(`Moving to Folder: ${cat?.name || 'General'}`);
                    await fileSystemManager.saveFile(expectedPath, blob);
                    await fileSystemManager.deleteFile(url);
                    newUrls.push(expectedPath);
                } else {
                    newUrls.push(url);
                }
            }
        }
        if (newUrls.length > 0) {
            updatedItems.push({ ...item, urls: newUrls });
        }
    }

    manifest.galleryItems = updatedItems;
    await fileSystemManager.saveFile('kollektiv_gallery_manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    onProgress('Media Vault Structure Optimized.');
};

/**
 * Rebuilds the prompt library index by scanning the prompts/ folder.
 */
export const rebuildPromptDatabase = async (onProgress: (msg: string) => void): Promise<void> => {
    onProgress('Indexing Neural Library...');
    const manifestStr = await fileSystemManager.readFile('prompts_manifest.json');
    if (!manifestStr) return;
    
    let manifest = JSON.parse(manifestStr);
    const existingPrompts: SavedPrompt[] = manifest.prompts;
    const updatedPrompts: SavedPrompt[] = [];

    // 1. Prune dead entries
    for (const p of existingPrompts) {
        const text = await fileSystemManager.readFile(`prompts/${p.id}.txt`);
        if (text) updatedPrompts.push(p);
    }

    // 2. Add orphan .txt files
    onProgress('Scanning for Unregistered Tokens...');
    try {
        for await (const handle of fileSystemManager.listDirectoryContents('prompts')) {
            if (handle.kind === 'file' && handle.name.endsWith('.txt')) {
                const id = handle.name.replace('.txt', '');
                if (!updatedPrompts.some(p => p.id === id)) {
                    const text = await fileSystemManager.readFile(`prompts/${handle.name}`);
                    if (text) {
                        updatedPrompts.push({
                            id,
                            title: `Recovered: ${handle.name}`,
                            text: text.substring(0, 100),
                            createdAt: Date.now(),
                            tags: ['recovered']
                        });
                    }
                }
            }
        }
    } catch (e) {
        // Folder might not exist yet
    }

    manifest.prompts = updatedPrompts;
    await fileSystemManager.saveFile('prompts_manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    onProgress('Neural Library Synced.');
};

/**
 * Strips whitespace and prunes dead links from all manifests to minimize footprint.
 */
export const optimizeManifests = async (onProgress: (msg: string) => void): Promise<void> => {
    onProgress('Compressing System Registries...');
    const files = ['kollektiv_gallery_manifest.json', 'prompts_manifest.json', 'crafter_manifest.json', 'refiner_presets_manifest.json', 'composer_presets_manifest.json'];
    
    for (const file of files) {
        const content = await fileSystemManager.readFile(file);
        if (content) {
            try {
                const json = JSON.parse(content);
                await fileSystemManager.saveFile(file, new Blob([JSON.stringify(json)], { type: 'application/json' }));
            } catch (e) {}
        }
    }
    onProgress('Optimization Complete.');
};

// --- Main Verification Logic ---
export const verifyAndRepairFiles = async (onProgress: (message: string, progress?: number) => void, settings: LLMSettings): Promise<boolean> => {
    onProgress('Verifying application files...');
    await delay(100);

    let success = true;
    const totalSteps = fileManifest.length;
    let currentStep = 0;

    for (const entry of fileManifest) {
        currentStep++;
        const progress = currentStep / totalSteps;
        
        const isCheatsheet = entry.path.endsWith('_cheatsheet.json') || entry.path === 'cheatsheet.json';

        if (isCheatsheet) {
            onProgress(`Verifying: ${entry.path}`, progress);
            const content = await fileSystemManager.readFile(entry.path);
            const defaultData = entry.getDefaultContent() as CheatsheetCategory[];
            let needsWrite = false;
            let finalData: CheatsheetCategory[] = [];

            if (content === null) {
                needsWrite = true;
                finalData = defaultData;
            } else {
                try {
                    const storedData = JSON.parse(content) as CheatsheetCategory[];
                    
                    const storedImages = new Map<string, string[]>();
                    const storedDescriptions = new Map<string, string | undefined>();

                    storedData.forEach(category => {
                        category.items.forEach(item => {
                            if (item.imageUrls && item.imageUrls.length > 0) {
                                storedImages.set(item.id, item.imageUrls);
                            }
                            if (item.description) {
                                storedDescriptions.set(item.id, item.description);
                            }
                        });
                    });
                    
                    finalData = defaultData.map(category => ({
                        ...category,
                        items: category.items.map(item => ({
                            ...item,
                            imageUrls: storedImages.get(item.id) || item.imageUrls || [],
                            description: storedDescriptions.get(item.id) || item.description,
                        })),
                    }));
                    
                    if (JSON.stringify(storedData) !== JSON.stringify(finalData)) {
                        needsWrite = true;
                    }

                } catch (e) {
                    needsWrite = true;
                    finalData = defaultData;
                }
            }

            if (needsWrite) {
                try {
                    const contentString = JSON.stringify(finalData);
                    const blob = new Blob([contentString], { type: 'application/json' });
                    await fileSystemManager.saveFile(entry.path, blob);
                } catch (e) {
                    success = false;
                }
            }
        } else {
            onProgress(`Checking: ${entry.path}`, progress);
            let needsRepair = false;
            const content = await fileSystemManager.readFile(entry.path);

            if (content === null) {
                needsRepair = true;
            } else if (entry.type === 'json') {
                try {
                    JSON.parse(content);
                } catch (e) {
                    needsRepair = true;
                }
            }
            
            if (needsRepair) {
                try {
                    const defaultContent = entry.getDefaultContent();
                    const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent);
                    const blob = new Blob([contentString], { type: entry.type === 'json' ? 'application/json' : 'text/plain' });
                    await fileSystemManager.saveFile(entry.path, blob);
                } catch (e) {
                    success = false;
                }
            }
        }
        await delay(50);
    }
    
    onProgress('Registry Healthy.', 1);
    return success;
};