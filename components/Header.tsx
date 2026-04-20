import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import type { ActiveTab } from '../types';
import { audioService } from '../services/audioService';
import { useSettings } from '../contexts/SettingsContext';
import { gsap } from 'gsap';
import RollingText from './RollingText';

interface HeaderProps {
  onNavigate: (tab: ActiveTab) => void;
  activeTab: ActiveTab;
  isInitialized?: boolean;
}

interface NavItemData {
  id: ActiveTab;
  label: string;
  enabled?: boolean;
}

const NavItem: React.FC<{
  label: string;
  onClick: () => void;
  isActive: boolean;
  isCurrent: boolean;
}> = ({ label, onClick, isActive, isCurrent }) => {
  const containerRef = useRef<HTMLButtonElement>(null);

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
      className={`px-3 h-full flex items-center text-[13px] font-normal uppercase tracking-[0.25em] transition-all duration-300 whitespace-nowrap overflow-hidden opacity-0 translate-y-[10px] ${isCurrent ? 'text-primary font-bold' : 'text-base-content/30 hover:text-primary'}`}
    >
      <RollingText text={label} hoverClassName="text-primary" />
    </button>
  );
};

const Header: React.FC<HeaderProps> = ({ onNavigate, activeTab, isInitialized }) => {
  const { settings } = useSettings();
  const { features } = settings;
  const navRef = useRef<HTMLDivElement>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const switchingRef = useRef(false);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const workspaceItems: NavItemData[] = [
    { id: 'prompts' as ActiveTab, label: 'Builder' },
    { id: 'prompt' as ActiveTab, label: 'Library', enabled: features.isPromptLibraryEnabled },
    { id: 'gallery' as ActiveTab, label: 'Vault', enabled: features.isGalleryEnabled },
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
    { id: 'workspaces', label: 'Workspaces', items: workspaceItems },
    { id: 'guides', label: 'References', items: guideItems },
    { id: 'utilities', label: 'Utilities', items: utilityItems },
  ];

  // If activeTab changes, but no menu is open, expand the group containing the active tab
  useLayoutEffect(() => {
    if (!activeMenu) {
      const activeGroup = navGroups.find(g => g.items.some(item => item.id === activeTab));
      if (activeGroup) {
        setActiveMenu(activeGroup.id);
      }
    }
  }, [activeTab]);

  const isGroupCurrent = (groupId: string) => {
    const group = navGroups.find(g => g.id === groupId);
    return group?.items.some(item => item.id === activeTab);
  };

  useLayoutEffect(() => {
    if (!isInitialized || !navRef.current) return;

    const navItems = navRef.current.querySelectorAll('.parent-nav-item');
    const separators = navRef.current.querySelectorAll('.nav-separator');
    
    gsap.set([navItems, separators], { y: -20, autoAlpha: 0 });

    gsap.to([navItems, separators], {
      y: 0,
      autoAlpha: 1,
      duration: 1.2,
      delay: 0.5,
      stagger: 0.05,
      ease: "power3.out"
    });

    return () => {
      gsap.killTweensOf([navItems, separators]);
    };
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

  const handleParentClick = useCallback((menuId: string) => {
    if (switchingRef.current) return;
    
    if (activeMenu === menuId) {
      setActiveMenu(null);
      return;
    }

    if (activeMenu) {
      switchingRef.current = true;
      setActiveMenu(null);
      setTimeout(() => {
        setActiveMenu(menuId);
        switchingRef.current = false;
      }, 900); 
    } else {
      setActiveMenu(menuId);
    }
    audioService.playClick();
  }, [activeMenu]);

  return (
    <header className="flex-shrink-0 flex flex-col h-12 bg-transparent z-50 relative">
      <div ref={navRef} className="flex flex-grow justify-center items-center relative z-50 px-8 gap-1">
                <div className="absolute top-1/2 left-0 right-0 h-px nav-line-middle -translate-y-1/2 z-0 pointer-events-none" />
        
        {navGroups.map((group, groupIdx) => {
          const isExpanded = activeMenu === group.id;
          const isCurrent = isGroupCurrent(group.id);
          
          return (
            <React.Fragment key={group.id}>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleParentClick(group.id)}
                  className={`parent-nav-item relative z-10 px-3 h-full flex items-center text-[13px] font-normal uppercase tracking-[0.25em] leading-none transition-all duration-500 hover:text-primary ${isExpanded || isCurrent ? 'text-base-content font-bold' : 'text-base-content/30'}`}
                >
                  <RollingText text={group.label} hoverClassName="text-primary" />
                </button>

                {/* GSAP Managed Child Container */}
                <div 
                  ref={el => { if (el) containerRefs.current[group.id] = el; }}
                  className="overflow-hidden opacity-0 w-0 flex items-center bg-transparent h-full pointer-events-auto"
                >
                  <div className="flex items-center px-0 h-full gap-1">
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
                <div className="nav-separator nav-separator-line w-[1px] h-3 opacity-30 mx-1" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </header>
  );
};


export default Header;

