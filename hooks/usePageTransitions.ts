import { useRef, useCallback, useEffect } from 'react';
import { useTransitionDirector } from '../components/transitions/useTransitionDirector';
import type { TransitionOverlayHandle } from '../components/transitions/TransitionOverlay';
import type { ActiveTab } from '../types';
import { recordTabVisit } from '../utils/tabHistory';

interface UsePageTransitionsInput {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  transitionOverlayHandleRef: React.RefObject<TransitionOverlayHandle | null>;
}

interface UsePageTransitionsReturn {
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
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Record the persisted tab once on boot so history isn't empty after a reload.
  useEffect(() => {
    recordTabVisit(activeTabRef.current);
  }, []);

  const { navigate: directorNavigate } = useTransitionDirector({
    overlayRef: transitionOverlayHandleRef,
    contentRef,
    getActiveTab: () => activeTabRef.current,
    commit: (tag) => {
      recordTabVisit(tag);
      setActiveTab(tag);
    },
  });

  const handleNavigate = useCallback((tab: ActiveTab) => {
    directorNavigate(tab);
  }, [directorNavigate]);

  return { handleNavigate };
};
