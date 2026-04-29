import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import type { ActiveTab } from '../types';
import { audioService } from '../services/audioService';
import { useSettings } from '../contexts/SettingsContext';
import { gsap } from 'gsap';
import { motion } from 'framer-motion';
import RollingText from './RollingText';
import TimedScrambledText from './TimedScrambledText';
import ThemeSwitcher from './ThemeSwitcher';
import ChromaticText from './ChromaticText';
import { InformationCircleIcon, BookmarkIcon, Cog6ToothIcon, PowerIcon, ChatBubbleIcon } from './icons';

interface HeaderProps {
  onNavigate: (tab: ActiveTab) => void;
  activeTab: ActiveTab;
  isInitialized?: boolean;
  onAboutClick: () => void;
  onToggleClippingPanel: () => void;
  onStandbyClick: (e: React.MouseEvent) => void;
  clippedIdeasCount: number;
  onToggleOpenClaw?: () => void;
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

const HUDNavItem: React.FC<{
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: () => void;
  title?: string;
  badge?: number;
}> = ({ children, onClick, onHover, title, badge }) => {
  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => {
        audioService.playHover();
        onHover?.();
      }}
      initial="initial"
      whileHover="hover"
      className="group relative p-2 text-primary no-glow transition-colors duration-300 pointer-events-auto"
      title={title}
    >
      {children}

      {badge !== undefined && badge > 0 && (
        <span className="absolute top-0 right-0 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-none h-2 w-2 bg-primary"></span>
        </span>
      )}
    </motion.button>
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
      className={`px-3 h-full flex items-center font-normal uppercase tracking-widest leading-none transition-all duration-300 whitespace-nowrap overflow-hidden opacity-0 translate-y-[10px] ${isPipboyTheme ? 'font-fixedsys text-[12px]' : 'font-rajdhani text-[12px] font-normal'} ${isCurrent ? 'text-primary no-glow' : 'text-base-content/30 hover:text-primary hover:no-glow'}`}
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
  onToggleOpenClaw,
  onStandbyClick,
  clippedIdeasCount
}) => {
  const { settings } = useSettings();
  const navRef = useRef<HTMLDivElement>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const switchingRef = useRef(false);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const workspaceItems: NavItemData[] = [
    { id: 'crafter' as ActiveTab, label: 'Crafter' },
    { id: 'refiner' as ActiveTab, label: 'Refiner' },
    { id: 'prompt_analyzer' as ActiveTab, label: 'Analyzer' },
    { id: 'media_analyzer' as ActiveTab, label: 'Abstractor' },
  ];

  const vaultItems: NavItemData[] = [
    { id: 'prompt' as ActiveTab, label: 'Prompt' },
    { id: 'gallery' as ActiveTab, label: 'Media' },
  ];

  const guideItems: NavItemData[] = [
    { id: 'cheatsheet' as ActiveTab, label: 'Cheatsheet' },
    { id: 'artstyles' as ActiveTab, label: 'Styles' },
    { id: 'artists' as ActiveTab, label: 'Artists' },
  ];

  const utilityItems: NavItemData[] = [
    { id: 'composer' as ActiveTab, label: 'Composer' },
    { id: 'image_compare' as ActiveTab, label: 'Compare' },
    { id: 'color_palette_extractor' as ActiveTab, label: 'Palette' },
    { id: 'resizer' as ActiveTab, label: 'Resizer' },
    { id: 'video_to_frames' as ActiveTab, label: 'Video' },
  ];

  const navGroups = [
    { id: 'home', label: 'Home', items: [], singleId: 'dashboard' as ActiveTab },
    { id: 'discovery', label: 'Discovery', items: [], singleId: 'discovery' as ActiveTab },
    { id: 'workspaces', label: 'Workspaces', items: workspaceItems },
    { id: 'vault', label: 'Vault', items: vaultItems },
    { id: 'guides', label: 'References', items: guideItems },
    { id: 'utilities', label: 'Utilities', items: utilityItems },
  ];

  // If activeTab changes, but no menu is open, expand the group containing the active tab
  useLayoutEffect(() => {
    if (!activeMenu) {
      const activeGroup = navGroups.find(g =>
        (g.items && g.items.some(item => item.id === activeTab)) ||
        (g.singleId === activeTab)
      );
      if (activeGroup && !activeGroup.singleId) {
        setActiveMenu(activeGroup.id);
      }
    }
  }, [activeTab]);

  const isGroupCurrent = (groupId: string) => {
    const group = navGroups.find(g => g.id === groupId);
    return group?.items.some(item => item.id === activeTab);
  };

  // Removed internal entry animation as it is now coordinated from App.tsx
  useLayoutEffect(() => {
    if (!isInitialized || !navRef.current) return;

    // Set initial state to visible as parent handles the slide
    const navItems = navRef.current.querySelectorAll('.parent-nav-item');
    const separators = navRef.current.querySelectorAll('.nav-separator');
    gsap.set([navItems, separators], { y: 0, autoAlpha: 1 });
  }, [isInitialized]);

  // Handle Container sliding via GSAP
  useLayoutEffect(() => {
    navGroups.forEach(group => {
      const container = containerRefs.current[group.id];
      if (!container) return;

      if (activeMenu === group.id) {
        gsap.to(container, {
          width: 'auto',
          opacity: 1,
          duration: 0.6,
          ease: "power2.out",
          overwrite: true
        });
      } else {
        // Delay container slide until letters have started sliding down
        gsap.to(container, {
          width: 0,
          opacity: 0,
          duration: 0.5,
          delay: 0.3,
          ease: "power2.inOut",
          overwrite: true
        });
      }
    });
  }, [activeMenu]);

  const handleParentClick = useCallback((group: typeof navGroups[0]) => {
    if (switchingRef.current) return;

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

    if (activeMenu) {
      switchingRef.current = true;
      audioService.playSlide();
      setActiveMenu(null);
      setTimeout(() => {
        setActiveMenu(group.id);
        audioService.playSlide();
        switchingRef.current = false;
      }, 900);
    } else {
      setActiveMenu(group.id);
      audioService.playSlide();
    }
  }, [activeMenu, onNavigate]);

  return (
    <header className="flex-shrink-0 flex flex-col h-12 bg-base-200/20 backdrop-blur-md border-b border-base-content/10 z-50 relative">
      <div ref={navRef} className="flex flex-grow items-center relative z-50 px-6 gap-4">

        {/* Left Side Logo */}
        <Logo onNavigate={onNavigate} />

        <div className="w-px h-6 bg-base-content/10 mx-2" />

        {/* Menu Items (Left Aligned) */}
        <div className="flex items-center gap-0">
          {navGroups.map((group, groupIdx) => {
            const isExpanded = activeMenu === group.id;
            const isCurrent = isGroupCurrent(group.id);
            const isPipboyTheme = settings.darkTheme === 'pipboy';

            return (
              <React.Fragment key={group.id}>
                <div className="flex items-center gap-0">
                  <button
                    onClick={() => handleParentClick(group)}
                    onMouseEnter={() => audioService.playHover()}
                    className={`parent-nav-item font-normal uppercase tracking-widest relative z-10 px-3 h-full flex items-center leading-none transition-all duration-500 hover:text-primary hover:no-glow ${isPipboyTheme ? 'font-fixedsys text-[12px]' : 'font-rajdhani text-[12px] font-normal'} ${isExpanded || isCurrent || (group.singleId === activeTab) ? 'text-base-content no-glow' : 'text-base-content/30'}`}
                  >
                    <RollingText text={group.label} hoverClassName="text-primary" />
                  </button>

                  <div
                    ref={el => { if (el) containerRefs.current[group.id] = el; }}
                    className="overflow-hidden opacity-0 w-0 flex items-center bg-transparent h-full pointer-events-auto"
                  >
                    <div className="flex items-center px-0 h-full gap-0">
                      {group.items.filter(item => item.enabled !== false).map((item) => (
                        <NavItem
                          key={item.id}
                          label={item.label}
                          isActive={activeMenu === group.id}
                          isCurrent={activeTab === item.id}
                          onClick={() => onNavigate(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {groupIdx < navGroups.length - 1 && (
                  <div className="nav-separator nav-separator-line w-[1px] h-3 opacity-30 mx-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Side Controls */}
        <div className="ml-auto flex gap-1 items-center">
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
          <HUDNavItem
            onClick={(e) => {
              e.stopPropagation();
              audioService.playClick();
              onToggleOpenClaw?.();
            }}
            title="Chat"
          >
            <ChatBubbleIcon className="w-4 h-4" />
          </HUDNavItem>
          <div className="w-px h-2 bg-base-content/10 self-center" />
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
    </header>
  );
};


export default Header;

