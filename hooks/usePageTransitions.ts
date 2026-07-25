import { useState, useRef, useCallback } from 'react';
import { useTransitionDirector } from '../components/transitions/useTransitionDirector';
import type { TransitionOverlayHandle } from '../components/transitions/TransitionOverlay';
import type { FxKind } from '../components/transitions/routeFx';
import type { ActiveTab } from '../types';

interface UsePageTransitionsInput {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  transitionOverlayHandleRef: React.RefObject<TransitionOverlayHandle | null>;
}

interface UsePageTransitionsReturn {
  pageFxKind: FxKind;
  handleNavigate: (tab: ActiveTab) => void;
}

/**
 * Orchestrates the "Context Shift" page transition engine.
 * Wraps useTransitionDirector and exposes a handleNavigate function
 * that exercises the overlay animation + SFX before committing the tab.
 */
export const usePageTransitions = ({
  activeTab,
  setActiveTab,
  contentRef,
  transitionOverlayHandleRef,
}: UsePageTransitionsInput): UsePageTransitionsReturn => {
  const [pageFxKind, setPageFxKind] = useState<FxKind>('module-boot');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const { navigate: directorNavigate } = useTransitionDirector({
    overlayRef: transitionOverlayHandleRef,
    contentRef,
    getActiveTab: () => activeTabRef.current,
    commit: (tag, kind) => {
      setPageFxKind(kind);
      setActiveTab(tag);
    },
  });

  const handleNavigate = useCallback((tab: ActiveTab) => {
    directorNavigate(tab);
  }, [directorNavigate]);

  return { pageFxKind, handleNavigate };
};
