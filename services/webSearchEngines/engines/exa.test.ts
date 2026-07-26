import { describe, it, expect } from 'vitest';

describe('exaEngine', () => {
  it('throws when EXA_API_KEY is not set', async () => {
    const prev = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    const { exaEngine } = await import('./exa');
    await expect(exaEngine.search('test')).rejects.toThrow('EXA_API_KEY not configured');
    if (prev) process.env.EXA_API_KEY = prev;
  });
});
