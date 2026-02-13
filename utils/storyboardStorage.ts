
import type { Storyboard, Scene } from '../types';
import { fileSystemManager } from './fileUtils';
import { v4 as uuidv4 } from 'uuid';

interface StoryboardManifest {
  storyboards: Storyboard[];
}

const MANIFEST_NAME = 'storyboards_manifest.json';

const getManifest = async (): Promise<StoryboardManifest> => {
    const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
    if (manifestContent) {
        try {
            const parsed = JSON.parse(manifestContent);
            if (Array.isArray(parsed.storyboards)) {
                return parsed;
            }
        } catch (e) {
            console.error("Failed to parse storyboards manifest, starting fresh.", e);
        }
    }
    return { storyboards: [] };
};

const saveManifest = async (manifest: StoryboardManifest) => {
    await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
};

export const loadStoryboards = async (): Promise<Storyboard[]> => {
    const manifest = await getManifest();
    return manifest.storyboards.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const createStoryboard = async (title: string, model: string): Promise<Storyboard> => {
    const manifest = await getManifest();
    const newStoryboard: Storyboard = {
        id: `storyboard_${Date.now()}_${uuidv4().substring(0, 6)}`,
        title: title || 'Untitled Storyboard',
        targetModel: model,
        scenes: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    manifest.storyboards.unshift(newStoryboard);
    await saveManifest(manifest);
    return newStoryboard;
};

export const updateStoryboard = async (id: string, updates: Partial<Storyboard>): Promise<void> => {
    const manifest = await getManifest();
    const index = manifest.storyboards.findIndex(s => s.id === id);
    if (index > -1) {
        manifest.storyboards[index] = { 
            ...manifest.storyboards[index], 
            ...updates, 
            updatedAt: Date.now() 
        };
        await saveManifest(manifest);
    }
};

export const deleteStoryboard = async (id: string): Promise<void> => {
    const manifest = await getManifest();
    manifest.storyboards = manifest.storyboards.filter(s => s.id !== id);
    await saveManifest(manifest);
};
