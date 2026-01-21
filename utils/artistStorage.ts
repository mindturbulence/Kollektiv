
import type { CheatsheetCategory, CheatsheetItem, LLMSettings } from '../types';
import { ARTIST_CHEATSHEET_DATA } from '../constants';
import { fileSystemManager } from './fileUtils';
import { generateArtistDescription } from '../services/llmService';

const MANIFEST_NAME = 'artists_cheatsheet.json';
const IMG_FOLDER = 'artists';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getManifest = async (): Promise<CheatsheetCategory[]> => {
    try {
        const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
        if (manifestContent) {
            const storedData = JSON.parse(manifestContent);
            if (Array.isArray(storedData)) {
                return storedData;
            }
        }
    } catch (e) {
        console.error(`Error reading ${MANIFEST_NAME}, returning empty.`, e);
    }
    return [];
};

const saveArtists = async (data: CheatsheetCategory[]): Promise<void> => {
    try {
        const dataString = JSON.stringify(data, null, 2);
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([dataString], { type: 'application/json' }));
    } catch (error) {
        console.error("Failed to save artists:", error);
    }
};

export const loadArtists = async (): Promise<CheatsheetCategory[]> => {
    return await getManifest();
};

export const updateArtist = async (itemId: string, updates: Partial<CheatsheetItem>): Promise<CheatsheetCategory[]> => {
    const data = await getManifest();
    let itemFound = false;

    let finalUrls: string[] | undefined = undefined;

    if (updates.imageUrls) {
        const savedImageUrls = await Promise.all(updates.imageUrls.map(async (url, index) => {
            if (url.startsWith('data:')) {
                const item = data.flatMap(c => c.items).find(i => i.id === itemId);
                if (!item) return url;
                
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const extension = blob.type.split('/')[1] || 'png';
                    const fileName = `${item.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${index}.${extension}`;
                    const category = data.find(c => c.items.some(i => i.id === itemId))?.category || 'Uncategorized';

                    return await fileSystemManager.saveFile(`${IMG_FOLDER}/${category}/${fileName}`, blob);
                } catch (e) {
                    console.error(`Failed to save image for ${item.name}:`, e);
                    return null;
                }
            }
            return url;
        }));
        finalUrls = savedImageUrls.filter((url): url is string => url !== null);
    }

    const updatedData = data.map(category => {
        const itemIndex = category.items.findIndex(item => item.id === itemId);
        if (itemIndex > -1) {
            itemFound = true;
            const updatedItems = [...category.items];
            updatedItems[itemIndex] = {
                ...updatedItems[itemIndex],
                ...updates,
                ...(finalUrls ? { imageUrls: finalUrls } : {})
            };
            return { ...category, items: updatedItems };
        }
        return category;
    });

    if (itemFound) {
        await saveArtists(updatedData);
    }

    return updatedData;
};

export const enrichArtistDataWithDescriptions = async (
    settings: LLMSettings,
    onProgress: (progress: { current: number, total: number }) => void
): Promise<{ updated: number; total: number }> => {
    const data = await getManifest();
    const artistsToEnrich = data.flatMap(cat => cat.items).filter(item => !item.description?.trim());

    const total = artistsToEnrich.length;
    onProgress({ current: 0, total });

    if (total === 0) {
        return { updated: 0, total: 0 };
    }

    let current = 0;
    let updatedCount = 0;

    for (const item of artistsToEnrich) {
        try {
            const newDescription = await generateArtistDescription(item.name, settings);
            if (newDescription) {
                for (const category of data) {
                    const foundItem = category.items.find(i => i.id === item.id);
                    if (foundItem) {
                        foundItem.description = newDescription;
                        updatedCount++;
                        await saveArtists(data);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error(`Could not generate description for ${item.name}:`, e);
        }
        current++;
        onProgress({ current, total });
        await delay(400); 
    }
    
    return { updated: updatedCount, total: total };
};
