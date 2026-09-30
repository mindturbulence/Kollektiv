// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { useAsk, type Ask } from './AskDialog';

afterEach(cleanup);

let ask!: Ask;
const Host: React.FC = () => {
  const r = useAsk();
  ask = r.ask;
  return <>{r.dialog}</>;
};

describe('useAsk', () => {
  it('confirm resolves true on OK, false on Cancel and on Escape', async () => {
    render(<Host />);
    let p = ask.confirm('Delete it?', 'Delete');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await p).toBe(true);

    p = ask.confirm('Again?');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(false);

    p = ask.confirm('Once more?');
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    expect(await p).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('prompt resolves the typed text on Enter/OK and null on Cancel', async () => {
    render(<Host />);
    let p = ask.prompt('New folder name:', 'untitled');
    const input = await screen.findByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('untitled');
    fireEvent.change(input, { target: { value: 'holiday' } });
    fireEvent.submit(input.closest('form')!);
    expect(await p).toBe('holiday');

    p = ask.prompt('Rename to:');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await p).toBeNull();
  });

  it('a new request cancels the one still open', async () => {
    render(<Host />);
    const first = ask.confirm('first?');
    await screen.findByText('first?');
    let second!: Promise<boolean>;
    act(() => { second = ask.confirm('second?'); });
    expect(await first).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
    expect(await second).toBe(true);
  });
});
