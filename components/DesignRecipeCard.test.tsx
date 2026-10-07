import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DesignRecipeCard from './DesignRecipeCard';
import type { DesignRecipe } from '../types';

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: { getFileAsBlob: vi.fn().mockResolvedValue(null) },
}));

const base: DesignRecipe = {
  id: 'r1', createdAt: Date.UTC(2026, 9, 6, 12), updatedAt: 1, title: 'Stripe Home', pageType: 'landing',
  tags: [], refs: ['design-library/r1/refs/1.png'], overview: 'Calm gradient hero',
};

const setup = (over: Partial<DesignRecipe> = {}, extra: Partial<React.ComponentProps<typeof DesignRecipeCard>> = {}) => {
  const handlers = { onOpen: vi.fn(), onUse: vi.fn(), onCopyPrompt: vi.fn(), onDelete: vi.fn() };
  const recipe = { ...base, ...over };
  render(<ul><DesignRecipeCard recipe={recipe} {...handlers} {...extra} /></ul>);
  return { recipe, ...handlers };
};

describe('DesignRecipeCard', () => {
  afterEach(() => cleanup());

  it('renders one swatch per palette colour with its hex as colour and label', () => {
    setup({ palette: ['#635bff', '#ffffff'] });
    const a = screen.getByRole('img', { name: '#635bff' });
    expect(a.style.backgroundColor).toBe('rgb(99, 91, 255)');
    expect(a.getAttribute('title')).toBe('#635bff');
    expect(screen.getByRole('img', { name: '#ffffff' }).style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('renders font chips', () => {
    setup({ fonts: ['Inter / 56px', 'Fraunces / 20px'] });
    expect(screen.getByText('Inter / 56px')).toBeTruthy();
    expect(screen.getByText('Fraunces / 20px')).toBeTruthy();
  });

  it.each([[undefined], [[]]])('renders no swatches, chips or empty overlay for palette/fonts %j', (v) => {
    const { container } = render(<ul><DesignRecipeCard recipe={{ ...base, palette: v, fonts: v }} onOpen={vi.fn()} onUse={vi.fn()} onCopyPrompt={vi.fn()} onDelete={vi.fn()} /></ul>);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(container.querySelector('.backdrop-blur-sm')).toBeNull();
    expect(container.querySelector('.bottom-0')).toBeNull();
  });

  it('shows the page type tag, date and ref count', () => {
    const { container } = render(<ul><DesignRecipeCard recipe={{ ...base, refs: ['a', 'b'] }} onOpen={vi.fn()} onUse={vi.fn()} onCopyPrompt={vi.fn()} onDelete={vi.fn()} /></ul>);
    expect(screen.getByText('landing').className).toContain('paper-tag');
    // Locale-dependent output, so compare against the same formatter instead of a literal.
    const day = new Date(base.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(container.textContent).toContain(`${day} · 2 refs`);
  });

  it('does not throw or print "Invalid Date" for a NaN timestamp', () => {
    const { container } = render(<ul><DesignRecipeCard recipe={{ ...base, createdAt: NaN }} onOpen={vi.fn()} onUse={vi.fn()} onCopyPrompt={vi.fn()} onDelete={vi.fn()} /></ul>);
    expect(container.textContent).not.toContain('Invalid');
  });

  it('caps tags at 3 and shows +N for the rest', () => {
    setup({ tags: ['t1', 't2', 't3', 't4', 't5'] });
    expect(screen.getByText('t3')).toBeTruthy();
    expect(screen.queryByText('t4')).toBeNull();
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('opens from the title button', () => {
    const { onOpen, recipe } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Stripe Home' }));
    expect(onOpen).toHaveBeenCalledWith(recipe);
  });

  it('Use, Copy prompt and Delete call their handler and never open the card', () => {
    const { onOpen, onUse, onCopyPrompt, onDelete, recipe } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Use recipe Stripe Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt for Stripe Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Stripe Home' }));
    expect(onUse).toHaveBeenCalledWith(recipe);
    expect(onCopyPrompt).toHaveBeenCalledWith(recipe);
    expect(onDelete).toHaveBeenCalledWith(recipe);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('reveals the actions on hover and focus-within and disables delete when asked', () => {
    setup({}, { deleteDisabled: true });
    const use = screen.getByRole('button', { name: 'Use recipe Stripe Home' });
    expect(use.className).toContain('group-hover:opacity-100');
    expect(use.className).toContain('group-focus-within:opacity-100');
    expect(screen.getByRole('button', { name: 'Delete Stripe Home' }).hasAttribute('disabled')).toBe(true);
  });
});
