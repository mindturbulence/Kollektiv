// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ColorPanel, { nextEffectsForGrading, nextEffectsForChroma } from './ColorPanel';
import { decodeColorGrading, decodeChromaKey } from '../../core/effect-params';
import { DEFAULT_COLOR_WHEELS } from '../../core/engines/color-grading';
import { DEFAULT_CHROMA_KEY_SETTINGS } from '../../core/engines/chroma-key';
import type { Clip, Effect } from '../../core/types';

afterEach(cleanup);

function makeClip(effects: Effect[] = []): Clip {
  return {
    id: 'c1', trackId: 't1', start: 0, duration: 5, inPoint: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
    keyframes: [], effects,
  };
}

describe('nextEffectsForGrading', () => {
  it('creates a colorGrade effect when none exists and the grading is non-neutral', () => {
    const clip = makeClip();
    const wheels = { ...DEFAULT_COLOR_WHEELS, shadows: { r: 0.2, g: 0, b: 0 } };
    const effects = nextEffectsForGrading(clip, { wheels });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('colorGrade');
    expect(effects[0].id).toBeTruthy();
    expect(decodeColorGrading(effects[0].params).wheels?.shadows.r).toBeCloseTo(0.2);
  });

  it('updates the existing colorGrade effect in place, preserving its id', () => {
    const wheels = { ...DEFAULT_COLOR_WHEELS, shadows: { r: 0.2, g: 0, b: 0 } };
    const clip = makeClip([{ id: 'e1', type: 'colorGrade', params: { value: JSON.stringify({ wheels }) }, enabled: true }]);
    const nextWheels = { ...wheels, shadows: { r: 0.4, g: 0, b: 0 } };
    const effects = nextEffectsForGrading(clip, { wheels: nextWheels });
    expect(effects).toHaveLength(1);
    expect(effects[0].id).toBe('e1');
    expect(decodeColorGrading(effects[0].params).wheels?.shadows.r).toBeCloseTo(0.4);
  });

  it('removes the colorGrade effect once every section is back to neutral', () => {
    const wheels = { ...DEFAULT_COLOR_WHEELS, shadows: { r: 0.2, g: 0, b: 0 } };
    const other: Effect = { id: 'keep', type: 'brightness', params: { amount: 1 }, enabled: true };
    const clip = makeClip([{ id: 'e1', type: 'colorGrade', params: { value: JSON.stringify({ wheels }) }, enabled: true }, other]);
    const effects = nextEffectsForGrading(clip, {});
    expect(effects).toEqual([other]);
  });

  it('is a no-op when already neutral and no effect exists', () => {
    const clip = makeClip();
    expect(nextEffectsForGrading(clip, {})).toBe(clip.effects);
  });
});

describe('nextEffectsForChroma', () => {
  it('creates a chromaKey effect on first toggle with default settings', () => {
    const clip = makeClip();
    const effects = nextEffectsForChroma(clip, { enabled: true });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('chromaKey');
    expect(effects[0].enabled).toBe(true);
    expect(decodeChromaKey(effects[0].params)).toEqual(DEFAULT_CHROMA_KEY_SETTINGS);
  });

  it('updates settings and enabled flag on the existing effect, preserving its id', () => {
    const clip = makeClip([{ id: 'k1', type: 'chromaKey', params: { keyColor: '#00ff00', tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }, enabled: false }]);
    const effects = nextEffectsForChroma(clip, { enabled: true, settings: { ...DEFAULT_CHROMA_KEY_SETTINGS, tolerance: 0.6 } });
    expect(effects).toHaveLength(1);
    expect(effects[0].id).toBe('k1');
    expect(effects[0].enabled).toBe(true);
    expect(decodeChromaKey(effects[0].params).tolerance).toBeCloseTo(0.6);
  });

  it('toggling enabled off keeps the effect (only colorGrade is removed on neutral)', () => {
    const clip = makeClip([{ id: 'k1', type: 'chromaKey', params: { keyColor: '#00ff00', tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }, enabled: true }]);
    const effects = nextEffectsForChroma(clip, { enabled: false });
    expect(effects).toHaveLength(1);
    expect(effects[0].enabled).toBe(false);
  });
});

describe('ColorPanel (rendered)', () => {
  it('clicking the chroma key checkbox commits once with an enabled chromaKey effect', () => {
    const clip = makeClip();
    const onCommit = vi.fn();
    render(<ColorPanel clip={clip} onCommit={onCommit} />);
    fireEvent.click(screen.getByLabelText('Enable chroma key'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const effects = onCommit.mock.calls[0][0] as Effect[];
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('chromaKey');
    expect(effects[0].enabled).toBe(true);
  });
});
