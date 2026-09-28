import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import NoteViewer from './NoteViewer';
import { openNoteInPanel } from '../utils/obsidianStorage';

describe('NoteViewer', () => {
  afterEach(cleanup);

  it('shows a note opened via openNoteInPanel', () => {
    render(<NoteViewer />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => openNoteInPanel({
      path: 'ideas/film.md', title: 'Film looks', content: '# Grain\n\nPush **two** stops.',
      tags: [], frontmatter: {}, updatedAt: null,
    }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Film looks');
    expect(dialog.textContent).toContain('ideas/film.md');
    expect(screen.getByRole('heading', { name: 'Grain' })).toBeTruthy();
  });
});
