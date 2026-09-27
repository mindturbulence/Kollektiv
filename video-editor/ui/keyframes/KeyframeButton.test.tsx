// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import KeyframeButton from './KeyframeButton';
import { dispatch as realDispatch, __resetForTests } from '../../core/store';
import type { Clip } from '../../core/types';

vi.mock('../../core/store', async () => {
  const actual = await vi.importActual<typeof import('../../core/store')>('../../core/store');
  return { ...actual, dispatch: vi.fn(actual.dispatch) };
});

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', trackId: 't1', mediaId: 'm1', start: 10, duration: 6, inPoint: 0, speed: 1, volume: 1,
    fadeIn: 0, fadeOut: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
    keyframes: [], effects: [],
    ...overrides,
  };
}

beforeEach(() => {
  __resetForTests();
  vi.mocked(realDispatch).mockClear();
});
afterEach(cleanup);

describe('KeyframeButton', () => {
  it('is hollow and adds a keyframe on click when none exists at the playhead', () => {
    const clip = makeClip();
    render(<KeyframeButton clip={clip} property="opacity" playhead={12} fps={30} value={0.7} />);
    const btn = screen.getByRole('button', { name: 'Add opacity keyframe' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(realDispatch).toHaveBeenCalledWith({
      type: 'updateClip', clipId: 'c1',
      patch: { keyframes: [expect.objectContaining({ time: 2, value: 0.7, property: 'opacity' })] },
    });
  });

  it('is filled and removes the keyframe on click when one exists at the playhead', () => {
    const clip = makeClip({ keyframes: [{ id: 'k1', time: 2, value: 0.4, property: 'opacity', easing: 'linear' }] });
    render(<KeyframeButton clip={clip} property="opacity" playhead={12} fps={30} value={0.4} />);
    const btn = screen.getByRole('button', { name: 'Remove opacity keyframe' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(realDispatch).toHaveBeenCalledWith({ type: 'updateClip', clipId: 'c1', patch: { keyframes: [] } });
  });

  it('is disabled when the playhead is outside the clip', () => {
    const clip = makeClip();
    render(<KeyframeButton clip={clip} property="opacity" playhead={999} fps={30} value={0.7} />);
    expect(screen.getByRole('button', { name: 'Add opacity keyframe' })).toHaveProperty('disabled', true);
  });
});
