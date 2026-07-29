import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import WorkflowImportModal from './WorkflowImportModal';

// Mock audio service
vi.mock('../services/audioService', () => ({
  audioService: { playClick: vi.fn() },
}));

// Mock workflow storage
vi.mock('../utils/workflowStorage', () => ({
  saveWorkflowSchema: vi.fn().mockResolvedValue(undefined),
  generateWorkflowId: () => 'wf_mock_id',
}));

// Mock the icons
vi.mock('./icons', () => ({
  CloseIcon: ({ className }: { className?: string }) => (
    <span data-testid="close-icon" className={className}>X</span>
  ),
  UploadIcon: ({ className }: { className?: string }) => (
    <span data-testid="upload-icon" className={className}>U</span>
  ),
  BracesIcon: ({ className }: { className?: string }) => (
    <span data-testid="braces-icon" className={className}>{'{ }'}</span>
  ),
}));

// Mock createPortal to render inline
vi.mock('react-dom', () => {
  const actual = vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (content: React.ReactNode) => content,
  };
});

const PROMPT_FORMAT_JSON = JSON.stringify({
  '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
  '6': {
    class_type: 'KSampler',
    inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'euler' },
  },
});

const WEBUI_EXPORT_JSON = JSON.stringify({
  nodes: [
    { id: 3, type: 'CLIPTextEncode', widgets_values: ['hello'] },
    { id: 6, type: 'KSampler', widgets_values: [42, 20, 7, 'euler', 'normal', 1] },
  ],
  links: [],
});

const INVALID_JSON = '{invalid}';

function createMockFile(content: string, name = 'workflow.json'): File {
  return new File([content], name, { type: 'application/json' });
}

describe('WorkflowImportModal', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <WorkflowImportModal isOpen={false} onClose={vi.fn()} onImported={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the upload drop zone when open', () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText(/DROP/i)).toBeTruthy();
    expect(screen.getByText(/ComfyUI API-format JSON/i)).toBeTruthy();
  });

  it('shows error for non-JSON file name', async () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['not json'], 'workflow.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [badFile] } });
    await waitFor(() => {
      expect(screen.getByText(/only \.json files/i)).toBeTruthy();
    });
  });

  it('transitions to mapping step when valid prompt-format JSON is uploaded', async () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createMockFile(PROMPT_FORMAT_JSON);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Parameter Mapping/i)).toBeTruthy();
    });
    expect(screen.getByText(/Node Explorer/i)).toBeTruthy();
    // These appear multiple times (label + descriptions + add buttons), so use getAllByText
    expect(screen.getAllByText(/Positive Prompt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Seed/i).length).toBeGreaterThanOrEqual(1);
  });

  it('converts web-ui export format and shows mapping step', async () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createMockFile(WEBUI_EXPORT_JSON);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Parameter Mapping/i)).toBeTruthy();
    });
  });

  it('shows error for invalid JSON', async () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File([INVALID_JSON], 'bad.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON/i)).toBeTruthy();
    });
  });

  it('calls onImported and onClose when save button is clicked', async () => {
    const onClose = vi.fn();
    const onImported = vi.fn();
    render(
      <WorkflowImportModal isOpen={true} onClose={onClose} onImported={onImported} />,
    );

    // Upload a workflow
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createMockFile(PROMPT_FORMAT_JSON);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Parameter Mapping/i)).toBeTruthy();
    });

    // Now click SAVE
    const saveBtn = screen.getByText(/SAVE WORKFLOW/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });
    expect(onImported).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wf_mock_id',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has Auto-Detect button to reset mappings', async () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createMockFile(PROMPT_FORMAT_JSON);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Auto-Detect/i)).toBeTruthy();
    });
  });

  it('shows KSampler in node explorer', async () => {
    render(<WorkflowImportModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createMockFile(PROMPT_FORMAT_JSON);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // KSampler appears once in node explorer title + once in subtitle
      const matches = screen.getAllByText(/KSampler/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('closes when CANCEL is clicked', async () => {
    const onClose = vi.fn();
    render(<WorkflowImportModal isOpen={true} onClose={onClose} onImported={vi.fn()} />);

    const cancelBtns = screen.getAllByText(/CANCEL/i);
    fireEvent.click(cancelBtns[0]);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
