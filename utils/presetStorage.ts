/**
 * presetStorage — Persist/load/delete named generation-setting presets for
 * the ComfyUI / A1111 Studio pages, using the existing OPFS-based manifest
 * pattern (same as promptStorage.ts).
 */

import { fileSystemManager } from './fileUtils';
import { loadManifestSafe, ManifestWriteBlockedError, stampSchemaVersion, type ManifestLoad } from './manifestStore';

const MANIFEST_NAME = 'generation_presets_manifest.json';

export interface GenerationPreset {
  id: string;
  name: string;
  backendId: 'comfy' | 'a1111';
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number | null;
  randomizeSeed: boolean;
  sampler: string;
  model: string;
  /** Comma-separated Forge additional-modules string (A1111 only) — same
   * raw representation as `LLMSettings.a1111AdditionalModules`, so there is
   * only one place that parses it into an array (LocalGenerationStudioPage). */
  additionalModules: string;
  createdAt: number;
}

interface PresetManifest {
  entries: GenerationPreset[];
}

const isPreset = (e: any): e is GenerationPreset =>
  e && typeof e === 'object' && typeof e.id === 'string' && typeof e.name === 'string' &&
  (e.backendId === 'comfy' || e.backendId === 'a1111');

const getManifest = (): Promise<ManifestLoad<PresetManifest>> =>
  loadManifestSafe<PresetManifest>(
    MANIFEST_NAME,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return { entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isPreset) : [] };
    },
    () => ({ entries: [] }),
  );

const saveManifest = async (manifest: PresetManifest) => {
  await fileSystemManager.saveFile(
    MANIFEST_NAME,
    new Blob([JSON.stringify(stampSchemaVersion(manifest as any), null, 2)], { type: 'application/json' }),
  );
};

/** Load all saved presets, across both backends. */
export async function loadPresets(): Promise<GenerationPreset[]> {
  const { data: manifest } = await getManifest();
  return manifest.entries;
}

/** Save a new preset, or replace an existing one with the same id. */
export async function savePreset(preset: GenerationPreset): Promise<void> {
  const { data: manifest, safeToSave } = await getManifest();
  if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);

  const idx = manifest.entries.findIndex((e) => e.id === preset.id);
  if (idx >= 0) manifest.entries[idx] = preset;
  else manifest.entries.push(preset);

  await saveManifest(manifest);
}

/** Delete a preset by id. */
export async function deletePreset(id: string): Promise<void> {
  const { data: manifest, safeToSave } = await getManifest();
  if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);

  manifest.entries = manifest.entries.filter((e) => e.id !== id);
  await saveManifest(manifest);
}

/** Generate a unique preset id. */
export function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
