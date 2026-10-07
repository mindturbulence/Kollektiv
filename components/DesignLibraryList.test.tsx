import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DesignLibraryList from './DesignLibraryList';
import type { DesignRecipe } from '../types';

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: { getFileAsBlob: vi.fn().mockResolvedValue(null) },
}));

const mk = (id: string, over: Partial<DesignRecipe> = {}): DesignRecipe => ({
  id, createdAt: 1, updatedAt: 1, title: `Title ${id}`, pageType: 'landing', tags: [], refs: [`design-library/${id}/refs/1.png`], overview: '', ...over,
});
const recipes = [mk('a'), mk('b'), mk('c')];

/** Selection is lifted state in the real page; the wrapper mirrors that so keyboard moves are observable. */
const Harness: React.FC<{ list: DesignRecipe[]; initial?: string; onSelect?: (id: string) => void }> = ({ list, initial, onSelect }) => {
  const [id, setId] = useState(initial);
  return <DesignLibraryList recipes={list} selectedId={id} onSelect={(next) => { setId(next); onSelect?.(next); }} />;
};

const listbox = () => screen.getByRole('listbox', { name: 'Recipes' });
const selectedText = () => screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.textContent;

describe('DesignLibraryList', () => {
  afterEach(() => cleanup());

  it('renders one option per recipe with its title and marks only the selected one', () => {
    render(<Harness list={recipes} initial="b" />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    ['Title a', 'Title b', 'Title c'].forEach((t, i) => expect(options[i].textContent).toContain(t));
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('points aria-activedescendant at the selected option', () => {
    render(<Harness list={recipes} initial="b" />);
    const selected = screen.getAllByRole('option')[1];
    expect(listbox().getAttribute('aria-activedescendant')).toBe(selected.id);
    expect(selected.id).not.toBe('');
  });

  it('is focusable and selects on click', () => {
    const onSelect = vi.fn();
    render(<Harness list={recipes} initial="a" onSelect={onSelect} />);
    expect(listbox().getAttribute('tabindex')).toBe('0');
    fireEvent.click(screen.getByText('Title c'));
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(selectedText()).toContain('Title c');
  });

  it('moves with ArrowDown/ArrowUp and clamps at both ends without wrapping', () => {
    const onSelect = vi.fn();
    render(<Harness list={recipes} initial="a" onSelect={onSelect} />);
    fireEvent.keyDown(listbox(), { key: 'ArrowUp' });
    expect(selectedText()).toContain('Title a');
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    expect(selectedText()).toContain('Title c');
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    expect(selectedText()).toContain('Title c');
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['b', 'c']);
    fireEvent.keyDown(listbox(), { key: 'ArrowUp' });
    expect(selectedText()).toContain('Title b');
  });

  it('jumps with Home and End and ignores other keys', () => {
    render(<Harness list={recipes} initial="b" />);
    fireEvent.keyDown(listbox(), { key: 'End' });
    expect(selectedText()).toContain('Title c');
    fireEvent.keyDown(listbox(), { key: 'Home' });
    expect(selectedText()).toContain('Title a');
    expect(fireEvent.keyDown(listbox(), { key: 'x' })).toBe(true);
    expect(selectedText()).toContain('Title a');
  });

  it('prevents the page from scrolling on handled keys', () => {
    render(<Harness list={recipes} initial="a" />);
    expect(fireEvent.keyDown(listbox(), { key: 'ArrowDown' })).toBe(false);
  });

  it('starts from the first row when nothing is selected', () => {
    const onSelect = vi.fn();
    render(<Harness list={recipes} onSelect={onSelect} />);
    expect(listbox().getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('handles an empty list and a single recipe without throwing', () => {
    const { unmount } = render(<Harness list={[]} />);
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    fireEvent.keyDown(listbox(), { key: 'End' });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    unmount();
    const onSelect = vi.fn();
    render(<Harness list={[mk('solo')]} initial="solo" onSelect={onSelect} />);
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    fireEvent.keyDown(listbox(), { key: 'End' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows at most 3 tag pills plus +N', () => {
    render(<Harness list={[mk('t', { tags: ['t1', 't2', 't3', 't4', 't5'] })]} initial="t" />);
    expect(screen.getByText('t3')).toBeTruthy();
    expect(screen.queryByText('t4')).toBeNull();
    expect(screen.getByText('+2').className).toContain('paper-tag');
  });

  it('scrolls the selected option into view when scrollIntoView exists', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<Harness list={recipes} initial="a" />);
      fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
      expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
    } finally {
      // jsdom has none; restore that state for the other tests.
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
