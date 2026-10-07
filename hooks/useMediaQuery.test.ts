import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

afterEach(() => vi.unstubAllGlobals());

const stubMatchMedia = (initial: boolean) => {
  let listener: (() => void) | undefined;
  const mq = {
    matches: initial,
    addEventListener: vi.fn((_: string, fn: () => void) => { listener = fn; }),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => mq);
  vi.stubGlobal('matchMedia', matchMedia);
  return { mq, matchMedia, fire: (matches: boolean) => { mq.matches = matches; listener?.(); } };
};

describe('useMediaQuery', () => {
  it('assumes a match when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns the current match for the query, both ways', () => {
    const m = stubMatchMedia(false);
    expect(renderHook(() => useMediaQuery('(min-width: 768px)')).result.current).toBe(false);
    expect(m.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
    stubMatchMedia(true);
    expect(renderHook(() => useMediaQuery('(min-width: 768px)')).result.current).toBe(true);
  });

  it('follows change events and unsubscribes on unmount', () => {
    const m = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    act(() => m.fire(true));
    expect(result.current).toBe(true);
    act(() => m.fire(false));
    expect(result.current).toBe(false);
    unmount();
    expect(m.mq.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('survives a media list without addEventListener', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('re-reads when the query changes', () => {
    const m = stubMatchMedia(false);
    const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), { initialProps: { q: '(min-width: 1024px)' } });
    expect(result.current).toBe(false);
    m.mq.matches = true;
    rerender({ q: '(min-width: 768px)' });
    expect(result.current).toBe(true);
  });
});
