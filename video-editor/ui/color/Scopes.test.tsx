// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../core/gpu/scopes', () => ({ createScopes: vi.fn(async () => null) }));

import Scopes from './Scopes';

afterEach(cleanup);

describe('Scopes', () => {
  it('shows a quiet empty state when WebGPU scopes are unavailable', async () => {
    render(<Scopes source={null} active={false} />);
    await waitFor(() => expect(screen.getByText('Scopes need WebGPU.')).toBeTruthy());
  });

  it('renders the three scope tabs', async () => {
    render(<Scopes source={null} active={false} />);
    expect(screen.getByRole('tab', { name: 'waveform' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'vectorscope' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'histogram' })).toBeTruthy();
  });
});
