import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadPresets,
  savePreset,
  deletePreset,
  generatePresetId,
  type GenerationPreset,
} from './presetStorage';

// Hoisted mock store so it's available before vi.mock runs
const mockStore = vi.hoisted(() => ({
  entries: [] as GenerationPreset[],
}));

let safeToSave = true;

// Mock manifestStore — returns mockStore directly so all mutations persist
vi.mock('./manifestStore', () => ({
  loadManifestSafe: vi.fn(
    (_name: string, _validate: (d: any) => any, _fallback: () => any) => {
      return Promise.resolve({
        data: mockStore,
        safeToSave,
      });
    },
  ),
  stampSchemaVersion: (m: any) => m,
  ManifestWriteBlockedError: class extends Error {
    constructor(name: string) {
      super(`Write blocked: ${name}`);
      this.name = 'ManifestWriteBlockedError';
    }
  },
}));

// Mock fileSystemManager
vi.mock('./fileUtils', () => ({
  fileSystemManager: {
    saveFile: vi.fn(),
    readFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

const SAMPLE_PRESET: GenerationPreset = {
  id: 'preset_test_001',
  name: 'Flux Dev',
  backendId: 'a1111',
  negativePrompt: 'blurry, low quality',
  width: 1024,
  height: 1024,
  steps: 20,
  cfgScale: 1,
  seed: null,
  randomizeSeed: true,
  sampler: 'Euler',
  model: 'flux1-dev.safetensors',
  additionalModules: 'clip_l.safetensors, t5xxl_fp16.safetensors, ae.safetensors',
  createdAt: 1700000000000,
};

describe('presetStorage', () => {
  beforeEach(() => {
    mockStore.entries.splice(0, mockStore.entries.length);
    safeToSave = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads empty list when no presets saved', async () => {
    const entries = await loadPresets();
    expect(entries).toEqual([]);
  });

  it('saves a preset entry and loads it back', async () => {
    await savePreset(SAMPLE_PRESET);
    const entries = await loadPresets();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(SAMPLE_PRESET);
  });

  it('deletes a preset entry by id', async () => {
    await savePreset(SAMPLE_PRESET);
    await deletePreset('preset_test_001');
    const entries = await loadPresets();
    expect(entries).toHaveLength(0);
  });

  it('replaces an existing entry with the same id', async () => {
    await savePreset(SAMPLE_PRESET);
    const updated: GenerationPreset = { ...SAMPLE_PRESET, name: 'Flux Dev v2', steps: 30 };
    await savePreset(updated);

    const entries = await loadPresets();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('Flux Dev v2');
    expect(entries[0].steps).toBe(30);
  });

  it('throws ManifestWriteBlockedError instead of saving when the manifest is unsafe', async () => {
    safeToSave = false;
    await expect(savePreset(SAMPLE_PRESET)).rejects.toThrow(/Write blocked/);
    expect(mockStore.entries).toHaveLength(0);
  });

  it('throws ManifestWriteBlockedError instead of deleting when the manifest is unsafe', async () => {
    await savePreset(SAMPLE_PRESET);
    safeToSave = false;
    await expect(deletePreset('preset_test_001')).rejects.toThrow(/Write blocked/);
  });

  it('generates unique ids', () => {
    const id1 = generatePresetId();
    const id2 = generatePresetId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^preset_\d+_/);
  });
});
