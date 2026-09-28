// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import KeyframeNav from './KeyframeNav';
import { dispatch as realDispatch, __resetForTests } from '../../core/store';
import type { Clip, Keyframe } from '../../core/types';

vi.mock('../../core/store', async () => {
  const actual = await vi.importActual<typeof import('../../core/store')>('../../core/store');
  return { ...actual, dispatch: vi.fn(actual.dispatch) };
});

function kf(time: number): Keyframe {
  return { id: `k-${time}`, time, value: 0, property: 'opacity', easing: 'linear' };
}

function makeClip(keyframes: Keyframe[]): Clip {
  return {
    id: 'c1', trackId: 't1', mediaId: 'm1', start: 10, duration: 6, inPoint: 0, speed: 1, volume: 1,
    fadeIn: 0, fadeOut: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
    keyframes, effects: [],
  };
}

beforeEach(() => {
  __resetForTests();
  vi.mocked(realDispatch).mockClear();
});
afterEach(cleanup);

describe('KeyframeNav', () => {
  it('disables prev/next when there is no keyframe in that direction', () => {
    render(<KeyframeNav clip={makeClip([])} playhead={12} fps={30} />);
    expect(screen.getByRole('button', { name: 'Previous keyframe' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next keyframe' })).toHaveProperty('disabled', true);
  });

  it('jumps the playhead to the previous keyframe, clip-absolute', () => {
    const clip = makeClip([kf(1), kf(4)]);
    render(<KeyframeNav clip={clip} playhead={13} fps={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous keyframe' }));
    expect(realDispatch).toHaveBeenCalledWith({ type: 'setPlayhead', time: 11 });
  });

  it('jumps the playhead to the next keyframe, clip-absolute', () => {
    const clip = makeClip([kf(1), kf(4)]);
    render(<KeyframeNav clip={clip} playhead={11} fps={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next keyframe' }));
    expect(realDispatch).toHaveBeenCalledWith({ type: 'setPlayhead', time: 14 });
  });
});
