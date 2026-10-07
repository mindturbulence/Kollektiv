import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import DesignLibrary from './DesignLibrary';
import type { DesignCollection, DesignRecipe } from '../types';

vi.mock('../services/audioService', () => ({
  audioService: { playClick: vi.fn(), playModalOpen: vi.fn(), playModalClose: vi.fn(), playPanelSlideIn: vi.fn(), playPanelSlideOut: vi.fn() },
}));

const storage = vi.hoisted(() => ({
  loadDesignLibrary: vi.fn(),
  deleteRecipe: vi.fn(),
  createRecipe: vi.fn(),
  findOrphanRecipes: vi.fn(),
  rebuildIndexFromDisk: vi.fn(),
}));
vi.mock('../utils/designLibraryStorage', () => storage);

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: { getFileAsBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' })) },
}));

const draft = vi.hoisted(() => ({ loadBriefDraft: vi.fn() }));
vi.mock('../utils/designExport', async () => ({
  ...(await vi.importActual<typeof import('../utils/designExport')>('../utils/designExport')),
  loadBriefDraft: draft.loadBriefDraft,
}));

vi.mock('./DesignRecipeDetail', () => ({
  default: ({ recipeId, onBack }: { recipeId: string; onBack: () => void }) => (
    <div><span>detail:{recipeId}</span><button type="button" onClick={onBack}>mock back</button></div>
  ),
}));

vi.mock('./settings/DesignLibrarySection', () => ({ default: () => <div>mock manager</div> }));

vi.mock('./UseRecipeModal', () => ({
  default: ({ recipeId, onClose }: { recipeId: string; onClose: () => void }) => (
    <div><span>use:{recipeId}</span><button type="button" onClick={onClose}>mock close</button></div>
  ),
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return { ...actual, createPortal: (content: React.ReactNode) => content };
});

const mk = (over: Partial<DesignRecipe>): DesignRecipe => ({
  id: 'x', createdAt: 1, updatedAt: 1, title: 'T', pageType: 'landing', tags: [], refs: ['design-library/x/refs/1.png'], overview: '', ...over,
});

const recipes = [
  mk({ id: 'a', title: 'Stripe Home', pageType: 'landing', tags: ['saas', 'dark'], overview: 'Calm gradient hero', createdAt: 3 }),
  mk({ id: 'b', title: 'Linear Board', pageType: 'app', tags: ['saas'], overview: 'Dense issue tracker', createdAt: 2 }),
  mk({ id: 'c', title: 'Studio Folio', pageType: 'portfolio', tags: ['minimal'], overview: 'Editorial grid', createdAt: 1 }),
];

const feedback = vi.fn();
const renderLib = (props: Partial<React.ComponentProps<typeof DesignLibrary>> = {}) =>
  render(<DesignLibrary showGlobalFeedback={feedback} {...props} />);

describe('DesignLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    localStorage.clear();
    storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [], safeToSave: true });
    storage.findOrphanRecipes.mockResolvedValue({ orphans: [], unreadable: [] });
  });
  afterEach(() => cleanup());

  it('shows the loading orb first', () => {
    storage.loadDesignLibrary.mockReturnValue(new Promise(() => {}));
    renderLib();
    expect(screen.getByTestId('thinking-orb')).toBeTruthy();
  });

  it('shows an empty state with an add action for an empty library', async () => {
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
    renderLib();
    expect(await screen.findByText('No recipes yet')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /add recipe/i }).length).toBe(2);
  });

  it('renders a card per recipe, newest first, with at most 3 tags', async () => {
    storage.loadDesignLibrary.mockResolvedValue({
      recipes: [mk({ id: 'm', title: 'Many Tags', tags: ['t1', 't2', 't3', 't4'], createdAt: 0 }), ...recipes],
      collections: [], safeToSave: true,
    });
    renderLib();
    await screen.findByText('Stripe Home');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Stripe Home', 'Linear Board', 'Studio Folio', 'Many Tags']);
    // tag badges only (the tag filter chips are buttons, not .paper-tag)
    const badges = Array.from(document.querySelectorAll('.paper-tag')).map((b) => b.textContent);
    expect(badges).toContain('t3');
    expect(badges).not.toContain('t4');
  });

  it('search narrows the grid and shows a no-matches state', async () => {
    renderLib();
    await screen.findByText('Stripe Home');
    const search = screen.getByLabelText('Search recipes');
    fireEvent.change(search, { target: { value: 'tracker' } });
    expect(screen.queryByText('Stripe Home')).toBeNull();
    expect(screen.getByText('Linear Board')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('page type chip narrows the grid', async () => {
    renderLib();
    await screen.findByText('Stripe Home');
    fireEvent.click(screen.getByRole('button', { name: /^portfolio$/i }));
    expect(screen.queryByText('Stripe Home')).toBeNull();
    expect(screen.getByText('Studio Folio')).toBeTruthy();
  });

  it('tag chip narrows the grid and clicking it again clears the filter', async () => {
    renderLib();
    await screen.findByText('Stripe Home');
    const chip = within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'minimal' });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Stripe Home')).toBeNull();
    expect(screen.getByText('Studio Folio')).toBeTruthy();
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Stripe Home')).toBeTruthy();
  });

  it('page type tabs are toggle buttons with aria-pressed', async () => {
    renderLib();
    await screen.findByText('Stripe Home');
    const tabs = within(screen.getByRole('group', { name: 'Page type' }));
    expect(tabs.getByRole('button', { name: 'all' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tabs.getByRole('button', { name: /^app$/i }));
    expect(tabs.getByRole('button', { name: /^app$/i }).getAttribute('aria-pressed')).toBe('true');
    expect(tabs.getByRole('button', { name: 'all' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('hides the tag row when no recipe has tags', async () => {
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [mk({ id: 'n', title: 'Untagged' })], collections: [], safeToSave: true });
    renderLib();
    await screen.findByText('Untagged');
    expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull();
  });

  describe('tag row overflow', () => {
    const tagged = [mk({ id: 't', title: 'Tagged', tags: Array.from({ length: 12 }, (_, i) => `tag${String(i).padStart(2, '0')}`) })];
    const row = () => within(screen.getByRole('group', { name: 'Tags' }));

    beforeEach(() => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: tagged, collections: [], safeToSave: true });
    });

    it('shows 8 tags plus "+N more", which reveals the rest and toggles back', async () => {
      renderLib();
      await screen.findByText('Tagged');
      expect(row().queryByRole('button', { name: 'tag09' })).toBeNull();
      fireEvent.click(row().getByRole('button', { name: '+4 more' }));
      fireEvent.click(row().getByRole('button', { name: 'tag11' }));
      expect(row().getByRole('button', { name: 'tag11' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(row().getByRole('button', { name: 'Show less' }));
      // the selected tag stays visible when the row collapses, and is not counted as hidden
      expect(row().getByRole('button', { name: 'tag11' })).toBeTruthy();
      expect(row().queryByRole('button', { name: 'tag10' })).toBeNull();
      expect(row().getByRole('button', { name: '+3 more' })).toBeTruthy();
    });

    it('has no "+N more" chip when the tags fit the row', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [], safeToSave: true });
      renderLib();
      await screen.findByText('Stripe Home');
      expect(row().queryByRole('button', { name: /more|Show less/ })).toBeNull();
    });
  });

  describe('stats tiles', () => {
    const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')!.textContent;
    const styled = [
      mk({ id: 's1', title: 'One', pageType: 'landing', tags: ['x'], palette: ['#FFFFFF', '#111111'], fonts: ['Inter / 56px', 'Playfair Display / 72px'], createdAt: 3 }),
      mk({ id: 's2', title: 'Two', pageType: 'app', palette: ['#ffffff', '#ff0000'], fonts: ['Inter / 16px'], createdAt: 2 }),
      mk({ id: 's3', title: 'Three', pageType: 'app', collectionId: 'c1', createdAt: 1 }),
    ];
    const collections: DesignCollection[] = [{ id: 'c1', name: 'Mine', order: 0 }];

    it('shows distinct counts and treats recipes without tokens as zero', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: styled, collections, safeToSave: true });
      renderLib();
      await screen.findByText('One');
      expect([stat('Recipes'), stat('Colours'), stat('Fonts')]).toEqual(['3', '3', '2']);
    });

    it('ignores search, page type and tag filters', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: styled, collections, safeToSave: true });
      renderLib();
      await screen.findByText('One');
      fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'Three' } });
      fireEvent.click(screen.getByRole('button', { name: /^app$/i }));
      fireEvent.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'x' }));
      expect(screen.getByText('No matches')).toBeTruthy();
      expect([stat('Recipes'), stat('Colours'), stat('Fonts')]).toEqual(['3', '3', '2']);
    });

    it('follows the collection scope', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: styled, collections, safeToSave: true });
      renderLib();
      await screen.findByText('One');
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Category navigation' })).getByRole('button', { name: /^Unsorted/ }));
      expect([stat('Recipes'), stat('Colours'), stat('Fonts')]).toEqual(['2', '3', '2']);
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Category navigation' })).getByRole('button', { name: /^Mine/ }));
      expect([stat('Recipes'), stat('Colours'), stat('Fonts')]).toEqual(['1', '0', '0']);
    });

    it('renders zeros for an empty library next to the empty state', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
      renderLib();
      expect(await screen.findByText('No recipes yet')).toBeTruthy();
      expect([stat('Recipes'), stat('Colours'), stat('Fonts')]).toEqual(['0', '0', '0']);
    });
  });

  describe('sort pills', () => {
    const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const sortBtn = (name: string) => within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name });

    it('defaults to Recent, A-Z reorders by title, Recent restores', async () => {
      renderLib();
      await screen.findByText('Stripe Home');
      expect(sortBtn('Recent').getAttribute('aria-pressed')).toBe('true');
      expect(titles()).toEqual(['Stripe Home', 'Linear Board', 'Studio Folio']);
      fireEvent.click(sortBtn('A–Z'));
      expect(sortBtn('A–Z').getAttribute('aria-pressed')).toBe('true');
      expect(titles()).toEqual(['Linear Board', 'Stripe Home', 'Studio Folio']);
      fireEvent.click(sortBtn('Recent'));
      expect(titles()).toEqual(['Stripe Home', 'Linear Board', 'Studio Folio']);
    });

    it('keeps the chosen order across unrelated re-renders, and Random re-seeds on every press', async () => {
      const many = Array.from({ length: 8 }, (_, i) => mk({ id: `r${i}`, title: `Item ${i}`, createdAt: 100 - i }));
      storage.loadDesignLibrary.mockResolvedValue({ recipes: many, collections: [], safeToSave: true });
      const spy = vi.spyOn(Math, 'random');
      spy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
      renderLib();
      await screen.findByText('Item 0');
      fireEvent.click(sortBtn('Random'));
      const first = titles();
      expect(first).not.toEqual(many.map((r) => r.title));
      // unrelated state changes (search typed and cleared, a page-type tab toggled) do not reshuffle
      fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'item' } });
      fireEvent.click(screen.getByRole('button', { name: /^app$/i }));
      fireEvent.click(screen.getByRole('button', { name: 'all' }));
      fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: '' } });
      expect(titles()).toEqual(first);
      fireEvent.click(sortBtn('Random'));
      expect(titles()).not.toEqual(first);
      spy.mockRestore();
    });
  });

  it('shows a read-only notice and disables add/delete when the manifest is unsafe', async () => {
    storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [], safeToSave: false });
    renderLib();
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^add recipe$/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete Stripe Home' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows an error state with retry instead of crashing when storage is unavailable', async () => {
    storage.loadDesignLibrary.mockRejectedValueOnce(new Error('vault not connected'));
    renderLib();
    expect(await screen.findByText('Library unavailable')).toBeTruthy();
    expect(screen.getByText(/vault not connected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Stripe Home')).toBeTruthy();
  });

  it('calls onOpenRecipe when a card is clicked', async () => {
    const onOpenRecipe = vi.fn();
    renderLib({ onOpenRecipe });
    fireEvent.click((await screen.findByText('Linear Board')).closest('button')!);
    expect(onOpenRecipe).toHaveBeenCalledWith('b');
  });

  it('opens the detail editor on card click and refreshes the list on return', async () => {
    renderLib();
    fireEvent.click((await screen.findByText('Linear Board')).closest('button')!);
    expect(screen.getByText('detail:b')).toBeTruthy();
    expect(screen.queryByText('Stripe Home')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'mock back' }));
    expect(await screen.findByText('Stripe Home')).toBeTruthy();
    await waitFor(() => expect(storage.loadDesignLibrary).toHaveBeenCalledTimes(2));
  });

  it('opens the use-recipe dialog from a card without opening the detail view', async () => {
    renderLib();
    fireEvent.click(await screen.findByRole('button', { name: 'Use recipe Linear Board' }));
    expect(screen.getByText('use:b')).toBeTruthy();
    expect(screen.queryByText('detail:b')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'mock close' }));
    expect(screen.queryByText('use:b')).toBeNull();
  });

  describe('copy prompt', () => {
    const writeText = vi.fn();
    const copyBtn = async () => screen.findByRole('button', { name: 'Copy prompt for Linear Board' });
    beforeEach(() => {
      writeText.mockReset().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      draft.loadBriefDraft.mockReturnValue({ brief: { project: 'Acme', pages: 'Home' }, mode: 'adapt' });
    });

    it('writes the compiled prompt and confirms when a brief draft exists', async () => {
      renderLib();
      fireEvent.click(await copyBtn());
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText.mock.calls[0][0]).toContain('Build Home for Acme');
      expect(writeText.mock.calls[0][0]).not.toContain('unzip');
      await waitFor(() => expect(feedback).toHaveBeenCalledWith('Prompt copied. Export the files too so the agent can see the screenshots.'));
      expect(screen.queryByText('use:b')).toBeNull();
    });

    it('opens the Use dialog instead when there is no usable draft', async () => {
      draft.loadBriefDraft.mockReturnValue({ brief: { project: '', pages: 'Home' }, mode: 'adapt' });
      renderLib();
      fireEvent.click(await copyBtn());
      expect(screen.getByText('use:b')).toBeTruthy();
      expect(writeText).not.toHaveBeenCalled();
    });

    it('reports a clipboard rejection and opens the Use dialog', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      renderLib();
      fireEvent.click(await copyBtn());
      expect(await screen.findByText('use:b')).toBeTruthy();
      expect(feedback).toHaveBeenCalledWith('Could not copy — open Use recipe instead.', true);
    });

    it('treats a missing clipboard like a rejection', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      renderLib();
      fireEvent.click(await copyBtn());
      expect(await screen.findByText('use:b')).toBeTruthy();
      expect(feedback).toHaveBeenCalledWith('Could not copy — open Use recipe instead.', true);
    });
  });

  it('renders inside the paper theme scope in every state, including the detail view', async () => {
    storage.loadDesignLibrary.mockReturnValue(new Promise(() => {}));
    const loading = renderLib();
    expect(loading.container.querySelector('[data-theme="paper"]')).toBeTruthy();
    cleanup();

    storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [], safeToSave: true });
    const { container } = renderLib();
    fireEvent.click((await screen.findByText('Linear Board')).closest('button')!);
    const scope = container.querySelector('[data-theme="paper"]')!;
    expect(scope.contains(screen.getByText('detail:b'))).toBe(true);
  });

  it('keeps a dialog opened from the page inside the paper theme', async () => {
    renderLib();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Stripe Home' }));
    expect(screen.getByRole('dialog').parentElement!.getAttribute('data-theme')).toBe('paper');
  });

  it('deletes after confirmation and reloads', async () => {
    storage.deleteRecipe.mockResolvedValue(undefined);
    renderLib();
    await screen.findByText('Stripe Home');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Stripe Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(storage.deleteRecipe).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(storage.loadDesignLibrary).toHaveBeenCalledTimes(2));
    expect(feedback).toHaveBeenCalledWith('Deleted "Stripe Home"');
  });

  it('surfaces a delete failure in a visible alert', async () => {
    storage.deleteRecipe.mockRejectedValue(new Error('manifest blocked'));
    renderLib();
    await screen.findByText('Stripe Home');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Stripe Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect((await screen.findByRole('alert')).textContent).toContain('manifest blocked');
  });

  describe('collections sidebar', () => {
    const collections: DesignCollection[] = [
      { id: 'c1', name: 'Landing pages', order: 0 },
      { id: 'c2', name: 'Heroes', parentId: 'c1', order: 0 },
      { id: 'c3', name: 'Docs sites', order: 1 },
    ];
    const inLib = [
      mk({ id: 'a', title: 'Alpha', collectionId: 'c1', createdAt: 5 }),
      mk({ id: 'b', title: 'Beta', collectionId: 'c2', createdAt: 4 }),
      mk({ id: 'c', title: 'Gamma', collectionId: 'c3', createdAt: 3 }),
      mk({ id: 'd', title: 'Delta', createdAt: 2 }),
      mk({ id: 'e', title: 'Epsilon', collectionId: 'long-gone', createdAt: 1 }),
    ];
    const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const node = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Category navigation' })).getByRole('button', { name });

    beforeEach(() => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: inLib, collections, safeToSave: true });
    });

    it('shows All recipes, Unsorted and the nested tree with recipe counts that include descendants', async () => {
      renderLib();
      await screen.findByText('Alpha');
      expect(node(/^All recipes/).textContent).toContain('5');
      expect(node(/^Unsorted/).textContent).toContain('2');
      expect(node(/^Landing pages/).textContent).toContain('2');
      expect(node(/^Docs sites/).textContent).toContain('1');
      expect(within(screen.getByRole('navigation', { name: 'Category navigation' })).queryByRole('button', { name: /^Heroes/ })).toBeNull();
      fireEvent.click(node(/^Landing pages/));
      expect(node(/^Heroes/).textContent).toContain('1');
    });

    it('selecting a collection filters the grid to it and its descendants; a sub-collection narrows further', async () => {
      renderLib();
      await screen.findByText('Alpha');
      fireEvent.click(node(/^Landing pages/));
      expect(titles()).toEqual(['Alpha', 'Beta']);
      fireEvent.click(node(/^Heroes/));
      expect(titles()).toEqual(['Beta']);
      fireEvent.click(node(/^All recipes/));
      expect(titles()).toHaveLength(5);
    });

    it('Unsorted holds recipes with no collection and recipes whose collection is gone', async () => {
      renderLib();
      await screen.findByText('Alpha');
      fireEvent.click(node(/^Unsorted/));
      expect(titles()).toEqual(['Delta', 'Epsilon']);
    });

    it('keeps the selection across a reload of the list', async () => {
      storage.deleteRecipe.mockResolvedValue(undefined);
      renderLib();
      await screen.findByText('Alpha');
      fireEvent.click(node(/^Docs sites/));
      expect(titles()).toEqual(['Gamma']);
      storage.loadDesignLibrary.mockResolvedValue({ recipes: inLib.filter((r) => r.id !== 'c'), collections, safeToSave: true });
      fireEvent.click(screen.getByRole('button', { name: 'Delete Gamma' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      expect(await screen.findByText('No matches')).toBeTruthy();
      expect(node(/^Docs sites/).textContent).toContain('0');
    });

    it('falls back to All recipes when the selected collection was deleted in Manage', async () => {
      renderLib();
      await screen.findByText('Alpha');
      fireEvent.click(node(/^Docs sites/));
      expect(titles()).toEqual(['Gamma']);
      fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
      expect(screen.getByText('mock manager')).toBeTruthy();
      storage.loadDesignLibrary.mockResolvedValue({
        recipes: inLib.map((r) => (r.id === 'c' ? { ...r, collectionId: undefined } : r)),
        collections: collections.filter((c) => c.id !== 'c3'),
        safeToSave: true,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(titles()).toHaveLength(5));
      expect(screen.queryByText('mock manager')).toBeNull();
    });

    it('pre-selects the current collection in the Add recipe dialog', async () => {
      renderLib();
      await screen.findByText('Alpha');
      fireEvent.click(node(/^Docs sites/));
      fireEvent.click(screen.getAllByRole('button', { name: /^add recipe$/i })[0]);
      expect((screen.getByLabelText('Collection') as HTMLSelectElement).value).toBe('c3');
    });

    it('works on first boot with no collections at all', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: inLib, collections: [], safeToSave: true });
      renderLib();
      await screen.findByText('Alpha');
      expect(node(/^Unsorted/).textContent).toContain('5');
      expect(titles()).toHaveLength(5);
    });
  });

  describe('view switch and Library view', () => {
    const VIEW_KEY = 'kollektiv.designLibraryView';
    const viewBtn = (name: 'Gallery' | 'Library') => within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name });
    const previewTitle = () => screen.getByRole('heading', { level: 2, name: /Stripe Home|Linear Board|Studio Folio/ }).textContent;
    const goLibrary = async () => {
      await screen.findByRole('heading', { level: 3, name: 'Stripe Home' });
      fireEvent.click(viewBtn('Library'));
    };
    const pane = () => within(screen.getByRole('article'));
    const menuItem = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      return screen.getByRole('menuitem', { name });
    };

    it('defaults to Gallery, keeps the card grid and offers both views as toggle buttons', async () => {
      renderLib();
      await screen.findByText('Stripe Home');
      expect(viewBtn('Gallery').getAttribute('aria-pressed')).toBe('true');
      expect(viewBtn('Library').getAttribute('aria-pressed')).toBe('false');
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('remembers the chosen view across a remount', async () => {
      const first = renderLib();
      await goLibrary();
      expect(localStorage.getItem(VIEW_KEY)).toBe('library');
      first.unmount();
      renderLib();
      expect(await screen.findByRole('listbox', { name: 'Recipes' })).toBeTruthy();
      expect(viewBtn('Library').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(viewBtn('Gallery'));
      expect(localStorage.getItem(VIEW_KEY)).toBe('gallery');
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    });

    it('ignores an invalid stored value', async () => {
      localStorage.setItem(VIEW_KEY, 'masonry');
      renderLib();
      await screen.findByText('Stripe Home');
      expect(viewBtn('Gallery').getAttribute('aria-pressed')).toBe('true');
    });

    it('still switches when storage throws on every access', async () => {
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
      try {
        renderLib();
        await goLibrary();
        expect(screen.getByRole('listbox', { name: 'Recipes' })).toBeTruthy();
        expect(viewBtn('Library').getAttribute('aria-pressed')).toBe('true');
      } finally {
        get.mockRestore();
        set.mockRestore();
      }
    });

    it('shows the list and the preview of the first recipe instead of cards', async () => {
      renderLib();
      await goLibrary();
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        expect.stringContaining('Stripe Home'), expect.stringContaining('Linear Board'), expect.stringContaining('Studio Folio'),
      ]);
      expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
      expect(previewTitle()).toBe('Stripe Home');
      expect(pane().getByText('Calm gradient hero')).toBeTruthy();
      expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    });

    it('selecting a row switches the preview, and search/sort still drive the list', async () => {
      renderLib();
      await goLibrary();
      fireEvent.click(screen.getByRole('option', { name: /Linear Board/ }));
      expect(previewTitle()).toBe('Linear Board');
      fireEvent.click(within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name: 'A–Z' }));
      expect(screen.getAllByRole('option')[0].textContent).toContain('Linear Board');
      fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'folio' } });
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });

    it('falls back to the first visible recipe when the selected one is filtered out, and returns when it is visible again', async () => {
      renderLib();
      await goLibrary();
      fireEvent.click(screen.getByRole('option', { name: /Linear Board/ }));
      fireEvent.click(within(screen.getByRole('group', { name: 'Page type' })).getByRole('button', { name: /^portfolio$/i }));
      expect(previewTitle()).toBe('Studio Folio');
      expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
      fireEvent.click(within(screen.getByRole('group', { name: 'Page type' })).getByRole('button', { name: 'all' }));
      expect(previewTitle()).toBe('Linear Board');
    });

    it('shows the no-matches state without a list when nothing is visible', async () => {
      renderLib();
      await goLibrary();
      fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'zzz' } });
      expect(screen.getByText('No matches')).toBeTruthy();
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.queryByRole('article')).toBeNull();
    });

    it('shows the empty-library state with the view switch intact', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
      localStorage.setItem(VIEW_KEY, 'library');
      renderLib();
      expect(await screen.findByText('No recipes yet')).toBeTruthy();
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('works with a single recipe', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipes[0]], collections: [], safeToSave: true });
      renderLib();
      await goLibrary();
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(previewTitle()).toBe('Stripe Home');
    });

    it('collapses the collections panel in Library view, can be expanded, and restores it for Gallery', async () => {
      const { container } = renderLib();
      await screen.findByText('Stripe Home');
      const aside = container.querySelector('aside')!;
      expect(aside.className).toContain('w-64');
      fireEvent.click(viewBtn('Library'));
      expect(aside.className).toContain('w-0');
      fireEvent.click(screen.getByRole('button', { name: /expand|collapse|toggle/i }));
      expect(aside.className).toContain('w-64');
      fireEvent.click(viewBtn('Gallery'));
      expect(aside.className).toContain('w-64');
    });

    it('shows the gallery below the lg breakpoint even when Library is remembered', async () => {
      localStorage.setItem(VIEW_KEY, 'library');
      vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
      try {
        renderLib();
        await screen.findByText('Stripe Home');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('opens the Use dialog from the pane for the selected recipe', async () => {
      renderLib();
      await goLibrary();
      fireEvent.click(screen.getByRole('option', { name: /Linear Board/ }));
      fireEvent.click(pane().getByRole('button', { name: 'Use recipe' }));
      expect(screen.getByText('use:b')).toBeTruthy();
    });

    it('opens the existing detail editor from Edit recipe and notifies onOpenRecipe', async () => {
      const onOpenRecipe = vi.fn();
      renderLib({ onOpenRecipe });
      await goLibrary();
      fireEvent.click(menuItem('Edit recipe'));
      expect(screen.getByText('detail:a')).toBeTruthy();
      expect(onOpenRecipe).toHaveBeenCalledWith('a');
      fireEvent.click(screen.getByRole('button', { name: 'mock back' }));
      expect(await screen.findByRole('listbox', { name: 'Recipes' })).toBeTruthy();
    });

    describe('Copy prompt only', () => {
      const writeText = vi.fn();
      beforeEach(() => {
        writeText.mockReset().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      });

      it('copies the compiled prompt when a brief draft exists', async () => {
        draft.loadBriefDraft.mockReturnValue({ brief: { project: 'Acme', pages: 'Home' }, mode: 'adapt' });
        renderLib();
        await goLibrary();
        fireEvent.click(menuItem('Copy prompt only'));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(writeText.mock.calls[0][0]).toContain('Build Home for Acme');
        await waitFor(() => expect(feedback).toHaveBeenCalledWith('Prompt copied. Export the files too so the agent can see the screenshots.'));
      });

      it('opens the Use dialog when there is no usable draft', async () => {
        draft.loadBriefDraft.mockReturnValue({ brief: { project: '', pages: '' }, mode: 'adapt' });
        renderLib();
        await goLibrary();
        fireEvent.click(menuItem('Copy prompt only'));
        expect(screen.getByText('use:a')).toBeTruthy();
        expect(writeText).not.toHaveBeenCalled();
      });
    });

    it('deletes the selected recipe after confirmation and the selection falls back to a remaining one', async () => {
      storage.deleteRecipe.mockResolvedValue(undefined);
      renderLib();
      await goLibrary();
      fireEvent.click(screen.getByRole('option', { name: /Linear Board/ }));
      storage.loadDesignLibrary.mockResolvedValue({ recipes: recipes.filter((r) => r.id !== 'b'), collections: [], safeToSave: true });
      fireEvent.click(menuItem('Delete recipe'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      await waitFor(() => expect(storage.deleteRecipe).toHaveBeenCalledWith('b'));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
      expect(previewTitle()).toBe('Stripe Home');
      expect(feedback).toHaveBeenCalledWith('Deleted "Linear Board"');
    });

    it('deleting the last recipe leaves the empty state instead of a crash', async () => {
      storage.deleteRecipe.mockResolvedValue(undefined);
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipes[0]], collections: [], safeToSave: true });
      renderLib();
      await goLibrary();
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
      fireEvent.click(menuItem('Delete recipe'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      expect(await screen.findByText('No recipes yet')).toBeTruthy();
    });

    it('disables Delete recipe in the pane when the manifest is read-only', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [], safeToSave: false });
      localStorage.setItem(VIEW_KEY, 'library');
      renderLib();
      await screen.findByRole('listbox', { name: 'Recipes' });
      expect((menuItem('Delete recipe') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('orphan recipe folders (SD-10)', () => {
    const rebuildBtn = () => screen.getByRole('button', { name: 'Rebuild index' }) as HTMLButtonElement;

    it('shows no notice when there are no orphans', async () => {
      renderLib();
      await screen.findByText('Stripe Home');
      await waitFor(() => expect(storage.findOrphanRecipes).toHaveBeenCalled());
      expect(screen.queryByText(/not in the library index/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rebuild index' })).toBeNull();
    });

    it('words the notice for one and for several folders', async () => {
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['x'], unreadable: [] });
      renderLib();
      expect(await screen.findByText('Found 1 recipe folder that is not in the library index.')).toBeTruthy();
      cleanup();
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['x', 'y', 'z'], unreadable: ['q'] });
      renderLib();
      expect(await screen.findByText('Found 3 recipe folders that are not in the library index.')).toBeTruthy();
    });

    it('is visible in the empty-library state, next to "No recipes yet"', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['a', 'b'], unreadable: [] });
      renderLib();
      expect(await screen.findByText(/Found 2 recipe folders/)).toBeTruthy();
      expect(screen.getByText('No recipes yet')).toBeTruthy();
      expect(rebuildBtn().disabled).toBe(false);
    });

    it('Rebuild calls the storage function, shows the toast and refreshes; the notice goes away', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['a', 'b'], unreadable: ['c'] });
      storage.rebuildIndexFromDisk.mockResolvedValue({ recovered: 2, unreadable: 1 });
      renderLib();
      await screen.findByText(/Found 2 recipe folders/);
      storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [], safeToSave: true });
      storage.findOrphanRecipes.mockResolvedValue({ orphans: [], unreadable: ['c'] });
      fireEvent.click(rebuildBtn());
      expect(await screen.findByText('Stripe Home')).toBeTruthy();
      expect(storage.rebuildIndexFromDisk).toHaveBeenCalledTimes(1);
      expect(feedback).toHaveBeenCalledWith('Recovered 2 recipes, 1 could not be read');
      expect(storage.loadDesignLibrary).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(screen.queryByText(/not in the library index/)).toBeNull());
    });

    it('uses the singular toast without an unreadable suffix', async () => {
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['a'], unreadable: [] });
      storage.rebuildIndexFromDisk.mockResolvedValue({ recovered: 1, unreadable: 0 });
      renderLib();
      await screen.findByText(/Found 1 recipe folder/);
      fireEvent.click(rebuildBtn());
      await waitFor(() => expect(feedback).toHaveBeenCalledWith('Recovered 1 recipe'));
    });

    it('shows the real error in the alert banner when the rebuild fails', async () => {
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['a'], unreadable: [] });
      storage.rebuildIndexFromDisk.mockRejectedValue(new Error('disk on fire'));
      renderLib();
      await screen.findByText(/Found 1 recipe folder/);
      fireEvent.click(rebuildBtn());
      expect((await screen.findByRole('alert')).textContent).toContain('Could not rebuild the library index: disk on fire');
      expect(feedback).not.toHaveBeenCalled();
      expect(rebuildBtn().disabled).toBe(false);
    });

    it('disables Rebuild with a reason when the manifest is read-only', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: false });
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['a'], unreadable: [] });
      renderLib();
      await screen.findByText(/Found 1 recipe folder/);
      expect(rebuildBtn().disabled).toBe(true);
      expect(rebuildBtn().title).toMatch(/read-only/);
    });

    it('disables Rebuild while it runs', async () => {
      storage.findOrphanRecipes.mockResolvedValue({ orphans: ['a'], unreadable: [] });
      storage.rebuildIndexFromDisk.mockReturnValue(new Promise(() => {}));
      renderLib();
      await screen.findByText(/Found 1 recipe folder/);
      fireEvent.click(rebuildBtn());
      const busy = await screen.findByRole('button', { name: 'Rebuilding…' });
      expect((busy as HTMLButtonElement).disabled).toBe(true);
    });

    it('a throwing scan does not break the page', async () => {
      storage.findOrphanRecipes.mockRejectedValue(new Error('scan exploded'));
      renderLib();
      expect(await screen.findByText('Stripe Home')).toBeTruthy();
      await waitFor(() => expect(storage.findOrphanRecipes).toHaveBeenCalled());
      expect(screen.queryByText(/not in the library index/)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('responsive layout (SD-08)', () => {
    const VIEW_KEY = 'kollektiv.designLibraryView';
    /** Matches by query so md (768) and lg (1024) can differ. */
    const stubWidth = (px: number) => vi.stubGlobal('matchMedia', vi.fn((q: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
      return { matches: px >= min, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }));
    afterEach(() => vi.unstubAllGlobals());
    const asideOf = (c: HTMLElement) => c.querySelector('aside')!;
    const group = (name: string) => screen.getByRole('group', { name });

    it('starts with the collections panel collapsed below md and lets it open', async () => {
      stubWidth(390);
      const { container } = renderLib();
      await screen.findByText('Stripe Home');
      expect(asideOf(container).className).toContain('w-0');
      expect(asideOf(container).className).toContain('absolute');
      fireEvent.click(screen.getByRole('button', { name: 'Expand Panel' }));
      expect(asideOf(container).className).toContain('w-64');
    });

    it('closes the overlay panel after picking a collection on a phone', async () => {
      stubWidth(390);
      storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [{ id: 'c1', name: 'Marketing', order: 0 }], safeToSave: true });
      const { container } = renderLib();
      await screen.findByText('Stripe Home');
      fireEvent.click(screen.getByRole('button', { name: 'Expand Panel' }));
      fireEvent.click(screen.getByRole('button', { name: /^Marketing/ }));
      expect(asideOf(container).className).toContain('w-0');
    });

    it('keeps the panel open at md and wider, and open after picking a collection there', async () => {
      stubWidth(768);
      storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: [{ id: 'c1', name: 'Marketing', order: 0 }], safeToSave: true });
      const { container } = renderLib();
      await screen.findByText('Stripe Home');
      expect(asideOf(container).className).toContain('w-64');
      expect(asideOf(container).className).toContain('md:relative');
      fireEvent.click(screen.getByRole('button', { name: /^Marketing/ }));
      expect(asideOf(container).className).toContain('w-64');
    });

    it('Library view is compact: no description or eyebrow, tiles inline, toolbar not sticky, panes at least 24rem', async () => {
      stubWidth(1440);
      localStorage.setItem(VIEW_KEY, 'library');
      const { container } = renderLib();
      await screen.findByRole('listbox', { name: 'Recipes' });
      expect(screen.queryByText(/Reference designs you can turn into a prompt/)).toBeNull();
      expect(screen.queryByText('Vault')).toBeNull();
      expect(screen.getByText('Recipes', { selector: 'dt' }).parentElement!.className).toContain('flex-row-reverse');
      expect(screen.getByText('Recipes', { selector: 'dt' }).closest('.paper-card')!.className).not.toContain('min-w-28');
      expect(group('Tags').closest('.border-b')!.className).not.toContain('sticky');
      expect(screen.getByRole('listbox').closest('.min-h-\\[24rem\\]')).toBeTruthy();
      expect(container.querySelector('h1')!.className).toContain('text-3xl');
    });

    it('Gallery view keeps the full header and the sticky toolbar', async () => {
      stubWidth(1440);
      renderLib();
      await screen.findByText('Stripe Home');
      expect(screen.getByText(/Reference designs you can turn into a prompt/)).toBeTruthy();
      expect(screen.getByText('Vault')).toBeTruthy();
      expect(group('Tags').closest('.border-b')!.className).toContain('sticky');
    });

    it('page-type tabs, view and sort pills and the tag row scroll sideways instead of wrapping', async () => {
      stubWidth(1440);
      storage.loadDesignLibrary.mockResolvedValue({
        recipes: [mk({ id: 'm', title: 'Many', createdAt: 9, tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'] })],
        collections: [],
        safeToSave: true,
      });
      renderLib();
      await screen.findByText('Many');
      expect(group('Page type').className).toContain('overflow-x-auto');
      expect(group('Page type').className).toContain('lg:flex-1');
      const pills = group('Sort').parentElement!;
      expect(pills.className).toContain('shrink-0');
      expect(pills.className).toContain('overflow-x-auto');
      expect(within(group('Sort')).getByRole('button', { name: 'Recent' }).className).toContain('shrink-0');
      expect(group('Tags').className).toContain('overflow-x-auto');
      expect(group('Tags').className).not.toContain('flex-wrap');
      fireEvent.click(screen.getByRole('button', { name: /more$/ }));
      expect(group('Tags').className).toContain('flex-wrap');
      expect(group('Tags').className).not.toContain('overflow-x-auto');
    });

    it('stacks the header and shows one grid column on a phone', async () => {
      stubWidth(390);
      const { container } = renderLib();
      await screen.findByText('Stripe Home');
      const dl = container.querySelector('dl')!;
      expect(dl.className).toContain('grid-cols-3');
      expect(dl.parentElement!.className).toContain('flex-col');
      const tile = screen.getByText('Recipes', { selector: 'dt' }).closest('.paper-card')!;
      expect(tile.className).toContain('md:min-w-28');
      expect(tile.className).not.toMatch(/(^|\s)min-w-28/);
      const grid = container.querySelector('ul.grid')!;
      expect(grid.className).toContain('grid-cols-1');
    });

    it('asks to delete with a question heading and plain Delete / Cancel labels', async () => {
      stubWidth(1440);
      renderLib();
      await screen.findByText('Stripe Home');
      fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);
      expect(screen.getByRole('heading', { level: 3, name: 'Delete this recipe?' })).toBeTruthy();
      expect(screen.getByLabelText('Confirm action').textContent).toBe('Delete');
      expect(screen.getByLabelText('Cancel action').textContent).toBe('Cancel');
    });
  });
});
