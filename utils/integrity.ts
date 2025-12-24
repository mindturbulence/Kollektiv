import { fileSystemManager } from './fileUtils';
import { ART_STYLES_DATA, ARTIST_CHEATSHEET_DATA, CHEATSHEET_DATA } from '../constants';
import type { CheatsheetCategory, LLMSettings } from '../types';
import { generateArtistDescription } from '../services/llmService';

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
    },
    {
        path: 'crafter/outfits.txt',
        type: 'text',
        getDefaultContent: () => 'a simple white dress\na futuristic cyberpunk jacket\nelegant evening gown\ncasual jeans and t-shirt',
    },
    {
        path: 'crafter/locations.txt',
        type: 'text',
        getDefaultContent: () => 'a neon-lit city street at night\na sun-drenched beach at sunset\na mysterious enchanted forest\na rooftop overlooking a futuristic city',
    },
    {
        path: 'crafter/moods.txt',
        type: 'text',
        getDefaultContent: () => 'happy\nsad\ncontemplative\nenergetic',
    }
];

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
            onProgress(`Verifying cheatsheet: ${entry.path}`, progress);
            const content = await fileSystemManager.readFile(entry.path);
            const defaultData = entry.getDefaultContent() as CheatsheetCategory[];
            let needsWrite = false;
            let finalData: CheatsheetCategory[] = [];

            if (content === null) {
                needsWrite = true;
                finalData = defaultData;
                console.warn(`Cheatsheet not found: ${entry.path}. Creating from defaults.`);
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
                        console.log(`Cheatsheet requires update: ${entry.path}. Merging changes.`);
                    }

                } catch (e) {
                    needsWrite = true;
                    finalData = defaultData;
                    console.error(`Cheatsheet is corrupt: ${entry.path}. Resetting to defaults.`, e);
                }
            }

            if (needsWrite) {
                onProgress(`Updating: ${entry.path}`, progress);
                try {
                    const contentString = JSON.stringify(finalData, null, 2);
                    const blob = new Blob([contentString], { type: 'application/json' });
                    await fileSystemManager.saveFile(entry.path, blob);
                } catch (e) {
                    console.error(`Failed to update cheatsheet: ${entry.path}`, e);
                    success = false;
                }
            }
        } else {
            onProgress(`Checking: ${entry.path}`, progress);
            let needsRepair = false;
            const content = await fileSystemManager.readFile(entry.path);

            if (content === null) {
                needsRepair = true;
                console.warn(`File not found: ${entry.path}. Will be recreated.`);
            } else if (entry.type === 'json') {
                try {
                    JSON.parse(content);
                } catch (e) {
                    needsRepair = true;
                    console.error(`File is corrupt (invalid JSON): ${entry.path}. Will be reset.`, e);
                }
            }
            
            if (needsRepair) {
                onProgress(`Repairing: ${entry.path}`, progress);
                try {
                    const defaultContent = entry.getDefaultContent();
                    const contentString = typeof defaultContent === 'string' ? defaultContent : JSON.stringify(defaultContent, null, 2);
                    const blob = new Blob([contentString], { type: entry.type === 'json' ? 'application/json' : 'text/plain' });
                    await fileSystemManager.saveFile(entry.path, blob);
                } catch (e) {
                    console.error(`Failed to repair file: ${entry.path}`, e);
                    success = false;
                }
            }
        }
        await delay(50);
    }
    
    onProgress('File verification complete.', 1);
    return success;
};