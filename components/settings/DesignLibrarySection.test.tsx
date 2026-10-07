import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DesignLibrarySection from './DesignLibrarySection';
import type { DesignCollection, DesignRecipe } from '../../types';

vi.mock('../../services/audioService', () => ({
  audioService: { playClick: vi.fn(), playModalOpen: vi.fn(), playModalClose: vi.fn() },
}));

const storage = vi.hoisted(() => ({
  loadDesignLibrary: vi.fn(),
  addCollection: vi.fn(),
  renameCollection: vi.fn(),
  moveCollection: vi.fn(),
  deleteCollection: vi.fn(),
  saveCollectionsOrder: vi.fn(),
}));
vi.mock('../../utils/designLibraryStorage', () => storage);

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return { ...actual, createPortal: (content: React.ReactNode) => content };
});

const rec = (id: string, collectionId?: string): DesignRecipe => ({
  id, createdAt: 1, updatedAt: 1, title: id, pageType: 'app', tags: [], refs: [], overview: '', ...(collectionId ? { collectionId } : {}),
});

// Landing (2 recipes, 1 sub-collection) > Heroes (1 recipe) ; Docs (empty)
const collections: DesignCollection[] = [
  { id: 'c1', name: 'Landing', order: 0 },
  { id: 'c2', name: 'Heroes', parentId: 'c1', order: 0 },
  { id: 'c3', name: 'Docs', order: 1 },
];
const recipes = [rec('r1', 'c1'), rec('r2', 'c1'), rec('r3', 'c2')];

const deleteButtons = () => screen.getAllByTitle('Purge Empty or Filled Folder');

describe('DesignLibrarySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.loadDesignLibrary.mockResolvedValue({ recipes, collections, safeToSave: true });
  });
  afterEach(() => cleanup());

  it('lists the collections as a nested tree', async () => {
    render(<DesignLibrarySection />);
    expect(await screen.findByText('Landing')).toBeTruthy();
    expect(screen.getByText('Heroes')).toBeTruthy();
    expect(screen.getByText('Docs')).toBeTruthy();
    expect(screen.getByText('Design Collections')).toBeTruthy();
  });

  it('shows the empty registry on first boot', async () => {
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
    render(<DesignLibrarySection />);
    expect(await screen.findByText('Registry Empty')).toBeTruthy();
  });

  it('delete of a top-level collection says its recipes and sub-collections move to the top level, with counts', async () => {
    render(<DesignLibrarySection />);
    await screen.findByText('Landing');
    fireEvent.click(deleteButtons()[0]);
    expect(
      screen.getByText('Delete collection "Landing"? Its 1 sub-collection and 2 recipes will move to the top level (recipes become Unsorted). Nothing else is deleted.'),
    ).toBeTruthy();
  });

  it('delete of a nested collection names the parent it moves to', async () => {
    render(<DesignLibrarySection />);
    await screen.findByText('Heroes');
    fireEvent.click(deleteButtons()[1]);
    expect(screen.getByText('Delete collection "Heroes"? Its 1 recipe will move to "Landing". Nothing else is deleted.')).toBeTruthy();
  });

  it('delete of an empty collection says so', async () => {
    render(<DesignLibrarySection />);
    await screen.findByText('Docs');
    fireEvent.click(deleteButtons()[2]);
    expect(screen.getByText('Delete the empty collection "Docs"?')).toBeTruthy();
  });

  it('abort deletes nothing; execute deletes by id and reloads the list', async () => {
    storage.deleteCollection.mockResolvedValue(undefined);
    render(<DesignLibrarySection />);
    await screen.findByText('Docs');
    fireEvent.click(deleteButtons()[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(storage.deleteCollection).not.toHaveBeenCalled();

    fireEvent.click(deleteButtons()[2]);
    storage.loadDesignLibrary.mockResolvedValue({ recipes, collections: collections.filter((c) => c.id !== 'c3'), safeToSave: true });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(storage.deleteCollection).toHaveBeenCalledWith('c3'));
    await waitFor(() => expect(screen.queryByText('Docs')).toBeNull());
  });

  it('shows a failed delete (e.g. blocked manifest or name clash) in a visible alert', async () => {
    storage.deleteCollection.mockRejectedValue(new Error('Cannot delete "Landing": rename first'));
    render(<DesignLibrarySection />);
    await screen.findByText('Landing');
    fireEvent.click(deleteButtons()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Cannot delete "Landing": rename first');
  });

  it('creates a collection through the storage function and refreshes', async () => {
    storage.addCollection.mockResolvedValue({ id: 'c4', name: 'Shops', order: 2 });
    render(<DesignLibrarySection />);
    await screen.findByText('Landing');
    fireEvent.click(screen.getByTitle('New Folder'));
    fireEvent.change(screen.getAllByRole('textbox').at(-1)!, { target: { value: 'Shops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(storage.addCollection).toHaveBeenCalledWith('Shops', undefined));
    await waitFor(() => expect(storage.loadDesignLibrary).toHaveBeenCalledTimes(2));
  });

  it('keeps the add dialog open and shows the error for a duplicate name', async () => {
    storage.addCollection.mockRejectedValue(new Error('A collection named "Landing" already exists at the top level.'));
    render(<DesignLibrarySection />);
    await screen.findByText('Landing');
    fireEvent.click(screen.getByTitle('New Folder'));
    fireEvent.change(screen.getAllByRole('textbox').at(-1)!, { target: { value: 'landing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('already exists');
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  it('shows a rejected re-parent (cycle) and restores the list from storage', async () => {
    storage.moveCollection.mockRejectedValue(new Error('Cannot move "Landing" into itself or one of its own sub-collections.'));
    render(<DesignLibrarySection />);
    await screen.findByText('Landing');
    fireEvent.change(screen.getAllByTitle('Move folder to another placement in tree')[0], { target: { value: 'c3' } });
    expect((await screen.findByRole('alert')).textContent).toContain('into itself');
    await waitFor(() => expect(storage.loadDesignLibrary).toHaveBeenCalledTimes(2));
  });
});
