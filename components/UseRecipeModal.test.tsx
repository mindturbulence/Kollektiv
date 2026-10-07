import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import UseRecipeModal from './UseRecipeModal';
import type { DesignRecipe } from '../types';

vi.mock('../services/audioService', () => ({
  audioService: { playClick: vi.fn(), playModalOpen: vi.fn(), playModalClose: vi.fn() },
}));

const files = vi.hoisted(() => ({
  readFile: vi.fn(),
  getFileAsBlob: vi.fn(),
  createZipAndDownload: vi.fn(),
}));
vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: { readFile: files.readFile, getFileAsBlob: files.getFileAsBlob },
  createZipAndDownload: files.createZipAndDownload,
}));

const storage = vi.hoisted(() => ({ loadDesignLibrary: vi.fn() }));
vi.mock('../utils/designLibraryStorage', () => storage);

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return { ...actual, createPortal: (content: React.ReactNode) => content };
});

const recipe: DesignRecipe = {
  id: 'r1', createdAt: 1, updatedAt: 1, title: 'Stripe Home', pageType: 'landing', tags: [], overview: '',
  refs: ['design-library/r1/refs/1.png', 'design-library/r1/refs/2.jpg'],
};

class FakeDir {
  dirs = new Map<string, FakeDir>();
  files = new Map<string, string | Blob>();
  constructor(public name = 'my-repo') {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw new DOMException('missing', 'NotFoundError');
      d = new FakeDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw new DOMException('missing', 'NotFoundError');
      this.files.set(name, '');
    }
    return { createWritable: async () => ({ write: async (c: string | Blob) => { this.files.set(name, c); }, close: async () => {} }) };
  }
  async removeEntry(name: string) {
    if (!this.dirs.delete(name) && !this.files.delete(name)) throw new DOMException('missing', 'NotFoundError');
  }
  async *keys() {
    yield* this.dirs.keys();
    yield* this.files.keys();
  }
}

const onClose = vi.fn();
const feedback = vi.fn();
const DRAFT_KEY = 'kollektiv.designBriefDraft';
const clipboard = { writeText: vi.fn() };

const renderModal = () => render(<UseRecipeModal recipeId="r1" recipeTitle="Stripe Home" onClose={onClose} showGlobalFeedback={feedback} />);
const type = (name: RegExp, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const fillRequired = () => { type(/^project/i, 'Acme'); type(/^pages/i, 'home + pricing'); };
const click = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const stubPicker = (fn?: () => Promise<unknown>) => {
  window.showDirectoryPicker = vi.fn(fn ?? (async () => new FakeDir())) as unknown as Window['showDirectoryPicker'];
};

describe('UseRecipeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipe], collections: [], safeToSave: true });
    files.readFile.mockResolvedValue('---\nname: X\n---\n# Overview');
    files.getFileAsBlob.mockImplementation(async (p: string) => new Blob([p], { type: p.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
    clipboard.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    stubPicker();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.showDirectoryPicker;
  });

  it('blocks every action until project and pages are filled', async () => {
    renderModal();
    click(/export files/i);
    click(/copy prompt only/i);
    expect(await screen.findAllByText(/is required/i)).toHaveLength(2);
    expect(window.showDirectoryPicker).not.toHaveBeenCalled();
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('restores the saved draft and saves every change', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ project: 'Old', pages: 'About', stack: 'Astro', mode: 'reproduce' }));
    renderModal();
    expect((screen.getByLabelText(/^project/i) as HTMLInputElement).value).toBe('Old');
    expect((screen.getByLabelText(/^stack/i) as HTMLTextAreaElement).value).toBe('Astro');
    expect((screen.getByLabelText(/reproduce/i) as HTMLInputElement).checked).toBe(true);
    type(/^project/i, 'New');
    fireEvent.click(screen.getByLabelText(/adapt/i));
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toMatchObject({ project: 'New', pages: 'About', mode: 'adapt' });
  });

  it('works with storage that throws and with invalid JSON in storage', async () => {
    localStorage.setItem(DRAFT_KEY, '{nope');
    renderModal();
    expect((screen.getByLabelText(/^project/i) as HTMLInputElement).value).toBe('');
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderModal();
    fillRequired();
    click(/copy prompt only/i);
    await screen.findByText(/prompt copied/i);
    expect(clipboard.writeText).toHaveBeenCalledOnce();
  });

  it('adapt and reproduce reach the copied prompt', async () => {
    renderModal();
    fillRequired();
    click(/copy prompt only/i);
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(1));
    expect(clipboard.writeText.mock.calls[0][0]).toContain('Use OUR brand, copy and imagery');
    expect(clipboard.writeText.mock.calls[0][0]).toContain('Build home + pricing for Acme');
    fireEvent.click(screen.getByLabelText(/reproduce/i));
    click(/copy prompt only/i);
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(2));
    expect(clipboard.writeText.mock.calls[1][0]).toContain('Reproduce the screenshots as closely as possible');
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it('exports the bundle to the picked folder and copies the prompt', async () => {
    const root = new FakeDir('my-repo');
    stubPicker(async () => root);
    renderModal();
    fillRequired();
    click(/export files/i);
    await screen.findByText(/wrote design\/ to "my-repo"\. prompt copied/i);
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({ mode: 'readwrite', id: 'kollektiv-design-export' });
    expect(files.readFile).toHaveBeenCalledWith('design-library/r1/DESIGN.md');
    const design = root.dirs.get('design')!;
    expect([...design.files.keys()].sort()).toEqual(['BRIEF.md', 'DESIGN.md', 'PROMPT.md']);
    expect([...design.dirs.get('refs')!.files.keys()]).toEqual(['1.png', '2.jpg']);
    expect(design.files.get('PROMPT.md')).toBe(clipboard.writeText.mock.calls[0][0]);
    expect(feedback).toHaveBeenCalledWith('Design bundle exported');
  });

  it('falls back to "the chosen folder" when the picked handle has an empty name', async () => {
    stubPicker(async () => new FakeDir(''));
    renderModal();
    fillRequired();
    click(/export files/i);
    expect((await screen.findByRole('status')).textContent).toBe('Wrote design/ to the chosen folder. Prompt copied.');
  });

  it('names the chosen folder in the overwrite question even when the handle name is empty', async () => {
    const root = new FakeDir('');
    (await root.getDirectoryHandle('design', { create: true })).files.set('DESIGN.md', 'old');
    stubPicker(async () => root);
    renderModal();
    fillRequired();
    click(/export files/i);
    await screen.findByText('Overwrite design/ in the chosen folder?');
    expect(screen.getByLabelText('Confirm action').textContent).toBe('Overwrite');
    expect(screen.getByLabelText('Cancel action').textContent).toBe('Cancel');
  });

  it('keeps Close in a footer outside the scrolling region, also once a notice is showing', async () => {
    renderModal();
    fillRequired();
    click(/copy prompt only/i);
    await screen.findByText(/prompt copied/i);
    const footerClose = screen.getAllByRole('button', { name: 'Close' }).find((b) => b.textContent === 'Close')!;
    expect(footerClose.closest('.overflow-y-auto')).toBeNull();
    expect(footerClose.closest('fieldset')).toBeNull();
    const scroller = screen.getByText(/prompt copied/i).closest('.overflow-y-auto')!;
    expect(scroller).toBeTruthy();
    expect(scroller.contains(screen.getByRole('textbox', { name: 'Prompt preview' }))).toBe(true);
    expect(scroller.contains(footerClose)).toBe(false);
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('caps the prompt preview height on narrow screens so the primary action stays near it', () => {
    renderModal();
    const preview = screen.getByRole('textbox', { name: 'Prompt preview' });
    expect(preview.className).toContain('max-h-36');
    expect(preview.className).toContain('md:max-h-none');
  });

  it('asks before overwriting an existing design/ and replaces it on confirm', async () => {
    const root = new FakeDir('my-repo');
    const old = await root.getDirectoryHandle('design', { create: true });
    old.files.set('DESIGN.md', 'old');
    old.files.set('mine.txt', 'keep');
    stubPicker(async () => root);
    renderModal();
    fillRequired();
    click(/export files/i);
    await screen.findByText(/overwrite design\/ in my-repo\?/i);
    expect(old.files.get('DESIGN.md')).toBe('old');
    click(/confirm action/i);
    await screen.findByText(/prompt copied/i);
    expect(old.files.get('DESIGN.md')).toContain('# Overview');
    expect(old.files.get('mine.txt')).toBe('keep');
  });

  it('cancelling the overwrite writes nothing and shows no error', async () => {
    const root = new FakeDir('my-repo');
    const old = await root.getDirectoryHandle('design', { create: true });
    old.files.set('DESIGN.md', 'old');
    stubPicker(async () => root);
    renderModal();
    fillRequired();
    click(/export files/i);
    await screen.findByText(/overwrite design\/ in my-repo/i);
    click(/cancel action/i);
    await waitFor(() => expect(screen.queryByText(/overwrite design\/ in my-repo/i)).toBeNull());
    expect(old.files.get('DESIGN.md')).toBe('old');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /export files/i }).hasAttribute('disabled')).toBe(false);
  });

  it('a cancelled picker is silent', async () => {
    stubPicker(async () => { throw new DOMException('cancelled', 'AbortError'); });
    renderModal();
    fillRequired();
    click(/export files/i);
    await waitFor(() => expect(window.showDirectoryPicker).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /export files/i }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it('names the missing file when DESIGN.md or a reference cannot be read', async () => {
    files.readFile.mockResolvedValue(null);
    renderModal();
    fillRequired();
    click(/export files/i);
    expect((await screen.findByRole('alert')).textContent).toContain('design-library/r1/DESIGN.md');
    files.readFile.mockResolvedValue('# ok');
    files.getFileAsBlob.mockResolvedValue(null);
    click(/export files/i);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('design-library/r1/refs/1.png'));
  });

  it('reports a permission error from writing without closing', async () => {
    const root = new FakeDir('locked');
    root.getDirectoryHandle = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    stubPicker(async () => root);
    renderModal();
    fillRequired();
    click(/export files/i);
    expect((await screen.findByRole('alert')).textContent).toMatch(/permission denied writing to the chosen folder/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to a ZIP with the unzip prompt when the picker is missing', async () => {
    delete window.showDirectoryPicker;
    renderModal();
    expect(screen.getByText(/unzip it into your repo root/i)).toBeTruthy();
    fillRequired();
    click(/download zip/i);
    await screen.findByText(/downloaded design\.zip/i);
    const [zipFiles, zipName] = files.createZipAndDownload.mock.calls[0];
    expect(zipName).toBe('design.zip');
    expect(zipFiles.map((f: { name: string }) => f.name)).toEqual([
      'design/DESIGN.md', 'design/BRIEF.md', 'design/PROMPT.md', 'design/refs/1.png', 'design/refs/2.jpg',
    ]);
    expect(clipboard.writeText.mock.calls[0][0].startsWith('First unzip design.zip into the repo root.')).toBe(true);
  });

  it('shows the prompt in a read-only textarea when the clipboard is blocked', async () => {
    clipboard.writeText.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    renderModal();
    fillRequired();
    click(/copy prompt only/i);
    const box = await screen.findByLabelText('Prompt') as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toContain('Build home + pricing for Acme');
    clipboard.writeText.mockResolvedValue(undefined);
    click(/^copy$/i);
    await screen.findByText(/^prompt copied\.$/i);
    expect(screen.queryByLabelText('Prompt')).toBeNull();
  });

  it('keeps the screenshot warning next to the copy-only button', () => {
    renderModal();
    expect(screen.getByText(/copy prompt only skips the files, so the agent will not see the screenshots/i)).toBeTruthy();
  });

  describe('For agents card', () => {
    const AGENTS = ['Claude Code', 'Codex', 'Gemini CLI', 'Cursor', 'Other'];
    const AGENT_KEY = 'kollektiv.designAgent';
    const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
    const preview = () => (screen.getByLabelText('Prompt preview') as HTMLTextAreaElement);

    it('defaults to Claude Code and selects one agent at a time', () => {
      renderModal();
      expect(AGENTS.map(pressed)).toEqual(['true', 'false', 'false', 'false', 'false']);
      fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));
      expect(AGENTS.map(pressed)).toEqual(['false', 'false', 'false', 'true', 'false']);
    });

    it('changes only the usage hint per agent', () => {
      renderModal();
      expect(screen.getByText(/start Claude Code, then paste the prompt/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Codex' }));
      expect(screen.getByText(/start Codex, then paste the prompt/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Gemini CLI' }));
      expect(screen.getByText(/start Gemini CLI, then paste the prompt/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));
      expect(screen.getByText(/open the agent chat, then paste the prompt/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Other' }));
      expect(screen.getByText(/any coding agent that can read files in your project/i)).toBeTruthy();
    });

    it('remembers the agent and restores it on the next open', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Gemini CLI' }));
      expect(localStorage.getItem(AGENT_KEY)).toBe('gemini-cli');
      cleanup();
      renderModal();
      expect(pressed('Gemini CLI')).toBe('true');
    });

    it('ignores an invalid remembered agent and survives blocked storage', () => {
      localStorage.setItem(AGENT_KEY, 'emacs');
      renderModal();
      expect(pressed('Claude Code')).toBe('true');
      cleanup();
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Codex' }));
      expect(pressed('Codex')).toBe('true');
    });

    it('shows a placeholder until project and pages are filled, then the live prompt', () => {
      renderModal();
      expect(preview().value).toBe('');
      expect(preview().placeholder).toMatch(/fill in project and pages to see the prompt/i);
      type(/^project/i, 'Acme');
      expect(preview().value).toBe('');
      type(/^pages/i, 'home + pricing');
      expect(preview().value).toContain('Build home + pricing for Acme');
      expect(preview().value).toContain('Use OUR brand, copy and imagery');
      fireEvent.click(screen.getByLabelText(/reproduce/i));
      expect(preview().value).toContain('Reproduce the screenshots as closely as possible');
      type(/^pages/i, 'about');
      expect(preview().value).toContain('Build about for Acme');
    });

    it('previews the ZIP prompt when the folder picker is missing', () => {
      delete window.showDirectoryPicker;
      renderModal();
      fillRequired();
      expect(preview().value.startsWith('First unzip design.zip into the repo root.')).toBe(true);
    });

    it('copies and exports a byte-identical prompt whichever agent is picked', async () => {
      renderModal();
      fillRequired();
      const seen: string[] = [];
      for (const name of AGENTS) {
        fireEvent.click(screen.getByRole('button', { name }));
        const before = clipboard.writeText.mock.calls.length;
        click(/copy prompt only/i);
        await waitFor(() => expect(clipboard.writeText.mock.calls.length).toBe(before + 1));
        click(/export files/i);
        await waitFor(() => expect(clipboard.writeText.mock.calls.length).toBe(before + 2));
        await waitFor(() => expect(screen.getByRole('button', { name: /export files/i }).hasAttribute('disabled')).toBe(false));
        seen.push(clipboard.writeText.mock.calls[before][0], clipboard.writeText.mock.calls[before + 1][0]);
        expect(preview().value).toBe(seen[seen.length - 1]);
      }
      expect(seen).toHaveLength(10);
      expect(new Set(seen).size).toBe(1);
    });
  });
});
