import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createNode } from '../core/graph';
import type { GraphNode } from '../core/types';
import { Inspector } from './Inspector';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SCRIPT = 'Total duration 6s\nA fox.\n\n0-3s: wide shot\n3-6s: close up\n\nAudio: wind';

function shot(text: string): GraphNode {
  const n = createNode('shot', { x: 0, y: 0 }, 's');
  n.data = { model: 'Google Veo 3', durationSec: 6, text, edited: false };
  return n;
}

function setup(node: GraphNode) {
  const onUpdate = vi.fn();
  const utils = render(<Inspector node={node} run={{ status: 'done' }} running={false} onUpdate={onUpdate} onRun={vi.fn()} />);
  return { onUpdate, ...utils };
}

describe('Inspector', () => {
  it('shows one editable row per beat', () => {
    setup(shot(SCRIPT));
    expect((screen.getByLabelText('Beat 1') as HTMLTextAreaElement).value).toBe('wide shot');
    expect((screen.getByLabelText('Beat 2') as HTMLTextAreaElement).value).toBe('close up');
  });

  it('commits an edited beat on blur as the re-serialised script', () => {
    const { onUpdate } = setup(shot(SCRIPT));
    const beat = screen.getByLabelText('Beat 2');
    fireEvent.change(beat, { target: { value: 'slow push in' } });
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.blur(beat);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { text: string };
    expect(patch.text).toMatch(/3[–-]6s: slow push in/);
    expect(patch.text).toMatch(/0[–-]3s: wide shot/);
    expect(patch.text).toContain('Audio: wind');
  });

  it('debounces typing into a single commit', () => {
    vi.useFakeTimers();
    const { onUpdate } = setup(shot(SCRIPT));
    const beat = screen.getByLabelText('Beat 1');
    fireEvent.change(beat, { target: { value: 'w' } });
    fireEvent.change(beat, { target: { value: 'wi' } });
    fireEvent.change(beat, { target: { value: 'wide' } });
    vi.advanceTimersByTime(399);
    expect(onUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect((onUpdate.mock.calls[0][0] as { text: string }).text).toMatch(/0[–-]3s: wide\n/);
  });

  it('flushes a pending edit when the inspector unmounts (selection changed)', () => {
    const { onUpdate, unmount } = setup(shot(SCRIPT));
    fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'just text' } });
    unmount();
    expect(onUpdate).toHaveBeenCalledWith({ text: 'just text', edited: true });
  });

  it('ignores a non-positive length', () => {
    const { onUpdate } = setup(shot(SCRIPT));
    const len = screen.getByLabelText('Length in seconds');
    fireEvent.change(len, { target: { value: '0' } });
    fireEvent.blur(len);
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.change(len, { target: { value: '8' } });
    fireEvent.blur(len);
    expect(onUpdate).toHaveBeenCalledWith({ durationSec: 8 });
  });

  it('edits audio and preset fields', () => {
    const audio = createNode('audio', { x: 0, y: 0 }, 'a');
    const { onUpdate } = setup(audio);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'direct' } });
    expect(onUpdate).toHaveBeenCalledWith({ mode: 'direct' });
  });
});
