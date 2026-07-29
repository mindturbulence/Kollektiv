import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadWorkflowSchemas,
  saveWorkflowSchema,
  deleteWorkflowSchema,
  generateWorkflowId,
} from './workflowStorage';
import type { SavedWorkflowEntry } from '../services/comfyWorkflowParser';

// Hoisted mock store so it's available before vi.mock runs
const mockStore = vi.hoisted(() => ({
  entries: [] as SavedWorkflowEntry[],
}));

// Mock manifestStore — returns mockStore directly so all mutations persist
vi.mock('./manifestStore', () => ({
  loadManifestSafe: vi.fn(
    (_name: string, _validate: (d: any) => any, _fallback: () => any) => {
      // Return mockStore directly (not a copy), so array mutations
      // like push(), filter() reassignment all affect the hoisted store.
      return Promise.resolve({
        data: mockStore,
        safeToSave: true,
      });
    },
  ),
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

const SAMPLE_ENTRY: SavedWorkflowEntry = {
  id: 'wf_test_001',
  label: 'My Flux Workflow',
  createdAt: 1700000000000,
  schema: {
    workflowName: 'My Flux Workflow',
    rawPromptJson: {
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '6': {
        class_type: 'KSampler',
        inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'euler' },
      },
    },
    targetInputs: {
      positivePrompt: [{ nodeId: '3', fieldPath: 'inputs.text' }],
      negativePrompt: [],
      seed: [{ nodeId: '6', fieldPath: 'inputs.seed' }],
      steps: [{ nodeId: '6', fieldPath: 'inputs.steps' }],
      cfg: [{ nodeId: '6', fieldPath: 'inputs.cfg' }],
      samplerName: [{ nodeId: '6', fieldPath: 'inputs.sampler_name' }],
    },
  },
};

describe('workflowStorage', () => {
  beforeEach(() => {
    // Clear the array without reassigning the const
    mockStore.entries.splice(0, mockStore.entries.length);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads empty list when no workflows saved', async () => {
    const entries = await loadWorkflowSchemas();
    expect(entries).toEqual([]);
  });

  it('saves a workflow entry and loads it back', async () => {
    await saveWorkflowSchema(SAMPLE_ENTRY);
    const entries = await loadWorkflowSchemas();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('wf_test_001');
    expect(entries[0].label).toBe('My Flux Workflow');
  });

  it('deletes a workflow entry by id', async () => {
    await saveWorkflowSchema(SAMPLE_ENTRY);
    await deleteWorkflowSchema('wf_test_001');
    const entries = await loadWorkflowSchemas();
    expect(entries).toHaveLength(0);
  });

  it('replaces an existing entry with the same id', async () => {
    await saveWorkflowSchema(SAMPLE_ENTRY);

    const updated: SavedWorkflowEntry = {
      ...SAMPLE_ENTRY,
      label: 'Updated Label',
    };
    await saveWorkflowSchema(updated);

    const entries = await loadWorkflowSchemas();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Updated Label');
  });

  it('generates unique ids', () => {
    const id1 = generateWorkflowId();
    const id2 = generateWorkflowId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^wf_\d+_/);
  });
});
