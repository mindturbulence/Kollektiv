

import type { CheatsheetCategory, CheatsheetItem } from '../types';
import { CHEATSHEET_DATA } from '../constants';
import { fileSystemManager } from './fileUtils';

const MANIFEST_NAME = 'cheatsheet.json';

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
