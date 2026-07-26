import { useState, useCallback, useEffect } from 'react';
import useLocalStorage from '../utils/useLocalStorage';
import { appEventBus } from '../utils/eventBus';
import { addSavedPrompt } from '../utils/promptStorage';
import { getNotesSync } from '../utils/notesStorage';
import type { ActiveTab, ActiveSettingsTab, Idea } from '../types';

type PromptsPageState = {
  prompt?: string;
  artStyle?: string;
  artist?: string;
  view?: 'enhancer' | 'composer' | 'create' | 'prompt_analyzer';
  id?: string;
} | null;

export interface ShellState {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAboutModalOpen: boolean;
  isClippingPanelOpen: boolean;
  isMediaPanelOpen: boolean;
  isActivityPanelOpen: boolean;
  isChatPanelOpen: boolean;
  isLlmPanelOpen: boolean;
  isCommandPaletteOpen: boolean;
  videoPlayerUrl: string | null;
  globalFeedback: { message: string; type: 'success' | 'error' } | null;
  promptsPageState: PromptsPageState;
  activeSettingsTab: ActiveSettingsTab;
  activeSettingsSubTab: string;
  clippedIdeas: Idea[];
  notesCount: number;
  filesCount: number;
  collapsedPanels: Record<string, boolean>;

  showGlobalFeedback: (message: string, isError?: boolean) => void;
  handleSendToPromptsPage: (state: PromptsPageState) => void;
  handleClipIdea: (idea: Idea) => void;
  handleRemoveIdea: (id: string) => void;
  handleClearAllIdeas: () => void;
  handleInsertIdea: (prompt: string) => void;
  handleRefineIdea: (promptValue: string) => void;
  handleSaveClippedIdea: (idea: Idea) => Promise<void>;
  handleSendToEnhancer: (promptValue: string) => void;
  handleClearPromptsPageState: () => void;

  // Panel toggles
  handleAboutClick: () => void;
  handleToggleClippingPanel: () => void;
  handleToggleActivityPanel: () => void;
  handleCloseActivityPanel: () => void;
  handleToggleMediaPanel: () => void;
  handleCloseMediaPanel: () => void;
  handleCloseVideoPlayer: () => void;
  handleToggleChatPanel: () => void;
  handleCloseChatPanel: () => void;
  handleToggleLlmPanel: () => void;
  handleCloseLlmStatus: () => void;
  handleCloseAboutModal: () => void;
  handleCloseFeedback: () => void;
  setVideoPlayerUrl: (url: string | null) => void;
  setIsClippingPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsMediaPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsLlmPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsAboutModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setGlobalFeedback: (feedback: { message: string; type: 'success' | 'error' } | null) => void;
  setIsCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setCollapsedPanels: (panels: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setPromptsPageState: (state: PromptsPageState) => void;
  setActiveSettingsTab: (tab: ActiveSettingsTab) => void;
  setActiveSettingsSubTab: (subTab: string) => void;
}

export interface UseAppShellInput {
  handleNavigate: (tab: ActiveTab) => void;
}

/**
 * Manages all shell/layout state: panel toggles, active tab, clipped ideas,
 * global feedback, keyboard shortcuts, and cross-component event subscriptions.
 */
export const useAppShell = ({
  handleNavigate,
}: UseAppShellInput): ShellState => {
  const [activeTab, setActiveTab] = useLocalStorage<ActiveTab>('activeTab', 'dashboard');
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isClippingPanelOpen, setIsClippingPanelOpen] = useState(false);
  const [isMediaPanelOpen, setIsMediaPanelOpen] = useState(false);
  const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(false);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [isLlmPanelOpen, setIsLlmPanelOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useLocalStorage<Record<string, boolean>>('collapsedPanels', {});
  const [globalFeedback, setGlobalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [promptsPageState, setPromptsPageState] = useState<PromptsPageState>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useLocalStorage<ActiveSettingsTab>('activeSettingsTab', 'app');
  const [activeSettingsSubTab, setActiveSettingsSubTab] = useLocalStorage<string>('activeSettingsSubTab', 'general');
  const [clippedIdeas, setClippedIdeas] = useLocalStorage<Idea[]>('clippedIdeas', []);
  const [notesCount, setNotesCount] = useState(() => getNotesSync().length);
  const [filesCount, setFilesCount] = useState(0);

  // ── Global feedback ──────────────────────────────────────────────────

  const showGlobalFeedback = useCallback((message: string, isError = false) => {
    setGlobalFeedback({ message, type: isError ? 'error' : 'success' });
  }, []);

  // ── Navigation helpers ───────────────────────────────────────────────

  const handleSendToPromptsPage = useCallback((state: PromptsPageState) => {
    setPromptsPageState(state);

    let targetBar: ActiveTab = 'crafter';
    if (state?.view === 'enhancer') {
      targetBar = 'refiner';
    } else if (state?.view === 'prompt_analyzer') {
      targetBar = 'prompt_analyzer';
    } else if (state?.view === 'composer' || state?.view === 'create') {
      targetBar = 'crafter';
    } else {
      targetBar = 'crafter';
    }

    handleNavigate(targetBar);
    showGlobalFeedback('Sent to Builder!');
  }, [showGlobalFeedback, handleNavigate]);

  const handleSendToEnhancer = useCallback((promptValue: string) => {
    handleSendToPromptsPage({ prompt: promptValue, view: 'enhancer' });
  }, [handleSendToPromptsPage]);

  const handleClearPromptsPageState = useCallback(() => {
    setPromptsPageState(null);
  }, []);

  // ── Clipping & ideas ─────────────────────────────────────────────────

  const handleClipIdea = useCallback((idea: Idea) => {
    setClippedIdeas(prev => [idea, ...prev]);
    showGlobalFeedback(`Clipped "${idea.title}"`);
  }, [setClippedIdeas, showGlobalFeedback]);

  const handleRemoveIdea = useCallback(
    (id: string) => setClippedIdeas(prev => prev.filter(idea => idea.id !== id)),
    [setClippedIdeas],
  );

  const handleClearAllIdeas = useCallback(
    () => setClippedIdeas([]),
    [setClippedIdeas],
  );

  const handleInsertIdea = useCallback((prompt: string) => {
    handleSendToPromptsPage({ prompt, view: 'composer', id: `clip-${Date.now()}` });
    setIsClippingPanelOpen(false);
  }, [handleSendToPromptsPage]);

  const handleRefineIdea = useCallback((promptValue: string) => {
    handleSendToPromptsPage({ prompt: promptValue, view: 'enhancer' });
    setIsClippingPanelOpen(false);
  }, [handleSendToPromptsPage]);

  const handleSaveClippedIdea = useCallback(async (idea: Idea) => {
    try {
      await addSavedPrompt({
        text: idea.prompt,
        title: idea.title,
        tags: [idea.lens],
      });
      showGlobalFeedback(`"${idea.title}" saved.`);
    } catch {
      showGlobalFeedback("Failed to save.", true);
    }
  }, [showGlobalFeedback]);

  // ── Panel toggle handlers ────────────────────────────────────────────

  const handleAboutClick = useCallback(() => setIsAboutModalOpen(true), []);
  const handleToggleClippingPanel = useCallback(() => setIsClippingPanelOpen(prev => !prev), []);
  const handleToggleActivityPanel = useCallback(() => setIsActivityPanelOpen(prev => !prev), []);
  const handleCloseActivityPanel = useCallback(() => setIsActivityPanelOpen(false), []);
  const handleToggleMediaPanel = useCallback(() => setIsMediaPanelOpen(prev => !prev), []);
  const handleCloseMediaPanel = useCallback(() => setIsMediaPanelOpen(false), []);
  const handleCloseVideoPlayer = useCallback(() => setVideoPlayerUrl(null), []);
  const handleToggleChatPanel = useCallback(() => {
    setIsChatPanelOpen(prev => !prev);
  }, []);
  const handleCloseChatPanel = useCallback(() => setIsChatPanelOpen(false), []);
  const handleCloseLlmStatus = useCallback(() => setIsLlmPanelOpen(false), []);
  const handleToggleLlmPanel = useCallback(() => {
    setIsLlmPanelOpen(prev => !prev);
  }, []);
  const handleCloseAboutModal = useCallback(() => {
    setIsAboutModalOpen(false);
  }, []);
  const handleCloseFeedback = useCallback(() => setGlobalFeedback(null), []);

  // ── Notes count refresh ──────────────────────────────────────────────

  useEffect(() => {
    return appEventBus.on('notesChanged', (notes: any[]) => setNotesCount(notes.length));
  }, []);

  // ── Files count refresh ──────────────────────────────────────────────

  useEffect(() => {
    const refresh = async () => {
      try {
        const { fileSystemManager } = await import('../utils/fileUtils');
        if (!fileSystemManager.isDirectorySelected()) { setFilesCount(0); return; }
        let c = 0;
        for await (const h of fileSystemManager.listDirectoryContents('assistant')) {
          if (h.kind === 'file') c++;
        }
        setFilesCount(c);
      } catch { setFilesCount(0); }
    };
    void refresh();
    return appEventBus.on('assistantFilesChanged', () => { void refresh(); });
  }, []);

  return {
    activeTab,
    setActiveTab,
    isAboutModalOpen,
    isClippingPanelOpen,
    isMediaPanelOpen,
    isActivityPanelOpen,
    isChatPanelOpen,
    isLlmPanelOpen,
    isCommandPaletteOpen,
    videoPlayerUrl,
    globalFeedback,
    promptsPageState,
    activeSettingsTab,
    activeSettingsSubTab,
    clippedIdeas,
    notesCount,
    filesCount,
    collapsedPanels,

    showGlobalFeedback,
    handleSendToPromptsPage,
    handleClipIdea,
    handleRemoveIdea,
    handleClearAllIdeas,
    handleInsertIdea,
    handleRefineIdea,
    handleSaveClippedIdea,
    handleSendToEnhancer,
    handleClearPromptsPageState,

    handleAboutClick,
    handleToggleClippingPanel,
    handleToggleActivityPanel,
    handleCloseActivityPanel,
    handleToggleMediaPanel,
    handleCloseMediaPanel,
    handleCloseVideoPlayer,
    handleToggleChatPanel,
    handleCloseChatPanel,
    handleToggleLlmPanel,
    handleCloseLlmStatus,
    handleCloseAboutModal,
    handleCloseFeedback,
    setVideoPlayerUrl,
    setIsClippingPanelOpen,
    setIsMediaPanelOpen,
    setIsCommandPaletteOpen,
    setCollapsedPanels,
    setPromptsPageState,
    setActiveSettingsTab,
    setActiveSettingsSubTab,
    setIsLlmPanelOpen,
    setIsAboutModalOpen,
    setGlobalFeedback,
  };
};
