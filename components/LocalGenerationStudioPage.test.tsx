import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { SavedWorkflowEntry } from '../services/comfyWorkflowParser';

beforeEach(cleanup);

const mockState = {
  phase: 'idle' as const,
  available: true as boolean | null,
  models: ['sd15.safetensors'],
  loadingModels: false,
  samplers: ['euler', 'dpmpp_2m'],
  loadingSamplers: false,
  loras: [] as { name: string; alias: string }[],
  loadingLoras: false,
  embeddings: [] as string[],
  loadingEmbeddings: false,
  resultUrl: null as string | null,
  resultSeed: null as number | null,
  galleryItemId: null as string | null,
  error: null as string | null,
};

const hookMocks = {
  checkAvailability: vi.fn(),
  refreshModels: vi.fn(),
  refreshSamplers: vi.fn(),
  refreshLoras: vi.fn(),
  refreshEmbeddings: vi.fn(),
  generate: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
};

vi.mock('../hooks/useLocalGenerationStudio', () => ({
  useLocalGenerationStudio: () => ({ state: mockState, ...hookMocks }),
}));

const { mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn(),
}));

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      comfyUrl: 'http://127.0.0.1:8188', comfyModel: '',
      a1111Url: 'http://127.0.0.1:7860', a1111Model: '', a1111Sampler: '', a1111AdditionalModules: '',
    },
    updateSettings: mockUpdateSettings,
  }),
}));

// Mock WorkflowImportModal to keep tests focused on the parent
vi.mock('./WorkflowImportModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mock-import-modal">Import Modal</div> : null,
}));

// Mock workflowStorage — use vi.hoisted so vars exist before vi.mock runs
const { mockDeleteWorkflowSchema, mockLoadWorkflowSchemas } = vi.hoisted(() => ({
  mockDeleteWorkflowSchema: vi.fn().mockResolvedValue(undefined),
  mockLoadWorkflowSchemas: vi.fn().mockResolvedValue([]),
}));

vi.mock('../utils/workflowStorage', () => ({
  loadWorkflowSchemas: mockLoadWorkflowSchemas,
  deleteWorkflowSchema: mockDeleteWorkflowSchema,
}));

// Mock presetStorage — use vi.hoisted so vars exist before vi.mock runs
const { mockLoadPresets, mockSavePreset, mockDeletePreset } = vi.hoisted(() => ({
  mockLoadPresets: vi.fn().mockResolvedValue([]),
  mockSavePreset: vi.fn().mockResolvedValue(undefined),
  mockDeletePreset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/presetStorage', () => ({
  loadPresets: mockLoadPresets,
  savePreset: mockSavePreset,
  deletePreset: mockDeletePreset,
  generatePresetId: () => 'preset_test_id',
}));

import { LocalGenerationStudioPage } from './LocalGenerationStudioPage';

const SAMPLE_WORKFLOW: SavedWorkflowEntry = {
  id: 'wf_test_001',
  label: 'Test Flux Workflow',
  createdAt: Date.now(),
  schema: {
    workflowName: 'Test Flux Workflow',
    rawPromptJson: {},
    targetInputs: {
      positivePrompt: [],
      negativePrompt: [],
      seed: [],
      steps: [],
      cfg: [],
      samplerName: [],
    },
  },
};

describe('LocalGenerationStudioPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockLoadWorkflowSchemas.mockResolvedValue([]);
    mockLoadPresets.mockResolvedValue([]);
  });

  it('renders the backend label in the heading', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText(/ComfyUI Studio/i)).toBeTruthy();
  });

  it('shows the connected badge when available', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText(/Connected/i)).toBeTruthy();
  });

  it('lists fetched models in the checkpoint dropdown', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText('sd15.safetensors')).toBeTruthy();
  });

  it('disables Generate until a prompt is typed', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByRole('button', { name: /generate/i }).hasAttribute('disabled')).toBe(true);
  });

  it('calls generate with the typed prompt when clicked', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/a photo of/i), { target: { value: 'a red fox' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(hookMocks.generate).toHaveBeenCalledTimes(1);
    expect(hookMocks.generate.mock.calls[0][0].prompt).toBe('a red fox');
  });

  it('hides the Negative Prompt textarea by default and reveals it via the toggle', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/blurry, low quality/i)).toBeNull();

    fireEvent.click(screen.getByText(/Show Negative Prompt/i));
    expect(screen.getByPlaceholderText(/blurry, low quality/i)).toBeTruthy();

    fireEvent.click(screen.getByText(/Hide Negative Prompt/i));
    expect(screen.queryByPlaceholderText(/blurry, low quality/i)).toBeNull();
  });

  it('renders the Workflow selector for ComfyUI backend', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText(/Default \(txt2img\)/i)).toBeTruthy();
    expect(screen.getByText(/\+ IMPORT/i)).toBeTruthy();
  });

  it('does NOT render the Workflow selector for A1111 backend', () => {
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    expect(screen.queryByText(/Default \(txt2img\)/i)).toBeNull();
    expect(screen.queryByText(/\+ IMPORT/i)).toBeNull();
  });

  it('opens the import modal when +IMPORT is clicked', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    const importBtn = screen.getByText(/\+ IMPORT/i);
    fireEvent.click(importBtn);
    expect(screen.getByTestId('mock-import-modal')).toBeTruthy();
  });

  it('uses default workflow (no customWorkflowJson) when no custom workflow selected', () => {
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/a photo of/i), { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    const params = hookMocks.generate.mock.calls[0][0];
    expect(params.customWorkflowJson).toBeUndefined();
  });

  it('shows delete button when a custom workflow is selected, and deletes on click', async () => {
    // Mount with a saved workflow
    mockLoadWorkflowSchemas.mockResolvedValue([SAMPLE_WORKFLOW]);
    const showGlobalFeedback = vi.fn();
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={showGlobalFeedback} />);

    // Wait for the workflow to appear in the dropdown
    await waitFor(() => {
      expect(screen.getByText('Test Flux Workflow')).toBeTruthy();
    });

    // Select the custom workflow
    const workflowSelect = screen.getByDisplayValue('Default (txt2img)');
    fireEvent.change(workflowSelect, { target: { value: 'wf_test_001' } });

    // Delete button should now appear
    const deleteBtn = screen.getByTitle(/Delete this workflow/i);
    expect(deleteBtn).toBeTruthy();

    // Click delete
    fireEvent.click(deleteBtn);

    // Verify deleteWorkflowSchema was called with the right id
    expect(mockDeleteWorkflowSchema).toHaveBeenCalledWith('wf_test_001');

    // Verify the selector reset to default
    await waitFor(() => {
      expect(screen.getByDisplayValue('Default (txt2img)')).toBeTruthy();
    });
  });

  it('does NOT show delete button when default workflow is selected', () => {
    mockLoadWorkflowSchemas.mockResolvedValue([SAMPLE_WORKFLOW]);
    render(<LocalGenerationStudioPage backendId="comfy" showGlobalFeedback={vi.fn()} />);
    expect(screen.queryByTitle(/Delete this workflow/i)).toBeNull();
  });

  it('applying a preset sends model/sampler/additionalModules in one updateSettings call, and carries steps/sampler/additionalModules into Generate', async () => {
    const preset = {
      id: 'preset_1',
      name: 'Flux Preset',
      backendId: 'a1111' as const,
      negativePrompt: 'blurry',
      width: 768,
      height: 768,
      steps: 30,
      cfgScale: 1,
      seed: null,
      randomizeSeed: true,
      sampler: 'Euler',
      model: 'flux1-dev.safetensors',
      additionalModules: 'clip_l.safetensors, t5xxl_fp16.safetensors',
      createdAt: Date.now(),
    };
    mockLoadPresets.mockResolvedValue([preset]);

    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Flux Preset')).toBeTruthy());

    const presetSelect = screen.getByDisplayValue('Preset: None');
    fireEvent.change(presetSelect, { target: { value: 'preset_1' } });

    // Regression guard: three separate updateSettings calls (model, then sampler, then
    // additionalModules) would each close over the same stale settings snapshot and the
    // last write would silently drop the other two — must be exactly one call.
    expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      a1111Model: 'flux1-dev.safetensors',
      a1111Sampler: 'Euler',
      a1111AdditionalModules: 'clip_l.safetensors, t5xxl_fp16.safetensors',
    }));

    fireEvent.change(screen.getByPlaceholderText(/a photo of/i), { target: { value: 'a fox' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    const params = hookMocks.generate.mock.calls[0][0];
    expect(params.steps).toBe(30);
    expect(params.sampler).toBe('Euler');
    expect(params.additionalModules).toEqual(['clip_l.safetensors', 't5xxl_fp16.safetensors']);
  });
});
