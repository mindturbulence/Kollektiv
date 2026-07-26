import { describe, it, expect, vi, beforeEach } from 'vitest';

const watchPageFetch = vi.fn();
const innertubeFetch = vi.fn();

vi.mock('./backends/watchPage', () => ({
  watchPageBackend: { name: 'watchPage', fetch: (...args: any[]) => watchPageFetch(...args) },
}));
vi.mock('./backends/innertube', () => ({
  innertubeBackend: { name: 'innertube', fetch: (...args: any[]) => innertubeFetch(...args) },
}));

describe('getTranscript (ordered fallback)', () => {
  beforeEach(() => {
    watchPageFetch.mockReset();
    innertubeFetch.mockReset();
  });

  it('returns the primary backend result when it succeeds', async () => {
    watchPageFetch.mockResolvedValue([{ text: 'hello', start: 0, duration: 1 }]);
    const { getTranscript } = await import('./index');
    const result = await getTranscript('abc123');
    expect(result.backendUsed).toBe('watchPage');
    expect(result.segments).toHaveLength(1);
    expect(innertubeFetch).not.toHaveBeenCalled();
  });

  it('falls back to the second backend when the first throws', async () => {
    watchPageFetch.mockRejectedValue(new Error('blocked'));
    innertubeFetch.mockResolvedValue([{ text: 'fallback', start: 0, duration: 1 }]);
    const { getTranscript } = await import('./index');
    const result = await getTranscript('abc123');
    expect(result.backendUsed).toBe('innertube');
    expect(result.segments[0].text).toBe('fallback');
  });

  it('throws a clean joined error when both backends fail, never an uncaught crash', async () => {
    watchPageFetch.mockRejectedValue(new Error('blocked'));
    innertubeFetch.mockRejectedValue(new Error('also blocked'));
    const { getTranscript } = await import('./index');
    await expect(getTranscript('abc123')).rejects.toThrow(/watchPage: blocked.*innertube: also blocked/s);
  });
});
