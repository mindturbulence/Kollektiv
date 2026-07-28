import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { VaultMapPanel } from './VaultMapPanel';

beforeEach(cleanup);

vi.mock('../services/tools/graphHydration', () => ({
  hydrateKnowledgeGraph: vi.fn(async () => ({ entities: 2, relations: 1, ms: 5 })),
}));
vi.mock('../services/relationshipGraph', () => ({
  relationshipGraph: {
    getEntities: () => [
      { kind: 'gallery_item', id: 'g1', label: 'Sunset', tags: ['cinematic'] },
      { kind: 'prompt', id: 'p1', label: 'Golden hour', tags: ['cinematic'] },
    ],
    getRelations: () => [{ id: 'r1', type: 'similar_to', source: 'gallery_item::g1', target: 'prompt::p1', weight: 0.5 }],
  },
}));

describe('VaultMapPanel', () => {
  it('renders entity labels once hydrated', async () => {
    render(<VaultMapPanel isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Sunset')).toBeTruthy());
    expect(screen.getByText('Golden hour')).toBeTruthy();
  });

  it('reports the entity and relation counts', async () => {
    render(<VaultMapPanel isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/2 items/i)).toBeTruthy());
    expect(screen.getByText(/1 link/i)).toBeTruthy();
  });

  it('shows an empty state when the vault has no tagged items', async () => {
    const { relationshipGraph } = await import('../services/relationshipGraph');
    (relationshipGraph.getEntities as any) = () => [];
    (relationshipGraph.getRelations as any) = () => [];
    render(<VaultMapPanel isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/nothing tagged yet/i)).toBeTruthy());
  });
});
