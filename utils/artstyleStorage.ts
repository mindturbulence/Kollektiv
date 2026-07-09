
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import { fileSystemManager } from './fileUtils';
import { loadManifestSafe, ManifestWriteBlockedError, type ManifestLoad } from './manifestStore';

const MANIFEST_NAME = 'artstyles_cheatsheet.json';
const IMG_FOLDER = 'artstyles';
const BG_FOLDER = 'backgrounds';

const getManifest = (): Promise<ManifestLoad<CheatsheetCategory[]>> =>
    loadManifestSafe<CheatsheetCategory[]>(
        MANIFEST_NAME,
        (parsed) => (Array.isArray(parsed) ? parsed : null),
        () => []
    );


const saveArtStyles = async (data: CheatsheetCategory[]): Promise<void> => {
    try {
        const dataString = JSON.stringify(data, null, 2);
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([dataString], { type: 'application/json' }));
    } catch (error) {
        console.error("Failed to save art styles:", error);
    }
};

export const loadArtStyles = async (): Promise<CheatsheetCategory[]> => {
    const { data: manifest } = await getManifest();
    return manifest;
};

export const updateArtStyle = async (itemId: string, updates: Partial<CheatsheetItem>): Promise<CheatsheetCategory[]> => {
    const { data: manifest, safeToSave } = await getManifest();
    if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
    const data = manifest;
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
        await saveArtStyles(updatedData);
    }

    return updatedData;
};

export const updateCategory = async (categoryName: string, updates: Partial<CheatsheetCategory>): Promise<CheatsheetCategory[]> => {
    const { data: manifest, safeToSave } = await getManifest();
    if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
    const data = manifest;
    let finalBgUrl = updates.backgroundImageUrl;

    if (finalBgUrl && finalBgUrl.startsWith('data:')) {
        try {
            const response = await fetch(finalBgUrl);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1] || 'png';
            const fileName = `bg_${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${extension}`;
            finalBgUrl = await fileSystemManager.saveFile(`${BG_FOLDER}/${fileName}`, blob);
        } catch (e) {
            console.error(`Failed to save background for ${categoryName}:`, e);
        }
    }

    const updatedData = data.map(cat => {
        if (cat.category === categoryName) {
            return { ...cat, ...updates, backgroundImageUrl: finalBgUrl };
        }
        return cat;
    });

    await saveArtStyles(updatedData);
    return updatedData;
};
