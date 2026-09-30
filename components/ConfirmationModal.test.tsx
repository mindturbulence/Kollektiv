// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../services/audioService', () => ({
  audioService: { playModalOpen: vi.fn(), playModalClose: vi.fn(), playClick: vi.fn() },
}));

import ConfirmationModal from './ConfirmationModal';
import MigrationModal from './MigrationModal';

afterEach(cleanup);

describe('ConfirmationModal (on the shared Modal)', () => {
  it('is a labelled dialog; Abort and Escape close it, Execute confirms', () => {
    const onClose = vi.fn(), onConfirm = vi.fn();
    render(<ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} title="Delete item" message="Really delete?" />);
    const dialog = screen.getByRole('dialog', { name: 'Delete item' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Really delete?')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Confirm action'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Cancel action'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Cancel action'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps focus inside: Tab from the last button wraps to the first', () => {
    render(<ConfirmationModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    const abort = screen.getByLabelText('Cancel action');
    const exec = screen.getByLabelText('Confirm action');
    exec.focus();
    fireEvent.keyDown(exec, { key: 'Tab' });
    expect(document.activeElement).toBe(abort);
  });

  it('closes out of the DOM when isOpen turns false', async () => {
    const { rerender } = render(<ConfirmationModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    expect(screen.queryByRole('dialog')).toBeTruthy();
    rerender(<ConfirmationModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('MigrationModal (on the shared Modal)', () => {
  it('names itself by direction and Escape closes it', () => {
    const onClose = vi.fn();
    render(<MigrationModal isOpen onClose={onClose} onConfirm={vi.fn()} isWorking={false} progress={0} message="" syncDirection="pull" />);
    screen.getByRole('dialog', { name: 'Pull sync' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
