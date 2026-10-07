import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DesignRecipeAddModal from './DesignRecipeAddModal';
import type { DesignCollection } from '../types';

const storage = vi.hoisted(() => ({ createRecipe: vi.fn() }));
vi.mock('../utils/designLibraryStorage', () => storage);

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return { ...actual, createPortal: (content: React.ReactNode) => content };
});

const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });

const collections: DesignCollection[] = [
  { id: 'c1', name: 'Landing', order: 0 },
  { id: 'c2', name: 'Hero', parentId: 'c1', order: 0 },
  { id: 'c3', name: 'Docs', order: 1 },
];

const setup = (defaultCollectionId?: string) => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<DesignRecipeAddModal isOpen onClose={onClose} onCreated={onCreated} collections={collections} defaultCollectionId={defaultCollectionId} />);
  return { onClose, onCreated };
};

const addViaInput = async (files: File[]) => {
  fireEvent.change(screen.getByTestId('ref-file-input'), { target: { files } });
  await waitFor(() => expect(screen.getAllByRole('img').length + screen.queryAllByRole('alert').length).toBeGreaterThan(0));
};

describe('DesignRecipeAddModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => cleanup());

  it('requires a title and at least one image', async () => {
    setup();
    const submit = screen.getByRole('button', { name: 'Add recipe' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('e.g. Stripe landing'), { target: { value: 'My recipe' } });
    expect(submit.hasAttribute('disabled')).toBe(true);
    await addViaInput([png()]);
    expect(submit.hasAttribute('disabled')).toBe(false);
  });

  it('reports non-images per file and keeps the valid ones', async () => {
    setup();
    await addViaInput([new File(['t'], 'notes.txt', { type: 'text/plain' }), png('ok.png')]);
    expect(screen.getByRole('alert').textContent).toContain('notes.txt');
    expect(screen.getAllByRole('img').length).toBe(1);
  });

  it('caps references at 6', async () => {
    setup();
    await addViaInput(Array.from({ length: 8 }, (_, i) => png(`${i}.png`)));
    expect(screen.getAllByRole('img').length).toBe(6);
    expect(screen.getByRole('alert').textContent).toContain('Only 6');
  });

  it('takes images from a paste event', async () => {
    setup();
    const file = png('pasted.png');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] } });
    window.dispatchEvent(event);
    await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
    expect(event.defaultPrevented).toBe(true);
  });

  it('submits parsed fields, then closes and notifies', async () => {
    storage.createRecipe.mockResolvedValue({});
    const { onClose, onCreated } = setup();
    fireEvent.change(screen.getByPlaceholderText('e.g. Stripe landing'), { target: { value: '  My recipe ' } });
    fireEvent.change(screen.getByPlaceholderText('saas, dark, minimal'), { target: { value: 'saas, Dark, SAAS, ' } });
    await addViaInput([png()]);
    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const arg = storage.createRecipe.mock.calls[0][0];
    expect(arg).toMatchObject({ title: 'My recipe', pageType: 'landing', tags: ['saas', 'Dark'], sourceUrl: undefined });
    expect(arg.refs).toHaveLength(1);
    expect(arg.spec.frontMatter).toEqual({ name: 'My recipe' });
    expect(onClose).toHaveBeenCalled();
  });

  it('offers Unsorted then the collections tree indented by depth, defaulting to Unsorted', () => {
    setup();
    const select = screen.getByLabelText('Collection') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => `${o.value}|${o.textContent}`)).toEqual([
      '|Unsorted',
      'c1|Landing',
      'c2|   Hero',
      'c3|Docs',
    ]);
    expect(select.value).toBe('');
  });

  it('pre-selects the current collection and submits the chosen one', async () => {
    storage.createRecipe.mockResolvedValue({});
    const { onCreated } = setup('c2');
    const select = screen.getByLabelText('Collection') as HTMLSelectElement;
    expect(select.value).toBe('c2');
    fireEvent.change(select, { target: { value: 'c3' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Stripe landing'), { target: { value: 'R' } });
    await addViaInput([png()]);
    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(storage.createRecipe.mock.calls[0][0].collectionId).toBe('c3');
  });

  it('submits no collection when Unsorted is chosen', async () => {
    storage.createRecipe.mockResolvedValue({});
    const { onCreated } = setup('c1');
    fireEvent.change(screen.getByLabelText('Collection'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Stripe landing'), { target: { value: 'R' } });
    await addViaInput([png()]);
    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(storage.createRecipe.mock.calls[0][0].collectionId).toBeUndefined();
  });

  it('shows the error and stays open when saving fails', async () => {
    storage.createRecipe.mockRejectedValue(new Error('manifest blocked'));
    const { onClose, onCreated } = setup();
    fireEvent.change(screen.getByPlaceholderText('e.g. Stripe landing'), { target: { value: 'R' } });
    await addViaInput([png()]);
    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
    expect((await screen.findByText('manifest blocked'))).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add recipe' }).hasAttribute('disabled')).toBe(false);
  });
});
