import { fileSystemManager } from '../utils/fileUtils';
import type { PromptModifiers } from '../types';

const MANIFEST_NAME = 'refiner_presets_manifest.json';

export interface RefinerPreset {
  name: string;
  modifiers: PromptModifiers;
  targetAIModel: string;
  mediaMode: 'image' | 'video' | 'audio';
  promptLength: string;
}

interface PresetsManifest {
  presets: RefinerPreset[];
}

class RefinerPresetService {
  private async getManifest(): Promise<PresetsManifest> {
    const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
    if (manifestContent) {
      try {
        const parsed = JSON.parse(manifestContent);
        if (Array.isArray(parsed.presets)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse refiner presets manifest, returning empty.", e);
      }
    }
    return { presets: [] };
  }

  private async saveManifest(manifest: PresetsManifest): Promise<void> {
    await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
  }

  public async loadPresets(): Promise<RefinerPreset[]> {
    if (!fileSystemManager.isDirectorySelected()) return [];
    const manifest = await this.getManifest();
    return manifest.presets.sort((a, b) => a.name.localeCompare(b.name));
  }

  public async savePreset(preset: RefinerPreset): Promise<void> {
    if (!fileSystemManager.isDirectorySelected()) {
      throw new Error("Application data directory not selected.");
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
      throw new Error("Application data directory not selected.");
    }
    const manifest = await this.getManifest();
    manifest.presets = manifest.presets.filter(p => p.name !== presetName);
    await this.saveManifest(manifest);
  }
}

export const refinerPresetService = new RefinerPresetService();