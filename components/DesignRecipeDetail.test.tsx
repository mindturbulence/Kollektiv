import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DesignRecipeDetail from './DesignRecipeDetail';
import { DESIGN_HEADINGS, serializeDesignSpec, type DesignSpec } from '../utils/designSpec';
import type { DesignRecipe } from '../types';
import type { ExtractResult } from '../services/designSpecService';

vi.mock('../services/audioService', () => ({
  audioService: { playClick: vi.fn(), playModalOpen: vi.fn(), playModalClose: vi.fn() },
}));

const storage = vi.hoisted(() => ({
  loadDesignLibrary: vi.fn(),
  loadRecipeSpec: vi.fn(),
  updateRecipe: vi.fn(),
  addRecipeRefs: vi.fn(),
  removeRecipeRef: vi.fn(),
  reorderRecipeRefs: vi.fn(),
}));
vi.mock('../utils/designLibraryStorage', () => storage);

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: { getFileAsBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' })) },
}));

const extraction = vi.hoisted(() => ({ extractDesignSpec: vi.fn(), MAX_EXTRACT_REFS: 4 }));
vi.mock('../services/designSpecService', () => extraction);
vi.mock('../utils/settingsStorage', () => ({ loadLLMSettings: () => ({ activeLLM: 'gemini' }) }));

vi.mock('./UseRecipeModal', () => ({
  default: ({ recipeId, recipeTitle }: { recipeId: string; recipeTitle: string }) => <div>use:{recipeId}:{recipeTitle}</div>,
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return { ...actual, createPortal: (content: React.ReactNode) => content };
});

const A = 'design-library/r1/refs/1.png';
const B = 'design-library/r1/refs/2.png';
const recipe: DesignRecipe = {
  id: 'r1', createdAt: 1, updatedAt: 1, title: 'Stripe Home', pageType: 'landing', tags: ['saas', 'dark'],
  sourceUrl: 'https://stripe.com', refs: [A, B], overview: 'Calm',
};

const frontMatter = {
  name: 'Stripe',
  colors: { background: '#fff', accent: '#635bff' },
  typography: { display: { fontFamily: 'Figtree, system-ui', size: 56 }, body: { size: 16 } },
  rounded: { sm: 4 },
  spacing: [4, 8],
  components: { 'button-primary': { bg: '{colors.accent}', padding: '12px 20px' } },
};
const fullSections = Object.fromEntries(DESIGN_HEADINGS.map((h) => [h, `${h} text`]));
const fullSpec: DesignSpec = { frontMatter, sections: fullSections };

const onBack = vi.fn();
const feedback = vi.fn();
const renderDetail = () => render(<DesignRecipeDetail recipeId="r1" onBack={onBack} showGlobalFeedback={feedback} />);

const sectionBox = (heading: string): HTMLTextAreaElement => {
  const label = screen.getAllByText(heading).map((n) => n.closest('label')).find((l) => l?.querySelector('textarea'));
  return label!.querySelector('textarea')!;
};
const saveBtn = () => screen.getByRole('button', { name: /^save$/i });

describe('DesignRecipeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipe], collections: [], safeToSave: true });
    storage.loadRecipeSpec.mockResolvedValue({ spec: fullSpec, missing: [], truncated: false });
  });
  afterEach(() => cleanup());

  it('loads fields, refs, color rows and one textarea per heading', async () => {
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    expect(screen.getByDisplayValue('saas, dark')).toBeTruthy();
    expect(screen.getByDisplayValue('https://stripe.com')).toBeTruthy();
    expect(screen.getByDisplayValue('accent')).toBeTruthy();
    expect(screen.getByDisplayValue('#635bff')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('img').length).toBe(2));
    for (const h of DESIGN_HEADINGS) expect(sectionBox(h).value).toBe(`${h} text`);
    expect(screen.getByText('All sections filled')).toBeTruthy();
    expect(screen.queryByText('missing')).toBeNull();
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
  });

  it('opens the use-recipe dialog, but only while there are no unsaved edits', async () => {
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    const useBtn = screen.getByRole('button', { name: /^use recipe$/i });
    fireEvent.change(sectionBox('Overview'), { target: { value: 'changed' } });
    expect(useBtn.hasAttribute('disabled')).toBe(true);
    fireEvent.change(sectionBox('Overview'), { target: { value: 'Overview text' } });
    expect(useBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(useBtn);
    expect(screen.getByText('use:r1:Stripe Home')).toBeTruthy();
  });

  it('flags missing/empty sections and shows the truncated banner', async () => {
    const { Signature: _s, Motion: _m, ...rest } = fullSections;
    storage.loadRecipeSpec.mockResolvedValue({
      spec: { frontMatter, sections: { ...rest, Dials: '', Extra: 'kept' } },
      missing: ['heading: Signature'],
      truncated: true,
    });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    expect(screen.getByText('3 sections empty/missing')).toBeTruthy();
    expect(screen.getAllByText('missing').length).toBe(3);
    expect(screen.getByText(/Signature is missing/)).toBeTruthy();
    expect(sectionBox('Extra').value).toBe('kept');
    fireEvent.change(sectionBox('Signature'), { target: { value: 'The glow' } });
    expect(screen.queryByText(/Signature is missing/)).toBeNull();
  });

  it('warns about "(est.)" values and missing front matter keys without blocking Save', async () => {
    storage.loadRecipeSpec.mockResolvedValue({
      spec: { frontMatter: { name: 'x', colors: { a: '#fff (est.)' } }, sections: fullSections },
      missing: [], truncated: false,
    });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    expect(screen.getByText(/\(est\.\)/).textContent).toContain('colors.a');
    expect(screen.getByText(/Missing front matter keys: typography, rounded, spacing, components/)).toBeTruthy();
    fireEvent.change(sectionBox('Overview'), { target: { value: 'x' } });
    expect(saveBtn().hasAttribute('disabled')).toBe(false);
  });

  it('saves an edited section with updateRecipe, keeping nested tokens intact', async () => {
    storage.updateRecipe.mockResolvedValue(recipe);
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    fireEvent.change(sectionBox('Layout'), { target: { value: '  12-column grid  ' } });
    fireEvent.change(screen.getByDisplayValue('Stripe Home'), { target: { value: ' Stripe Landing ' } });
    fireEvent.change(screen.getByDisplayValue('saas, dark'), { target: { value: 'saas, SaaS, light' } });
    fireEvent.change(screen.getByDisplayValue('https://stripe.com'), { target: { value: '' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(storage.updateRecipe).toHaveBeenCalledTimes(1));
    const [id, patch, spec] = storage.updateRecipe.mock.calls[0] as [string, Record<string, unknown>, DesignSpec];
    expect(id).toBe('r1');
    expect(patch).toEqual({ title: 'Stripe Landing', pageType: 'landing', tags: ['saas', 'light'], sourceUrl: undefined });
    expect(spec.frontMatter).toEqual(frontMatter);
    expect(Object.keys(spec.frontMatter)).toEqual(Object.keys(frontMatter));
    expect(spec.sections.Layout).toBe('12-column grid');
    expect(serializeDesignSpec(spec)).toContain('## Layout\n\n12-column grid');
    await waitFor(() => expect(feedback).toHaveBeenCalledWith('Recipe saved'));
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
    expect(screen.getByDisplayValue('Stripe Landing')).toBeTruthy();
  });

  describe('collection select', () => {
    const collections = [
      { id: 'c1', name: 'Landing', order: 0 },
      { id: 'c2', name: 'Hero', parentId: 'c1', order: 0 },
    ];
    const select = () => screen.getByLabelText('Collection') as HTMLSelectElement;

    it('lists Unsorted and the indented tree, with the recipe collection selected and Save disabled', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [{ ...recipe, collectionId: 'c2' }], collections, safeToSave: true });
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      expect(Array.from(select().options).map((o) => o.textContent)).toEqual(['Unsorted', 'Landing', '   Hero']);
      expect(select().value).toBe('c2');
      expect(saveBtn().hasAttribute('disabled')).toBe(true);
    });

    it('moving a recipe is a normal Save: the patch carries the new collectionId', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipe], collections, safeToSave: true });
      storage.updateRecipe.mockResolvedValue(recipe);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      expect(select().value).toBe('');
      fireEvent.change(select(), { target: { value: 'c1' } });
      expect(storage.updateRecipe).not.toHaveBeenCalled();
      fireEvent.click(saveBtn());
      await waitFor(() => expect(storage.updateRecipe).toHaveBeenCalledTimes(1));
      expect(storage.updateRecipe.mock.calls[0][1]).toMatchObject({ collectionId: 'c1' });
    });

    it('choosing Unsorted saves collectionId as undefined', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [{ ...recipe, collectionId: 'c1' }], collections, safeToSave: true });
      storage.updateRecipe.mockResolvedValue(recipe);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.change(select(), { target: { value: '' } });
      fireEvent.click(saveBtn());
      await waitFor(() => expect(storage.updateRecipe).toHaveBeenCalledTimes(1));
      expect(storage.updateRecipe.mock.calls[0][1].collectionId).toBeUndefined();
    });

    it('treats a collectionId whose collection is gone as Unsorted without marking the form dirty', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [{ ...recipe, collectionId: 'deleted' }], collections, safeToSave: true });
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      expect(select().value).toBe('');
      expect(saveBtn().hasAttribute('disabled')).toBe(true);
    });
  });

  it('saves colour and YAML token edits', async () => {
    storage.updateRecipe.mockResolvedValue(recipe);
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    fireEvent.change(screen.getByLabelText('Color value 2'), { target: { value: '#000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
    fireEvent.change(screen.getByLabelText('Color name 3'), { target: { value: 'muted' } });
    fireEvent.change(screen.getByLabelText('Color value 3'), { target: { value: '#888' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove color 1' }));
    const yamlBox = screen.getByText(/Other tokens/).closest('label')!.querySelector('textarea')!;
    fireEvent.change(yamlBox, { target: { value: yamlBox.value.replace('size: 16', 'size: 18') } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(storage.updateRecipe).toHaveBeenCalled());
    const spec = storage.updateRecipe.mock.calls[0][2] as DesignSpec;
    expect(spec.frontMatter.colors).toEqual({ accent: '#000000', muted: '#888' });
    expect(spec.frontMatter.typography).toEqual({ display: { fontFamily: 'Figtree, system-ui', size: 56 }, body: { size: 18 } });
    expect(spec.frontMatter.components).toEqual(frontMatter.components);
  });

  it('shows an inline error and disables Save for invalid YAML, a non-mapping, or a blank title', async () => {
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    const yamlBox = screen.getByText(/Other tokens/).closest('label')!.querySelector('textarea')!;
    fireEvent.change(yamlBox, { target: { value: 'a: [1, 2' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/Invalid YAML/);
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
    fireEvent.change(yamlBox, { target: { value: '- a\n- b' } });
    expect(screen.getByRole('alert').textContent).toMatch(/mapping/);
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
    fireEvent.change(yamlBox, { target: { value: 'name: ok' } });
    expect(saveBtn().hasAttribute('disabled')).toBe(false);
    fireEvent.change(screen.getByDisplayValue('Stripe Home'), { target: { value: '  ' } });
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
    expect(storage.updateRecipe).not.toHaveBeenCalled();
  });

  it('keeps the edits and shows the error when saving fails (blocked manifest)', async () => {
    storage.updateRecipe.mockRejectedValue(new Error('manifest blocked'));
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    fireEvent.change(sectionBox('Layout'), { target: { value: 'edited' } });
    fireEvent.click(saveBtn());
    expect((await screen.findByRole('alert')).textContent).toContain('manifest blocked');
    expect(sectionBox('Layout').value).toBe('edited');
    expect(feedback).not.toHaveBeenCalled();
    expect(saveBtn().hasAttribute('disabled')).toBe(false);
  });

  it('is read-only with a notice when the manifest is unsafe', async () => {
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipe], collections: [], safeToSave: false });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    expect(screen.getByRole('status').textContent).toMatch(/read-only/);
    fireEvent.change(sectionBox('Layout'), { target: { value: 'edited' } });
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Remove reference 1' }).hasAttribute('disabled')).toBe(true);
  });

  it('goes back directly when clean and asks for confirmation when dirty', async () => {
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.change(sectionBox('Layout'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Discard your unsaved edits/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('reorders refs through reorderRecipeRefs and shows the new order', async () => {
    storage.reorderRecipeRefs.mockResolvedValue({ ...recipe, refs: [B, A] });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    expect(screen.getByRole('button', { name: 'Move reference 1 left' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Move reference 2 right' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move reference 1 right' }));
    await waitFor(() => expect(storage.reorderRecipeRefs).toHaveBeenCalledWith('r1', [B, A]));
    fireEvent.click(await screen.findByRole('button', { name: 'Move reference 2 left' }));
    await waitFor(() => expect(storage.reorderRecipeRefs).toHaveBeenLastCalledWith('r1', [A, B]));
  });

  it('removes a ref only after confirmation', async () => {
    storage.removeRecipeRef.mockResolvedValue({ ...recipe, refs: [B] });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference 1' }));
    expect(storage.removeRecipeRef).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(storage.removeRecipeRef).toHaveBeenCalledWith('r1', A));
    await waitFor(() => expect(screen.getAllByRole('img').length).toBe(1));
  });

  it('does not allow removing the last reference', async () => {
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [{ ...recipe, refs: [A] }], collections: [], safeToSave: true });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    expect(screen.getByRole('button', { name: 'Remove reference 1' }).hasAttribute('disabled')).toBe(true);
  });

  it('adds picked images and surfaces per-file errors; ref changes do not dirty the form', async () => {
    storage.addRecipeRefs.mockResolvedValue({ ...recipe, refs: [A, B, 'design-library/r1/refs/3.png'] });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    const good = new File(['x'], 'ok.png', { type: 'image/png' });
    const bad = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('ref-file-input'), { target: { files: [good, bad] } });
    await waitFor(() => expect(storage.addRecipeRefs).toHaveBeenCalledTimes(1));
    expect(storage.addRecipeRefs.mock.calls[0][1]).toEqual([{ name: 'ok.png', blob: good }]);
    expect((await screen.findByRole('alert')).textContent).toContain('notes.txt');
    await waitFor(() => expect(screen.getAllByRole('img').length).toBe(3));
    expect(saveBtn().hasAttribute('disabled')).toBe(true);
  });

  it('adds an image pasted onto the window, but ignores plain text paste', async () => {
    storage.addRecipeRefs.mockResolvedValue({ ...recipe, refs: [A, B, 'design-library/r1/refs/3.png'] });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const paste = (items: unknown[]) => {
      const e = new Event('paste', { cancelable: true });
      Object.defineProperty(e, 'clipboardData', { value: { items } });
      window.dispatchEvent(e);
    };
    paste([{ kind: 'string', type: 'text/plain', getAsFile: () => null }]);
    expect(storage.addRecipeRefs).not.toHaveBeenCalled();
    paste([{ kind: 'file', type: 'image/png', getAsFile: () => file }]);
    // normalizeRef is async; the default 1 s window flaked when many test files ran in parallel on a loaded machine.
    await waitFor(() => expect(storage.addRecipeRefs).toHaveBeenCalledWith('r1', [{ name: 'shot.png', blob: file }]), { timeout: 5000 });
  });

  it('refuses to add beyond the 6 reference cap', async () => {
    const six = Array.from({ length: 5 }, (_, i) => `design-library/r1/refs/${i + 1}.png`);
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [{ ...recipe, refs: six }], collections: [], safeToSave: true });
    storage.addRecipeRefs.mockResolvedValue({ ...recipe, refs: [...six, 'design-library/r1/refs/6.png'] });
    renderDetail();
    await screen.findByDisplayValue('Stripe Home');
    const f = (n: string) => new File(['x'], n, { type: 'image/png' });
    fireEvent.change(screen.getByTestId('ref-file-input'), { target: { files: [f('a.png'), f('b.png')] } });
    await waitFor(() => expect(storage.addRecipeRefs).toHaveBeenCalledTimes(1));
    expect(storage.addRecipeRefs.mock.calls[0][1]).toHaveLength(1);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Only 6/);
    expect(screen.getByRole('button', { name: 'Maximum reached' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows an error state with a Back action when DESIGN.md is missing', async () => {
    storage.loadRecipeSpec.mockRejectedValue(new Error('DESIGN.md missing for recipe r1'));
    renderDetail();
    expect(await screen.findByText('Recipe unavailable')).toBeTruthy();
    expect(screen.getByText(/DESIGN\.md missing/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  describe('Extract from screens', () => {
    const extractedFm = {
      name: 'Calm',
      typography: { body: { size: 16 } },
      colors: { background: '#fafafa', accent: '#635bff' },
      rounded: { sm: 2 },
      spacing: [4, 8],
      components: {},
    };
    const extractedSections = Object.fromEntries(DESIGN_HEADINGS.map((h) => [h, `${h} extracted`]));
    const full: ExtractResult = { spec: { frontMatter: extractedFm, sections: extractedSections }, missing: [], truncated: false, stripped: [] };
    const { Signature: _sig, ...cutSections } = extractedSections;
    const cut: ExtractResult = { spec: { frontMatter: extractedFm, sections: cutSections }, missing: ['heading: Signature'], truncated: true, stripped: [] };
    const extractBtn = () => screen.getByRole('button', { name: 'Extract from screens' });
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };

    it('asks before replacing existing content, shows progress while running, then fills the editor without saving', async () => {
      const run = deferred<typeof full>();
      extraction.extractDesignSpec.mockImplementation(async (_b: Blob[], _s: unknown, onProgress?: (s: string) => void) => {
        onProgress?.('Waiting for the model…');
        return run.promise;
      });
      storage.updateRecipe.mockResolvedValue(recipe);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');

      fireEvent.click(extractBtn());
      expect(screen.getByText(/Replace the tokens and body/)).toBeTruthy();
      expect(extraction.extractDesignSpec).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));

      expect(await screen.findByText('Waiting for the model…')).toBeTruthy();
      const [blobs, settings] = extraction.extractDesignSpec.mock.calls[0];
      expect(blobs).toHaveLength(2);
      expect(settings).toEqual({ activeLLM: 'gemini' });
      expect(screen.getByRole('button', { name: 'Working…' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Remove reference 1' }).closest('fieldset')?.disabled).toBe(true);

      run.resolve({ ...full, stripped: ['colors.accent'] });
      await waitFor(() => expect(sectionBox('Overview').value).toBe('Overview extracted'));
      expect(screen.queryByText('Waiting for the model…')).toBeNull();
      expect(screen.getByDisplayValue('#635bff')).toBeTruthy();
      expect(screen.getByDisplayValue('Stripe Home')).toBeTruthy();
      expect(storage.updateRecipe).not.toHaveBeenCalled();

      const note = screen.getByText(/Removed "\(est\.\)" guess markers from: colors\.accent/);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss note' }));
      expect(note.isConnected).toBe(false);

      fireEvent.click(saveBtn());
      await waitFor(() => expect(storage.updateRecipe).toHaveBeenCalledTimes(1));
      const spec = storage.updateRecipe.mock.calls[0][2] as DesignSpec;
      expect(spec.frontMatter).toEqual(extractedFm);
      expect(Object.keys(spec.frontMatter)).toEqual(Object.keys(extractedFm));
      expect(spec.sections.Signature).toBe('Signature extracted');
    });

    it('runs straight away on a fresh recipe with nothing to lose', async () => {
      storage.loadRecipeSpec.mockResolvedValue({ spec: { frontMatter: { name: 'Stripe Home' }, sections: { Overview: '' } }, missing: [], truncated: true });
      extraction.extractDesignSpec.mockResolvedValue(full);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.click(extractBtn());
      expect(screen.queryByText(/Replace the tokens and body/)).toBeNull();
      await waitFor(() => expect(sectionBox('Signature').value).toBe('Signature extracted'));
    });

    it('blocks Save on a cut-off answer until Re-run returns a complete one', async () => {
      extraction.extractDesignSpec.mockResolvedValueOnce(cut).mockResolvedValueOnce(full);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.click(extractBtn());
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));

      expect(await screen.findByText(/The model's answer was cut off \(missing: heading: Signature\)/)).toBeTruthy();
      expect(sectionBox('Overview').value).toBe('Overview extracted');
      expect(saveBtn().hasAttribute('disabled')).toBe(true);

      // Re-running over the untouched result needs no confirmation.
      fireEvent.click(screen.getByRole('button', { name: 'Re-run' }));
      await waitFor(() => expect(extraction.extractDesignSpec).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(sectionBox('Signature').value).toBe('Signature extracted'));
      expect(screen.queryByText(/cut off/)).toBeNull();
      expect(saveBtn().hasAttribute('disabled')).toBe(false);
    });

    it('unblocks Save on a cut-off answer once Signature is written by hand', async () => {
      extraction.extractDesignSpec.mockResolvedValue(cut);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.click(extractBtn());
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      await screen.findByText(/cut off/);
      fireEvent.change(sectionBox('Signature'), { target: { value: 'A glowing grid' } });
      expect(screen.queryByText(/cut off/)).toBeNull();
      expect(saveBtn().hasAttribute('disabled')).toBe(false);
    });

    it('asks again before a Re-run would overwrite edits made after the extraction', async () => {
      extraction.extractDesignSpec.mockResolvedValue(cut);
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.click(extractBtn());
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      await screen.findByText(/cut off/);
      fireEvent.change(sectionBox('Layout'), { target: { value: 'my edit' } });
      fireEvent.click(screen.getByRole('button', { name: 'Re-run' }));
      expect(screen.getByText(/Replace the tokens and body/)).toBeTruthy();
      expect(extraction.extractDesignSpec).toHaveBeenCalledTimes(1);
    });

    it('shows the real error inline and leaves the edits untouched', async () => {
      extraction.extractDesignSpec.mockRejectedValue(new Error('Design spec is not available with the anthropic engine (supported: gemini, ollama).'));
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.change(sectionBox('Layout'), { target: { value: 'my edit' } });
      fireEvent.click(extractBtn());
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      expect((await screen.findByRole('alert')).textContent).toBe('Extraction failed: Design spec is not available with the anthropic engine (supported: gemini, ollama).');
      expect(sectionBox('Layout').value).toBe('my edit');
      expect(saveBtn().hasAttribute('disabled')).toBe(false);
    });

    it('reports a reference missing on disk without calling the model', async () => {
      const { fileSystemManager } = await import('../utils/fileUtils');
      vi.mocked(fileSystemManager.getFileAsBlob).mockResolvedValue(null);
      try {
        renderDetail();
        await screen.findByDisplayValue('Stripe Home');
        fireEvent.click(extractBtn());
        fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
        expect((await screen.findByRole('alert')).textContent).toContain(`missing on disk: ${A}`);
        expect(extraction.extractDesignSpec).not.toHaveBeenCalled();
      } finally {
        vi.mocked(fileSystemManager.getFileAsBlob).mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
      }
    });

    it('drops a result that arrives after the view was left', async () => {
      const run = deferred<typeof full>();
      extraction.extractDesignSpec.mockReturnValue(run.promise);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const view = renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      fireEvent.click(extractBtn());
      fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
      await waitFor(() => expect(extraction.extractDesignSpec).toHaveBeenCalled());
      view.unmount();
      run.resolve(full);
      await run.promise;
      await new Promise((r) => setTimeout(r, 0));
      expect(errors).not.toHaveBeenCalled();
      expect(storage.updateRecipe).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    it('is unavailable when the recipe is read-only', async () => {
      storage.loadDesignLibrary.mockResolvedValue({ recipes: [recipe], collections: [], safeToSave: false });
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      expect(extractBtn().hasAttribute('disabled')).toBe(true);
    });

    it('warns about empty token values', async () => {
      storage.loadRecipeSpec.mockResolvedValue({ spec: { frontMatter: { ...frontMatter, rounded: { sm: null } }, sections: fullSections }, missing: [], truncated: false });
      renderDetail();
      await screen.findByDisplayValue('Stripe Home');
      expect(screen.getByText(/Token values are empty .*: rounded\.sm/)).toBeTruthy();
    });
  });

  it('shows an error state when the vault cannot be read or the recipe is gone', async () => {
    storage.loadDesignLibrary.mockRejectedValueOnce(new Error('vault not connected'));
    const first = renderDetail();
    expect(await screen.findByText(/vault not connected/)).toBeTruthy();
    first.unmount();
    storage.loadDesignLibrary.mockResolvedValue({ recipes: [], collections: [], safeToSave: true });
    renderDetail();
    expect(await screen.findByText(/recipe not found/i)).toBeTruthy();
  });
});
