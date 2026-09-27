import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { act } from 'react';
import CaptionsMenu from './CaptionsMenu';
import { __resetForTests, dispatch, getSnapshot } from '../../core/store';
import { createDefaultProject } from '../placement';

describe('CaptionsMenu', () => {
  beforeEach(() => __resetForTests());
  afterEach(cleanup);

  it('disables the trigger without a project', () => {
    render(<CaptionsMenu onError={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Captions' });
    expect(button.getAttribute('disabled')).not.toBeNull();
  });

  it('imports an SRT file as a batch action on the store', async () => {
    const project = createDefaultProject('Test', 1920, 1080);
    act(() => dispatch({ type: 'loadProject', project }));

    const onError = vi.fn();
    render(<CaptionsMenu onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Captions' }));
    fireEvent.click(screen.getByText('Import SRT…'));

    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello\n';
    const file = new File([srt], 'captions.srt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      const clips = getSnapshot().project!.clips;
      expect(clips.some(c => c.text?.content === 'Hello')).toBe(true);
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an error and does not dispatch when the file has no usable cues', async () => {
    const project = createDefaultProject('Test', 1920, 1080);
    act(() => dispatch({ type: 'loadProject', project }));

    const onError = vi.fn();
    render(<CaptionsMenu onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Captions' }));
    fireEvent.click(screen.getByText('Import SRT…'));

    const file = new File(['not an srt file'], 'bad.srt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(getSnapshot().project!.clips).toHaveLength(0);
  });

  it('reports the overlap-skipped count alongside malformed cues', async () => {
    const project = createDefaultProject('Test', 1920, 1080);
    act(() => dispatch({ type: 'loadProject', project }));

    const onError = vi.fn();
    render(<CaptionsMenu onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Captions' }));
    fireEvent.click(screen.getByText('Import SRT…'));

    const srt = [
      '1\n00:00:01,000 --> 00:00:02,000\nA',
      '2\n00:00:01,500 --> 00:00:02,500\nOverlaps A',
      'not a cue at all',
    ].join('\n\n');
    const file = new File([srt], 'captions.srt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Imported with 1 malformed, 1 overlapping cues skipped.'));
  });

  it('reports an error on export when there are no captions', () => {
    const project = createDefaultProject('Test', 1920, 1080);
    act(() => dispatch({ type: 'loadProject', project }));

    const onError = vi.fn();
    render(<CaptionsMenu onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Captions' }));
    fireEvent.click(screen.getByText('Export SRT'));
    expect(onError).toHaveBeenCalledWith('No captions on a text track to export.');
  });
});
