// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  captureSite: vi.fn(),
  writeCloneSpec: vi.fn(),
  measuredRecipe: vi.fn(),
  isNoVisionError: vi.fn((e: unknown) => e instanceof Error && e.message.includes('cannot read images')),
}));
vi.mock('../services/cloneSiteService', () => svc);
const storage = vi.hoisted(() => ({ createRecipe: vi.fn() }));
vi.mock('../utils/designLibraryStorage', () => storage);
vi.mock('../utils/settingsStorage', () => ({ loadLLMSettings: () => ({ activeLLM: 'gemini' }) }));

import CloneSiteModal from './CloneSiteModal';

const site = { finalUrl: 'https://acme.example/', title: 'Acme' };
const recipe = (over = {}) => ({
  title: 'Acme', pageType: 'landing', tags: ['saas'], sourceUrl: 'https://acme.example/',
  refs: [{ name: 'desktop.jpg', blob: new Blob(['d']) }], spec: { frontMatter: {}, sections: {} },
  truncated: false, missing: [], stripped: [], measuredOnly: false,
  clone: { capturedAt: 1, tech: [], files: { 'assets.json': '{}', 'content.json': '{}', 'measurements.json': '{}' } },
  ...over,
});

const setup = () => {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<CloneSiteModal isOpen onClose={onClose} onCreated={onCreated} collections={[]} />);
  fireEvent.change(screen.getByPlaceholderText('https://example.com'), { target: { value: 'acme.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clone site' }));
  return { onCreated, onClose };
};

beforeEach(() => {
  vi.clearAllMocks();
  svc.captureSite.mockResolvedValue(site);
  svc.writeCloneSpec.mockResolvedValue(recipe());
  svc.measuredRecipe.mockReturnValue(recipe({ measuredOnly: true, pageType: 'other' }));
  storage.createRecipe.mockResolvedValue({ id: 'dr_new' });
});
afterEach(cleanup);

describe('CloneSiteModal', () => {
  it('captures (adding https://), writes the spec and saves a cloned recipe', async () => {
    const { onCreated, onClose } = setup();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('dr_new', null));
    expect(svc.captureSite).toHaveBeenCalledWith('https://acme.example', expect.any(AbortSignal));
    expect(storage.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ title: 'Acme', pageType: 'landing', tags: ['saas'], clone: expect.objectContaining({ capturedAt: 1 }) }));
    expect(onClose).toHaveBeenCalled();
  });

  it('falls back to a measurements-only recipe when the provider cannot read images', async () => {
    svc.writeCloneSpec.mockImplementation(async () => { throw new Error('The Ollama model "x" cannot read images.'); });
    const { onCreated } = setup();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('dr_new', expect.stringMatching(/^Built from measurements only/)));
    expect(svc.measuredRecipe).toHaveBeenCalledWith(site);
  });

  it('keeps the capture after a transient AI failure: Retry AI does not capture again', async () => {
    svc.writeCloneSpec.mockImplementationOnce(async () => { throw new Error('HTTP 503'); });
    const { onCreated } = setup();
    expect(await screen.findByText(/writing the spec failed: HTTP 503/)).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('dr_new', null));
    expect(svc.captureSite).toHaveBeenCalledTimes(1);
    expect(svc.writeCloneSpec).toHaveBeenCalledTimes(2);
  });

  it('can save from measurements only after an AI failure', async () => {
    svc.writeCloneSpec.mockImplementation(async () => { throw new Error('HTTP 503'); });
    const { onCreated } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Save from measurements only' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('dr_new', 'Built from measurements only.'));
  });

  it('notes a cut-off AI answer', async () => {
    svc.writeCloneSpec.mockResolvedValue(recipe({ truncated: true }));
    const { onCreated } = setup();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('dr_new', expect.stringMatching(/cut off/)));
  });

  it('shows a capture error and keeps the address for another try', async () => {
    svc.captureSite.mockImplementation(async () => { throw new Error('That address is local or private, so it cannot be cloned.'); });
    setup();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'That address is local or private, so it cannot be cloned.');
    expect((screen.getByPlaceholderText('https://example.com') as HTMLInputElement).value).toBe('acme.example');
    expect(storage.createRecipe).not.toHaveBeenCalled();
  });
});
