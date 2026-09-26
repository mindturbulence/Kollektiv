import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import CustomCursor from './CustomCursor';
import { BusyProvider } from '../contexts/BusyContext';

afterEach(cleanup);

describe('CustomCursor', () => {
  it('ignores a mousemove without numeric coordinates instead of crashing', () => {
    render(<CustomCursor />, { wrapper: BusyProvider });

    // A mousemove missing clientX/clientY (e.g. synthesized by some browser
    // extensions/automation) defaults them to NaN on a plain Event — this
    // must not throw when read via .toString().
    expect(() => {
      act(() => {
        window.dispatchEvent(new Event('mousemove'));
      });
    }).not.toThrow();

    expect(screen.getByText(/X:0000/)).toBeTruthy();
    expect(screen.getByText(/Y:0000/)).toBeTruthy();
  });

  it('still tracks a normal mousemove with real coordinates', () => {
    render(<CustomCursor />, { wrapper: BusyProvider });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 42, clientY: 7 }));
    });

    expect(screen.getByText(/X:0042/)).toBeTruthy();
    expect(screen.getByText(/Y:0007/)).toBeTruthy();
  });
});
