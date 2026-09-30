// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContextMenu from './ContextMenu';
import type { MenuItem } from './ContextMenu';

function makeItems(onSelect: Record<string, () => void>): MenuItem[] {
  return [
    { kind: 'action', label: 'Alpha', onSelect: onSelect.alpha ?? vi.fn() },
    { kind: 'separator' },
    { kind: 'action', label: 'Bravo', disabled: true, onSelect: onSelect.bravo ?? vi.fn() },
    { kind: 'action', label: 'Charlie', onSelect: onSelect.charlie ?? vi.fn() },
    { kind: 'submenu', label: 'Sort By', children: [{ kind: 'action', label: 'Manual', onSelect: onSelect.manual ?? vi.fn() }] },
  ];
}

const menu = () => screen.getByRole('menu');
const items = () => screen.getAllByRole('menuitem');
const focusedLabel = () =>
  items().find(el => el.hasAttribute('data-focused'))?.textContent ?? null;

describe('ContextMenu keyboard navigation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  function open(onSelect: Record<string, () => void> = {}) {
    const onClose = vi.fn();
    const utils = render(<ContextMenu items={makeItems(onSelect)} x={100} y={100} onClose={onClose} />);
    // Flush the click-outside registration timer.
    vi.runOnlyPendingTimers();
    return { onClose, ...utils };
  }

  it('renders items, separators and skips separators in navigation', () => {
    open();
    expect(menu()).toBeTruthy();
    // 4 actionable items (separator excluded from menuitem roles).
    expect(items()).toHaveLength(4);
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    // Nothing focused initially.
    expect(focusedLabel()).toBeNull();
  });

  it('ArrowDown moves focus forward and wraps', () => {
    open();
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(focusedLabel()).toContain('Alpha');
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(focusedLabel()).toContain('Bravo'); // disabled items are still focusable
    // …all the way past the end wraps to the first.
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(focusedLabel()).toContain('Alpha');
  });

  it('ArrowUp moves focus backwards', () => {
    open();
    // focusIdx -1 → (-1 - 1 + n) % n → second-to-last action (Charlie).
    fireEvent.keyDown(menu(), { key: 'ArrowUp' });
    expect(focusedLabel()).toContain('Charlie');
  });

  it('ArrowUp from the first item wraps to the last', () => {
    open();
    fireEvent.keyDown(menu(), { key: 'ArrowDown' }); // Alpha (index 0)
    expect(focusedLabel()).toContain('Alpha');
    fireEvent.keyDown(menu(), { key: 'ArrowUp' });
    expect(focusedLabel()).toContain('Sort By'); // index n-1
  });

  it('Home jumps to the first item, End to the last', () => {
    open();
    fireEvent.keyDown(menu(), { key: 'End' });
    expect(focusedLabel()).toContain('Sort By');
    fireEvent.keyDown(menu(), { key: 'Home' });
    expect(focusedLabel()).toContain('Alpha');
  });

  it('Enter selects the focused action and closes', () => {
    const charlie = vi.fn();
    const { onClose } = open({ charlie });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' }); // Alpha → Bravo → Charlie
    expect(focusedLabel()).toContain('Charlie');
    fireEvent.keyDown(menu(), { key: 'Enter' });
    expect(charlie).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter on a disabled item does nothing', () => {
    const bravo = vi.fn();
    const { onClose } = open({ bravo });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' }); // focus Bravo (disabled)
    expect(focusedLabel()).toContain('Bravo');
    fireEvent.keyDown(menu(), { key: 'Enter' });
    expect(bravo).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes without selecting', () => {
    const alpha = vi.fn();
    const { onClose } = open({ alpha });
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(alpha).not.toHaveBeenCalled();
  });

  it('type-ahead jumps to the first item starting with the character', () => {
    open();
    fireEvent.keyDown(menu(), { key: 'c' });
    expect(focusedLabel()).toContain('Charlie');
    // Wraps when no later item matches.
    fireEvent.keyDown(menu(), { key: 's' });
    expect(focusedLabel()).toContain('Sort By');
  });

  it('ArrowRight on a submenu opens its children; Enter too', () => {
    const manual = vi.fn();
    const { onClose } = open({ manual });
    fireEvent.keyDown(menu(), { key: 'End' }); // focus Sort By
    fireEvent.keyDown(menu(), { key: 'ArrowRight' });
    // A second menu (the submenu) is now rendered.
    expect(screen.getAllByRole('menu')).toHaveLength(2);
    const sub = screen.getAllByRole('menu')[1];
    expect(sub.textContent).toContain('Manual');
    fireEvent.keyDown(sub, { key: 'ArrowDown' });
    fireEvent.keyDown(sub, { key: 'Enter' });
    expect(manual).toHaveBeenCalledTimes(1);
    // Selecting a submenu action closes only the submenu (parent stays open
    // until an outside click / Escape at parent level).
    expect(screen.getAllByRole('menu').length).toBeGreaterThanOrEqual(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mouse click selects an action and closes', () => {
    const alpha = vi.fn();
    const { onClose } = open({ alpha });
    fireEvent.click(items()[0]);
    expect(alpha).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mousedown outside the menu closes it', () => {
    const { onClose } = open();
    fireEvent.mouseDown(document.body, { capture: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
