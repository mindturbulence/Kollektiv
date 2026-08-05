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
  modules: [] as { name: string; type: string }[],
  loadingModules: false,
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
  refreshModules: vi.fn(),
  generate: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
};

const mockConsumePendingStudioParams = vi.fn((_backendId?: string) => null as any);
vi.mock('../hooks/useLocalGenerationStudio', () => ({
  useLocalGenerationStudio: () => ({ state: mockState, ...hookMocks }),
  consumePendingStudioParams: (backendId: string) => mockConsumePendingStudioParams(backendId),
}));

const { mockUpdateSettings, mockSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn(),
  mockSettings: {
    comfyUrl: 'http://127.0.0.1:8188', comfyModel: '',
    a1111Url: 'http://127.0.0.1:7860', a1111Model: '', a1111Sampler: '', a1111AdditionalModules: '',
  },
}));

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: mockSettings, updateSettings: mockUpdateSettings }),
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
    mockSettings.a1111AdditionalModules = '';
    mockState.modules = [];
  });

  // Regression guard (WP4): "Load these settings" stashes a Generation's
  // params via setPendingStudioParams before navigating here; this page must
  // pick them up on mount rather than silently ignoring them.
  it('applies pending studio params from a loaded generation on mount', async () => {
    mockConsumePendingStudioParams.mockReturnValueOnce({
      prompt: 'a loaded fox',
      negativePrompt: 'blurry',
      width: 768,
      height: 512,
      steps: 25,
      cfgScale: 5,
      seed: 42,
      sampler: 'DPM++ 2M',
      model: 'flux1-dev.safetensors',
    });

    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText(/a photo of/i) as HTMLTextAreaElement).value).toBe('a loaded fox');
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      a1111Model: 'flux1-dev.safetensors',
      a1111Sampler: 'DPM++ 2M',
    }));
  });

  it('does nothing when there are no pending studio params', () => {
    mockConsumePendingStudioParams.mockReturnValueOnce(null);
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    expect((screen.getByPlaceholderText(/a photo of/i) as HTMLTextAreaElement).value).toBe('');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
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

  it('renders scanned modules as checkboxes and toggling persists them to settings', () => {
    mockState.modules = [
      { name: 'clip_l.safetensors', type: 'text_encoder' },
      { name: 't5xxl_fp16.safetensors', type: 'text_encoder' },
      { name: 'ae.safetensors', type: 'vae' },
    ];
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);

    // Toggle one module on
    fireEvent.click(screen.getByRole('checkbox', { name: /clip_l\.safetensors/i }));
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      a1111AdditionalModules: 'clip_l.safetensors',
    }));

    // Toggle it off again
    fireEvent.click(screen.getByRole('checkbox', { name: /clip_l\.safetensors/i }));
    expect(mockUpdateSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      a1111AdditionalModules: '',
    }));
  });

  it('groups scanned modules into type segments with headers', () => {
    mockState.modules = [
      { name: 'clip_l.safetensors', type: 'text_encoder' },
      { name: 't5xxl_fp16.safetensors', type: 'text_encoder' },
      { name: 'ae.safetensors', type: 'vae' },
      { name: 'vae-ft-mse.safetensors', type: 'vae' },
      { name: 'flux_unet.safetensors', type: 'unet' },
      { name: 'mystery.safetensors', type: 'other' },
    ];
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByText('Text Encoders')).toBeTruthy();
    expect(screen.getByText('VAE')).toBeTruthy();
    expect(screen.getByText('UNet')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
  });

  it('keeps manual entries not present in the scanned list visible as removable chips', () => {
    mockSettings.a1111AdditionalModules = 'custom_te.safetensors';
    mockState.modules = [
      { name: 'clip_l.safetensors', type: 'text_encoder' },
      { name: 'ae.safetensors', type: 'vae' },
    ];
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);

    // The custom entry is preserved as a removable chip even though it's not in the scanned list
    expect(screen.getByText('custom_te.safetensors')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /custom_te\.safetensors/i })).toBeNull();

    // Removing the chip clears the persisted value
    fireEvent.click(screen.getByTitle(/Remove/i));
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      a1111AdditionalModules: '',
    }));
  });

  it('falls back to the free-text input when no module list is available (vanilla A1111)', () => {
    mockState.modules = [];
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    const input = screen.getByPlaceholderText(/clip_l\.safetensors, t5xxl_fp16\.safetensors, ae\.safetensors/i);
    fireEvent.change(input, { target: { value: 'clip_l.safetensors' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      a1111AdditionalModules: 'clip_l.safetensors',
    }));
  });

  it('refreshes the module list on mount for the A1111 backend', () => {
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    expect(hookMocks.refreshModules).toHaveBeenCalled();
  });

  it('renders refresh actions as icon-only buttons with tooltips', () => {
    render(<LocalGenerationStudioPage backendId="a1111" showGlobalFeedback={vi.fn()} />);
    expect(screen.getByTitle('Refresh checkpoint list from backend')).toBeTruthy();
    expect(screen.getByTitle('Refresh sampler list from backend')).toBeTruthy();
    expect(screen.getByTitle('Rescan available CLIP/T5/VAE modules from the server')).toBeTruthy();
    // Icon-only: no text labels remain on the refresh/scan actions
    expect(screen.queryByText('REFRESH')).toBeNull();
    expect(screen.queryByText('SCAN')).toBeNull();
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
