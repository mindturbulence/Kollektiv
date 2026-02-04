import { fileSystemManager } from '../utils/fileUtils';

export interface ComposerPreset {
    name: string;
    mode: 'grid' | 'frame';
    frameStyle: 'minimal' | 'polaroid' | 'leica' | 'film' | 'museum' | 'bottom_only' | 'vertical_mat' | 'minimal_footer';
    aspectRatio: string;
    width: string;
    height: string;
    columns: number;
    rows: number;
    spacing: number;
    bgColor: string;
    imageFit: 'cover' | 'contain';
}

interface ComposerPresetsManifest {
    presets: ComposerPreset[];
}

const MANIFEST_NAME = 'composer_presets_manifest.json';

class ComposerPresetService {
    private async getManifest(): Promise<ComposerPresetsManifest> {
        const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
        if (manifestContent) {
            try {
                const parsed = JSON.parse(manifestContent);
                if (Array.isArray(parsed.presets)) {
                    return parsed;
                }
            } catch (e) {
                console.error("Failed to parse composer presets manifest, returning empty.", e);
            }
        }
        return { presets: [] };
    }

    private async saveManifest(manifest: ComposerPresetsManifest): Promise<void> {
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    }

    public async loadPresets(): Promise<ComposerPreset[]> {
        if (!fileSystemManager.isDirectorySelected()) return [];
        const manifest = await this.getManifest();
        return manifest.presets.sort((a, b) => a.name.localeCompare(b.name));
    }

    public async savePreset(preset: ComposerPreset): Promise<void> {
        if (!fileSystemManager.isDirectorySelected()) {
            throw new Error("Vault not connected.");
        }
        const manifest = await this.getManifest();
        const existingIndex = manifest.presets.findIndex(p => p.name === preset.name);
        if (existingIndex > -1) {
            manifest.presets[existingIndex] = preset;
        } else {
            manifest.presets.push(preset);
        }
        await this.saveManifest(manifest);
    }

    public async deletePreset(presetName: string): Promise<void> {
        if (!fileSystemManager.isDirectorySelected()) {
            throw new Error("Vault not connected.");
        }
        const manifest = await this.getManifest();
        manifest.presets = manifest.presets.filter(p => p.name !== presetName);
        await this.saveManifest(manifest);
    }
}

export const composerPresetService = new ComposerPresetService();