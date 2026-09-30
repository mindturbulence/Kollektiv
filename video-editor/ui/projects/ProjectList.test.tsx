import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ProjectSummary } from '../../core/autosave';

const autosaveMock = vi.hoisted(() => ({
  listProjects: vi.fn<() => Promise<ProjectSummary[]>>(),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  renameProject: vi.fn().mockResolvedValue(undefined),
  duplicateProject: vi.fn().mockResolvedValue('new-id'),
  estimateStorage: vi.fn().mockResolvedValue(null),
  sweepOrphanedMedia: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../core/autosave', () => autosaveMock);

// The real ConfirmationModal renders in a portal and plays audio; the
// component under test only needs to know it opened and can confirm.
vi.mock('../../../components/ConfirmationModal', () => ({
  default: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) =>
    isOpen ? <button onClick={onConfirm}>confirm-delete</button> : null,
}));

import ProjectList from './ProjectList';

const summaries: ProjectSummary[] = [
  { id: 'p1', name: 'Beach edit', createdAt: 0, updatedAt: Date.now() - 60_000, clipCount: 3 },
  { id: 'p2', name: 'Interview', createdAt: 0, updatedAt: Date.now() - 3_600_000, clipCount: 0 },
];

describe('ProjectList', () => {
  beforeEach(() => {
    autosaveMock.listProjects.mockResolvedValue(summaries);
    autosaveMock.deleteProject.mockClear();
    autosaveMock.renameProject.mockClear();
    autosaveMock.duplicateProject.mockClear();
  });
  afterEach(cleanup);

  it('renders saved projects with name and clip count', async () => {
    render(<ProjectList onOpen={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByText('Beach edit')).toBeInTheDocument();
    expect(screen.getByText(/3 clips/)).toBeInTheDocument();
    expect(screen.getByText(/0 clips/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no projects', async () => {
    autosaveMock.listProjects.mockResolvedValue([]);
    render(<ProjectList onOpen={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByText('No saved projects')).toBeInTheDocument();
  });

  it('calls onOpen when a project row is clicked', async () => {
    const onOpen = vi.fn();
    render(<ProjectList onOpen={onOpen} onError={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Beach edit' }));
    expect(onOpen).toHaveBeenCalledWith('p1');
  });

  it('deletes a project only after confirming, then refreshes the list', async () => {
    render(<ProjectList onOpen={vi.fn()} onError={vi.fn()} />);
    await screen.findByText('Beach edit');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Beach edit' }));
    expect(autosaveMock.deleteProject).not.toHaveBeenCalled();

    autosaveMock.listProjects.mockResolvedValue([summaries[1]]);
    fireEvent.click(screen.getByText('confirm-delete'));

    await waitFor(() => expect(autosaveMock.deleteProject).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('Beach edit')).not.toBeInTheDocument());
  });

  it('disables delete for the currently open project', async () => {
    render(<ProjectList onOpen={vi.fn()} onError={vi.fn()} currentProjectId="p1" />);
    await screen.findByText('Beach edit');
    expect(screen.getByRole('button', { name: 'Delete Beach edit' })).toBeDisabled();
  });

  it('renames a project inline', async () => {
    render(<ProjectList onOpen={vi.fn()} onError={vi.fn()} />);
    await screen.findByText('Beach edit');

    fireEvent.click(screen.getByRole('button', { name: 'Rename Beach edit' }));
    const input = screen.getByDisplayValue('Beach edit');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(autosaveMock.renameProject).toHaveBeenCalledWith('p1', 'Renamed'));
  });

  it('duplicates a project', async () => {
    render(<ProjectList onOpen={vi.fn()} onError={vi.fn()} />);
    await screen.findByText('Beach edit');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Beach edit' }));
    await waitFor(() => expect(autosaveMock.duplicateProject).toHaveBeenCalledWith('p1'));
  });

  it('reports errors from a failed load via onError', async () => {
    autosaveMock.listProjects.mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    render(<ProjectList onOpen={vi.fn()} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('boom'));
  });

  it('sweeps orphaned media before listing, and a failed sweep never blocks the list or raises an error', async () => {
    autosaveMock.sweepOrphanedMedia.mockRejectedValueOnce(new Error('no idb'));
    autosaveMock.listProjects.mockResolvedValue(summaries);
    const onError = vi.fn();
    render(<ProjectList onOpen={vi.fn()} onError={onError} />);
    await screen.findByText('Beach edit');
    expect(autosaveMock.sweepOrphanedMedia).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
