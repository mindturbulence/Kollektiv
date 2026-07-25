import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppShell } from './useAppShell';

// Mock child modules that touch network/storage in jsdom
vi.mock('../utils/promptStorage', () => ({
  addSavedPrompt: vi.fn(),
}));
vi.mock('../utils/notesStorage', () => ({
  getNotesSync: vi.fn(() => []),
}));
vi.mock('../utils/eventBus', () => ({
  appEventBus: { on: vi.fn(() => () => {}), emit: vi.fn() },
}));

// Mock localStorage to satisfy useLocalStorage
const store: Record<string, string> = {};
vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store[k] ?? null);
vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });

describe('useAppShell', () => {
  const noop = () => {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });

  describe('initial state', () => {
    it('exposes all required state fields', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      expect(typeof result.current.isAboutModalOpen).toBe('boolean');
      expect(result.current.clippedIdeas).toEqual([]);
      expect(result.current.collapsedPanels).toEqual({});
      expect(result.current.globalFeedback).toBeNull();
      expect(result.current.notesCount).toBe(0);
      expect(result.current.filesCount).toBe(0);
      expect(result.current.videoPlayerUrl).toBeNull();
    });
  });

  describe('panel toggles', () => {
    it('handleAboutClick opens the about modal', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.handleAboutClick());
      expect(result.current.isAboutModalOpen).toBe(true);
    });

    it('handleToggleClippingPanel flips the clipping panel', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.handleToggleClippingPanel());
      expect(result.current.isClippingPanelOpen).toBe(true);
      act(() => result.current.handleToggleClippingPanel());
      expect(result.current.isClippingPanelOpen).toBe(false);
    });

    it('handleCloseClippingPanel pins the panel closed', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.setIsClippingPanelOpen(true));
      act(() => result.current.handleToggleClippingPanel()); // close
      expect(result.current.isClippingPanelOpen).toBe(false);
    });
  });

  describe('global feedback', () => {
    it('showGlobalFeedback sets a success message by default', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.showGlobalFeedback('hello'));
      expect(result.current.globalFeedback).toEqual({ message: 'hello', type: 'success' });
    });

    it('showGlobalFeedback(..., true) sets an error', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.showGlobalFeedback('oops', true));
      expect(result.current.globalFeedback).toEqual({ message: 'oops', type: 'error' });
    });

    it('handleCloseFeedback clears global feedback', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.showGlobalFeedback('msg'));
      act(() => result.current.handleCloseFeedback());
      expect(result.current.globalFeedback).toBeNull();
    });
  });

  describe('clipped ideas', () => {
    it('handleClipIdea prepends a new idea', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      const idea = { id: 'i1', title: 'X', prompt: 'p1', lens: 'L', source: 'S' };
      act(() => result.current.handleClipIdea(idea));
      expect(result.current.clippedIdeas).toHaveLength(1);
      expect(result.current.clippedIdeas[0].id).toBe('i1');
    });

    it('handleRemoveIdea filters by id', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.handleClipIdea({ id: 'a', title: 'A', prompt: 'p', lens: 'l', source: 's' }));
      act(() => result.current.handleClipIdea({ id: 'b', title: 'B', prompt: 'p', lens: 'l', source: 's' }));
      act(() => result.current.handleRemoveIdea('a'));
      expect(result.current.clippedIdeas.map((i: any) => i.id)).toEqual(['b']);
    });

    it('handleClearAllIdeas empties the list', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.handleClipIdea({ id: 'a', title: 'A', prompt: 'p', lens: 'l', source: 's' }));
      act(() => result.current.handleClearAllIdeas());
      expect(result.current.clippedIdeas).toEqual([]);
    });
  });

  describe('navigation bridge', () => {
    it('handleSendToPromptsPage stores the state', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.handleSendToPromptsPage({ prompt: 'p', view: 'enhancer' }));
      expect(result.current.promptsPageState).toEqual({ prompt: 'p', view: 'enhancer' });
    });

    it('handleClearPromptsPageState clears the state', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.handleSendToPromptsPage({ prompt: 'p', view: 'composer' }));
      act(() => result.current.handleClearPromptsPageState());
      expect(result.current.promptsPageState).toBeNull();
    });

    it('handleSendToPromptsPage routes to the matching top-level tab', () => {
      const handleNavigate = vi.fn();
      const { result } = renderHook(() => useAppShell({ handleNavigate }));
      act(() => result.current.handleSendToPromptsPage({ view: 'enhancer' }));
      expect(handleNavigate).toHaveBeenCalledWith('refiner');
    });

    it('routes prompt_analyzer view to its tab', () => {
      const handleNavigate = vi.fn();
      const { result } = renderHook(() => useAppShell({ handleNavigate }));
      act(() => result.current.handleSendToPromptsPage({ view: 'prompt_analyzer' }));
      expect(handleNavigate).toHaveBeenCalledWith('prompt_analyzer');
    });
  });

  describe('video player bridge', () => {
    it('handleCloseVideoPlayer clears the URL', () => {
      const { result } = renderHook(() => useAppShell({ handleNavigate: noop }));
      act(() => result.current.setVideoPlayerUrl('https://youtu.be/x'));
      act(() => result.current.handleCloseVideoPlayer());
      expect(result.current.videoPlayerUrl).toBeNull();
    });
  });
});
