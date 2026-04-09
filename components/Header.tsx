import React from 'react';
import { MenuIcon, BookmarkIcon, PowerIcon, Cog6ToothIcon } from './icons';
import type { ActiveTab } from '../types';
import ThemeSwitcher from './ThemeSwitcher';
import { audioService } from '../services/audioService';
import TimedScrambledText from './TimedScrambledText';

interface HeaderProps {
  onMenuClick: () => void;
  onStandbyClick: (e: React.MouseEvent) => void;
  activeTab: ActiveTab;
  clippedIdeasCount: number;
  onToggleClippingPanel: () => void;
  onNavigate: (tab: ActiveTab) => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onStandbyClick, activeTab, clippedIdeasCount, onToggleClippingPanel, onNavigate }) => {

  const pageTitleMap: Record<ActiveTab, string> = {
    dashboard: 'Dashboard',
    prompts: 'Prompt Builder',
    // Added storyboard title to satisfy ActiveTab record requirement
    storyboard: 'Storyboard AI',
    prompt: 'Prompt Library',
    gallery: 'Gallery',
    cheatsheet: 'Guides',
    artstyles: 'Art Style Cheatsheet',
    artists: 'Artist Cheatsheet',
    settings: 'Settings',
    image_compare: 'Image Comparer',
    color_palette_extractor: 'Color Palette Extractor',
    composer: 'Grid Composer',
    resizer: 'Image Resizer',
    video_to_frames: 'Video Tool',
  };

  const pageTitle = pageTitleMap[activeTab] || 'Kollektiv';

  return (
    <header className="flex-shrink-0 flex items-center justify-between h-16 px-4 bg-transparent z-10 relative overflow-hidden">
      {/* Technical Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
      
      <div className="flex items-center gap-4 relative z-10 w-1/3">
        <button
          onClick={() => {
            audioService.playClick();
            onMenuClick();
          }}
          onMouseEnter={() => audioService.playHover()}
          className="flex items-center gap-3 px-3 py-2 hover:bg-primary/10 transition-colors group relative"
          aria-label="Toggle navigation menu"
        >
          <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-primary/40 group-hover:border-primary transition-colors"></div>
          <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-primary/40 group-hover:border-primary transition-colors"></div>
          <MenuIcon className="w-5 h-5 text-primary" />
          <span className="text-[10px] font-black tracking-[0.3em] text-primary/60 group-hover:text-primary uppercase hidden xs:block">Menu</span>
        </button>
        <div className="w-[1px] h-4 bg-base-300 hidden sm:block"></div>
        <h2 className="text-xs font-black hidden sm:block uppercase tracking-[0.4em] text-primary/80">{pageTitle}</h2>
      </div>

      {/* Center: Logo */}
      <div className="flex-1 flex justify-center items-center relative z-10 w-1/3">
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-3 group">
          <h1 className="text-xl font-black tracking-tighter text-base-content uppercase flex items-center font-logo">
            <span className="font-black">
              <TimedScrambledText text="Kollektiv" intervalMs={300000} />
            </span>
            <span className="text-primary italic animate-pulse drop-shadow-[0_0_10px_oklch(var(--p))] transition-all inline-block ml-0.5 font-black">.</span>
          </h1>
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 relative z-10 w-1/3">
        <div className="contents">
          <button 
            onClick={() => {
              audioService.playClick();
              onToggleClippingPanel();
            }} 
            onMouseEnter={() => audioService.playHover()}
            className="btn btn-ghost btn-circle btn-sm indicator"
          >
              <BookmarkIcon className="w-6 h-6"/>
              {clippedIdeasCount > 0 && <span className="indicator-item badge badge-primary badge-xs">{clippedIdeasCount}</span>}
          </button>
          <ThemeSwitcher />
          <button 
            onClick={() => {
              audioService.playClick();
              onNavigate('settings');
            }}
            onMouseEnter={() => audioService.playHover()}
            className="btn btn-sm btn-ghost btn-circle opacity-60 hover:opacity-100 hover:text-primary transition-all"
            title="Settings"
          >
              <Cog6ToothIcon className="w-5 h-5"/>
          </button>
          <button 
            onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onStandbyClick(e);
            }} 
            onMouseEnter={() => audioService.playHover()}
            onMouseDown={(e) => e.stopPropagation()}
            className="btn btn-sm btn-ghost btn-circle opacity-60 hover:opacity-100 hover:text-primary transition-all"
            title="Manual Standby"
          >
              <PowerIcon className="w-5 h-5"/>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;