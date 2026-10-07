import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import DesignRecipePreview from './DesignRecipePreview';
import type { DesignRecipe } from '../types';

const fs = vi.hoisted(() => ({ getFileAsBlob: vi.fn() }));
vi.mock('../utils/fileUtils', () => ({ fileSystemManager: fs }));

const base: DesignRecipe = {
  id: 'r1', createdAt: Date.UTC(2026, 9, 6, 12), updatedAt: 1, title: 'Stripe Home', pageType: 'landing',
  tags: [], refs: ['design-library/r1/refs/1.png'], overview: 'Calm gradient hero',
};

const setup = (over: Partial<DesignRecipe> = {}, extra: Partial<React.ComponentProps<typeof DesignRecipePreview>> = {}) => {
  const handlers = { onUse: vi.fn(), onCopyPrompt: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  const recipe = { ...base, ...over };
  const ui = (r: DesignRecipe) => <DesignRecipePreview recipe={r} {...handlers} {...extra} />;
  const utils = render(ui(recipe));
  return { recipe, ...handlers, ...utils, rerenderWith: (r: DesignRecipe) => utils.rerender(ui(r)) };
};

const chevron = () => screen.getByRole('button', { name: 'More actions' });
const openMenu = () => { fireEvent.click(chevron()); return screen.getByRole('menu'); };

describe('DesignRecipePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.getFileAsBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => cleanup());

  it('shows title, page type tag, date and overview', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: 'Stripe Home' })).toBeTruthy();
    expect(screen.getByText('landing').className).toContain('paper-tag');
    const day = new Date(base.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(screen.getByText(day)).toBeTruthy();
    const overview = screen.getByText('Calm gradient hero');
    expect(overview.className).toContain('line-clamp-3');
  });

  it('renders nothing for an empty overview and no "Invalid Date" for a NaN timestamp', () => {
    const { container } = setup({ overview: '', createdAt: NaN });
    expect(container.querySelector('.line-clamp-3')).toBeNull();
    expect(container.textContent).not.toContain('Invalid');
  });

  it('shows swatches and font chips, and omits both for undefined', () => {
    const { unmount } = setup({ palette: ['#635bff'], fonts: ['Inter / 56px'] });
    expect(screen.getByRole('img', { name: '#635bff' })).toBeTruthy();
    expect(screen.getByText('Inter / 56px')).toBeTruthy();
    unmount();
    setup({ palette: undefined, fonts: undefined });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  describe('split button', () => {
    it('the main button uses the recipe', () => {
      const { onUse, recipe } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Use recipe' }));
      expect(onUse).toHaveBeenCalledWith(recipe);
    });

    it('the chevron toggles a menu and exposes its state', () => {
      setup();
      expect(chevron().getAttribute('aria-haspopup')).toBe('menu');
      expect(chevron().getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('menu')).toBeNull();
      openMenu();
      expect(chevron().getAttribute('aria-expanded')).toBe('true');
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy prompt only', 'Edit recipe', 'Delete recipe']);
      fireEvent.click(chevron());
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('focuses the first item on open and Escape closes and returns focus to the chevron', () => {
      setup();
      openMenu();
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Copy prompt only' }));
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(chevron());
    });

    it('closes on an outside click but not on a click inside the menu area', () => {
      setup();
      openMenu();
      fireEvent.mouseDown(screen.getByRole('menu'));
      expect(screen.queryByRole('menu')).toBeTruthy();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('ArrowDown/ArrowUp move focus between items and wrap', () => {
      setup();
      openMenu();
      const items = screen.getAllByRole('menuitem');
      fireEvent.keyDown(items[0], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[1]);
      fireEvent.keyDown(items[1], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[2]);
      fireEvent.keyDown(items[2], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[0]);
      fireEvent.keyDown(items[0], { key: 'ArrowUp' });
      expect(document.activeElement).toBe(items[2]);
    });

    it('Tab closes the menu', () => {
      setup();
      openMenu();
      fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Edit recipe' }), { key: 'Tab' });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it.each([
      ['Copy prompt only', 'onCopyPrompt'],
      ['Edit recipe', 'onEdit'],
      ['Delete recipe', 'onDelete'],
    ] as const)('"%s" calls %s with the recipe, closes the menu and returns focus', (name, handler) => {
      const h = setup();
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name }));
      expect(h[handler]).toHaveBeenCalledWith(h.recipe);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(chevron());
    });

    it('disables delete with an explanation when the library is read-only and skips it with the arrow keys', () => {
      const { onDelete } = setup({}, { deleteDisabled: true });
      openMenu();
      const del = screen.getByRole('menuitem', { name: 'Delete recipe' }) as HTMLButtonElement;
      expect(del.disabled).toBe(true);
      expect(del.title).not.toBe('');
      fireEvent.click(del);
      expect(onDelete).not.toHaveBeenCalled();
      const edit = screen.getByRole('menuitem', { name: 'Edit recipe' });
      edit.focus();
      fireEvent.keyDown(edit, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Copy prompt only' }));
    });
  });

  describe('source', () => {
    it('links an https source and uses its hostname in the frame address', () => {
      setup({ sourceUrl: 'https://stripe.com/payments?x=1' });
      const link = screen.getByRole('link', { name: 'Source' });
      expect(link.getAttribute('href')).toBe('https://stripe.com/payments?x=1');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(screen.getByTestId('frame-address').textContent).toBe('stripe.com');
    });

    it.each([['javascript:alert(1)'], ['ftp://example.com/x'], ['not a url']])('renders %s as plain text and falls back to the title', (sourceUrl) => {
      setup({ sourceUrl });
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText(sourceUrl)).toBeTruthy();
      expect(screen.getByTestId('frame-address').textContent).toBe('Stripe Home');
    });

    it('shows the title in the frame address and no source when there is no sourceUrl', () => {
      setup();
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByTestId('frame-address').textContent).toBe('Stripe Home');
    });
  });

  describe('reference frame', () => {
    it('shows the first reference at full size and revokes its URL on unmount', async () => {
      const { unmount } = setup();
      const img = await screen.findByRole('img', { name: 'Stripe Home' });
      expect(img.getAttribute('src')).toBe('blob:mock');
      expect(fs.getFileAsBlob).toHaveBeenCalledWith('design-library/r1/refs/1.png');
      unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('shows the placeholder and no switcher for a recipe without refs', () => {
      setup({ refs: [] });
      expect(screen.getByText('No preview')).toBeTruthy();
      expect(screen.queryByRole('group', { name: 'References' })).toBeNull();
    });

    it('shows the placeholder when the file is missing or unreadable', async () => {
      fs.getFileAsBlob.mockResolvedValue(null);
      const { unmount } = setup();
      expect(await screen.findByText('No preview')).toBeTruthy();
      unmount();
      fs.getFileAsBlob.mockRejectedValue(new Error('denied'));
      setup();
      expect(await screen.findByText('No preview')).toBeTruthy();
    });

    it('shows the placeholder when the image fails to decode', async () => {
      setup();
      fireEvent.error(await screen.findByRole('img', { name: 'Stripe Home' }));
      expect(await screen.findByText('No preview')).toBeTruthy();
    });

    it('has no switcher for a single reference', () => {
      setup();
      expect(screen.queryByRole('group', { name: 'References' })).toBeNull();
    });

    it('switches the framed reference with the numbered buttons and resets for another recipe', async () => {
      const multi = { refs: ['p/1.png', 'p/2.png', 'p/3.png'] };
      const { rerenderWith } = setup(multi);
      const buttons = () => screen.getAllByRole('button', { name: /^Reference \d$/ });
      expect(buttons()).toHaveLength(3);
      expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
      await waitFor(() => expect(fs.getFileAsBlob).toHaveBeenCalledWith('p/1.png'));

      fireEvent.click(buttons()[2]);
      expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
      await waitFor(() => expect(screen.getAllByRole('img', { name: 'Stripe Home' }).length).toBeGreaterThan(0));
      expect(fs.getFileAsBlob.mock.calls.filter((c) => c[0] === 'p/3.png').length).toBeGreaterThan(0);

      rerenderWith({ ...base, ...multi, id: 'r2', title: 'Other' });
      expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    });

    it('falls back to the first reference when the picked index no longer exists', () => {
      const { rerenderWith } = setup({ refs: ['p/1.png', 'p/2.png'] });
      fireEvent.click(screen.getAllByRole('button', { name: /^Reference \d$/ })[1]);
      fs.getFileAsBlob.mockClear();
      rerenderWith({ ...base, refs: ['p/9.png'] });
      expect(screen.queryByRole('group', { name: 'References' })).toBeNull();
      expect(fs.getFileAsBlob).toHaveBeenCalledWith('p/9.png');
    });
  });
});
