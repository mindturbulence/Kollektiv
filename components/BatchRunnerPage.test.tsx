import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

beforeEach(cleanup);

vi.mock('../services/batchOperations', () => ({
  BATCH_OPERATIONS: [{ id: 'refine_prompt', label: 'Refine prompt', inputKind: 'prompt', run: async () => 'x' }],
  getOperation: () => ({ id: 'refine_prompt', label: 'Refine prompt', inputKind: 'prompt', run: async () => 'x' }),
}));
vi.mock('../utils/promptStorage', () => ({ loadSavedPrompts: vi.fn(async () => [{ id: 'p1', title: 'One', text: 'a' }]) }));
vi.mock('../utils/galleryStorage', () => ({ loadGalleryItems: vi.fn(async () => []) }));
vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { activeLLM: 'gemini' }, updateSettings: vi.fn() }),
}));

import { BatchRunnerPage } from './BatchRunnerPage';

describe('BatchRunnerPage', () => {
  it('lists the available operations', () => {
    render(<BatchRunnerPage />);
    expect(screen.getByText('Refine prompt')).toBeTruthy();
  });

  it('shows a pre-run summary with the item count before starting', async () => {
    render(<BatchRunnerPage />);
    expect(await screen.findByText(/0 items/i)).toBeTruthy();
  });

  it('disables Run with nothing selected', () => {
    render(<BatchRunnerPage />);
    expect(screen.getByRole('button', { name: /run/i }).hasAttribute('disabled')).toBe(true);
  });
});
