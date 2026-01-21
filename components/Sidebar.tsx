import React, { useRef, useState, useEffect } from 'react';
import type { ActiveTab } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import {
  HomeIcon, Cog6ToothIcon, AppLogoIcon, SparklesIcon,
  PromptIcon, PhotoIcon,
  AdjustmentsVerticalIcon, PaletteIcon, AspectRatioIcon, CropIcon, FilmIcon, ViewColumnsIcon,
  BookOpenIcon, UsersIcon, ThumbTackIcon, InformationCircleIcon
} from './icons';
import LlmStatusSwitcher from './LlmStatusSwitcher';

interface SidebarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  isSidebarOpen: boolean;
  isPinned: boolean;
  setIsPinned: (isPinned: boolean | ((isPinned: boolean) => boolean)) => void;
  onAboutClick: () => void;
}

const NavItem: React.FC<{
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  activeTab: ActiveTab;
  onClick: (tab: ActiveTab) => void;
  registerRef: (id: ActiveTab, el: HTMLAnchorElement | null) => void;
}> = ({ id, label, icon, activeTab, onClick, registerRef }) => (
    <li>
        <a
          ref={(el) => registerRef(id, el)}
          onClick={() => onClick(id)}
          className={`flex items-center p-2.5 rounded-lg text-base font-medium transition-colors cursor-pointer relative z-10 ${
            activeTab === id
              ? 'text-primary-content font-bold'
              : 'text-base-content/70 hover:bg-base-200'
          }`}
          aria-current={activeTab === id ? 'page' : undefined}
        >
          <div className="mr-3">{icon}</div>
          <span className="uppercase text-[10px] font-black tracking-widest">{label}</span>
        </a>
    </li>
);

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-4">
        <h2 className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30">
            {title}
        </h2>
        <ul className="menu menu-sm p-0 gap-0.5 relative">
            {children}
        </ul>
    </div>
);


const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate, isSidebarOpen, isPinned, setIsPinned, onAboutClick }) => {
    const { settings } = useSettings();
    const { features } = settings;
    const navRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
    const [pillStyle, setPillStyle] = useState<React.CSSProperties>({ display: 'none' });

    const registerRef = (id: ActiveTab, el: HTMLAnchorElement | null) => {
        navRefs.current[id] = el;
    };

    useEffect(() => {
        const activeEl = navRefs.current[activeTab];
        const container = activeEl?.closest('nav');
        if (activeEl && container) {
            const rect = activeEl.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            setPillStyle({
                top: rect.top - containerRect.top + container.scrollTop,
                height: rect.height,
                width: rect.width,
                left: rect.left - containerRect.left,
                opacity: 1,
            });
        } else {
            setPillStyle({ opacity: 0 });
        }
    }, [activeTab, isSidebarOpen, isPinned]);

  return (
    <aside
      className={`fixed top-0 left-0 h-full w-80 bg-base-100 text-base-content z-40 transition-transform duration-300 ease-in-out flex flex-col border-r border-base-300 shadow-2xl
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      aria-label="Main Navigation"
    >
      <div className="flex-shrink-0 flex items-center justify-between h-16 px-6 border-b border-base-300">
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-3 group">
          <h1 className="text-xl font-black tracking-tighter text-base-content uppercase">
            Kollektiv<span className="text-primary">.</span>
          </h1>
        </button>
        <button
          onClick={() => setIsPinned(p => !p)}
          className="btn btn-ghost btn-circle btn-sm hidden lg:inline-flex"
          title={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}
        >
          <ThumbTackIcon className={`w-5 h-5 transition-all ${isPinned ? 'rotate-0 text-primary' : '-rotate-45 text-base-content/20'}`} />
        </button>
      </div>

      <nav className="flex-grow px-4 py-6 overflow-y-auto relative scroll-smooth custom-scrollbar">
        <div 
            className="absolute bg-primary rounded-lg shadow-lg pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={pillStyle}
        />

        <div className="mb-6 px-2 relative z-20">
            <LlmStatusSwitcher />
        </div>
        
        <Section title="Overview">
             <NavItem id="dashboard" label="Home" icon={<HomeIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
        </Section>
        
        <Section title="Workspace">
            <NavItem id="prompts" label="Prompt Builder" icon={<SparklesIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            {features.isPromptLibraryEnabled && <NavItem id="prompt" label="Prompt Library" icon={<PromptIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />}
            {features.isGalleryEnabled && <NavItem id="gallery" label="Media Vault" icon={<PhotoIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />}
        </Section>

        {features.isCheatsheetsEnabled && (
            <Section title="Guides">
                <NavItem id="cheatsheet" label="Writing References" icon={<BookOpenIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="artstyles" label="Art Styles" icon={<PaletteIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="artists" label="Artists" icon={<UsersIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            </Section>
        )}

         {features.isToolsEnabled && (
            <Section title="Utilities">
                <NavItem id="composer" label="Composer" icon={<AspectRatioIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="image_compare" label="Compare" icon={<ViewColumnsIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="color_palette_extractor" label="Palette" icon={<PaletteIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="resizer" label="Resizer" icon={<CropIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
                <NavItem id="video_to_frames" label="Video" icon={<FilmIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            </Section>
        )}

      </nav>
      
      <div className="flex-shrink-0 p-4 border-t border-base-300 bg-base-200/20">
         <ul className="menu menu-sm p-0 gap-1">
            <NavItem id="settings" label="Settings" icon={<Cog6ToothIcon className="w-5 h-5" />} activeTab={activeTab} onClick={onNavigate} registerRef={registerRef} />
            <li>
                <a
                  onClick={onAboutClick}
                  className="flex items-center p-2.5 rounded-lg text-base font-medium transition-colors cursor-pointer text-base-content/50 hover:bg-base-200"
                >
                    <InformationCircleIcon className="w-5 h-5 mr-3" />
                    <span className="uppercase text-[10px] font-black tracking-widest">About</span>
                </a>
            </li>
         </ul>
      </div>
    </aside>
  );
};

export default Sidebar;