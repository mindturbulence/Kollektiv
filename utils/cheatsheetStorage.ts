
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import { CHEATSHEET_DATA } from '../constants';
import { fileSystemManager } from './fileUtils';

const MANIFEST_NAME = 'cheatsheet.json';
const IMG_FOLDER = 'backgrounds';

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


const saveCheatsheet = async (data: CheatsheetCategory[]): Promise<void> => {
    try {
        const dataString = JSON.stringify(data, null, 2);
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([dataString], { type: 'application/json' }));
    } catch (error) {
        console.error("Failed to save cheatsheet:", error);
    }
};

export const loadCheatsheet = async (): Promise<CheatsheetCategory[]> => {
    return await getManifest();
};

export const updateCategory = async (categoryName: string, updates: Partial<CheatsheetCategory>): Promise<CheatsheetCategory[]> => {
    const data = await getManifest();
    let finalBgUrl = updates.backgroundImageUrl;

    if (finalBgUrl && finalBgUrl.startsWith('data:')) {
        try {
            const response = await fetch(finalBgUrl);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1] || 'png';
            const fileName = `bg_${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${extension}`;
            finalBgUrl = await fileSystemManager.saveFile(`${IMG_FOLDER}/${fileName}`, blob);
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

    await saveCheatsheet(updatedData);
    return updatedData;
};
