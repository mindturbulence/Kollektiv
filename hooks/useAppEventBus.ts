import { useEffect } from 'react';
import { appEventBus, type PromptsPageState, type OpenInEditorPayload } from '../utils/eventBus';
import type { EditorOpenPayload } from '../image-editor/core/types';
import type { ActiveTab, Idea } from '../types';

interface UseAppEventBusInput {
  handleNavigate: (tab: ActiveTab) => void;
  handleSendToPromptsPage: (state: PromptsPageState) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
  setIsCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsMediaPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsClippingPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setVideoPlayerUrl: (url: string | null) => void;
  handleClipIdea: (idea: Idea) => void;
  setEditorOpenPayload: (payload: EditorOpenPayload | undefined) => void;
  setConverterOpenFiles: (files: File[] | undefined) => void;
  isCommandPaletteOpen: boolean;
  /** Cycles the active theme — shared code path with the header's ThemeSwitcher. */
  handleCycleTheme?: () => void;
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
  setEditorOpenPayload,
  setConverterOpenFiles,
  isCommandPaletteOpen,
  handleCycleTheme,
}: UseAppEventBusInput) => {
  // ── Navigation events ────────────────────────────────────────────────
  useEffect(() => {
    const navigateSub = appEventBus.on('navigate', (tab) => {
      handleNavigate(tab);
    });
    const sendToSub = appEventBus.on('sendToPromptsPage', (state) => {
      handleSendToPromptsPage(state);
    });
    const feedbackSub = appEventBus.on('assistantFeedback', (f) => {
      showGlobalFeedback(f.message, f.isError);
    });
    return () => { navigateSub(); sendToSub(); feedbackSub(); };
  }, [handleNavigate, handleSendToPromptsPage, showGlobalFeedback]);

  // ── Theme cycling (from command palette "Next Theme") ────────────────
  useEffect(() => {
    if (!handleCycleTheme) return;
    return appEventBus.on('cycleTheme', handleCycleTheme);
  }, [handleCycleTheme]);

  // ── Open in editor (from Gallery ImageCard EDIT button) ──────────────
  useEffect(() => {
    return appEventBus.on('openInEditor', (payload: OpenInEditorPayload) => {
      if ('galleryItemId' in payload) {
        setEditorOpenPayload({ kind: 'gallery', galleryItemId: payload.galleryItemId, url: payload.url });
      } else {
        setEditorOpenPayload({ kind: 'blob', blob: payload.blob });
      }
      handleNavigate('image_editor');
    });
  }, [setEditorOpenPayload, handleNavigate]);

  // ── Open in converter (from Assets Manager selection toolbar) ────────
  useEffect(() => {
    return appEventBus.on('openInConverter', (payload: { files: File[] }) => {
      setConverterOpenFiles(payload.files);
      handleNavigate('converter');
    });
  }, [setConverterOpenFiles, handleNavigate]);

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

  // ── Media panel: open from assistant-triggered events ────────────────
  useEffect(() => {
    return appEventBus.on('openMediaPanel', () => {
      setIsMediaPanelOpen(true);
    });
  }, [setIsMediaPanelOpen]);

  // ── Stop media (from assistant stop_media tool) ──────────────────────
  useEffect(() => {
    return appEventBus.on('stopMedia', () => {
      setVideoPlayerUrl(null);
    });
  }, [setVideoPlayerUrl]);

  // ── Clip idea from assistant ──────────────────────────────────────────
  useEffect(() => {
    return appEventBus.on('clipIdea', (p) => {
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