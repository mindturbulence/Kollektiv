import { describe, it, expect, vi, beforeEach } from 'vitest';

const scoreAllGenerationsMock = vi.fn(async () => 3);
const getTopGenerationsMock = vi.fn(async (_limit?: number) => [] as any[]);
const getTopGenerationsByBackendMock = vi.fn(async (_backendId?: string, _limit?: number) => [] as any[]);
vi.mock('../generationSignals', () => ({
  scoreAllGenerations: () => scoreAllGenerationsMock(),
  getTopGenerations: (limit: number) => getTopGenerationsMock(limit),
  getTopGenerationsByBackend: (backendId: string, limit: number) => getTopGenerationsByBackendMock(backendId, limit),
}));

import { scoreGenerationsTool } from './generationSignalsTool';

beforeEach(() => vi.clearAllMocks());

describe('scoreGenerationsTool', () => {
  it('re-scores and reports top generations across all backends by default', async () => {
    scoreAllGenerationsMock.mockResolvedValue(5);
    getTopGenerationsMock.mockResolvedValue([
      { id: 'g1', score: 0.9, backendId: 'a1111', promptText: 'a fox in the forest' },
    ]);

    const result = await scoreGenerationsTool.execute({}, {} as any);

    expect(scoreAllGenerationsMock).toHaveBeenCalled();
    expect(getTopGenerationsByBackendMock).not.toHaveBeenCalled();
    expect(result).toContain('Re-scored 5');
    expect(result).toContain('a1111');
  });

  it('restricts to one backend when backendId is provided', async () => {
    getTopGenerationsByBackendMock.mockResolvedValue([]);
    const result = await scoreGenerationsTool.execute({ backendId: 'comfy' }, {} as any);
    expect(getTopGenerationsByBackendMock).toHaveBeenCalledWith('comfy', 10);
    expect(getTopGenerationsMock).not.toHaveBeenCalled();
    expect(result).toContain('No scored generations found for backend "comfy"');
  });
});
