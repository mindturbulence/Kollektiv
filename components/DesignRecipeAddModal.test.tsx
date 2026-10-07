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

  describe('Import from site', () => {
    const PNG_B64 = btoa('\x89PNG fake');
    const fetchMock = vi.fn();
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    const respond = (body: unknown) => fetchMock.mockResolvedValueOnce({ json: async () => body });
    const success = (finalUrl = 'https://www.example.com/') =>
      respond({ ok: true, finalUrl, title: 'Example', width: 1440, height: 900, imageBase64: PNG_B64 });
    const urlInput = () => screen.getByLabelText('Import from site URL') as HTMLInputElement;
    const captureBtn = () => screen.getByRole('button', { name: /Captur/ });
    const sourceInput = () => screen.getByPlaceholderText('https://') as HTMLInputElement;
    const capture = (url = 'https://example.com') => {
      fireEvent.change(urlInput(), { target: { value: url } });
      fireEvent.click(captureBtn());
    };

    it('posts the URL as JSON, adds the PNG as a reference and fills an empty source URL', async () => {
      success();
      setup();
      capture('https://example.com');
      await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/capture-site');
      expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com' }) });
      expect(screen.getByRole('img').getAttribute('alt')).toBe('www.example.com.png');
      expect(sourceInput().value).toBe('https://www.example.com/');
      expect(urlInput().value).toBe('');
    });

    it('submits the captured PNG with the recipe', async () => {
      success();
      storage.createRecipe.mockResolvedValue({});
      const { onCreated } = setup();
      fireEvent.change(screen.getByPlaceholderText('e.g. Stripe landing'), { target: { value: 'R' } });
      capture();
      await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
      fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      const arg = storage.createRecipe.mock.calls[0][0];
      expect(arg.sourceUrl).toBe('https://www.example.com/');
      expect(arg.refs[0].blob.type).toBe('image/png');
      expect(arg.refs[0].blob.size).toBe(atob(PNG_B64).length);
    });

    it('never overwrites a source URL the user typed', async () => {
      success();
      setup();
      fireEvent.change(sourceInput(), { target: { value: 'https://mine.example/' } });
      capture();
      await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
      expect(sourceInput().value).toBe('https://mine.example/');
    });

    it('keeps a source URL typed while the capture was running', async () => {
      let resolve: (v: unknown) => void = () => undefined;
      fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
      setup();
      capture();
      fireEvent.change(sourceInput(), { target: { value: 'https://typed-meanwhile.example/' } });
      resolve({ json: async () => ({ ok: true, finalUrl: 'https://www.example.com/', title: '', width: 1, height: 1, imageBase64: PNG_B64 }) });
      await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
      expect(sourceInput().value).toBe('https://typed-meanwhile.example/');
    });

    it('disables the row while capturing and shows progress', async () => {
      let resolve: (v: unknown) => void = () => undefined;
      fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
      setup();
      expect(captureBtn().hasAttribute('disabled')).toBe(true); // empty URL
      capture();
      expect(captureBtn().textContent).toContain('Capturing…');
      expect(captureBtn().hasAttribute('disabled')).toBe(true);
      expect(urlInput().disabled).toBe(true);
      resolve({ json: async () => ({ ok: false, code: 'timeout', error: 'x' }) });
      await waitFor(() => expect(captureBtn().textContent).toBe('Capture'));
      expect(urlInput().disabled).toBe(false);
    });

    it('captures on Enter instead of submitting the recipe form', async () => {
      success();
      storage.createRecipe.mockResolvedValue({});
      setup();
      fireEvent.change(urlInput(), { target: { value: 'https://example.com' } });
      fireEvent.keyDown(urlInput(), { key: 'Enter' });
      await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
      expect(storage.createRecipe).not.toHaveBeenCalled();
    });

    it.each([
      ['timeout', 'took too long'],
      ['rate_limited', 'Too many captures'],
      ['busy', 'Another capture'],
      ['too_large', 'over 8 MB'],
      ['unreachable', 'could not be loaded'],
      ['forbidden_origin', 'refused by the server'],
      ['capture_failed', 'capture failed'],
    ])('shows a clear message for %s', async (code, text) => {
      respond({ ok: false, code, error: 'server detail' });
      setup();
      capture();
      expect((await screen.findByRole('alert')).textContent).toContain(text);
      expect(screen.queryAllByRole('img')).toHaveLength(0);
    });

    it.each([
      ['capture_unavailable', 'No Chrome, Chromium or Edge could be started on the server. Install Microsoft Edge or Google Chrome.'],
      ['blocked_host', 'Local and private network hosts are not allowed.'],
      ['invalid_url', 'Only http:// and https:// URLs can be captured.'],
    ])('shows the server detail for %s', async (code, error) => {
      respond({ ok: false, code, error });
      setup();
      capture();
      expect((await screen.findByRole('alert')).textContent).toBe(error);
    });

    it('handles a server that is down or answers without a code', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      setup();
      capture();
      expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the Kollektiv server');
      respond({ error: 'Cross-origin request blocked' });
      capture();
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The capture failed.'));
    });

    it('respects the cap of 6 references', async () => {
      setup();
      await addViaInput(Array.from({ length: 6 }, (_, i) => png(`${i}.png`)));
      fireEvent.change(urlInput(), { target: { value: 'https://example.com' } });
      expect(captureBtn().hasAttribute('disabled')).toBe(true);
      fireEvent.keyDown(urlInput(), { key: 'Enter' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports the cap when it filled up during the capture', async () => {
      let resolve: (v: unknown) => void = () => undefined;
      fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
      setup();
      capture();
      await addViaInput(Array.from({ length: 6 }, (_, i) => png(`${i}.png`)));
      resolve({ json: async () => ({ ok: true, finalUrl: 'https://www.example.com/', title: '', width: 1, height: 1, imageBase64: PNG_B64 }) });
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Only 6'));
      expect(screen.getAllByRole('img')).toHaveLength(6);
    });
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
