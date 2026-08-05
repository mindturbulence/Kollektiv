import { describe, it, expect, vi, beforeEach } from 'vitest';

const isPromptRequestFormatMock = vi.fn((_w: any) => false);
const autoDetectTargetsMock = vi.fn((_w: any) => ({}));
const validateWorkflowOnComfyMock = vi.fn(async (_w: any, _url: string) => ({ node_errors: {} }));
vi.mock('../comfyWorkflowParser', () => ({
  isPromptRequestFormat: (w: any) => isPromptRequestFormatMock(w),
  autoDetectTargets: (w: any) => autoDetectTargetsMock(w),
  validateWorkflowOnComfy: (w: any, url: string) => validateWorkflowOnComfyMock(w, url),
}));

import { comfyWorkflowTool } from './comfyWorkflowTool';

const WORKFLOW = JSON.stringify({ nodes: [{ id: 1 }, { id: 2 }] });

beforeEach(() => vi.clearAllMocks());

describe('comfyWorkflowTool', () => {
  it('does not call validateWorkflowOnComfy when validate is false', async () => {
    const result = await comfyWorkflowTool.execute(
      { workflowJson: WORKFLOW, validate: false },
      { settings: { comfyUrl: 'http://127.0.0.1:8188' } } as any,
    );
    expect(validateWorkflowOnComfyMock).not.toHaveBeenCalled();
    expect(result).not.toContain('Validation');
  });

  // Regression guard: previously passed `{}` as the comfyUrl argument, which
  // threw inside validateWorkflowOnComfy (`comfyUrl.replace is not a function`)
  // before any request was ever sent — this asserts the real URL is threaded through.
  it('passes the configured comfyUrl through when validate is true', async () => {
    validateWorkflowOnComfyMock.mockResolvedValue({ node_errors: {} });
    const result = await comfyWorkflowTool.execute(
      { workflowJson: WORKFLOW, validate: true },
      { settings: { comfyUrl: 'http://127.0.0.1:8188' } } as any,
    );
    expect(validateWorkflowOnComfyMock).toHaveBeenCalledWith(expect.anything(), 'http://127.0.0.1:8188');
    expect(result).toContain('Validation: PASSED');
  });

  it('skips validation with a clear message instead of crashing when no comfyUrl is configured', async () => {
    const result = await comfyWorkflowTool.execute(
      { workflowJson: WORKFLOW, validate: true },
      { settings: {} } as any,
    );
    expect(validateWorkflowOnComfyMock).not.toHaveBeenCalled();
    expect(result).toContain('Validation skipped');
    expect(result).toContain('no ComfyUI URL configured');
  });

  it('reports node errors when validation fails', async () => {
    validateWorkflowOnComfyMock.mockResolvedValue({ node_errors: { '1': 'bad input' } });
    const result = await comfyWorkflowTool.execute(
      { workflowJson: WORKFLOW, validate: true },
      { settings: { comfyUrl: 'http://127.0.0.1:8188' } } as any,
    );
    expect(result).toContain('Validation: FAILED');
    expect(result).toContain('Node 1');
  });
});
