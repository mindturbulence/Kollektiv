// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import Modal from './Modal';

afterEach(cleanup);

const Harness: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Test Title">
        <button>inner</button>
      </Modal>
    </>
  );
};

describe('Modal', () => {
  it('labels the dialog, traps Tab, closes on Escape and restores focus', async () => {
    render(<Harness />);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Test Title' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByLabelText('Close');
    const inner = screen.getByText('inner');
    expect(document.activeElement).toBe(close);

    inner.focus();
    fireEvent.keyDown(inner, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(inner);

    fireEvent.keyDown(inner, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Modal bare mode', () => {
  it('keeps the dialog behaviour but renders no header, and names the dialog by aria-label', async () => {
    let closed = 0;
    render(<Modal isOpen onClose={() => { closed++; }} title="Bare Dialog" bare size="lg" className="my-panel" backdropClassName="bg-black/80">
      <button>first</button><button>last</button>
    </Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Bare Dialog' });
    expect(dialog.className).toContain('my-panel');
    expect(dialog.className).toContain('max-w-lg');
    expect(screen.queryByLabelText('Close')).toBeNull();          // no built-in header/close
    expect(dialog.parentElement!.className).toContain('bg-black/80');
    fireEvent.keyDown(screen.getByText('first'), { key: 'Escape' });
    expect(closed).toBe(1);
    screen.getByText('last').focus();
    fireEvent.keyDown(screen.getByText('last'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first')); // Tab still trapped
  });
});
