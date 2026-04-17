import React, { useState, useRef, useLayoutEffect } from 'react';
import type { ActiveTab } from '../types';
import { audioService } from '../services/audioService';
import { useSettings } from '../contexts/SettingsContext';
import { gsap } from 'gsap';

import { motion, AnimatePresence } from 'framer-motion';
import RollingText from './RollingText';
import { 
  SparklesIcon, PromptIcon, PhotoIcon, 
  BookOpenIcon, PaletteIcon, UsersIcon,
  LayoutDashboardIcon, ViewColumnsIcon, CropIcon, FilmIcon
} from './icons';

interface HeaderProps {
  onNavigate: (tab: ActiveTab) => void;
  isInitialized?: boolean;
}

const DropdownMenu: React.FC<{
  label: string;
  items: { id: ActiveTab; label: string; icon: React.ReactNode; enabled?: boolean }[];
  onNavigate: (tab: ActiveTab) => void;
}> = ({ label, items, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className="relative"
      onMouseEnter={() => {
        audioService.playHover();
        setIsOpen(true);
      }}
      onMouseLeave={() => setIsOpen(false)}
    >
      <motion.button 
        initial="initial"
        whileHover="hover"
        className="flex items-center gap-2 px-4 py-2 text-[13px] font-normal tracking-[0.2em] uppercase text-base-content/60 hover:text-primary transition-colors duration-300"
      >
        <RollingText text={label} hoverClassName="text-primary" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ 
              duration: 0.4, 
              ease: [0.23, 1, 0.32, 1] 
            }}
            className="absolute top-full left-0 mt-1 w-56 bg-base-100/40 backdrop-blur-xl shadow-2xl z-[100] p-2"
          >
            <div className="flex flex-col gap-1">
              {items.filter(item => item.enabled !== false).map((item) => (
                <button
                  key={item.id}
                  onMouseEnter={() => audioService.playHover()}
                  onClick={() => {
                    audioService.playClick();
                    onNavigate(item.id);
                    setIsOpen(false);
                  }}
                  className="flex items-center px-3 py-2 hover:bg-primary/10 text-base-content/70 hover:text-primary transition-all group text-left"
                >
                  <span className="text-[13px] font-normal uppercase tracking-wide">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({ onNavigate, isInitialized }) => {
  const { settings } = useSettings();
  const { features } = settings;
  const navRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isInitialized || !navRef.current) return;

    const navItems = navRef.current.children;
    gsap.set(navItems, { y: -20, autoAlpha: 0 });

    gsap.to(navItems, {
      y: 0,
      autoAlpha: 1,
      duration: 1.2,
      delay: 2.8, // Start slightly after the main HUD elements
      stagger: 0.1,
      ease: "power3.out"
    });

    // Nav Scan Animation - Triggers every 2 minutes
    const scanLine = navRef.current.querySelector('.nav-scan-line');
    if (scanLine) {
      gsap.to(scanLine, {
        left: '120%',
        opacity: 1,
        duration: 3,
        repeat: -1,
        repeatDelay: 117, // 2 minutes (120s total - 3s animation)
        delay: 30, // Start later
        ease: "power1.inOut",
        onRepeat: () => {
          gsap.set(scanLine, { opacity: 1 });
        }
      });
    }

    return () => {
      gsap.killTweensOf(navItems);
      if (scanLine) gsap.killTweensOf(scanLine);
    };
  }, [isInitialized]);

  const workspaceItems = [
    { id: 'prompts' as ActiveTab, label: 'Prompt Builder', icon: <SparklesIcon className="w-4 h-4" /> },
    { id: 'prompt' as ActiveTab, label: 'Prompt Library', icon: <PromptIcon className="w-4 h-4" />, enabled: features.isPromptLibraryEnabled },
    { id: 'gallery' as ActiveTab, label: 'Image Library', icon: <PhotoIcon className="w-4 h-4" />, enabled: features.isGalleryEnabled },
  ];

  const guideItems = [
    { id: 'cheatsheet' as ActiveTab, label: 'Guides', icon: <BookOpenIcon className="w-4 h-4" /> },
    { id: 'artstyles' as ActiveTab, label: 'Art Styles', icon: <PaletteIcon className="w-4 h-4" /> },
    { id: 'artists' as ActiveTab, label: 'Artists', icon: <UsersIcon className="w-4 h-4" /> },
  ];

  const utilityItems = [
    { id: 'composer' as ActiveTab, label: 'Builder', icon: <LayoutDashboardIcon className="w-4 h-4" /> },
    { id: 'image_compare' as ActiveTab, label: 'Compare', icon: <ViewColumnsIcon className="w-4 h-4" /> },
    { id: 'color_palette_extractor' as ActiveTab, label: 'Palette', icon: <PaletteIcon className="w-4 h-4" /> },
    { id: 'resizer' as ActiveTab, label: 'Resizer', icon: <CropIcon className="w-4 h-4" /> },
    { id: 'video_to_frames' as ActiveTab, label: 'Video', icon: <FilmIcon className="w-4 h-4" /> },
  ];

  return (
    <header className="flex-shrink-0 flex flex-col h-12 bg-transparent z-50 relative">
      {/* Bottom row: Navigation */}
      <div ref={navRef} className="flex flex-grow justify-center items-center gap-6 py-3 relative z-50">
        {/* Horizontal System Line - Center-aligned to text */}
        <div className="absolute top-[52%] left-0 right-0 h-px bg-base-content/5 -translate-y-1/2 z-0 pointer-events-none">
          <div className="nav-scan-line absolute inset-y-0 left-[-20%] w-[20%] bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0" />
        </div>
        
        <DropdownMenu label="Workspaces" items={workspaceItems} onNavigate={onNavigate} />
        <div className="w-[1px] h-2 bg-base-content/10"></div>
        <DropdownMenu label="Guides" items={guideItems} onNavigate={onNavigate} />
        <div className="w-[1px] h-2 bg-base-content/10"></div>
        <DropdownMenu label="Utilities" items={utilityItems} onNavigate={onNavigate} />
      </div>
    </header>
  );
};

export default Header;
