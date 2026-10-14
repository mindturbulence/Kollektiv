import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../core/persistence', () => ({
  loadGraph: vi.fn(async () => null),
  saveGraph: vi.fn(async () => ({})),
}));
vi.mock('../../services/llmService', () => ({ refineSinglePrompt: vi.fn() }));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { activeLLM: 'gemini' }, updateSettings: vi.fn() }),
}));

import { getRunStates, getSnapshot } from '../core/store';
import RefinerCanvasPage from './RefinerCanvasPage';

// xyflow measures with ResizeObserver and DOMMatrixReadOnly, neither of which jsdom has.
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class DOMMatrixStub {
    m22: number;
    constructor(transform?: string) {
      const m = /scale\(([\d.]+)\)/.exec(transform ?? '');
      this.m22 = m ? Number(m[1]) : 1;
    }
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('DOMMatrixReadOnly', DOMMatrixStub);
});

afterEach(cleanup);

describe('RefinerCanvasPage', () => {
  it('boots a starter Concept -> Shot graph and edits it through the toolbar with undo', async () => {
    render(<RefinerCanvasPage />);
    await screen.findByRole('button', { name: '+ Shot' });
    expect(getSnapshot().nodes.map(n => n.kind)).toEqual(['concept', 'shot']);
    expect(getSnapshot().edges).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '+ Audio' }));
    expect(getSnapshot().nodes.map(n => n.kind)).toEqual(['concept', 'shot', 'audio']);
    // The new node is selected, so its inspector opens.
    expect(screen.getByLabelText('Node inspector')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(getSnapshot().nodes).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(getSnapshot().nodes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getSnapshot().nodes).toHaveLength(2);
  });

  it('Run reports a missing model on the shot instead of crashing', async () => {
    render(<RefinerCanvasPage />);
    await screen.findByRole('button', { name: 'Run' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    });
    // The starter concept is empty, so the shot has nothing to refine: it errors, the page stays alive.
    const shot = getSnapshot().nodes.find(n => n.kind === 'shot');
    expect(getRunStates().get(shot?.id ?? '')?.status).toBe('error');
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  });
});
