import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import type { ActiveTab } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { audioService } from '../services/audioService';
import {
  HomeIcon, SparklesIcon,
  PromptIcon, PhotoIcon,
  PaletteIcon, LayoutDashboardIcon, CropIcon, FilmIcon, ViewColumnsIcon,
  BookOpenIcon, UsersIcon, ThumbTackIcon, CloseIcon
} from './icons';

interface SidebarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  isSidebarOpen: boolean;
  isPinned: boolean;
  setIsPinned: (isPinned: boolean | ((isPinned: boolean) => boolean)) => void;
  onClose: () => void;
}

const ScrambleLetter: React.FC<{ char: string; isHovered: boolean }> = ({ char, isHovered }) => {
    const [displayChar, setDisplayChar] = useState(char);
    const [opacity, setOpacity] = useState(1);
    const symbols = '01_[]{}//\\*^!#%&?X+$@';
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (isHovered) {
            let iteration = 0;
            const maxIterations = 8 + Math.floor(Math.random() * 6);
            
            if (timerRef.current) window.clearInterval(timerRef.current);
            
            timerRef.current = window.setInterval(() => {
                const isFinalStretch = iteration > maxIterations * 0.7;
                const shouldShowCorrect = isFinalStretch && Math.random() > 0.5;

                if (shouldShowCorrect || iteration >= maxIterations) {
                    setDisplayChar(char);
                    setOpacity(1);
                    window.clearInterval(timerRef.current!);
                } else {
                    setDisplayChar(symbols[Math.floor(Math.random() * symbols.length)]);
                    setOpacity(0.25 + Math.random() * 0.5);
                }
                
                iteration++;
            }, 30 + Math.random() * 30);
        } else {
            if (timerRef.current) window.clearInterval(timerRef.current);
            setDisplayChar(char);
            setOpacity(1);
        }
        return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    }, [isHovered, char]);

    return (
        <span 
            className="inline-block transition-all duration-200 ease-out"
            style={{ opacity, filter: opacity < 1 ? 'blur(0.3px)' : 'none' }}
        >
            {displayChar === ' ' ? '\u00A0' : displayChar}
        </span>
    );
};

const ScrambledText: React.FC<{ text: string; isHovered: boolean }> = ({ text, isHovered }) => {
    return (
        <span className={`inline-flex transition-colors duration-400 ${isHovered ? 'font-mono text-primary' : 'font-display'}`}>
            {text.split('').map((char, idx) => (
                <ScrambleLetter key={`${text}-${idx}`} char={char} isHovered={isHovered} />
            ))}
        </span>
    );
};

const NavItem: React.FC<{
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  activeTab: ActiveTab;
  onClick: (tab: ActiveTab) => void;
  registerRef: (id: ActiveTab, el: HTMLAnchorElement | null) => void;
}> = ({ id, label, icon, activeTab, onClick, registerRef }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <li>
            <a
              ref={(el) => registerRef(id, el)}
              onClick={() => onClick(id)}
              onMouseEnter={() => {
                setIsHovered(true);
                audioService.playHover();
              }}
              onMouseLeave={() => setIsHovered(false)}
              className={`flex items-center py-1.5 px-3 text-base font-medium transition-colors cursor-pointer relative z-10 ${
                activeTab === id
                  ? 'text-primary'
                  : isHovered
                    ? 'text-base-content'
                    : 'text-base-content/70'
              }`}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <div className="mr-3">{icon}</div>
              <span className="uppercase text-[10px] font-black tracking-widest min-w-0 inline-block overflow-hidden">
                <ScrambledText text={label} isHovered={isHovered} />
              </span>
            </a>
        </li>
    );
};

const Section: React.FC<{ title: string, children: React.ReactNode, action?: React.ReactNode }> = ({ title, children, action }) => (
    <div className="mb-3">
        <div className="flex items-center justify-between px-3 pb-1.5">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30">
                {title}
            </h2>
            {action}
        </div>
        <ul className="menu menu-sm p-0 gap-px relative">
            {children}
        </ul>
    </div>
);


const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate, isSidebarOpen, isPinned, setIsPinned, onClose }) => {
    const { settings } = useSettings();
    const { features } = settings;
    const sidebarRef = useRef<HTMLElement>(null);
    const navRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
    const isFirstRender = useRef(true);

    const registerRef = (id: ActiveTab, el: HTMLAnchorElement | null) => {
        navRefs.current[id] = el;
    };

    useLayoutEffect(() => {
        if (!sidebarRef.current) return;
        
        if (isFirstRender.current) {
            isFirstRender.current = false;
            if (isSidebarOpen) {
                gsap.set(sidebarRef.current, { x: 0, marginLeft: 0, width: 320, opacity: 1, visibility: 'visible' });
            } else {
                gsap.set(sidebarRef.current, { 
                    x: isPinned ? 0 : '-100%', 
                    marginLeft: isPinned ? -320 : 0, 
                    width: isPinned ? 0 : 320, 
                    opacity: 0, 
                    visibility: 'hidden' 
                });
            }
            return;
        }

        gsap.killTweensOf(sidebarRef.current);
        
        if (isSidebarOpen) {
            if (isPinned) {
                gsap.to(sidebarRef.current, {
                    marginLeft: 0,
                    width: 320,
                    x: 0,
                    duration: 0.4,
                    ease: "power3.out",
                    visibility: 'visible',
                    opacity: 1
                });
            } else {
                gsap.to(sidebarRef.current, {
                    x: 0,
                    duration: 1.2,
                    ease: "elastic.out(1, 0.75)",
                    visibility: 'visible',
                    pointerEvents: 'auto',
                    opacity: 1,
                    // Reset pinned properties
                    marginLeft: 0,
                    width: 320
                });
            }
        } else {
            if (isPinned) {
                gsap.to(sidebarRef.current, {
                    marginLeft: -320,
                    width: 0,
                    x: 0,
                    duration: 0.3,
                    ease: "power3.inOut",
                    opacity: 0,
                    onComplete: () => {
                        if (sidebarRef.current && !isSidebarOpen) {
                            sidebarRef.current.style.visibility = 'hidden';
                        }
                    }
                });
            } else {
                gsap.to(sidebarRef.current, {
                    x: '-100%',
                    duration: 0.8,
                    ease: "elastic.in(1, 0.75)",
                    pointerEvents: 'none',
                    opacity: 0,
                    onComplete: () => {
                        if (sidebarRef.current && !isSidebarOpen) {
                            sidebarRef.current.style.visibility = 'hidden';
                        }
                    }
                });
            }
        }
    }, [isSidebarOpen, isPinned]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!isPinned && isSidebarOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (!isPinned && isSidebarOpen && typeof document !== 'undefined') {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('mousedown', handleClickOutside);
            }
        };
    }, [isSidebarOpen, isPinned, onClose]);

  const sidebarClasses = [
    "text-base-content z-[600] flex flex-col overflow-hidden flex-shrink-0",
    isPinned 
      ? "h-full bg-transparent relative transition-all duration-300" 
      : "fixed top-0 left-0 bottom-0 bg-base-100/40 backdrop-blur-xl border-r border-base-300/20 shadow-none -translate-x-full"
  ].join(" ");

  return (
    <aside
      ref={sidebarRef}
      className={sidebarClasses}
      style={{ visibility: 'hidden' }}
      aria-label="Main Navigation"
    >
      {/* Technical Background Details */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 blur-2xl rounded-full -ml-12 -mb-12 pointer-events-none"></div>
      

      <nav className="flex-grow px-4 py-4 overflow-y-auto relative scroll-smooth custom-scrollbar flex flex-col">
        
        <Section 
            title="Overview"
            action={
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsPinned(p => !p)}
                        onMouseEnter={() => audioService.playHover()}
                        className="btn btn-ghost btn-circle btn-xs hidden lg:inline-flex opacity-40 hover:opacity-100"
                        title={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}
                    >
                        <ThumbTackIcon className={`w-3 h-3 transition-all duration-300 ease-out ${isPinned ? 'text-primary -rotate-45' : 'text-base-content/20 rotate-0'}`} />
                    </button>
                    {!isPinned && (
                        <button
                            onClick={() => {
                                audioService.playClick();
                                onClose();
                            }}
                            onMouseEnter={() => audioService.playHover()}
                            className="btn btn-ghost btn-circle btn-xs opacity-40 hover:opacity-100"
                            aria-label="Close sidebar"
                        >
                            <CloseIcon className="w-3 h-3" />
                        </button>
                    )}
                </div>
            }
        >
             <NavItem id="dashboard" label="Home" icon={<HomeIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
        </Section>
        
        <Section title="Workspace">
            <NavItem id="prompts" label="Prompt Builder" icon={<SparklesIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            {features.isPromptLibraryEnabled && <NavItem id="prompt" label="Prompt Library" icon={<PromptIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />}
            {features.isGalleryEnabled && <NavItem id="gallery" label="Image Library" icon={<PhotoIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />}
        </Section>

        {features.isCheatsheetsEnabled && (
            <Section title="Guides">
                <NavItem id="cheatsheet" label="Guides" icon={<BookOpenIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="artstyles" label="Art Styles" icon={<PaletteIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="artists" label="Artists" icon={<UsersIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            </Section>
        )}

         {features.isToolsEnabled && (
            <Section title="Utilities">
                <NavItem id="composer" label="Builder" icon={<LayoutDashboardIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="image_compare" label="Compare" icon={<ViewColumnsIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="color_palette_extractor" label="Palette" icon={<PaletteIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="resizer" label="Resizer" icon={<CropIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="video_to_frames" label="Video" icon={<FilmIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            </Section>
        )}

        <div className="mt-auto pt-4 border-t border-base-300/20">
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;