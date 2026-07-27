import { useState, useRef, useCallback, useEffect } from 'react';
import { gsap } from 'gsap';
import { initNotesStore } from '../utils/notesStorage';
import { initMemoriesStore } from '../utils/memoryStorage';
import { initChatStore } from '../utils/chatStorage';
import type { LLMSettings } from '../types';

export type BootPhase = 'initializing' | 'loading' | 'ready' | 'error';

export interface BootState {
  phase: BootPhase;
  isInitialized: boolean;
  isLoading: boolean;
  showWelcome: boolean;
  initStatus: string;
  initProgress: number | null;
}

export interface UseBootSequenceInput {
  /** Auth context value (stub currently, but used for dependency tracking). */
  auth: unknown;
  /** Current settings — needed to resolve the storage provider at boot. */
  settings: LLMSettings;
  /** Callback to surface a global error to the user. Pass showGlobalFeedback from the app shell. */
  showGlobalFeedback: (message: string, isError?: boolean) => void;
  /** Called after user clicks "Continue" — unlocks the audio context and optionally starts ambient music. */
  startupContinue: (withMusic: boolean) => void;
}

export interface UseBootSequenceReturn {
  bootState: BootState;
  loaderRef: React.RefObject<HTMLDivElement | null>;
  initializeApp: (customSettings?: LLMSettings) => Promise<void>;
  handleInitContinue: (withMusic: boolean) => Promise<void>;
  hasInitializedRef: React.MutableRefObject<boolean>;
}

/**
 * Manages the application boot sequence:
 * 1. Initialize IndexedDB stores
 * 2. Show loader with progress
 * 3. Wait for user to click Continue (unlocks audio)
 * 4. Signal ready
 *
 * Designed to be extracted from App.tsx — no DOM refs beyond the loader div.
 */
export const useBootSequence = ({
  auth,
  settings,
  showGlobalFeedback,
  startupContinue,
}: UseBootSequenceInput): UseBootSequenceReturn => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [initStatus, setInitStatus] = useState('Starting App');
  const [initProgress, setInitProgress] = useState<number | null>(0);

  const hasInitializedRef = useRef(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Read through refs so initializeApp keeps a stable identity — depending on
  // settings directly would re-run the whole boot on every theme switch.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const authRef = useRef(auth);
  authRef.current = auth;

  const initializeApp = useCallback(async (customSettings?: LLMSettings) => {
    if (customSettings) {
      hasInitializedRef.current = false;
    } else if (hasInitializedRef.current) {
      return;
    }
    // Lock immediately so StrictMode double-mount (or any re-render)
    // cannot spawn a second concurrent initialization.
    hasInitializedRef.current = true;

    if (typeof window !== 'undefined' && (window as any).__initLog) {
      (window as any).__initLog('INIT_APP_STARTED');
    }
    setIsLoading(true);
    setShowWelcome(false);
    setInitStatus('Connecting...');
    setInitProgress(0.1);

    const onProgress = (message: string, progress?: number) => {
      const step = `PROGRESS: ${message} (${progress !== undefined ? (progress * 100).toFixed(0) + '%' : 'N/A'})`;
      if (typeof window !== 'undefined' && (window as any).__initLog) {
        (window as any).__initLog(step);
      }
      setInitStatus(message.toUpperCase());
      if (progress !== undefined) setInitProgress(progress);
    };

    try {
      // ── Initialize IndexedDB stores (notes, memories, chat) ──
      await Promise.all([
        initNotesStore(),
        initMemoriesStore(),
        initChatStore(),
      ]);

      // ── Storage gate: without a vault handle (or with permission revoked)
      // there is nothing to boot into, so hand off to OnboardingFlow. This
      // gate was dropped when the hook was extracted from App.tsx — see
      // ISSUE-45. ──
      const activeSettings = customSettings || settingsRef.current;
      const { fileSystemManager } = await import('../utils/fileUtils');
      const hasVaultAccess = await fileSystemManager.initialize(activeSettings, authRef.current as any);
      if (!hasVaultAccess) {
        setShowWelcome(true);
        setIsLoading(false);
        return;
      }

      // ── Reconnect a previously-granted Obsidian vault and make sure the
      // knowledge/{inbox,projects,output,wiki} lifecycle folders exist —
      // best-effort, non-fatal if no vault was ever connected. ──
      try {
        const { initObsidianVault, ensureFolders } = await import('../utils/obsidianStorage');
        if (await initObsidianVault()) {
          const { knowledgeLifecycle } = await import('../services/knowledgeLifecycle');
          const folders = Object.values(knowledgeLifecycle.getAllStageConfigs()).map((c) => c.folder);
          await ensureFolders(folders);
        }
      } catch { /* obsidian vault is optional */ }

      // ── Rebuild the knowledge index so existing memories/notes/vault files
      // are searchable and promotable (knowledge_lifecycle_promote needs them
      // indexed first) — best-effort, non-fatal. ──
      try {
        const { knowledgeService } = await import('../services/knowledgeService');
        await knowledgeService.rebuildIndex();
      } catch { /* non-fatal */ }

      // ── FAST-PATH: skip remaining async I/O for diagnostics ──
      onProgress('System Ready', 1.0);

      // ── Clear diagnostic sessionStorage markers so the reload-detection
      // overlay in index.html does NOT show on the next page load ──
      try {
        sessionStorage.removeItem('_init_last_step');
        sessionStorage.removeItem('_init_reload_count');
      } catch { /* ignore */ }

      // InitialLoader shows its CONTINUE / CONTINUE WITHOUT MUSIC buttons
      // once progress hits 100%, and calls handleInitContinue (which sets
      // isInitialized/isLoading) when the user picks one — don't do that
      // here, or the loader unmounts itself before the buttons are clickable.
    } catch (err) {
      console.error("Initialization Failure:", err);
      hasInitializedRef.current = true;
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined' && (window as any).__initLog) {
        (window as any).__initLog('INIT_CATCH: ' + errorMsg);
      }
      setIsLoading(false);
      showGlobalFeedback(`System error: ${errorMsg}`, true);
    }
    // Removed dependency on settings to prevent re-init on theme switch
    // settings are only needed for initial storage handle check
  }, [showGlobalFeedback]);

  const handleInitContinue = useCallback(async (withMusic: boolean) => {
    // startupContinue handles audio system enable + music toggle logic
    startupContinue(withMusic);

    hasInitializedRef.current = true;
    setIsInitialized(true);

    if (loaderRef.current) {
      gsap.set(loaderRef.current, {
        alpha: 0,
      });
    }

    setIsLoading(false);
  }, [startupContinue]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initializeApp();
    }
  }, [initializeApp]);

  const phase: BootPhase = (() => {
    if (showWelcome) return 'initializing';
    if (isLoading) return 'loading';
    if (isInitialized) return 'ready';
    return 'error';
  })();

  return {
    bootState: {
      phase,
      isInitialized,
      isLoading,
      showWelcome,
      initStatus,
      initProgress,
    },
    loaderRef,
    initializeApp,
    handleInitContinue,
    hasInitializedRef,
  };
};
