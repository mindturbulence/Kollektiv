import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppTheme } from './useAppTheme';

describe('useAppTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.fontSize = '';
  });

  it('sets data-theme attribute on the document root', () => {
    renderHook(() => useAppTheme('Kollektiv', 14));
    expect(document.documentElement.getAttribute('data-theme')).toBe('Kollektiv');
  });

  it('sets font-size on the document root', () => {
    renderHook(() => useAppTheme('pipboy', 16));
    expect(document.documentElement.style.fontSize).toBe('16px');
  });

  it('updates when darkTheme changes', () => {
    const { rerender } = renderHook(
      ({ theme, size }) => useAppTheme(theme, size),
      { initialProps: { theme: 'Kollektiv', size: 14 } },
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('Kollektiv');

    rerender({ theme: 'pipboy', size: 14 });
    expect(document.documentElement.getAttribute('data-theme')).toBe('pipboy');
  });

  it('updates when fontSize changes', () => {
    const { rerender } = renderHook(
      ({ theme, size }) => useAppTheme(theme, size),
      { initialProps: { theme: 'Kollektiv', size: 14 } },
    );
    expect(document.documentElement.style.fontSize).toBe('14px');

    rerender({ theme: 'Kollektiv', size: 18 });
    expect(document.documentElement.style.fontSize).toBe('18px');
  });
});
