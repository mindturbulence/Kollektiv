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
  setIsCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsMediaPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsClippingPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setVideoPlayerUrl: (url: string | null) => void;
  handleClipIdea: (idea: Idea) => void;
  isCommandPaletteOpen: boolean;
}

/**
 * Subscribes to global app events and triggers shell actions.
 * Keeps event-driven logic separate from the main shell hook.
 */
export const useAppEventBus = ({
  handleNavigate,
  handleSendToPromptsPage,
  showGlobalFeedback,
  setIsCommandPaletteOpen,
  setIsMediaPanelOpen,
  setIsClippingPanelOpen,
  setVideoPlayerUrl,
  handleClipIdea,
  isCommandPaletteOpen,
}: UseAppEventBusInput) => {
  // ── Navigation events ────────────────────────────────────────────────
  useEffect(() => {
    const navigateSub = appEventBus.on('navigate', (tab: ActiveTab) => {
      handleNavigate(tab);
    });
    const sendToSub = appEventBus.on('sendToPromptsPage', (state: PromptsPageState) => {
      handleSendToPromptsPage(state);
    });
    const feedbackSub = appEventBus.on('assistantFeedback', (f: { message: string; isError?: boolean }) => {
      showGlobalFeedback(f.message, f.isError);
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
        default: break;
      }
    });
    return off;
  }, [setIsMediaPanelOpen, setIsClippingPanelOpen]);

  // ── Video player ──────────────────────────────────────────────────────
  useEffect(() => {
    return appEventBus.on('playVideo', (payload: { url: string }) => {
      if (payload?.url) {
        setVideoPlayerUrl(payload.url);
      }
    });
  }, [setVideoPlayerUrl]);

  // ── Clip idea from assistant ──────────────────────────────────────────
  useEffect(() => {
    return appEventBus.on('clipIdea', (p: { title: string; prompt: string; lens?: string; source?: string }) => {
      if (!p.prompt) return;
      handleClipIdea({
        id: `clip-${Date.now()}`,
        title: p.title || p.prompt.slice(0, 40),
        prompt: p.prompt,
        lens: p.lens || 'Assistant',
        source: p.source || 'Assistant',
      });
    });
  }, [handleClipIdea]);
};