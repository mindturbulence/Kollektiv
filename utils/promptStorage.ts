
import type { SavedPrompt, PromptCategory } from '../types';
import { fileSystemManager } from './fileUtils';
import { v4 as uuidv4 } from 'uuid';

interface PromptManifest {
  prompts: SavedPrompt[];
  categories: PromptCategory[];
}

const MANIFEST_NAME = 'prompts_manifest.json';
const PROMPTS_DIR = 'prompts';

const getManifest = async (): Promise<PromptManifest> => {
    const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
    if (manifestContent) {
        try {
            const parsed = JSON.parse(manifestContent);
            if (Array.isArray(parsed.prompts) && Array.isArray(parsed.categories)) {
                return parsed;
            }
        } catch (e) {
            console.error("Failed to parse prompts manifest, starting fresh.", e);
        }
    }
    return { prompts: [], categories: [] };
};

const saveManifest = async (manifest: PromptManifest) => {
    await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
};

const _loadPromptsWithText = async (prompts: SavedPrompt[]): Promise<SavedPrompt[]> => {
    const promptsWithText = await Promise.all(prompts.map(async (prompt) => {
        const textContent = await fileSystemManager.readFile(`${PROMPTS_DIR}/${prompt.id}.txt`);
        return {
            ...prompt,
            text: textContent || prompt.text, // Fallback to manifest text if file is missing
        };
    }));
    return promptsWithText.sort((a, b) => b.createdAt - a.createdAt);
};

// --- Prompts ---
export const loadSavedPrompts = async (): Promise<SavedPrompt[]> => {
    const manifest = await getManifest();
    return _loadPromptsWithText(manifest.prompts);
};

export const addSavedPrompt = async (promptData: Omit<SavedPrompt, 'id' | 'createdAt'>): Promise<void> => {
    const manifest = await getManifest();
    const newPrompt: SavedPrompt = {
        id: `prompt_${Date.now()}_${uuidv4().substring(0, 6)}`,
        createdAt: Date.now(),
        ...promptData,
    };
    
    await fileSystemManager.saveFile(
        `${PROMPTS_DIR}/${newPrompt.id}.txt`,
        new Blob([newPrompt.text], { type: 'text/plain;charset=utf-8' })
    );

    manifest.prompts.unshift(newPrompt);
    await saveManifest(manifest);
};

export const addMultipleSavedPrompts = async (promptsData: Omit<SavedPrompt, 'id' | 'createdAt'>[]): Promise<void> => {
    const manifest = await getManifest();
    const newPrompts: SavedPrompt[] = [];
    const savePromises: Promise<any>[] = [];

    for (const promptData of promptsData) {
        const newPrompt: SavedPrompt = {
            id: `prompt_${Date.now()}_${uuidv4().substring(0, 6)}`,
            createdAt: Date.now(),
            ...promptData,
        };
        newPrompts.push(newPrompt);
        
        savePromises.push(
            fileSystemManager.saveFile(
                `${PROMPTS_DIR}/${newPrompt.id}.txt`,
                new Blob([newPrompt.text], { type: 'text/plain;charset=utf-8' })
            )
        );
    }
    
    await Promise.all(savePromises);
    
    manifest.prompts.unshift(...newPrompts);
    await saveManifest(manifest);
};

export const updateSavedPrompt = async (id: string, promptData: Omit<SavedPrompt, 'id' | 'createdAt'>): Promise<void> => {
    const manifest = await getManifest();
    const promptIndex = manifest.prompts.findIndex(p => p.id === id);

    if (promptIndex > -1) {
        manifest.prompts[promptIndex] = {
            ...manifest.prompts[promptIndex],
            ...promptData,
        };

        await fileSystemManager.saveFile(
            `${PROMPTS_DIR}/${id}.txt`,
            new Blob([promptData.text], { type: 'text/plain;charset=utf-8' })
        );
        
        await saveManifest(manifest);
    }
};

export const deleteSavedPrompt = async (id: string): Promise<void> => {
    const manifest = await getManifest();
    manifest.prompts = manifest.prompts.filter(p => p.id !== id);
    
    await fileSystemManager.deleteFile(`${PROMPTS_DIR}/${id}.txt`);

    await saveManifest(manifest);
};


// --- Categories ---
export const loadPromptCategories = async (): Promise<PromptCategory[]> => {
    const manifest = await getManifest();
    return manifest.categories;
};

export const addPromptCategory = async (name: string): Promise<PromptCategory[]> => {
    const manifest = await getManifest();
    const newCategory: PromptCategory = {
        id: `pcat_${Date.now()}`,
        name: name
    };
    manifest.categories.push(newCategory);
    await saveManifest(manifest);
    return manifest.categories;
};

export const updatePromptCategory = async (id: string, newName: string): Promise<PromptCategory[]> => {
    const manifest = await getManifest();
    const catIndex = manifest.categories.findIndex(c => c.id === id);
    if (catIndex > -1) {
        manifest.categories[catIndex].name = newName;
    }
    await saveManifest(manifest);
    return manifest.categories;
};

export const deletePromptCategory = async (id: string): Promise<PromptCategory[]> => {
    const manifest = await getManifest();
    manifest.categories = manifest.categories.filter(cat => cat.id !== id);

    manifest.prompts.forEach(prompt => {
        if (prompt.categoryId === id) {
            prompt.categoryId = undefined;
        }
    });

    await saveManifest(manifest);
    return manifest.categories;
};