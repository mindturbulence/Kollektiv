import { useEffect } from 'react';
import { appEventBus } from '../utils/eventBus';
import type { ActiveTab, Idea } from '../types';

type PromptsPageState = {
  prompt?: string;
  artStyle?: string;
  artist?: string;
  view?: 'enhancer' | 'composer' | 'create' | 'prompt_analyzer';
  id?: string;
} | null;

interface UseAppEventBusInput {
  handleNavigate: (tab: ActiveTab) => void;
  handleSendToPromptsPage: (state: PromptsPageState) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsClippingPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsMediaPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsWebViewerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setVideoPlayerUrl: (url: string | null) => void;
  handleClipIdea: (idea: Idea) => void;
}

/**
 * All appEventBus subscriptions extracted from App.tsx.
 * Side-effect only — subscribes on mount, unsubscribes on unmount.
 */
export const useAppEventBus = ({
  handleNavigate,
  handleSendToPromptsPage,
  showGlobalFeedback,
  isCommandPaletteOpen,
  setIsCommandPaletteOpen,
  setIsClippingPanelOpen,
  setIsMediaPanelOpen,
  setIsWebViewerOpen,
  setVideoPlayerUrl,
  handleClipIdea,
}: UseAppEventBusInput): void => {
  // ── Navigation & feedback events ─────────────────────────────────────
  useEffect(() => {
    const navigateSub = appEventBus.on('navigate', (tab) => {
      if (typeof tab === 'string') {
        handleNavigate(tab as ActiveTab);
      }
    });
    const sendToSub = appEventBus.on('sendToPromptsPage', (state) => {
      if (state && typeof state === 'object') {
        handleSendToPromptsPage(state as PromptsPageState);
      }
    });
    const feedbackSub = appEventBus.on('assistantFeedback', (payload) => {
      const p = payload as { message: string; isError?: boolean } | undefined;
      if (p?.message) showGlobalFeedback(p.message, !!p.isError);
    });
    return () => { navigateSub(); sendToSub(); feedbackSub(); };
  }, [handleNavigate, handleSendToPromptsPage, showGlobalFeedback]);

  // ── Global keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isCommandPaletteOpen, setIsCommandPaletteOpen]);

  // ── Panel toggle events (from command palette) ───────────────────────
  useEffect(() => {
    const off = appEventBus.on('togglePanel', (name: string) => {
      switch (name) {
        case 'media': setIsMediaPanelOpen(p => !p); break;
        case 'clipping': setIsClippingPanelOpen(p => !p); break;
        case 'webviewer': setIsWebViewerOpen(p => !p); break;
        default: break;
      }
    });
    return off;
  }, [setIsMediaPanelOpen, setIsClippingPanelOpen, setIsWebViewerOpen]);

  // ── Web viewer open/close on events ──────────────────────────────────
  useEffect(() => {
    return appEventBus.on('navigate', () => {
      setIsWebViewerOpen(false);
    });
  }, [setIsWebViewerOpen]);

  useEffect(() => {
    return appEventBus.on('openWebPage', () => {
      setIsWebViewerOpen(true);
    });
  }, [setIsWebViewerOpen]);

  // ── Video player ──────────────────────────────────────────────────────
  useEffect(() => {
    return appEventBus.on('playVideo', (payload: { url: string }) => {
      if (payload?.url) {
        setVideoPlayerUrl(payload.url);
      }
    });
  }, [setVideoPlayerUrl]);

  useEffect(() => {
    return appEventBus.on('openMediaPanel', (_payload: { url: string }) => {
      setIsMediaPanelOpen(true);
    });
  }, [setIsMediaPanelOpen]);

  // ── Clip idea event ──────────────────────────────────────────────────
  useEffect(() => {
    return appEventBus.on('clipIdea', (payload) => {
      if (payload && typeof payload === 'object' && (payload as any).prompt) {
        const p = payload as { title?: string; prompt: string; lens?: string; source?: string };
        handleClipIdea({
          id: `clip-${Date.now()}`,
          title: p.title || p.prompt.slice(0, 40),
          prompt: p.prompt,
          lens: p.lens || 'Assistant',
          source: p.source || 'Assistant',
        });
      }
    });
  }, [handleClipIdea]);
};
