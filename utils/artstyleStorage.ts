

import type { CheatsheetCategory, CheatsheetItem } from '../types';
import { ART_STYLES_DATA } from '../constants';
import { fileSystemManager } from './fileUtils';

const MANIFEST_NAME = 'artstyles_cheatsheet.json';
const IMG_FOLDER = 'artstyles';

// The data migration logic is removed from this read path.
// The `verifyAndRepairFiles` in `integrity.ts` is now the single source of truth for file creation and updates.
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
        // Silently fail if the file is missing, corrupt, or locked.
        // The integrity check is responsible for creating/repairing it on the next load.
        console.error(`Error reading ${MANIFEST_NAME}, returning empty.`, e);
    }
    return [];
};


const saveArtStyles = async (data: CheatsheetCategory[]): Promise<void> => {
    try {
        const dataString = JSON.stringify(data, null, 2);
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([dataString], { type: 'application/json' }));
    } catch (error) {
        console.error("Failed to save art styles:", error);
    }
};

export const loadArtStyles = async (): Promise<CheatsheetCategory[]> => {
    return await getManifest();
};

export const updateArtStyle = async (itemId: string, newImageUrls: string[]): Promise<CheatsheetCategory[]> => {
    const data = await getManifest();
    let itemFound = false;
    
    // Save new base64 images to disk and get their relative paths
    const savedImageUrls = await Promise.all(newImageUrls.map(async (url, index) => {
        if (url.startsWith('data:')) {
            const item = data.flatMap(c => c.items).find(i => i.id === itemId);
            if (!item) return url; // Should not happen
            
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const extension = blob.type.split('/')[1] || 'png';
                const fileName = `${item.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${index}.${extension}`;
                const category = data.find(c => c.items.some(i => i.id === itemId))?.category || 'Uncategorized';
                
                return await fileSystemManager.saveFile(`${IMG_FOLDER}/${category}/${fileName}`, blob);
            } catch (e) {
                console.error(`Failed to save image for ${item.name}:`, e);
                return null; // Indicates failure
            }
        }
        return url; // It's an existing relative path or http URL
    }));
    
    const successfulUrls = savedImageUrls.filter((url): url is string => url !== null);

    const updatedData = data.map(category => {
        const itemIndex = category.items.findIndex(item => item.id === itemId);
        if (itemIndex > -1) {
            itemFound = true;
            const updatedItems = [...category.items];
            updatedItems[itemIndex] = {
                ...updatedItems[itemIndex],
                imageUrls: successfulUrls,
            };
            return { ...category, items: updatedItems };
        }
        return category;
    });

    if (itemFound) {
        await saveArtStyles(updatedData);
    } else {
        console.warn(`Could not find art style with ID "${itemId}" to update.`);
    }

    return updatedData;
};
