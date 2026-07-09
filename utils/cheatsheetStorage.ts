
import type { CheatsheetCategory } from '../types';
import { fileSystemManager } from './fileUtils';
import { loadManifestSafe, ManifestWriteBlockedError, type ManifestLoad } from './manifestStore';

const MANIFEST_NAME = 'cheatsheet.json';
const IMG_FOLDER = 'backgrounds';

const getManifest = (): Promise<ManifestLoad<CheatsheetCategory[]>> =>
    loadManifestSafe<CheatsheetCategory[]>(
        MANIFEST_NAME,
        (parsed) => (Array.isArray(parsed) ? parsed : null),
        () => []
    );


const saveCheatsheet = async (data: CheatsheetCategory[]): Promise<void> => {
    const dataString = JSON.stringify(data, null, 2);
    await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([dataString], { type: 'application/json' }));
};

export const loadCheatsheet = async (): Promise<CheatsheetCategory[]> => {
    const { data: manifest } = await getManifest();
    return manifest;
};

export const updateCategory = async (categoryName: string, updates: Partial<CheatsheetCategory>): Promise<CheatsheetCategory[]> => {
    const { data: manifestData, safeToSave } = await getManifest();
    if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
    const data = manifestData;
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
