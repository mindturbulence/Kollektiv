import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import type { ActiveTab } from '../types';
import { audioService } from '../services/audioService';
import { useSettings } from '../contexts/SettingsContext';
import { gsap } from 'gsap';
import RollingText from './RollingText';
import TimedScrambledText from './TimedScrambledText';
import ThemeSwitcher from './ThemeSwitcher';
import ChromaticText from './ChromaticText';
import { InformationCircleIcon, BookmarkIcon, Cog6ToothIcon, PowerIcon, ChatBubbleIcon, FilmIcon, TerminalIcon } from './icons';
import { HUDNavItem } from './HUDNavItem';
import { LiveAssistantMicButton, LiveAssistantScreenButton, LiveAssistantControlButton, LiveAssistantCameraButton, LiveAssistantCameraPreview, LiveAssistantFault } from './LiveAssistantBar';

interface HeaderProps {
  onNavigate: (tab: ActiveTab) => void;
  activeTab: ActiveTab;
  isInitialized?: boolean;
  onAboutClick: () => void;
  onToggleClippingPanel: () => void;
  onToggleMediaPanel?: () => void;
  onToggleWebViewer?: () => void;
  onToggleActivityPanel?: () => void;
  onStandbyClick: (e: React.MouseEvent) => void;
  clippedIdeasCount: number;
  onToggleChatPanel?: () => void;
  onOpenCommandPalette?: () => void;
}

interface NavItemData {
  id: ActiveTab;
  label: string;
  enabled?: boolean;
}

const Logo: React.FC<{ onNavigate: (tab: ActiveTab) => void }> = ({ onNavigate }) => {
  const [scrambleTrigger, setScrambleTrigger] = useState(0);
  const { settings } = useSettings();
  const isIsacTheme = settings.darkTheme === 'isac';
  const isPipboyTheme = settings.darkTheme === 'pipboy';

  return (
    <button
      onClick={() => {
        audioService.playClick();
        onNavigate('dashboard');
      }}
      onMouseEnter={() => {
        audioService.playHover();
        setScrambleTrigger(prev => prev + 1);
      }}
      className="flex items-center justify-center gap-2 group pointer-events-auto w-[180px]"
    >
      <h1 className={`text-xl font-normal tracking-widest text-base-content uppercase flex items-center leading-none translate-y-[2px] ${isIsacTheme ? 'font-prime-light' : isPipboyTheme ? 'font-monofonto' : 'font-monoton'}`}>
        <ChromaticText>
          <TimedScrambledText text="Kollektiv" intervalMs={300000} trigger={scrambleTrigger} />
        </ChromaticText>
        <span className="text-primary italic animate-pulse drop-shadow-[0_0_10px_oklch(var(--p))] transition-all inline-block ml-0.5 font-black">.</span>
      </h1>
    </button>
  );
};

const NavItem: React.FC<{
  label: string;
  onClick: () => void;
  isActive: boolean;
  isCurrent: boolean;
}> = ({ label, onClick, isActive, isCurrent }) => {
  const containerRef = useRef<HTMLButtonElement>(null);
  const { settings } = useSettings();
  const isPipboyTheme = settings.darkTheme === 'pipboy';

  useLayoutEffect(() => {
    // Collect all elements from RollingText children if we want to animate entry with GSAP
    // But since RollingText uses framer-motion, it might be better to let it handle it's own visibility
    // Or just fade it in. The previous implementation used splitText for entry.

    if (isActive) {
      gsap.to(containerRef.current, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: "expo.out",
        overwrite: true
      });
    } else {
      gsap.to(containerRef.current, {
        opacity: 0,
        y: 10,
        duration: 0.3,
        ease: "expo.in",
        overwrite: true
      });
    }
  }, [isActive]);

  return (
    <button
      ref={containerRef}
      role="menuitem"
      onMouseEnter={() => audioService.playHover()}
      onClick={(e) => {
        e.stopPropagation();
        audioService.playClick();
        onClick();
      }}
      className={`px-3 h-full flex items-center font-normal uppercase tracking-widest leading-none transition-all duration-300 whitespace-nowrap overflow-hidden opacity-0 translate-y-[10px] ${isPipboyTheme ? 'font-fixedsys text-xs' : 'font-rajdhani text-xs font-normal'} ${isCurrent ? 'text-primary no-glow is-active' : 'text-base-content/60 hover:text-primary hover:no-glow'}`}
    >
      <RollingText text={label} hoverClassName="text-primary" />
    </button>
  );
};

const Header: React.FC<HeaderProps> = ({
  onNavigate,
  activeTab,
  isInitialized,
  onAboutClick,
  onToggleClippingPanel,
  onToggleMediaPanel,
  onToggleActivityPanel,
  onToggleChatPanel,
  onStandbyClick,
  clippedIdeasCount,
  onOpenCommandPalette
}) => {
  const { settings } = useSettings();
  // `prompts` renders the Crafter composer, so it lights up Crafter in the nav.
  const navTab: ActiveTab = activeTab === 'prompts' ? 'crafter' : activeTab;
  const navRef = useRef<HTMLDivElement>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const workspaceItems = React.useMemo<NavItemData[]>(() => [
    { id: 'crafter' as ActiveTab, label: 'Crafter' },
    { id: 'refiner' as ActiveTab, label: 'Refiner' },
    { id: 'prompt_analyzer' as ActiveTab, label: 'Analyzer' },
    { id: 'media_analyzer' as ActiveTab, label: 'Abstractor' },
    { id: 'batch_runner', label: 'Batch' },
  ], []);

  const vaultItems = React.useMemo<NavItemData[]>(() => [
    { id: 'prompt' as ActiveTab, label: 'Prompt' },
    { id: 'gallery' as ActiveTab, label: 'Media' },
  ], []);

  const utilityItems = React.useMemo<NavItemData[]>(() => [
    { id: 'assets_manager' as ActiveTab, label: 'Assets' },
    { id: 'color_palette_extractor' as ActiveTab, label: 'Palette' },
    { id: 'resizer' as ActiveTab, label: 'Resizer' },
    { id: 'converter' as ActiveTab, label: 'Converter' },
    { id: 'video_to_frames' as ActiveTab, label: 'Video' },
  ], []);

  const studioItems = React.useMemo<NavItemData[]>(() => [
    { id: 'image_editor' as ActiveTab, label: 'Image Editor' },
    { id: 'composer' as ActiveTab, label: 'Composer' },
    { id: 'image_compare' as ActiveTab, label: 'Compare' },
    { id: 'lora_editor' as ActiveTab, label: 'LoRA Editor' },
    { id: 'comfy_studio' as ActiveTab, label: 'ComfyUI' },
    { id: 'a1111_studio' as ActiveTab, label: 'A1111' },
  ], []);

  const navGroups = React.useMemo(() => [
    { id: 'home', label: 'Home', items: [], singleId: 'dashboard' as ActiveTab },
    { id: 'discovery', label: 'Discovery', items: [], singleId: 'discovery' as ActiveTab },
    { id: 'workspaces', label: 'Workbench', items: workspaceItems },
    { id: 'vault', label: 'Vault', items: vaultItems },
    { id: 'utilities', label: 'Utilities', items: utilityItems },
    { id: 'studio', label: 'Studio', items: studioItems },
  ], [workspaceItems, vaultItems, utilityItems, studioItems]);

  // Auto-expand the group containing the active tab — but only when the tab
  // CHANGES (motion review #3). The old effect also ran when activeMenu was
  // nulled by handleParentClick: at that moment activeTab still pointed at the
  // PREVIOUS page (the transition commits ~0.5s later), so the old group
  // reopened immediately on the way out and then never re-synced after the
  // commit. Gating on an actual tab change fixes both.
  const prevTabRef = React.useRef<ActiveTab | null>(null);
  useLayoutEffect(() => {
    const prevTab = prevTabRef.current;
    prevTabRef.current = navTab;
    if (prevTab === navTab) return; // same tab — activeMenu flip, not a navigation
    if (activeMenu) return;            // the user has a menu open — don't fight them
    const activeGroup = navGroups.find(g =>
      (g.items && g.items.some(item => item.id === navTab)) ||
      (g.singleId === navTab)
    );
    if (activeGroup && !activeGroup.singleId) {
      setActiveMenu(activeGroup.id);
    }
  }, [navTab, activeMenu, navGroups]);

  const isGroupCurrent = (groupId: string) => {
    const group = navGroups.find(g => g.id === groupId);
    return group?.items.some(item => item.id === navTab);
  };

  // Removed internal entry animation as it is now coordinated from App.tsx
  useLayoutEffect(() => {
    if (!isInitialized || !navRef.current) return;

    // Set initial state to visible as parent handles the slide
    const navItems = navRef.current.querySelectorAll('.parent-nav-item');
    const separators = navRef.current.querySelectorAll('.nav-separator');
    gsap.set([navItems, separators], { y: 0, autoAlpha: 1 });
  }, [isInitialized]);

  // Submenu rows are stacked absolutely under the header, so switching groups
  // is a crossfade: no width animation, no layout reflow.
  useLayoutEffect(() => {
    navGroups.forEach(group => {
      const container = containerRefs.current[group.id];
      if (!container) return;

      if (activeMenu === group.id) {
        gsap.to(container, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out",
          overwrite: true
        });
      } else {
        // Delay the row fade until the letters have started sliding down
        gsap.to(container, {
          opacity: 0,
          y: -4,
          duration: 0.3,
          delay: 0.3,
          ease: "power2.inOut",
          overwrite: true
        });
      }
    });
  }, [activeMenu, navGroups]);

  // Below xl the icon cluster collapses into a "…" popover.
  const [iconsOpen, setIconsOpen] = useState(false);
  const iconsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!iconsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!iconsRef.current?.contains(e.target as Node)) setIconsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIconsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [iconsOpen]);

  const handleParentClick = useCallback((group: typeof navGroups[0]) => {
    audioService.playClick();

    if (group.singleId) {
      if (activeMenu) audioService.playSlide();
      onNavigate(group.singleId);
      setActiveMenu(null);
      return;
    }

    if (activeMenu === group.id) {
      audioService.playSlide();
      setActiveMenu(null);
      return;
    }

    setActiveMenu(group.id);
    audioService.playSlide();
  }, [activeMenu, onNavigate]);

  return (
    <header className="flex-shrink-0 h-12 bg-base-200/20 backdrop-blur-md border-b border-base-content/10 z-50 relative">
      <div ref={navRef} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center h-full relative z-50 px-6 gap-4">

        {/* Left Side Logo */}
        <div className="flex items-center shrink-0 h-full">
          <Logo onNavigate={onNavigate} />
          <div className="w-px h-6 bg-base-content/10 mx-2" />
        </div>

        {/* Menu Items (Left Aligned) */}
        <div className="flex items-center gap-0 h-full min-w-0 overflow-hidden">
          {navGroups.map((group, groupIdx) => {
            const isExpanded = activeMenu === group.id;
            const isCurrent = isGroupCurrent(group.id);
            const isPipboyTheme = settings.darkTheme === 'pipboy';

            return (
              <React.Fragment key={group.id}>
                <button
                  onClick={() => handleParentClick(group)}
                  onMouseEnter={() => audioService.playHover()}
                  aria-expanded={group.singleId ? undefined : isExpanded}
                  className={`parent-nav-item shrink-0 whitespace-nowrap font-normal uppercase tracking-widest relative z-10 px-3 h-full flex items-center leading-none transition-all duration-500 hover:text-primary hover:no-glow ${isPipboyTheme ? 'font-fixedsys text-xs' : 'font-rajdhani text-xs font-normal'} ${isExpanded || isCurrent || (group.singleId === activeTab) ? 'text-base-content no-glow is-active' : 'text-base-content/60'}`}
                >
                  <RollingText text={group.label} hoverClassName="text-primary" />
                </button>

                {groupIdx < navGroups.length - 1 && (
                  <div className="nav-separator nav-separator-line shrink-0 w-[1px] h-3 opacity-30 mx-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Side Controls: inline at xl+, a "…" popover below */}
        <div ref={iconsRef} className="shrink-0 flex items-center relative z-[9999] pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              audioService.playClick();
              setIconsOpen(open => !open);
            }}
            onMouseEnter={() => audioService.playHover()}
            aria-label="More controls"
            aria-haspopup="true"
            aria-expanded={iconsOpen}
            className="xl:hidden p-2 text-primary text-base leading-none"
          >
            …
          </button>
          <div className={`${iconsOpen ? 'flex' : 'hidden'} xl:flex gap-1 items-center absolute xl:static top-full right-0 mt-2 xl:mt-0 p-1 xl:p-0 bg-base-200 xl:bg-transparent border border-base-content/10 xl:border-0 shadow-xl xl:shadow-none`}>
            {onOpenCommandPalette && (
              <>
                <HUDNavItem
                  onClick={(e) => {
                    e.stopPropagation();
                    audioService.playClick();
                    setIconsOpen(false);
                    onOpenCommandPalette();
                  }}
                  title="Command palette (Ctrl+K)"
                >
                  <kbd className="font-rajdhani text-[10px] leading-none tracking-widest uppercase border border-primary/40 px-1 py-0.5">Ctrl K</kbd>
                </HUDNavItem>
                <div className="w-px h-2 bg-base-content/10 self-center" />
              </>
            )}
            <LiveAssistantScreenButton />
            <LiveAssistantCameraButton />
            <LiveAssistantControlButton />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onAboutClick();
              }}
              title="About"
            >
              <InformationCircleIcon className="w-4 h-4" />
            </HUDNavItem>
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <LiveAssistantMicButton />
            <LiveAssistantFault hidden={activeTab === 'assistant'} />
            <LiveAssistantCameraPreview hidden={activeTab === 'assistant'} />
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();                    onToggleChatPanel?.();
                  }}
                              title="Chat"
                            >
                              <ChatBubbleIcon className="w-4 h-4" />
                            </HUDNavItem>
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onToggleMediaPanel?.();
              }}
              title="Media Player"
            >
              <FilmIcon className="w-4 h-4" />
            </HUDNavItem>
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onToggleActivityPanel?.();
              }}
              title="Activity & Transcript"
            >
              <TerminalIcon className="w-4 h-4" />
            </HUDNavItem>
  
            <ThemeSwitcher />
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onToggleClippingPanel();
              }}
              badge={clippedIdeasCount}
              title="Clipboard"
            >
              <BookmarkIcon className="w-4 h-4" />
            </HUDNavItem>
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onNavigate('settings' as ActiveTab);
              }}
              title="Settings"
            >
              <Cog6ToothIcon className="w-4 h-4" />
            </HUDNavItem>
            <div className="w-px h-2 bg-base-content/10 self-center" />
            <HUDNavItem
              onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onStandbyClick(e);
              }}
              title="Standby"
            >
              <PowerIcon className="w-4 h-4" />
            </HUDNavItem>
          </div>
        </div>
      </div>

      {/* Submenu rows overlay below the header bar, stacked so switching
          groups crossfades instead of reflowing the header width. */}
      <div className="absolute top-full left-0 right-0 h-9 z-40 pointer-events-none">
        {navGroups.filter(group => group.items.length > 0).map(group => {
          const isExpanded = activeMenu === group.id;
          return (
            <div
              key={group.id}
              ref={el => { if (el) containerRefs.current[group.id] = el; }}
              className={`absolute inset-0 flex items-center px-6 opacity-0 bg-base-200/95 border-b border-base-content/10 ${isExpanded ? 'pointer-events-auto' : ''}`}
              // Collapsed groups are only visually hidden (GSAP opacity), so
              // take them out of the tab order and a11y tree too.
              inert={!isExpanded}
            >
              {group.items.filter(item => item.enabled !== false).map((item) => (
                <NavItem
                  key={item.id}
                  label={item.label}
                  isActive={isExpanded}
                  isCurrent={navTab === item.id}
                  onClick={() => onNavigate(item.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </header>
  );
};


export default Header;

