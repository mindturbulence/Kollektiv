import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CommandPalette from './CommandPalette';
import { appEventBus } from '../utils/eventBus';

describe('CommandPalette', () => {
  beforeAll(() => { Element.prototype.scrollIntoView = () => {}; }); // jsdom lacks it
  afterEach(cleanup);

  it('Enter runs the best match even when a row re-renders under a resting pointer', () => {
    const emit = vi.spyOn(appEventBus, 'emit');
    render(<CommandPalette isOpen onClose={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 're' } }); // → Refiner, Image Compare, …

    // A pointer resting on the list fires mouseenter as rows swap in — it must not steal the selection.
    fireEvent.mouseEnter(screen.getByRole('option', { name: /Image Compare/ }));
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(emit).toHaveBeenCalledWith('navigate', 'refiner');
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    emit.mockRestore();
  });

  it('moving the mouse over a row selects it', () => {
    render(<CommandPalette isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'refiner' } });
    const second = screen.getByRole('option', { name: /Open Refiner/ });
    fireEvent.mouseMove(second);
    expect(second.getAttribute('aria-selected')).toBe('true');
  });
});
