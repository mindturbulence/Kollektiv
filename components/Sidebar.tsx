import React from 'react';
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
}> = ({ id, label, icon, activeTab, onClick }) => (
    <li>
        <a
          onClick={() => onClick(id)}
          className={`flex items-center p-2.5 rounded-lg text-base font-medium transition-colors cursor-pointer ${
            activeTab === id
              ? 'bg-neutral text-neutral-content font-bold shadow-md'
              : 'text-base-content/70 hover:bg-base-200'
          }`}
          aria-current={activeTab === id ? 'page' : undefined}
        >
          {icon}
          <span>{label}</span>
        </a>
    </li>
);

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h2 className="px-3 pt-4 pb-2 text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            {title}
        </h2>
        <ul className="menu menu-sm p-0 gap-0.5">
            {children}
        </ul>
    </div>
);


const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate, isSidebarOpen, isPinned, setIsPinned, onAboutClick }) => {
    const { settings } = useSettings();
    const { features } = settings;

  return (
    <aside
      className={`fixed top-0 left-0 h-full w-64 bg-base-100 text-base-content z-40 transition-transform duration-300 ease-in-out flex flex-col border-r border-base-300 
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      aria-label="Main Navigation"
    >
      {/* Header - Stays fixed */}
      <div className="flex-shrink-0 flex items-center justify-between h-16 px-4 border-b border-base-300">
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-3">
          <AppLogoIcon className="w-8 h-8 text-primary" />
          <h1 className="text-xl font-bold text-base-content">
            Kollektiv
          </h1>
        </button>
        <button
          onClick={() => setIsPinned(p => !p)}
          className="btn btn-ghost btn-circle btn-sm hidden lg:inline-flex"
          title={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}
        >
          <ThumbTackIcon className={`w-5 h-5 transition-transform ${isPinned ? 'rotate-0 text-primary' : '-rotate-45 text-base-content/60'}`} />
        </button>
      </div>

      {/* Navigation - this part scrolls */}
      <nav className="flex-grow px-4 overflow-y-auto">
        <div className="pt-4 pb-2">
            <LlmStatusSwitcher />
        </div>
        
        <Section title="Dashboard">
             <NavItem id="dashboard" label="Overview" icon={<HomeIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
        </Section>
        
        <Section title="Editor">
            <NavItem id="prompts" label="Prompt Builder" icon={<SparklesIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
            {features.isPromptLibraryEnabled && <NavItem id="prompt" label="Prompt Library" icon={<PromptIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />}
            {features.isGalleryEnabled && <NavItem id="gallery" label="Gallery" icon={<PhotoIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />}
        </Section>

        {features.isCheatsheetsEnabled && (
            <Section title="Resources">
                <NavItem id="cheatsheet" label="Prompting" icon={<BookOpenIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
                <NavItem id="artstyles" label="Art Styles" icon={<PaletteIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
                <NavItem id="artists" label="Artists" icon={<UsersIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
            </Section>
        )}

         {features.isToolsEnabled && (
            <Section title="Tools">
                <NavItem id="composer" label="Grid Composer" icon={<AspectRatioIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
                <NavItem id="image_compare" label="Image Comparer" icon={<ViewColumnsIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
                <NavItem id="color_palette_extractor" label="Color Palette" icon={<PaletteIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
                <NavItem id="resizer" label="Image Resizer" icon={<CropIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
                <NavItem id="video_to_frames" label="Video Editor" icon={<FilmIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
            </Section>
        )}

      </nav>
      
      {/* Footer - Stays fixed */}
      <div className="flex-shrink-0 p-4 border-t border-base-300">
         <ul className="menu menu-sm p-0">
            <NavItem id="settings" label="Settings" icon={<Cog6ToothIcon className="w-5 h-5 mr-3" />} activeTab={activeTab} onClick={onNavigate} />
            <li>
                <a
                  onClick={onAboutClick}
                  className="flex items-center p-2.5 rounded-lg text-base font-medium transition-colors cursor-pointer text-base-content/70 hover:bg-base-200"
                >
                    <InformationCircleIcon className="w-5 h-5 mr-3" />
                    <span>About</span>
                </a>
            </li>
         </ul>
      </div>
    </aside>
  );
};

export default Sidebar;